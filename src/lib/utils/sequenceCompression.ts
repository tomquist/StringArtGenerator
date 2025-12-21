
// Utility to compress and decompress pin sequences for URL sharing
// Format V1: [16-bit NumPins] [16-bit Sequence...]
// Format V2: [8-bit Version=2] [8-bit ShapeType] [16-bit Width] [16-bit Height] [16-bit NumPins] [16-bit Sequence...]
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
  // Use V2 format
  const headerSize = 8;
  const bufferLength = headerSize + (sequence.length * 2);
  const buffer = new Uint8Array(bufferLength);
  const view = new DataView(buffer.buffer);

  view.setUint8(0, 2); // Version 2
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
  const writePromise = writer.write(compressedData).then(() => writer.close());

  const response = new Response(stream.readable);
  const decompressedBuffer = await response.arrayBuffer();

  // Ensure write finished
  await writePromise;

  const decompressedBytes = new Uint8Array(decompressedBuffer);
  const view = new DataView(decompressedBytes.buffer);

  // Check Version
  if (decompressedBytes.length === 0) {
      throw new Error('Empty sequence data');
  }

  const firstByte = view.getUint8(0);

  if (firstByte !== 2) {
    throw new Error('Invalid data version or corrupted sequence');
  }

  // V2
  const shapeType = view.getUint8(1);
  const width = view.getUint16(2);
  const height = view.getUint16(4);
  const numberOfPins = view.getUint16(6);

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
