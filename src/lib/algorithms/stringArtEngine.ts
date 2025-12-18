/**
 * Main String Art Engine
 * Coordinates all algorithms to generate string art from an image
 */

import type { StringArtParameters, StringArtResult, OptimizationProgress } from '../../types';
import { processImageForStringArt, imageDataToFlatArray } from './imageProcessor';
import { calculatePins } from './pinCalculation';
import { precalculateLineCache, optimizeStringArt, createErrorMatrix } from './lineOptimization';
import { DEFAULT_CONFIG } from '../utils/constants';
import { calculateThreadThicknessMM, calculateLineWeight } from './yarnConversion';

/**
 * Main function to generate string art from an image
 */
export async function generateStringArt(
  imageElement: HTMLImageElement,
  params: Partial<StringArtParameters> = {},
  onProgress?: (progress: OptimizationProgress, currentLineSequence?: number[], pinCoordinates?: [number, number][]) => void
): Promise<StringArtResult> {
  const startTime = Date.now();

  // Calculate lineWeight from yarnSpec if present
  let lineWeight = params.lineWeight ?? DEFAULT_CONFIG.LINE_WEIGHT;
  if (params.yarnSpec) {
    const threadThicknessMM = calculateThreadThicknessMM(params.yarnSpec);
    // Use hoopDiameter or width (max dimension) for scale
    const hoopDiameter = params.hoopDiameter ?? (DEFAULT_CONFIG.HOOP_DIAMETER * 25.4);
    const imgSize = params.imgSize ?? DEFAULT_CONFIG.IMG_SIZE;
    lineWeight = calculateLineWeight(threadThicknessMM, hoopDiameter, imgSize);
  }

  // Merge with default parameters
  const parameters: StringArtParameters = {
    shape: params.shape ?? 'circle',
    numberOfPins: params.numberOfPins ?? DEFAULT_CONFIG.N_PINS,
    numberOfLines: params.numberOfLines ?? DEFAULT_CONFIG.MAX_LINES,
    lineWeight: lineWeight,
    minDistance: params.minDistance ?? DEFAULT_CONFIG.MIN_DISTANCE,
    imgSize: params.imgSize ?? DEFAULT_CONFIG.IMG_SIZE,
    scale: params.scale ?? DEFAULT_CONFIG.SCALE,
    hoopDiameter: params.hoopDiameter ?? (DEFAULT_CONFIG.HOOP_DIAMETER * 25.4),
    width: params.width,
    height: params.height,
    yarnSpec: params.yarnSpec,
  };

  // Step 1: Process the image
  console.log('Processing image...');
  const processedImageData = processImageForStringArt(
    imageElement,
    parameters.imgSize,
    parameters.shape,
    parameters.width,
    parameters.height
  );
  
  // Step 2: Calculate pin positions
  console.log('Calculating pin positions...');
  const pinCoordinates = calculatePins(parameters);

  // Step 3: Precalculate line cache
  console.log('Precalculating lines...');
  const lineCache = precalculateLineCache(pinCoordinates, parameters.minDistance);

  // Step 4: Create error matrix from processed image
  console.log('Creating error matrix...');
  // Note: createErrorMatrix likely expects a square array if imgSize is used as dimensions.
  // The processedImageData.circularMaskedImage matches the aspect ratio now.
  // However, `createErrorMatrix` logic (in `lineOptimization.ts`) likely assumes a square grid of `imgSize x imgSize`.
  // If we pass a non-square image array, `createErrorMatrix` needs to handle it.
  // Let's verify `lineOptimization.ts` in a moment.
  // For now, assume `createErrorMatrix` uses the flattened array and `imgSize` correctly
  // OR we need to update `lineOptimization` too.
  // Wait, `processImageForStringArt` returns dimensions.

  const imageArray = imageDataToFlatArray({
    data: processedImageData.circularMaskedImage.data,
    width: processedImageData.circularMaskedImage.width,
    height: processedImageData.circularMaskedImage.height,
  } as ImageData);

  // If the image is not square, we might have issues if optimizeStringArt expects square.
  // Let's pass dimensions if needed, or if it infers from array length.
  // Actually, standard `stringArtEngine` usually works on square.
  // If we changed to rectangle, we need to check `lineOptimization.ts`.
  // I will check `lineOptimization.ts` after this block update.

  const errorMatrix = createErrorMatrix(imageArray);

  // Step 5: Optimize string art
  console.log('Optimizing string art...');
  const { lineSequence, totalThreadLength } = await optimizeStringArt(
    errorMatrix,
    pinCoordinates,
    lineCache,
    parameters,
    onProgress
  );

  const processingTimeMs = Date.now() - startTime;

  return {
    lineSequence,
    pinCoordinates,
    totalThreadLength,
    parameters,
    processingTimeMs,
  };
}

/**
 * Validate parameters before processing
 */
export function validateStringArtParameters(params: Partial<StringArtParameters>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (params.numberOfPins !== undefined) {
    if (params.numberOfPins < 3) errors.push('Number of pins must be at least 3');
    if (params.numberOfPins > 1000) errors.push('Number of pins should not exceed 1000');
    if (!Number.isInteger(params.numberOfPins)) errors.push('Number of pins must be an integer');
  }

  if (params.numberOfLines !== undefined) {
    if (params.numberOfLines < 1) errors.push('Number of lines must be at least 1');
    if (params.numberOfLines > 10000) errors.push('Number of lines should not exceed 10000');
    if (!Number.isInteger(params.numberOfLines)) errors.push('Number of lines must be an integer');
  }

  if (params.lineWeight !== undefined) {
    if (params.lineWeight < 1) errors.push('Line weight must be at least 1');
    if (params.lineWeight > 100) errors.push('Line weight should not exceed 100');
  }

  if (params.minDistance !== undefined) {
    if (params.minDistance < 1) errors.push('Minimum distance must be at least 1');
    if (params.minDistance > 50) errors.push('Minimum distance should not exceed 50');
  }

  if (params.imgSize !== undefined) {
    if (params.imgSize < 100) errors.push('Image size must be at least 100');
    if (params.imgSize > 2000) errors.push('Image size should not exceed 2000');
    if (!Number.isInteger(params.imgSize)) errors.push('Image size must be an integer');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Create default parameters with validation
 */
export function createDefaultParameters(overrides: Partial<StringArtParameters> = {}): StringArtParameters {
  const defaults: StringArtParameters = {
    shape: 'circle',
    numberOfPins: DEFAULT_CONFIG.N_PINS,
    numberOfLines: DEFAULT_CONFIG.MAX_LINES,
    lineWeight: DEFAULT_CONFIG.LINE_WEIGHT,
    minDistance: DEFAULT_CONFIG.MIN_DISTANCE,
    imgSize: DEFAULT_CONFIG.IMG_SIZE,
    scale: DEFAULT_CONFIG.SCALE,
    hoopDiameter: DEFAULT_CONFIG.HOOP_DIAMETER,
  };

  return { ...defaults, ...overrides };
}
