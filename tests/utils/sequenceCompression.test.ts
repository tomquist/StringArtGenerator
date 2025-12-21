
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
});
