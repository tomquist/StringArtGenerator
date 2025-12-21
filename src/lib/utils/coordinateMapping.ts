/**
 * Coordinate mapping utilities for string art rendering
 * Handles scaling and offset calculations for different shapes
 */

import type { StringArtShape } from '../../types';

/**
 * Calculate pixel dimensions and scaling based on shape and target output size
 * This ensures pins are correctly positioned whether rendering to canvas or PDF
 */
export function calculateCoordinateMapping(
  imgSize: number,
  shape: StringArtShape,
  width: number = 0,
  height: number = 0,
  targetWidth: number,
  targetHeight: number
) {
  let pixelW = imgSize;
  let pixelH = imgSize;

  if (shape === 'rectangle' && width && height) {
    const aspect = width / height;
    if (aspect >= 1) {
      pixelH = Math.round(imgSize / aspect);
    } else {
      pixelW = Math.round(imgSize * aspect);
    }
  }

  // Fix scaling for rectangular shape to ensure pins hit the edges
  // Unify scaling logic: map [0, pixelW-1] to [0, targetWidth]
  // For rectangle: pins are at 0..pixelW-1.
  // For circle: pins effectively span the full diameter, represented by pixelW-1 range.
  // This ensures circle pins also touch the boundary if they are at the edge.
  const denominatorX = Math.max(1, pixelW - 1);
  const denominatorY = Math.max(1, pixelH - 1);

  const scaleX = targetWidth / denominatorX;
  const scaleY = targetHeight / denominatorY;

  // Calculate offsets to center/align the shape
  // For rectangle: starts at 0, so offset is 0.
  // For circle: center is at pixelW/2. Radius is pixelW/2 - 0.5.
  // Min val is 0.5. Max val is pixelW-0.5.
  // If we map 0 to 0 (via scale), then 0.5 maps to 0.5*scale.
  // We want 0.5 to map to 0 (touch edge).
  // So offset should be -0.5 * scale.
  // This applies if shape is circle.
  const offsetX = shape === 'circle' ? -0.5 * scaleX : 0;
  const offsetY = shape === 'circle' ? -0.5 * scaleY : 0;

  return { pixelW, pixelH, scaleX, scaleY, offsetX, offsetY };
}
