
import type { YarnSpec } from '../../types/yarn';

/**
 * Normalizes various yarn specifications into a canonical linear density Tex (g/1000m).
 * @param spec The user-provided yarn specification.
 * @returns The calculated Tex value.
 */
export function normalizeToTex(spec: YarnSpec): number {
  const { type, ticketNo, nm, ply, tex, dtex, denier, meters, grams } = spec;
  const safePly = ply || 1;

  switch (type) {
    case 'tex':
      return tex || 0;

    case 'dtex':
      // Tex = dtex / 10
      // If ply is provided, we assume input dtex is per-ply if it's common notation,
      // but usually dtex is total. Prompt says "dtex: [dtex] + optional [ply] OR total dtex".
      // We'll treat the entered dtex as "per strand" if ply > 1, or total if ply is 1/undefined.
      // Wait, prompt says: "dtex 141*2 -> 282 dtex -> Tex 28.2".
      // So if ply is specified, we multiply.
      return ((dtex || 0) * safePly) / 10;

    case 'denier':
      // Tex = Denier / 9
      return ((denier || 0) * safePly) / 9;

    case 'nm':
      // Tex = 1000 / Nm
      // Nm is usually length per weight (m/g).
      // Nm 71/2 means Nm 71 (single) with 2 plies.
      // Resulting Nm_total = Nm_single / ply = 71/2 = 35.5
      // Tex = 1000 / Nm_total = 1000 / (Nm_single / ply) = (1000 * ply) / Nm_single
      if (!nm || nm === 0) return 0;
      return (1000 * safePly) / nm;

    case 'length_weight':
      // Tex = (g / m) * 1000
      if (!meters || meters === 0) return 0;
      return ((grams || 0) / meters) * 1000;

    case 'ticket':
      // Tex ≈ 3000 / TicketNo (Approximation)
      if (!ticketNo || ticketNo === 0) return 0;
      return 3000 / ticketNo;

    case 'diameter_mm':
      // Cannot convert directly to Tex without density assumption, handled separately or unused for Tex calculation
      return 0;

    default:
      return 0;
  }
}

/**
 * Calculates the estimated physical diameter in millimeters.
 * @param spec The user-provided yarn specification.
 * @returns The estimated diameter in mm.
 */
export function calculateDiameterMM(spec: YarnSpec): number {
  const { type, material, diameterMM, overrideDiameterMM } = spec;

  // 1. If override is provided, use it.
  if (overrideDiameterMM && overrideDiameterMM > 0) {
    return overrideDiameterMM;
  }

  // 2. If type is 'diameter_mm', use it.
  if (type === 'diameter_mm') {
    return diameterMM || 0;
  }

  // 3. Calculate from Tex
  const tex = normalizeToTex(spec);
  if (tex <= 0) return 0;

  // Density rho [kg/m^3]
  let rho = 1380; // Polyester default

  switch (material) {
    case 'cotton':
      rho = 1540;
      break;
    case 'nylon':
      rho = 1140;
      break;
    case 'polyester':
    case 'unknown':
    default:
      rho = 1380;
      break;
  }

  // massPerLength [kg/m] = Tex [g/1000m] * 1e-6 (g to kg, 1000m normalization)
  // Wait. Tex = g / 1000m.
  // 1 Tex = 1g / 1000m = 0.001 kg / 1000m = 1e-6 kg/m.
  const massPerLength = tex * 1e-6;

  // area [m^2] = massPerLength / rho
  const area = massPerLength / rho;

  // diameter_m = 2 * sqrt(area / π)
  const diameter_m = 2 * Math.sqrt(area / Math.PI);

  // diameterMM
  return diameter_m * 1000;
}

/**
 * Calculates the effective thread thickness in millimeters, including the visual multiplier k.
 * @param spec The user-provided yarn specification.
 * @returns The effective thread thickness in mm.
 */
export function calculateThreadThicknessMM(spec: YarnSpec): number {
  const diameterMM = calculateDiameterMM(spec);

  // Apply k multiplier (default 1.10)
  // Note: if the user explicitly provided diameter, we might still want to apply k?
  // The prompt says: "If user chose 'Diameter in mm' or used 'Override diameter', skip the physics and set threadThicknessMM directly (still apply k only if you want, but be consistent and document it)."
  // Let's apply k to everything to allow fine tuning "fuzziness" even for explicit diameters.
  const k = spec.k || 1.10;

  return diameterMM * k;
}

/**
 * Calculates the lineWeight (1..255) based on thread thickness and frame parameters.
 * @param threadThicknessMM The effective thread thickness in mm.
 * @param hoopDiameterMM The frame/hoop diameter in mm.
 * @param imgSizePx The image size in pixels.
 * @returns The calculated lineWeight (opacity 1..255).
 */
export function calculateLineWeight(
  threadThicknessMM: number,
  hoopDiameterMM: number,
  imgSizePx: number
): number {
  if (imgSizePx <= 0 || hoopDiameterMM <= 0) return 1;

  const pixelSizeMM = hoopDiameterMM / imgSizePx;
  const opacity = (threadThicknessMM / pixelSizeMM) * 255;

  // clamp(1..255, round(opacity))
  return Math.max(1, Math.min(255, Math.round(opacity)));
}
