
import { describe, it, expect } from 'vitest';
import { calculateRectangularPins, calculatePins } from '../../src/lib/algorithms/pinCalculation';
import { StringArtParameters } from '../../src/types/stringArt';

describe('Pin Calculation', () => {

  describe('calculateRectangularPins', () => {
    it('should calculate pins for a square matching imgSize', () => {
      const params: Partial<StringArtParameters> = {
        numberOfPins: 4,
        width: 100,
        height: 100,
        imgSize: 100, // 1:1 pixel mapping
      };
      
      const pins = calculateRectangularPins(params);
      expect(pins.length).toBe(4);
      
      // With removal of centering offset (though 100x100 is full size anyway)
      // Top-Left: 0,0
      // Top-Right: 99, 0
      // Bottom-Right: 99, 99
      // Bottom-Left: 0, 99
      expect(pins[0]).toEqual([0, 0]);
      expect(pins[1]).toEqual([99, 0]);
      expect(pins[2]).toEqual([99, 99]);
      expect(pins[3]).toEqual([0, 99]);
    });

    it('should calculate pins for a 2:1 rectangle without centering offset', () => {
      const params: Partial<StringArtParameters> = {
        numberOfPins: 6,
        width: 200,
        height: 100,
        imgSize: 200, // Max dimension is 200px
      };

      // Expected pixel dimensions: 200 x 100
      const pins = calculateRectangularPins(params);
      
      // Check bounds
      const xs = pins.map(p => p[0]);
      const ys = pins.map(p => p[1]);
      
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      
      expect(minX).toBe(0);
      expect(maxX).toBe(199); // Width - 1
      expect(minY).toBe(0);
      expect(maxY).toBe(99); // Height - 1
      
      // Should NOT be centered in 200x200 (which would be offset Y by 50)
      // So minY should definitely be 0, not 50.
    });
  });

  describe('calculatePins (Circle)', () => {
    it('should calculate circular pins by default', () => {
      const params: Partial<StringArtParameters> = {
        numberOfPins: 4,
        imgSize: 100,
        shape: 'circle'
      };
      
      const pins = calculatePins(params);
      expect(pins.length).toBe(4);
      
      // Center 50, Radius 49.5
      // 0 deg: (99, 50) roughly
      // 90 deg: (50, 99) roughly
      // ...
      
      // Just check one or two to verify it's not returning rectangle logic
      const center = 50;
      const radius = 49.5;
      
      const p0 = pins[0]; // Angle 0
      const expectedX = Math.floor(center + radius * Math.cos(0));
      const expectedY = Math.floor(center + radius * Math.sin(0));
      
      expect(p0[0]).toBe(expectedX);
      expect(p0[1]).toBe(expectedY);
    });
  });

});
