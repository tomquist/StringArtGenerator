
import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '../ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import type { YarnSpec, YarnType, YarnMaterial } from '../../types/yarn';
import { normalizeToTex, calculateDiameterMM, calculateLineWeight } from '../../lib/algorithms/yarnConversion';

type YarnParametersProps = {
  onChange: (spec: YarnSpec, calculatedLineWeight: number) => void;
  hoopDiameterMM: number;
  imgSizePx: number;
  initialSpec?: YarnSpec;
  disabled?: boolean;
};

export const YarnParameters: React.FC<YarnParametersProps> = ({
  onChange,
  hoopDiameterMM,
  imgSizePx,
  initialSpec,
  disabled = false
}) => {
  // Local state for the yarn spec
  const [spec, setSpec] = useState<YarnSpec>(initialSpec || {
    type: 'tex',
    material: 'polyester',
    tex: 30,
    k: 1.10
  });

  // Derived values for preview
  const tex = normalizeToTex(spec);
  const diameterMM = calculateDiameterMM(spec);
  const lineWeight = calculateLineWeight(diameterMM * (spec.k || 1.10), hoopDiameterMM, imgSizePx);

  // Notify parent on changes
  useEffect(() => {
    onChange(spec, lineWeight);
  }, [spec, hoopDiameterMM, imgSizePx]); // Don't include lineWeight or we loop if parent updates it

  const updateSpec = (updates: Partial<YarnSpec>) => {
    setSpec(prev => ({ ...prev, ...updates }));
  };

  const handleTypeChange = (value: YarnType) => {
    updateSpec({ type: value });
  };

  const handleMaterialChange = (value: YarnMaterial) => {
    updateSpec({ material: value });
  };

  return (
    <Card className="border-2 mt-4">
      <CardHeader className="pb-4">
        <h3 className="text-heading-sm font-semibold">Thread / Yarn Specification</h3>
        <p className="text-body-sm text-subtle">
          Configure based on what's printed on your spool
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step A: Type Selection */}
        <div className="space-y-2">
          <label className="text-body-sm font-medium">Specification Type</label>
          <Select
            value={spec.type}
            onValueChange={(val) => handleTypeChange(val as YarnType)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ticket">Ticket / No. (e.g., 120)</SelectItem>
              <SelectItem value="nm">Nm (e.g., Nm 71/2)</SelectItem>
              <SelectItem value="tex">Tex (e.g., 30)</SelectItem>
              <SelectItem value="dtex">dtex (e.g., 141)</SelectItem>
              <SelectItem value="denier">Denier (e.g., 120)</SelectItem>
              <SelectItem value="length_weight">Length & Weight (e.g., 125m / 50g)</SelectItem>
              <SelectItem value="diameter_mm">Diameter (mm)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Dynamic Inputs based on Type */}
        <div className="grid grid-cols-2 gap-4">
          {spec.type === 'ticket' && (
            <div className="col-span-2">
               <label className="text-caption text-subtle block mb-1">Ticket No.</label>
               <input
                 type="number"
                 className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                 value={spec.ticketNo || ''}
                 onChange={(e) => updateSpec({ ticketNo: parseFloat(e.target.value) })}
                 disabled={disabled}
               />
            </div>
          )}

          {spec.type === 'nm' && (
            <>
              <div>
                <label className="text-caption text-subtle block mb-1">Nm Value</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={spec.nm || ''}
                  onChange={(e) => updateSpec({ nm: parseFloat(e.target.value) })}
                  disabled={disabled}
                />
              </div>
              <div>
                <label className="text-caption text-subtle block mb-1">Ply (optional)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={spec.ply || ''}
                  placeholder="1"
                  onChange={(e) => updateSpec({ ply: parseFloat(e.target.value) })}
                  disabled={disabled}
                />
              </div>
            </>
          )}

          {spec.type === 'tex' && (
            <div className="col-span-2">
               <label className="text-caption text-subtle block mb-1">Tex Value</label>
               <input
                 type="number"
                 className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                 value={spec.tex || ''}
                 onChange={(e) => updateSpec({ tex: parseFloat(e.target.value) })}
                 disabled={disabled}
               />
            </div>
          )}

          {spec.type === 'dtex' && (
            <>
              <div>
                <label className="text-caption text-subtle block mb-1">dtex Value</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={spec.dtex || ''}
                  onChange={(e) => updateSpec({ dtex: parseFloat(e.target.value) })}
                  disabled={disabled}
                />
              </div>
              <div>
                <label className="text-caption text-subtle block mb-1">Ply (optional)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={spec.ply || ''}
                  placeholder="1"
                  onChange={(e) => updateSpec({ ply: parseFloat(e.target.value) })}
                  disabled={disabled}
                />
              </div>
            </>
          )}

          {spec.type === 'denier' && (
            <>
              <div>
                <label className="text-caption text-subtle block mb-1">Denier Value</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={spec.denier || ''}
                  onChange={(e) => updateSpec({ denier: parseFloat(e.target.value) })}
                  disabled={disabled}
                />
              </div>
              <div>
                <label className="text-caption text-subtle block mb-1">Ply (optional)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={spec.ply || ''}
                  placeholder="1"
                  onChange={(e) => updateSpec({ ply: parseFloat(e.target.value) })}
                  disabled={disabled}
                />
              </div>
            </>
          )}

          {spec.type === 'length_weight' && (
            <>
              <div>
                <label className="text-caption text-subtle block mb-1">Length (m)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={spec.meters || ''}
                  onChange={(e) => updateSpec({ meters: parseFloat(e.target.value) })}
                  disabled={disabled}
                />
              </div>
              <div>
                <label className="text-caption text-subtle block mb-1">Weight (g)</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={spec.grams || ''}
                  onChange={(e) => updateSpec({ grams: parseFloat(e.target.value) })}
                  disabled={disabled}
                />
              </div>
            </>
          )}

          {spec.type === 'diameter_mm' && (
            <div className="col-span-2">
               <label className="text-caption text-subtle block mb-1">Diameter (mm)</label>
               <input
                 type="number"
                 step="0.01"
                 className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                 value={spec.diameterMM || ''}
                 onChange={(e) => updateSpec({ diameterMM: parseFloat(e.target.value) })}
                 disabled={disabled}
               />
            </div>
          )}
        </div>

        {/* Step B: Material Selection */}
        <div className="space-y-2">
          <label className="text-body-sm font-medium">Material</label>
          <Select
            value={spec.material}
            onValueChange={(val) => handleMaterialChange(val as YarnMaterial)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select material" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="polyester">Polyester (Default)</SelectItem>
              <SelectItem value="cotton">Cotton</SelectItem>
              <SelectItem value="nylon">Nylon</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Preview Panel */}
        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-subtle">Normalized Tex:</span>
            <span className="font-medium">{tex.toFixed(1)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-subtle">Est. Diameter:</span>
            <span className="font-medium">{diameterMM.toFixed(3)} mm</span>
          </div>
          <div className="flex justify-between items-center text-sm">
             <span className="text-subtle">Derived Line Weight:</span>
             <span className="font-medium">{lineWeight} / 255</span>
          </div>
          <div className="text-xs text-subtle mt-1">
             Frame: {hoopDiameterMM}mm, Image: {imgSizePx}px
          </div>
        </div>

        {/* Advanced Settings */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="yarn-advanced">
            <AccordionTrigger className="text-sm py-2">Advanced Yarn Settings</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-2">
                <div>
                   <label className="text-caption text-subtle block mb-1">Visual Thickness Multiplier (k)</label>
                   <input
                     type="number"
                     step="0.01"
                     className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                     value={spec.k || 1.10}
                     onChange={(e) => updateSpec({ k: parseFloat(e.target.value) })}
                     disabled={disabled}
                   />
                   <p className="text-xs text-subtle mt-1">Adjusts effective thickness for visual density (default 1.10)</p>
                </div>
                <div>
                   <label className="text-caption text-subtle block mb-1">Override Diameter (mm)</label>
                   <input
                     type="number"
                     step="0.01"
                     className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                     value={spec.overrideDiameterMM || ''}
                     placeholder="Optional"
                     onChange={(e) => updateSpec({ overrideDiameterMM: e.target.value ? parseFloat(e.target.value) : undefined })}
                     disabled={disabled}
                   />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
};
