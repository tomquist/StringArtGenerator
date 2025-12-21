
import { describe, it, expect } from 'vitest';
import { compressSequence, decompressSequence } from '../../src/lib/utils/sequenceCompression';

describe('Sequence Compression Utility V1', () => {
  it('should compress and decompress with shape data', async () => {
    const sequence = [0, 10, 20, 30];
    const numberOfPins = 100;
    const shape = 'rectangle';
    const width = 800;
    const height = 600;

    const compressed = await compressSequence(sequence, numberOfPins, shape, width, height);
    const result = await decompressSequence(compressed);

    expect(result.numberOfPins).toBe(numberOfPins);
    expect(result.sequence).toEqual(sequence);
    expect(result.shape).toBe(shape);
    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
  });

  it('should handle default circle shape', async () => {
    const sequence = [1, 2, 3];
    const compressed = await compressSequence(sequence, 200); // defaults
    const result = await decompressSequence(compressed);

    expect(result.shape).toBe('circle');
    expect(result.width).toBe(500);
  });

  it('should handle empty sequence', async () => {
    const sequence: number[] = [];
    const compressed = await compressSequence(sequence, 100);
    const result = await decompressSequence(compressed);
    expect(result.sequence).toEqual([]);
    expect(result.numberOfPins).toBe(100);
  });

  it('should handle single value sequence', async () => {
    const sequence = [42];
    const compressed = await compressSequence(sequence, 100);
    const result = await decompressSequence(compressed);
    expect(result.sequence).toEqual([42]);
  });

  it('should handle large sequences', async () => {
    const sequence = Array.from({ length: 10000 }, (_, i) => i % 200);
    const compressed = await compressSequence(sequence, 200);
    const result = await decompressSequence(compressed);
    expect(result.sequence.length).toBe(10000);
    expect(result.sequence).toEqual(sequence);
  });

  it('should handle boundary values (uint16)', async () => {
    const sequence = [0, 65535];
    const compressed = await compressSequence(sequence, 65535, 'circle', 65535, 65535);
    const result = await decompressSequence(compressed);
    expect(result.sequence).toEqual(sequence);
    expect(result.numberOfPins).toBe(65535);
    expect(result.width).toBe(65535);
    expect(result.height).toBe(65535);
  });

  describe('Input Validation', () => {
    it('should throw error for invalid pin count', async () => {
      await expect(compressSequence([], -1)).rejects.toThrow(RangeError);
      await expect(compressSequence([], 70000)).rejects.toThrow(RangeError);
      await expect(compressSequence([], 100.5)).rejects.toThrow(RangeError);
    });

    it('should throw error for invalid dimensions', async () => {
      await expect(compressSequence([], 100, 'circle', -10, 500)).rejects.toThrow(RangeError);
      await expect(compressSequence([], 100, 'circle', 500, 70000)).rejects.toThrow(RangeError);
    });

    it('should throw error for invalid sequence values', async () => {
      await expect(compressSequence([-1], 100)).rejects.toThrow(RangeError);
      await expect(compressSequence([70000], 100)).rejects.toThrow(RangeError);
      await expect(compressSequence([10.5], 100)).rejects.toThrow(RangeError);
    });

    it('should throw error if sequence is not an array', async () => {
      // @ts-expect-error testing invalid type
      await expect(compressSequence("not-array", 100)).rejects.toThrow(TypeError);
    });
  });

  describe('Decompression Errors', () => {
    it('should throw on corrupted base64', async () => {
        await expect(decompressSequence('%%%')).rejects.toThrow();
    });

    it('should throw on empty string', async () => {
        // Base64 decoding empty string results in empty buffer, which fails version check
        await expect(decompressSequence('')).rejects.toThrow();
    });

    it('should throw on invalid shape type', async () => {
        // Construct a buffer with valid header but invalid shape type (e.g., 2)
        // V1 Format: [Version=1, Shape=2, Width=500, Height=500, NumPins=100]
        const buffer = new Uint8Array(8);
        const view = new DataView(buffer.buffer);
        view.setUint8(0, 1); // Version 1
        view.setUint8(1, 2); // Invalid Shape
        view.setUint16(2, 500);
        view.setUint16(4, 500);
        view.setUint16(6, 100);

        // Compress manually
        const stream = new CompressionStream('gzip');
        const writer = stream.writable.getWriter();
        await writer.write(buffer);
        await writer.close();

        const response = new Response(stream.readable);
        const compressedData = await response.arrayBuffer();

        // Base64 encode
        let binaryString = '';
        const bytes = new Uint8Array(compressedData);
        for (let i = 0; i < bytes.length; i++) {
            binaryString += String.fromCharCode(bytes[i]);
        }
        const encoded = btoa(binaryString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        await expect(decompressSequence(encoded)).rejects.toThrow(/Invalid shape type/);
    });
  });
});
