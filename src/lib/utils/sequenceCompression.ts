
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
  // Header:
  // Byte 0: Version (2)
  // Byte 1: Shape (0 or 1)
  // Byte 2-3: Width
  // Byte 4-5: Height
  // Byte 6-7: NumPins
  // Rest: Sequence

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

  // Compress
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(buffer);
  writer.close();

  const compressedChunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) compressedChunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const totalLength = compressedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const compressedData = new Uint8Array(totalLength);
  let dataOffset = 0;
  for (const chunk of compressedChunks) {
    compressedData.set(chunk, dataOffset);
    dataOffset += chunk.length;
  }

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
  writer.write(compressedData);
  writer.close();

  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const decompressedBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    decompressedBytes.set(chunk, offset);
    offset += chunk.length;
  }

  const view = new DataView(decompressedBytes.buffer);

  // Check Version
  // Old format starts with 16-bit NumPins.
  // V2 starts with 8-bit Version = 2.
  // If byte 0 is 2, and byte 1 is 0 or 1, it's likely V2.
  // If it's old format, byte 0 is high byte of numPins? No, DataView is Big Endian, Uint16Array is platform endian (usually Little Endian).
  // Wait, my previous code used `new Uint16Array(buffer)`.
  // Uint16Array uses platform endianness (Little Endian on x86/ARM).
  // So `buffer[0]` (low byte) was the first byte.
  // If `numberOfPins` is say 288 (0x0120), in LE it is [0x20, 0x01].
  // 0x20 is 32. Not 2.
  // If `numberOfPins` is small, e.g. 2? Then [0x02, 0x00]. It matches.
  // But min pins is usually > 36.
  // However, explicit versioning is safer.

  // Let's check the first byte.
  const firstByte = view.getUint8(0);

  if (firstByte === 2) {
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
  } else {
    // Fallback to V1 (Uint16Array dump)
    // Create Uint16Array from buffer (respecting alignment)
    // Note: The previous code created `new Uint16Array(decompressedBytes.buffer)`.
    // This interprets bytes in platform order (Little Endian).
    // So we should do the same to maintain compat.

    // Ensure byte alignment
    const buffer = new Uint16Array(decompressedBytes.buffer, decompressedBytes.byteOffset, decompressedBytes.byteLength / 2);

    if (buffer.length < 1) throw new Error('Invalid data');

    const numberOfPins = buffer[0];
    const sequence = Array.from(buffer.slice(1));

    return {
      sequence,
      numberOfPins,
      shape: 'circle', // Default for V1
      width: 500,
      height: 500
    };
  }
}
