/**
 * Pin calculation algorithm for String Art generation
 * Extracted from NonBlockingCalculatePins function
 */

import type { PinCoordinate, StringArtParameters } from '../../types';
import { calculatePinPositions } from '../math/geometry';
import { DEFAULT_CONFIG } from '../utils/constants';

/**
 * Calculate pin coordinates around a circular or rectangular boundary
 */
export function calculatePins(params: Partial<StringArtParameters> = {}): PinCoordinate[] {
  const {
    numberOfPins = DEFAULT_CONFIG.N_PINS,
    imgSize = DEFAULT_CONFIG.IMG_SIZE,
    shape = 'circle',
  } = params;

  if (shape === 'rectangle') {
    return calculateRectangularPins(params);
  }

  // Circle (Default)
  const center = imgSize / 2;
  const radius = imgSize / 2 - 0.5; // Leave half-pixel margin

  return calculatePinPositions(numberOfPins, center, radius);
}

/**
 * Calculate pin coordinates for a rectangular boundary
 * Ensures pins are placed at corners and distributed evenly.
 */
export function calculateRectangularPins(params: Partial<StringArtParameters>): PinCoordinate[] {
  const {
    numberOfPins = DEFAULT_CONFIG.N_PINS,
    imgSize = DEFAULT_CONFIG.IMG_SIZE,
    width = 100, // Physical width
    height = 100, // Physical height
  } = params;

  // Map physical dimensions to pixels.
  // imgSize corresponds to the MAX dimension.
  const aspectRatio = width / height;

  let pixelWidth: number;
  let pixelHeight: number;

  if (aspectRatio >= 1) {
    pixelWidth = imgSize;
    pixelHeight = Math.round(imgSize / aspectRatio);
  } else {
    pixelHeight = imgSize;
    pixelWidth = Math.round(imgSize * aspectRatio);
  }

  // Ensure we have at least 1px
  pixelWidth = Math.max(1, pixelWidth);
  pixelHeight = Math.max(1, pixelHeight);

  // We need to place pins on the perimeter: 2*(w + h)
  // We want to snap to corners.

  // Calculate perimeter length
  const perimeter = 2 * (width + height);

  // Ideal spacing
  const spacing = perimeter / numberOfPins;

  // Number of intervals (pins - 1 roughly, but it's a loop so pins = intervals) on each side
  // To ensure corners, we force integer number of intervals per side.
  let pinsW = Math.round(width / spacing);
  let pinsH = Math.round(height / spacing);

  // Ensure at least 1 interval per side
  pinsW = Math.max(1, pinsW);
  pinsH = Math.max(1, pinsH);

  // Total pins might slightly vary from requested, but guarantees symmetry
  // Actual pins = 2 * (pinsW + pinsH)
  // We should try to stick close to requested numberOfPins.

  // Let's refine pinsW/pinsH to sum to numberOfPins/2
  const targetHalfPins = numberOfPins / 2;
  const totalUnits = width + height;

  const rawHalfW = targetHalfPins * (width / totalUnits);
  const rawHalfH = targetHalfPins * (height / totalUnits);

  let baseW = Math.floor(rawHalfW);
  let baseH = Math.floor(rawHalfH);

  const remainder = Math.round(targetHalfPins - (baseW + baseH));

  // Distribute remainder (0 or 1) to the side with larger fractional part
  if (remainder > 0) {
    if ((rawHalfW % 1) >= (rawHalfH % 1)) {
      baseW += remainder;
    } else {
      baseH += remainder;
    }
  }

  // Enforce min 1 per side
  pinsW = Math.max(1, baseW);
  pinsH = Math.max(1, baseH);

  // Calculate exact coordinates
  // Use horizontal loops to include both corners (t=0 to t=1)
  // Use vertical loops to generate only strictly interior points to avoid duplicate corners

  const coords: PinCoordinate[] = [];

  // We adjust coords to be 0..pixelWidth-1
  const maxX = pixelWidth - 1;
  const maxY = pixelHeight - 1;

  // Top: Left to Right (Include both TL and TR corners)
  // pinsW represents the number of segments on the width.
  // Iterating 0 to pinsW includes pinsW + 1 points (endpoints).
  for (let i = 0; i <= pinsW; i++) {
    const t = i / pinsW;
    coords.push([Math.round(t * maxX), 0]);
  }

  // Right: Top to Bottom (Skip corners TR and BR)
  // pinsH represents the number of segments on the height.
  // Iterate 1 to pinsH-1 to generate interior points.
  for (let i = 1; i < pinsH; i++) {
    const t = i / pinsH;
    coords.push([maxX, Math.round(t * maxY)]);
  }

  // Bottom: Right to Left (Include both BR and BL corners)
  for (let i = 0; i <= pinsW; i++) {
    const t = i / pinsW;
    coords.push([Math.round((1 - t) * maxX), maxY]);
  }

  // Left: Bottom to Top (Skip corners BL and TL)
  for (let i = 1; i < pinsH; i++) {
    const t = i / pinsH;
    coords.push([0, Math.round((1 - t) * maxY)]);
  }

  // Note on Centering:
  // The `processImageForStringArt` now crops the image to the specific aspect ratio of the rectangle.
  // This means the image data itself is `pixelWidth x pixelHeight`.
  // Therefore, the pin coordinates must align with this tightly cropped image space (0..pixelWidth, 0..pixelHeight).
  // We do NOT add any offset to center it within a larger square `imgSize`, because the underlying error matrix
  // will match the cropped image dimensions exactly.

  // Note: Generated pin count may differ slightly from requested for geometric constraints
  // This is expected for rectangles to ensure corners are properly placed

  return coords;
}


