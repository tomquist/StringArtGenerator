/**
 * Core types for String Art generation algorithm
 */

export type Point = {
  x: number;
  y: number;
};

export type PinCoordinate = [number, number];

export type StringArtShape = 'circle' | 'rectangle';

import type { YarnSpec } from './yarn';

export type StringArtParameters = {
  shape: StringArtShape;
  numberOfPins: number;
  numberOfLines: number;
  lineWeight: number;
  minDistance: number;
  imgSize: number;
  scale: number;
  hoopDiameter: number; // Kept for backward compatibility (circle diameter)
  width?: number;       // Physical width in mm (for rectangle)
  height?: number;      // Physical height in mm (for rectangle)
  yarnSpec?: YarnSpec;
};

export type LineCache = {
  x: (number[] | null)[];
  y: (number[] | null)[];
  length: number[];
  weight: number[];
};

export type OptimizationState = {
  error: Float32Array | Uint8Array;
  imgResult: Float32Array | Uint8Array;
  result: unknown; // OpenCV Mat object
  lineMask: Float32Array;
  lineSequence: number[];
  currentPin: number;
  threadLength: number;
  lastPins: number[];
};

export type OptimizationProgress = {
  linesDrawn: number;
  totalLines: number;
  percentComplete: number;
  currentPin: number;
  nextPin: number;
  threadLength: number;
};

export type StringArtResult = {
  lineSequence: number[];
  pinCoordinates: PinCoordinate[];
  totalThreadLength: number;
  parameters: StringArtParameters;
  processingTimeMs: number;
};
