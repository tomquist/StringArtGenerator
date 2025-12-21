/**
 * Export utilities for downloading string art results
 * Handles PNG, PDF, TXT, and template image exports
 */

import { jsPDF } from 'jspdf';
import type { StringArtResult } from '../../types';
import { calculateCoordinateMapping } from './coordinateMapping';

/**
 * Download the canvas as a PNG image
 */
export function downloadCanvasPNG(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;

  const link = document.createElement('a');
  link.download = `string-art-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download sequence as a text file
 */
export function downloadSequenceTXT(result: StringArtResult) {
  const content = `String Art Pin Sequence
Total Pins: ${result.parameters.numberOfPins}
Total Lines: ${result.lineSequence.length}
Thread Length: ${(result.totalThreadLength / 1000).toFixed(2)} m

Pin Sequence:
${result.lineSequence.join(', ')}`;

  const blob = new Blob([content], { type: 'text/plain' });
  const link = document.createElement('a');
  link.download = `string-art-sequence-${Date.now()}.txt`;
  link.href = URL.createObjectURL(blob);

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Download template image as PNG with pin labels
 */
export function downloadTemplatePNG(result: StringArtResult) {
  // Determine Canvas Aspect Ratio
  let canvasW = 4000;
  let canvasH = 4000;

  if (result.parameters.shape === 'rectangle' && result.parameters.width && result.parameters.height) {
    const aspect = result.parameters.width / result.parameters.height;
    if (aspect >= 1) {
      canvasH = Math.round(canvasW / aspect);
    } else {
      canvasW = Math.round(canvasH * aspect);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D canvas context for template export');
  }

  // Fill white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Padding
  const padding = 100;
  const contentW = canvasW - (padding * 2);
  const contentH = canvasH - (padding * 2);

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  // Draw Boundary
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.beginPath();

  if (result.parameters.shape === 'rectangle') {
    ctx.rect(cx - contentW / 2, cy - contentH / 2, contentW, contentH);
  } else {
    const radius = contentW / 2;
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  }
  ctx.stroke();

  // Draw Center Dot
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, 2 * Math.PI);
  ctx.fill();

  // Draw Guides
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 2;
  ctx.setLineDash([20, 20]);

  // Horizontal & Vertical
  ctx.beginPath();
  ctx.moveTo(cx - contentW / 2, cy);
  ctx.lineTo(cx + contentW / 2, cy);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx, cy - contentH / 2);
  ctx.lineTo(cx, cy + contentH / 2);
  ctx.stroke();

  // Diagonals
  ctx.beginPath();
  ctx.moveTo(cx - contentW / 2, cy - contentH / 2);
  ctx.lineTo(cx + contentW / 2, cy + contentH / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - contentW / 2, cy + contentH / 2);
  ctx.lineTo(cx + contentW / 2, cy - contentH / 2);
  ctx.stroke();

  ctx.setLineDash([]); // Reset

  // Draw pins
  const pinRadius = 4;
  ctx.fillStyle = 'black';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Font size calculation (approximate)
  const perimeter = result.parameters.shape === 'rectangle' ? 2 * (contentW + contentH) : Math.PI * contentW;
  const spacePerPin = perimeter / result.parameters.numberOfPins;
  const fontSize = Math.max(24, Math.min(80, Math.floor(spacePerPin * 0.6)));
  ctx.font = `${fontSize}px Arial`;

  const labelDist = 40;

  // Calculate scale from pixels (imgSize) to Canvas
  const { scaleX, scaleY, offsetX, offsetY } = calculateCoordinateMapping(
    result.parameters.imgSize,
    result.parameters.shape,
    result.parameters.width,
    result.parameters.height,
    contentW,
    contentH
  );

  const startX = cx - (contentW / 2);
  const startY = cy - (contentH / 2);

  for (let i = 0; i < result.parameters.numberOfPins; i++) {
    const pin = result.pinCoordinates[i];

    const px = startX + (pin[0] * scaleX + offsetX);
    const py = startY + (pin[1] * scaleY + offsetY);

    // Draw pin dot
    ctx.beginPath();
    ctx.arc(px, py, pinRadius, 0, 2 * Math.PI);
    ctx.fill();

    // Label position
    const dx = px - cx;
    const dy = py - cy;
    const len = Math.sqrt(dx * dx + dy * dy);

    let lx = px;
    let ly = py;

    if (len > 0) {
      lx = px + (dx / len) * labelDist;
      ly = py + (dy / len) * labelDist;
    }

    ctx.fillText(i.toString(), lx, ly);
  }

  // Download
  const link = document.createElement('a');
  link.download = `string-art-template-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download comprehensive PDF with report, image, template, and sequence
 */
export async function downloadPDF(result: StringArtResult, frameDiameter: number) {
  const doc = new jsPDF();
  const margin = 20;
  let y = margin;
  const pageWidth = doc.internal.pageSize.getWidth();
  const a4Width = 210;
  const a4Height = 297;

  // --- Page 1: Report & Statistics ---

  // Header
  doc.setFontSize(24);
  doc.text('String Art Generator Report', margin, y);
  y += 15;

  // Input Parameters
  doc.setFontSize(16);
  doc.text('Input Parameters', margin, y);
  y += 10;
  doc.setFontSize(12);
  doc.text(`Frame Diameter: ${frameDiameter} mm`, margin, y);
  y += 7;
  doc.text(`Number of Pins: ${result.parameters.numberOfPins}`, margin, y);
  y += 7;
  doc.text(`Number of Lines: ${result.parameters.numberOfLines}`, margin, y);
  y += 7;
  doc.text(`Line Weight: ${result.parameters.lineWeight}`, margin, y);
  y += 7;
  doc.text(`Image Size (Processing): ${result.parameters.imgSize}px`, margin, y);
  y += 15;

  // Statistics
  doc.setFontSize(16);
  doc.text('Statistics', margin, y);
  y += 10;
  doc.setFontSize(12);
  doc.text(`Total Lines Drawn: ${result.lineSequence.length}`, margin, y);
  y += 7;
  doc.text(`Total Thread Length: ${(result.totalThreadLength / 1000).toFixed(2)} meters`, margin, y);
  y += 7;
  doc.text(`Processing Time: ${(result.processingTimeMs / 1000).toFixed(2)} seconds`, margin, y);
  y += 15;

  // Note
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('This report includes a high-resolution image, a 1:1 scale stencil/template (full & tiled), and the full pin sequence.', margin, y);
  doc.setTextColor(0);

  // --- Shared Setup for 1:1 Pages ---
  let pageW: number, pageH: number;
  let frameDesc = '';

  if (result.parameters.shape === 'rectangle' && result.parameters.width && result.parameters.height) {
    pageW = result.parameters.width + (margin * 2);
    pageH = result.parameters.height + (margin * 2);
    frameDesc = `${result.parameters.width}x${result.parameters.height}mm`;
  } else {
    const d = result.parameters.hoopDiameter;
    pageW = d + (margin * 2);
    pageH = d + (margin * 2);
    frameDesc = `${d}mm Diameter`;
  }

  // Generate High-Res Image Data
  let canvasW = 4000;
  let canvasH = 4000;

  if (result.parameters.shape === 'rectangle' && result.parameters.width && result.parameters.height) {
    const aspect = result.parameters.width / result.parameters.height;
    if (aspect >= 1) {
      canvasH = Math.round(canvasW / aspect);
    } else {
      canvasW = Math.round(canvasH * aspect);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D canvas context for PDF export');
  }

  // Fill white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Draw lines
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.lineWidth = 1.0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const { scaleX, scaleY, offsetX, offsetY } = calculateCoordinateMapping(
    result.parameters.imgSize,
    result.parameters.shape,
    result.parameters.width,
    result.parameters.height,
    canvasW,
    canvasH
  );
  const pinCoords = result.pinCoordinates;

  for (let i = 0; i < result.lineSequence.length - 1; i++) {
    ctx.beginPath();
    const p1 = pinCoords[result.lineSequence[i]];
    const p2 = pinCoords[result.lineSequence[i + 1]];

    ctx.moveTo(p1[0] * scaleX + offsetX, p1[1] * scaleY + offsetY);
    ctx.lineTo(p2[0] * scaleX + offsetX, p2[1] * scaleY + offsetY);
    ctx.stroke();
  }
  const previewImgData = canvas.toDataURL('image/jpeg', 0.8);

  // Helper Functions for Drawing Content
  const drawPreviewContent = (pageOffsetX: number, pageOffsetY: number) => {
    doc.setFontSize(18);
    doc.text('Preview (1:1 Scale)', margin + pageOffsetX, margin + pageOffsetY);

    const targetW = pageW - (margin * 2);
    const targetH = pageH - (margin * 2);
    doc.addImage(previewImgData, 'JPEG', margin + pageOffsetX, margin + 10 + pageOffsetY, targetW, targetH);
  };

  const drawTemplateContent = (pageOffsetX: number, pageOffsetY: number) => {
    doc.setFontSize(14);
    doc.text('Template / Stencil (1:1 Scale)', margin + pageOffsetX, margin - 5 + pageOffsetY);
    doc.setFontSize(10);
    doc.text(frameDesc, margin + pageOffsetX, margin + pageOffsetY);

    const contentW = pageW - (margin * 2);
    const contentH = pageH - (margin * 2);

    const cx = margin + pageOffsetX + (contentW / 2);
    const cy = margin + 10 + pageOffsetY + (contentH / 2);

    // Shape Boundary
    doc.setLineWidth(0.2);
    if (result.parameters.shape === 'rectangle') {
      const rectX = cx - (contentW / 2);
      const rectY = cy - (contentH / 2);
      doc.rect(rectX, rectY, contentW, contentH, 'S');
    } else {
      const radius = contentW / 2;
      doc.circle(cx, cy, radius, 'S');
    }

    // Center Dot
    doc.setFillColor(0, 0, 0);
    doc.circle(cx, cy, 2, 'F');

    // Dotted Lines (Guides)
    doc.setLineWidth(0.1);
    doc.setLineDashPattern([2, 2], 0);

    const halfW = contentW / 2;
    const halfH = contentH / 2;

    doc.line(cx - halfW, cy, cx + halfW, cy); // Horizontal
    doc.line(cx, cy - halfH, cx, cy + halfH); // Vertical

    // Diagonals
    doc.line(cx - halfW, cy - halfH, cx + halfW, cy + halfH);
    doc.line(cx - halfW, cy + halfH, cx + halfW, cy - halfH);

    doc.setLineDashPattern([], 0);

    // Pins
    const pinRadius = 0.5;
    doc.setFontSize(7);
    const numPins = result.parameters.numberOfPins;

    const { scaleX, scaleY, offsetX, offsetY } = calculateCoordinateMapping(
      result.parameters.imgSize,
      result.parameters.shape,
      result.parameters.width,
      result.parameters.height,
      contentW,
      contentH
    );

    const startX = cx - (contentW / 2);
    const startY = cy - (contentH / 2);

    for (let i = 0; i < numPins; i++) {
      const pin = result.pinCoordinates[i];

      const px = startX + (pin[0] * scaleX + offsetX);
      const py = startY + (pin[1] * scaleY + offsetY);

      doc.setFillColor(0, 0, 0);
      doc.circle(px, py, pinRadius, 'F');

      // Label offset
      const dx = px - cx;
      const dy = py - cy;
      const len = Math.sqrt(dx * dx + dy * dy);
      const labelDist = 3;

      let lx = px;
      let ly = py;

      if (len > 0) {
        lx = px + (dx / len) * labelDist;
        ly = py + (dy / len) * labelDist;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      doc.text(i.toString(), lx, ly, { align: 'center', baseline: 'middle' } as any);
    }
  };

  // --- Page 2: High Resolution Image (1:1 Scale - Full) ---
  doc.addPage([pageW, pageH], pageW > pageH ? 'l' : 'p');
  drawPreviewContent(0, 0);

  // --- Page 2b: Tiled Preview (if larger than A4) ---
  if (pageW > 200 || pageH > 287) {
    const cols = Math.ceil(pageW / a4Width);
    const rows = Math.ceil(pageH / a4Height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        doc.addPage('a4', 'p');
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Preview Tile: Row ${r + 1}/${rows}, Col ${c + 1}/${cols}`, 5, 5);
        doc.setTextColor(0);

        drawPreviewContent(-c * a4Width, -r * a4Height);
      }
    }
  }

  // --- Page 3: Template / Stencil (1:1 Scale - Full) ---
  doc.addPage([pageW, pageH], pageW > pageH ? 'l' : 'p');
  drawTemplateContent(0, 0);

  // --- Page 3b: Tiled Template (if larger than A4) ---
  if (pageW > 200 || pageH > 287) {
    const cols = Math.ceil(pageW / a4Width);
    const rows = Math.ceil(pageH / a4Height);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        doc.addPage('a4', 'p');
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Template Tile: Row ${r + 1}/${rows}, Col ${c + 1}/${cols}`, 5, 5);
        doc.setTextColor(0);

        drawTemplateContent(-c * a4Width, -r * a4Height);
      }
    }
  }

  // --- Page 4+: Pin Sequence ---
  doc.addPage('a4', 'p');
  y = margin;
  doc.setFontSize(18);
  doc.text('Pin Sequence', margin, y);
  y += 10;

  doc.setFontSize(9);
  const cols = 4;
  const colWidth = (pageWidth - (margin * 2)) / cols;
  const rowsPerColumn = Math.floor((doc.internal.pageSize.getHeight() - y - margin) / 5);

  let currentStep = 0;
  const sequence = result.lineSequence;
  const totalSteps = sequence.length - 1;

  while (currentStep < totalSteps) {
    for (let col = 0; col < cols; col++) {
      const xBase = margin + (col * colWidth);

      for (let row = 0; row < rowsPerColumn; row++) {
        if (currentStep >= totalSteps) break;

        const fromPin = sequence[currentStep];
        const toPin = sequence[currentStep + 1];
        const stepNumber = currentStep + 1;

        doc.text(`${stepNumber}) ${fromPin} -> ${toPin}`, xBase, y + (row * 5));

        currentStep++;
      }
    }

    if (currentStep < totalSteps) {
      doc.addPage();
      y = margin;
    }
  }

  doc.save(`string-art-plan-${frameDiameter}mm-${Date.now()}.pdf`);
}