/**
 * Validate pin parameters
 */
export function validatePinParameters(params: Partial<StringArtParameters>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (params.numberOfPins !== undefined) {
    if (params.numberOfPins < 3) {
      errors.push('Number of pins must be at least 3');
    }
    if (params.numberOfPins > 1000) {
      errors.push('Number of pins should not exceed 1000 for performance reasons');
    }
    if (!Number.isInteger(params.numberOfPins)) {
      errors.push('Number of pins must be an integer');
    }
  }

  if (params.imgSize !== undefined) {
    if (params.imgSize < 100) {
      errors.push('Image size must be at least 100 pixels');
    }
    if (params.imgSize > 2000) {
      errors.push('Image size should not exceed 2000 pixels for performance reasons');
    }
    if (!Number.isInteger(params.imgSize)) {
      errors.push('Image size must be an integer');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate the angular separation between adjacent pins
 */
export function calculateAngularSeparation(numberOfPins: number): number {
  return (2 * Math.PI) / numberOfPins;
}

/**
 * Get the pin index that is at a specific angle offset from a given pin
 */
export function getPinAtOffset(
  currentPin: number,
  offset: number,
  numberOfPins: number
): number {
  return (currentPin + offset) % numberOfPins;
}

/**
 * Calculate the minimum distance between two pins (in terms of pin indices)
 */
export function calculateMinPinDistance(
  pin1: number,
  pin2: number,
  numberOfPins: number
): number {
  const direct = Math.abs(pin2 - pin1);
  const wraparound = numberOfPins - direct;
  return Math.min(direct, wraparound);
}

/**
 * Get all pins within a minimum distance range from a given pin
 */
export function getValidTargetPins(
  currentPin: number,
  minDistance: number,
  numberOfPins: number,
  excludePins: number[] = []
): number[] {
  const validPins: number[] = [];
  
  for (let offset = minDistance; offset < numberOfPins - minDistance; offset++) {
    const targetPin = getPinAtOffset(currentPin, offset, numberOfPins);
    
    if (!excludePins.includes(targetPin)) {
      validPins.push(targetPin);
    }
  }
  
  return validPins;
}
