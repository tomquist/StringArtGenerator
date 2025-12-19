
// Utility to compress and decompress pin sequences for URL sharing
// Format:
// - Header: 16-bit Unsigned Integer (Number of Pins)
// - Body: Array of 16-bit Unsigned Integers (Pin Sequence)
// Compression: Gzip (via CompressionStream)
// Encoding: URL-safe Base64

export async function compressSequence(sequence: number[], numberOfPins: number): Promise<string> {
  // 1. Create binary buffer
  // Size = 2 bytes (header) + sequence.length * 2 bytes
  const buffer = new Uint16Array(1 + sequence.length);
  buffer[0] = numberOfPins;
  buffer.set(sequence, 1);

  // 2. Compress using Gzip
  // We need to convert the typed array to a generic byte stream (Uint8Array) for the stream
  const byteStream = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(byteStream);
  writer.close();

  // 3. Read compressed data
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

  // Concatenate chunks
  const totalLength = compressedChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const compressedData = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of compressedChunks) {
    compressedData.set(chunk, offset);
    offset += chunk.length;
  }

  // 4. Encode to Base64 (URL-safe)
  // Convert Uint8Array to binary string
  // Note: For very large arrays, spread syntax or apply might overflow stack, so we process in chunks
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

export async function decompressSequence(encoded: string): Promise<{ sequence: number[], numberOfPins: number }> {
  // 1. Decode Base64
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  // Pad with =
  while (base64.length % 4) {
    base64 += '=';
  }

  const binaryString = atob(base64);
  const compressedData = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    compressedData[i] = binaryString.charCodeAt(i);
  }

  // 2. Decompress
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

  // 3. Read Header and Sequence
  // Ensure we have correct byte alignment for Uint16Array
  // If the buffer starts at an odd offset (unlikely with new Uint8Array), copy it.
  // Actually creating a new Uint16Array from the buffer automatically handles it?
  // No, if byteOffset is not multiple of 2, it throws.
  // But our new Uint8Array starts at 0.

  const buffer = new Uint16Array(decompressedBytes.buffer);

  if (buffer.length < 1) {
    throw new Error('Invalid sequence data');
  }

  const numberOfPins = buffer[0];
  const sequence = Array.from(buffer.slice(1));

  return { sequence, numberOfPins };
}
