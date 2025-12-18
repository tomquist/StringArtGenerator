
import { describe, it, expect } from 'vitest';
import { normalizeToTex, calculateDiameterMM, calculateThreadThicknessMM } from '../../src/lib/algorithms/yarnConversion';
import type { YarnSpec } from '../../src/types/yarn';

describe('Yarn Conversion', () => {
  describe('normalizeToTex', () => {
    it('should normalize Ticket/No. correctly', () => {
      // Tex ≈ 3000 / TicketNo
      const spec: YarnSpec = { type: 'ticket', material: 'polyester', ticketNo: 120 };
      expect(normalizeToTex(spec)).toBeCloseTo(25, 1);
    });

    it('should normalize Nm correctly', () => {
      // Nm 71/2 -> 35.5 -> 1000/35.5 = 28.17
      const spec: YarnSpec = { type: 'nm', material: 'polyester', nm: 71, ply: 2 };
      expect(normalizeToTex(spec)).toBeCloseTo(28.17, 2);
    });

    it('should normalize Tex correctly', () => {
      const spec: YarnSpec = { type: 'tex', material: 'polyester', tex: 30 };
      expect(normalizeToTex(spec)).toBe(30);
    });

    it('should normalize dtex correctly', () => {
      // 141 * 2 / 10 = 28.2
      const spec: YarnSpec = { type: 'dtex', material: 'polyester', dtex: 141, ply: 2 };
      expect(normalizeToTex(spec)).toBeCloseTo(28.2, 1);
    });

    it('should normalize Denier correctly', () => {
      // 120 / 9 = 13.33
      const spec: YarnSpec = { type: 'denier', material: 'polyester', denier: 120, ply: 1 };
      expect(normalizeToTex(spec)).toBeCloseTo(13.33, 2);
    });

    it('should normalize Length/Weight correctly', () => {
      // 125 m / 50 g => 0.4 g/m => 400 g/1000m => 400 Tex
      // Wait formula: (grams / meters) * 1000
      // 50 / 125 * 1000 = 0.4 * 1000 = 400
      const spec: YarnSpec = { type: 'length_weight', material: 'polyester', meters: 125, grams: 50 };
      expect(normalizeToTex(spec)).toBe(400);
    });
  });

  describe('calculateDiameterMM', () => {
    it('should calculate diameter for Polyester', () => {
      // Tex 30
      // rho = 1380
      // massPerLength = 30e-6
      // area = 30e-6 / 1380 = 2.17e-8
      // diam = 2 * sqrt(2.17e-8 / PI) = 2 * sqrt(6.9e-9) = 2 * 8.3e-5 = 1.66e-4 m = 0.166 mm
      const spec: YarnSpec = { type: 'tex', material: 'polyester', tex: 30 };
      const d = calculateDiameterMM(spec);
      expect(d).toBeCloseTo(0.166, 3);
    });

    it('should use override diameter if provided', () => {
      const spec: YarnSpec = { type: 'tex', material: 'polyester', tex: 30, overrideDiameterMM: 0.5 };
      expect(calculateDiameterMM(spec)).toBe(0.5);
    });

    it('should use explicit diameter input', () => {
      const spec: YarnSpec = { type: 'diameter_mm', material: 'polyester', diameterMM: 0.3 };
      expect(calculateDiameterMM(spec)).toBe(0.3);
    });
  });

  describe('calculateThreadThicknessMM', () => {
    it('should apply k multiplier', () => {
       const spec: YarnSpec = { type: 'diameter_mm', material: 'polyester', diameterMM: 0.3, k: 1.2 };
       expect(calculateThreadThicknessMM(spec)).toBeCloseTo(0.36, 2);
    });

    it('should use default k multiplier', () => {
       const spec: YarnSpec = { type: 'diameter_mm', material: 'polyester', diameterMM: 0.3 };
       expect(calculateThreadThicknessMM(spec)).toBeCloseTo(0.33, 2);
    });
  });
});
