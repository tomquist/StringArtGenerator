
// Utility to compress and decompress pin sequences for URL sharing
// Format V1: [8-bit Version=1] [8-bit ShapeType] [16-bit Width] [16-bit Height] [16-bit NumPins] [16-bit Sequence...]
// ShapeType: 0 = circle, 1 = rectangle

export interface CompressedSequenceData {
  sequence: number[];
  numberOfPins: number;
  shape: 'circle' | 'rectangle';
  width: number;
  height: number;
}

export async function compressSequence(
  sequence: number[],
  numberOfPins: number,
  shape: 'circle' | 'rectangle' = 'circle',
  width: number = 500,
  height: number = 500
): Promise<string> {
  // Input Validation
  if (!Number.isInteger(numberOfPins) || numberOfPins < 0 || numberOfPins > 65535) {
    throw new RangeError(`numberOfPins must be a uint16 integer. Got ${numberOfPins}`);
  }
  if (!Number.isInteger(width) || width < 0 || width > 65535) {
    throw new RangeError(`width must be a uint16 integer. Got ${width}`);
  }
  if (!Number.isInteger(height) || height < 0 || height > 65535) {
    throw new RangeError(`height must be a uint16 integer. Got ${height}`);
  }
  if (!Array.isArray(sequence)) {
    throw new TypeError('sequence must be an array');
  }

  // Validate sequence values
  for (let i = 0; i < sequence.length; i++) {
    const val = sequence[i];
    if (!Number.isInteger(val) || val < 0 || val > 65535) {
      throw new RangeError(`Sequence value at index ${i} is invalid (must be uint16): ${val}`);
    }
  }

  // Use V1 format
  const headerSize = 8;
  const bufferLength = headerSize + (sequence.length * 2);
  const buffer = new Uint8Array(bufferLength);
  const view = new DataView(buffer.buffer);

  view.setUint8(0, 1); // Version 1
  view.setUint8(1, shape === 'circle' ? 0 : 1);
  view.setUint16(2, width); // Big-endian by default in DataView
  view.setUint16(4, height);
  view.setUint16(6, numberOfPins);

  // Sequence data
  let offset = 8;
  for (let i = 0; i < sequence.length; i++) {
    view.setUint16(offset, sequence[i]);
    offset += 2;
  }

  // Compress using Response to handle stream flow automatically
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();

  // Write in background/parallel to allow reading to start
  // This prevents deadlock if the buffer fills up
  const writePromise = writer.write(buffer).then(() => writer.close());

  const response = new Response(stream.readable);
  const compressedBuffer = await response.arrayBuffer();

  // Ensure writing finished successfully
  await writePromise;

  const compressedData = new Uint8Array(compressedBuffer);

  // Base64 Encode
  let binaryString = '';
  const chunkSize = 8192;
  for (let i = 0; i < compressedData.length; i += chunkSize) {
    binaryString += String.fromCharCode.apply(null, Array.from(compressedData.slice(i, i + chunkSize)));
  }

  return btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function decompressSequence(encoded: string): Promise<CompressedSequenceData> {
  // Decode Base64
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }

  const binaryString = atob(base64);
  const compressedData = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    compressedData[i] = binaryString.charCodeAt(i);
  }

  // Decompress
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();

  // Write in background to prevent deadlock
  // We must catch errors here to prevent "Unhandled Rejection" if the read side fails first
  const writePromise = writer.write(compressedData).then(() => writer.close()).catch(() => {});

  const response = new Response(stream.readable);
  let decompressedBuffer: ArrayBuffer;
  try {
      decompressedBuffer = await response.arrayBuffer();
  } catch (e) {
      throw new Error('Decompression failed: Invalid Gzip data');
  }

  // Ensure write finished (in case it failed silently above, though read would likely fail too)
  await writePromise;

  const decompressedBytes = new Uint8Array(decompressedBuffer);
  const view = new DataView(decompressedBytes.buffer);

  // Validate Header Size
  if (decompressedBytes.length < 8) {
      throw new Error('Invalid sequence data: insufficient header length');
  }

  // Check Version
  const firstByte = view.getUint8(0);

  if (firstByte !== 1) {
    throw new Error(`Invalid data version: expected 1, got ${firstByte}`);
  }

  // V1
  const shapeType = view.getUint8(1);
  const width = view.getUint16(2);
  const height = view.getUint16(4);
  const numberOfPins = view.getUint16(6);

  // Validate Sequence Data Integrity
  const sequenceBytes = decompressedBytes.length - 8;
  if (sequenceBytes % 2 !== 0) {
      throw new Error('Invalid sequence data: length mismatch for 16-bit sequence');
  }

  const sequence: number[] = [];
  for (let i = 8; i < decompressedBytes.length; i += 2) {
    sequence.push(view.getUint16(i));
  }

  return {
    sequence,
    numberOfPins,
    shape: shapeType === 1 ? 'rectangle' : 'circle',
    width,
    height
  };
}
