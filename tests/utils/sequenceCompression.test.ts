
import { describe, it, expect } from 'vitest';
import { compressSequence, decompressSequence } from '../../src/lib/utils/sequenceCompression';

describe('Sequence Compression Utility', () => {
  it('should compress and decompress a simple sequence correctly', async () => {
    const sequence = [0, 10, 20, 30, 40, 50];
    const numberOfPins = 100;

    const compressed = await compressSequence(sequence, numberOfPins);
    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(0);

    const result = await decompressSequence(compressed);
    expect(result.numberOfPins).toBe(numberOfPins);
    expect(result.sequence).toEqual(sequence);
  });

  it('should handle large sequences', async () => {
    const numberOfPins = 360;
    const sequence = Array.from({ length: 4000 }, () => Math.floor(Math.random() * numberOfPins));

    const compressed = await compressSequence(sequence, numberOfPins);
    // Compression should achieve some reduction or at least valid string
    expect(typeof compressed).toBe('string');

    const result = await decompressSequence(compressed);
    expect(result.numberOfPins).toBe(numberOfPins);
    expect(result.sequence).toEqual(sequence);
  });

  it('should handle URL-safe characters', async () => {
    // Generate data that might produce + or / in standard base64
    // This is probabilistic, but 100 random numbers usually suffice
    const sequence = Array.from({ length: 100 }, () => Math.floor(Math.random() * 256));
    const numberOfPins = 256;

    const compressed = await compressSequence(sequence, numberOfPins);
    expect(compressed).not.toMatch(/[+/=]/); // Should not contain standard base64 unsafe chars
    expect(compressed).toMatch(/^[A-Za-z0-9_-]*$/);

    const result = await decompressSequence(compressed);
    expect(result.sequence).toEqual(sequence);
  });

  it('should throw or fail gracefully on invalid data', async () => {
     // This test depends on implementation details, but passing garbage should fail
     const garbage = 'NotAValidCompressedString';
     await expect(decompressSequence(garbage)).rejects.toThrow();
  });
});
