import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { compressSequence } from '../../lib/utils/sequenceCompression';
import { calculatePins } from '../../lib/algorithms/pinCalculation';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Headphones,
  Copy,
  Check,
  FileUp,
  FileDown,
  Search,
  X
} from 'lucide-react';

interface PinSequencePlayerProps {
  sequence: number[];
  numberOfPins: number;
  initialStep?: number;
  shape?: 'circle' | 'rectangle';
  width?: number;
  height?: number;
  onImport?: (sequence: number[], pins: number, shape: 'circle' | 'rectangle', w: number, h: number) => void;
}

// Helper to format remaining time
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}m ${secs}s`;
}

export const PinSequencePlayer: React.FC<PinSequencePlayerProps> = ({
  sequence,
  numberOfPins,
  initialStep = 0,
  shape = 'circle',
  width = 500,
  height = 500,
  onImport
}) => {
  // State
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');

  // Refs
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Constants
  const BASE_TIME_PER_PIN = 2.5;

  // FIX: Reset state when sequence changes or initialStep changes
  useEffect(() => {
    setCurrentStep(initialStep);
    setIsPlaying(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    window.speechSynthesis.cancel();
  }, [sequence, initialStep]);

  // Memoize pin coordinates for visualization
  const pinCoordinates = useMemo(() => {
    // We calculate pins on a normalized 1000x1000 space for precision then scale
    return calculatePins({
      numberOfPins,
      shape,
      width,
      height,
      imgSize: 1000 // Internal reference size
    });
  }, [numberOfPins, shape, width, height]);

  // Draw Visualization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Padding
    const p = 20;
    const drawW = w - 2 * p;
    const drawH = h - 2 * p;

    // Scale Logic
    let scale = 1;
    let offsetX = p;
    let offsetY = p;

    const aspect = (width || 500) / (height || 500);

    if (aspect >= 1) {
       scale = drawW / 1000;
       const scaledH = (1000 / aspect) * scale;
       offsetY = p + (drawH - scaledH) / 2;
    } else {
       scale = drawH / 1000;
       const scaledW = (1000 * aspect) * scale;
       offsetX = p + (drawW - scaledW) / 2;
    }

    // Draw Shape Outline
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 2;
    ctx.beginPath();

    if (shape === 'circle') {
       const cx = w / 2;
       const cy = h / 2;
       const r = (Math.min(drawW, drawH) / 2);
       ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    } else {
        let rectW, rectH;
        if (aspect >= 1) {
            rectW = 1000 * scale;
            rectH = (1000 / aspect) * scale;
        } else {
            rectH = 1000 * scale;
            rectW = (1000 * aspect) * scale;
        }
        ctx.rect(offsetX, offsetY, rectW, rectH);
    }
    ctx.stroke();

    // Draw Current Pin
    const currentPinIdx = sequence[currentStep];
    const pin = pinCoordinates[currentPinIdx];

    if (pin) {
      const px = offsetX + pin[0] * scale;
      const py = offsetY + pin[1] * scale;

      // Draw active pin
      ctx.fillStyle = '#2563eb'; // blue-600
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, 2 * Math.PI);
      ctx.fill();

      // Draw indicator ring
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.3)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, 2 * Math.PI);
      ctx.stroke();
    }

  }, [currentStep, sequence, pinCoordinates, shape, width, height]);


  // Initialize Voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      if (!selectedVoice) {
        const defaultVoice = availableVoices.find(v => v.lang.startsWith('en')) || availableVoices[0];
        setSelectedVoice(defaultVoice);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [selectedVoice]);

  // URL Sync
  useEffect(() => {
    const updateUrl = async () => {
      try {
        const compressed = await compressSequence(sequence, numberOfPins, shape, width, height);
        const url = new URL(window.location.href);
        url.searchParams.set('seq', compressed);
        url.searchParams.set('step', currentStep.toString());
        window.history.replaceState({}, '', url.toString());
      } catch (e) {
        console.error('Failed to update URL state', e);
      }
    };
    const timer = setTimeout(updateUrl, 500);
    return () => clearTimeout(timer);
  }, [currentStep, sequence, numberOfPins, shape, width, height]);

  // Playback Logic
  const speakPin = (pinIndex: number) => {
    window.speechSynthesis.cancel();
    if (pinIndex >= sequence.length) return;
    const pin = sequence[pinIndex];
    const text = pin.toString();
    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = speed;
    utterance.pitch = 1.0;
    utterance.onend = () => {
      if (isPlaying) {
         const delay = Math.max(500, 1500 / speed);
         timeoutRef.current = setTimeout(() => {
           if (currentStep < sequence.length - 1) {
             setCurrentStep(prev => prev + 1);
           } else {
             setIsPlaying(false);
           }
         }, delay);
      }
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (isPlaying) {
      speakPin(currentStep);
    }
    return () => {
      window.speechSynthesis.cancel();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, isPlaying]);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      window.speechSynthesis.cancel();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    } else {
      setIsPlaying(true);
      if (currentStep >= sequence.length - 1) {
        setCurrentStep(0);
      } else {
        speakPin(currentStep);
      }
    }
  };

  const handleNext = () => {
    if (currentStep < sequence.length - 1) setCurrentStep(prev => prev + 1);
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  const handleStepInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      const newIndex = Math.max(0, Math.min(sequence.length - 1, val - 1));
      setCurrentStep(newIndex);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setSearchMessage(null);
    if (!query.trim()) return;
    const searchNums = query.split(/[\s,]+/).filter(s => s).map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    if (searchNums.length === 0) return;

    const matches: number[] = [];
    for (let i = 0; i <= sequence.length - searchNums.length; i++) {
      let match = true;
      for (let j = 0; j < searchNums.length; j++) {
        if (sequence[i + j] !== searchNums[j]) {
          match = false;
          break;
        }
      }
      if (match) matches.push(i);
    }

    if (matches.length === 0) {
      setSearchMessage("No match found.");
    } else if (matches.length > 1) {
      setSearchMessage(`Found ${matches.length} matches. Add more pins.`);
    } else {
      setSearchMessage(`Found match at step ${matches[0] + 1}. Jumping...`);
      setCurrentStep(matches[0] + searchNums.length - 1);
    }
  };

  const handleExportCopy = async () => {
    try {
      const compressed = await compressSequence(sequence, numberOfPins, shape, width, height);
      await navigator.clipboard.writeText(compressed);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      console.error('Export failed', e);
    }
  };

  const handleImportSubmit = () => {
    import('../../lib/utils/sequenceCompression').then(async ({ decompressSequence }) => {
        try {
          const data = await decompressSequence(importText);
          if (onImport) {
              onImport(data.sequence, data.numberOfPins, data.shape, data.width, data.height);
              setImportText('');
              setShowImport(false);
          }
        } catch {
          alert('Invalid sequence string');
        }
    });
  };

  const remainingSteps = sequence.length - currentStep - 1;
  const estimatedSeconds = Math.max(0, remainingSteps * (BASE_TIME_PER_PIN / speed));

  return (
    <Card className="card-hover border-2 mt-8">
      <CardHeader className="pb-4 flex flex-row items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-heading-md font-semibold flex items-center gap-2">
            <Headphones className="w-5 h-5" />
            <span>Hands-free Player</span>
          </h3>
          <p className="text-body-sm text-subtle">
            Audio guide with visual indicator.
          </p>
        </div>
        <div className="flex gap-2">
           <Button variant="outline" size="sm" onClick={() => setShowImport(!showImport)}>
             {showImport ? <X className="w-4 h-4 mr-1" /> : <FileDown className="w-4 h-4 mr-1" />}
             {showImport ? 'Close' : 'Import / Export'}
           </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">

        {/* Import / Export Section */}
        {showImport && (
          <div className="p-4 bg-muted/30 rounded-lg space-y-4 animate-in fade-in slide-in-from-top-2">
             <div className="flex gap-2">
                <Button className="flex-1" variant="secondary" onClick={handleExportCopy}>
                  {isCopied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {isCopied ? 'Copied!' : 'Copy Current Sequence'}
                </Button>
             </div>
             <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or Import</span>
                </div>
             </div>
             <div className="flex gap-2">
               <input
                 className="flex-1 p-2 text-xs font-mono border rounded"
                 placeholder="Paste sequence string..."
                 value={importText}
                 onChange={(e) => setImportText(e.target.value)}
               />
               <Button onClick={handleImportSubmit}>
                 <FileUp className="w-4 h-4 mr-1" /> Load
               </Button>
             </div>
          </div>
        )}

        {/* Main Display + Visualization */}
        <div className="flex flex-col sm:flex-row gap-6 items-center justify-center p-6 bg-muted/30 rounded-lg">

          {/* Visualizer */}
          <div className={`relative w-48 h-48 bg-white border shadow-sm flex-shrink-0 flex items-center justify-center overflow-hidden ${shape === 'circle' ? 'rounded-full' : 'rounded-lg'}`}>
             <canvas
               ref={canvasRef}
               width={200}
               height={200}
               className="w-full h-full"
             />
             <div className="absolute top-2 right-2 text-[10px] text-muted-foreground bg-white/80 px-1 rounded">
               {shape === 'rectangle' ? `${width}x${height}` : `Ø${width}`}
             </div>
          </div>

          {/* Number & Progress */}
          <div className="flex-1 flex flex-col items-center w-full">
            <div className="text-display-lg font-bold text-primary">
              {sequence[currentStep]}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-body-sm text-subtle">Step</span>
              <input
                type="number"
                className="w-20 p-1 text-center rounded border border-input bg-background text-lg font-medium"
                value={currentStep + 1}
                onChange={handleStepInput}
                min={1}
                max={sequence.length}
              />
              <span className="text-body-sm text-subtle">/ {sequence.length}</span>
            </div>
            <div className="text-xs text-subtle mt-2 font-medium">
              Est. remaining: {formatTime(estimatedSeconds)}
            </div>

            <div className="w-full h-2 bg-muted rounded-full mt-4 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${((currentStep + 1) / sequence.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6">
          <Button variant="outline" size="icon" className="w-12 h-12" onClick={handlePrev} disabled={currentStep === 0}>
            <SkipBack className="w-5 h-5" />
          </Button>

          <Button
            size="lg"
            className="w-20 h-20 rounded-full text-3xl shadow-lg"
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
          </Button>

          <Button variant="outline" size="icon" className="w-12 h-12" onClick={handleNext} disabled={currentStep >= sequence.length - 1}>
            <SkipForward className="w-5 h-5" />
          </Button>
        </div>

        {/* Settings Row */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-border/50">
           <div className="flex-1 space-y-2">
             <label className="text-xs font-medium text-subtle">Speed: {speed}x</label>
             <input
               type="range"
               min="0.2"
               max="3"
               step="0.1"
               value={speed}
               onChange={(e) => setSpeed(parseFloat(e.target.value))}
               className="w-full accent-primary"
             />
           </div>

           <div className="flex-1 space-y-2">
             <label className="text-xs font-medium text-subtle">Voice</label>
             <select
               className="w-full p-1.5 rounded text-sm border border-input bg-background"
               value={selectedVoice?.name || ''}
               onChange={(e) => {
                 const voice = voices.find(v => v.name === e.target.value);
                 if (voice) setSelectedVoice(voice);
               }}
             >
               {voices.map(v => (
                 <option key={v.name} value={v.name}>{v.name.slice(0, 20)}...</option>
               ))}
             </select>
           </div>
        </div>

        {/* Search */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search sequence (e.g. '10 45 12')..."
              value={searchQuery}
              onChange={handleSearch}
              className="w-full pl-9 p-2 rounded border border-input bg-background text-sm"
            />
          </div>
          {searchMessage && (
            <p className={`text-xs ${searchMessage.includes('Found') ? 'text-green-600' : 'text-amber-600'}`}>
              {searchMessage}
            </p>
          )}
        </div>

      </CardContent>
    </Card>
  );
};
