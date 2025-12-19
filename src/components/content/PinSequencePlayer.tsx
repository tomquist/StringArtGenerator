
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { compressSequence } from '../../lib/utils/sequenceCompression';

interface PinSequencePlayerProps {
  sequence: number[];
  numberOfPins: number;
  initialStep?: number;
  onReset?: () => void;
}

export const PinSequencePlayer: React.FC<PinSequencePlayerProps> = ({
  sequence,
  numberOfPins,
  initialStep = 0,
  onReset
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
  const [showExport, setShowExport] = useState(false);
  const [exportedString, setExportedString] = useState('');

  // Refs
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize Voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      // Default to first English voice if available
      if (!selectedVoice) {
        const defaultVoice = availableVoices.find(v => v.lang.startsWith('en')) || availableVoices[0];
        setSelectedVoice(defaultVoice);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [selectedVoice]);

  // URL Sync
  useEffect(() => {
    // We update the URL silently
    const updateUrl = async () => {
      try {
        const compressed = await compressSequence(sequence, numberOfPins);
        const url = new URL(window.location.href);
        url.searchParams.set('seq', compressed);
        url.searchParams.set('step', currentStep.toString());

        window.history.replaceState({}, '', url.toString());
      } catch (e) {
        console.error('Failed to update URL state', e);
      }
    };

    // Debounce slightly to avoid rapid updates during playback
    const timer = setTimeout(updateUrl, 500);
    return () => clearTimeout(timer);
  }, [currentStep, sequence, numberOfPins]);

  // Generate exported string
  useEffect(() => {
    if (showExport && !exportedString) {
      compressSequence(sequence, numberOfPins).then(setExportedString);
    }
  }, [showExport, sequence, numberOfPins, exportedString]);

  // Playback Logic
  const speakPin = (pinIndex: number) => {
    window.speechSynthesis.cancel();

    // Safety check
    if (pinIndex >= sequence.length) return;

    const pin = sequence[pinIndex];
    const text = pin.toString();
    const utterance = new SpeechSynthesisUtterance(text);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.rate = speed;
    utterance.pitch = 1.0;

    utterance.onend = () => {
      if (isPlaying) {
         // Schedule next step
         // We add a small delay proportional to speed to make it rhythmic
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
      // If we are at the end, restart?
      if (currentStep >= sequence.length - 1) {
        setCurrentStep(0);
      } else {
        speakPin(currentStep);
      }
    }
  };

  const handleNext = () => {
    if (currentStep < sequence.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleStepInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      // 1-based input, 0-based index
      const newIndex = Math.max(0, Math.min(sequence.length - 1, val - 1));
      setCurrentStep(newIndex);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    setSearchMessage(null);

    if (!query.trim()) return;

    // Normalize: split by spaces/commas, filter empty, map to numbers
    const searchNums = query.split(/[\s,]+/).filter(s => s).map(s => parseInt(s, 10)).filter(n => !isNaN(n));

    if (searchNums.length === 0) return;

    // Find occurrences
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
      setSearchMessage(`Found ${matches.length} matches. Add more pins to narrow down.`);
    } else {
      setSearchMessage(`Found unique match at step ${matches[0] + 1}. Jumping...`);
      setCurrentStep(matches[0] + searchNums.length - 1);
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const copyExportString = () => {
    navigator.clipboard.writeText(exportedString);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <Card className="card-hover border-2 mt-8">
      <CardHeader className="pb-4 flex flex-row items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-heading-md font-semibold flex items-center gap-2">
            <span>🎧</span> Hands-free Player
          </h3>
          <p className="text-body-sm text-subtle">
            Audio guide for your pin sequence.
          </p>
        </div>
        {onReset && (
           <Button variant="ghost" size="sm" onClick={onReset} className="text-subtle hover:text-destructive">
             Load Different Sequence
           </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Display */}
        <div className="flex flex-col items-center justify-center p-6 bg-muted/30 rounded-lg">
          <div className="text-display-sm font-bold text-primary">
            {sequence[currentStep]}
          </div>
          <div className="flex items-center gap-2 mt-1">
             <span className="text-body-sm text-subtle">Step</span>
             <input
               type="number"
               className="w-16 p-1 text-center rounded border border-input bg-background text-sm font-medium"
               value={currentStep + 1}
               onChange={handleStepInput}
               min={1}
               max={sequence.length}
             />
             <span className="text-body-sm text-subtle">/ {sequence.length}</span>
          </div>

           {/* Progress Bar Visual */}
           <div className="w-full h-2 bg-muted rounded-full mt-4 overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${((currentStep + 1) / sequence.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          <Button variant="outline" size="icon" onClick={handlePrev} disabled={currentStep === 0}>
            ⏮
          </Button>

          <Button
            size="lg"
            className="w-16 h-16 rounded-full text-2xl"
            onClick={togglePlay}
          >
            {isPlaying ? '⏸' : '▶'}
          </Button>

          <Button variant="outline" size="icon" onClick={handleNext} disabled={currentStep >= sequence.length - 1}>
            ⏭
          </Button>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           {/* Speed */}
           <div className="space-y-3">
             <label className="text-sm font-medium">Speed: {speed}x</label>
             <input
               type="range"
               min="0.5"
               max="3"
               step="0.25"
               value={speed}
               onChange={(e) => setSpeed(parseFloat(e.target.value))}
               className="w-full"
             />
           </div>

           {/* Voice */}
           <div className="space-y-3">
             <label className="text-sm font-medium">Voice</label>
             <select
               className="w-full p-2 rounded-md border border-input bg-background text-sm"
               value={selectedVoice?.name || ''}
               onChange={(e) => {
                 const voice = voices.find(v => v.name === e.target.value);
                 if (voice) setSelectedVoice(voice);
               }}
             >
               {voices.map(v => (
                 <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
               ))}
             </select>
           </div>
        </div>

        {/* Search */}
        <div className="space-y-2 pt-4 border-t border-border">
          <label className="text-sm font-medium">Find Position</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter sequence (e.g. '10 45 12')..."
              value={searchQuery}
              onChange={handleSearch}
              className="flex-1 p-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
          {searchMessage && (
            <p className={`text-xs ${searchMessage.includes('Unique') ? 'text-green-600' : 'text-amber-600'}`}>
              {searchMessage}
            </p>
          )}
        </div>

        {/* Share & Export */}
        <div className="pt-2 space-y-2">
           <Button variant="outline" className="w-full" onClick={copyShareLink}>
             {isCopied && !showExport ? '✅ Link Copied!' : '🔗 Copy Share Link'}
           </Button>

           <Button variant="ghost" className="w-full text-xs text-subtle" onClick={() => setShowExport(!showExport)}>
             {showExport ? 'Hide Export Options' : 'Show Export Options'}
           </Button>

           {showExport && (
             <div className="space-y-2 p-3 bg-muted/30 rounded-md animate-in fade-in zoom-in-95 duration-200">
                <label className="text-xs font-medium">Compressed Sequence String</label>
                <textarea
                  readOnly
                  value={exportedString}
                  className="w-full h-24 p-2 text-xs font-mono border rounded bg-background resize-none"
                  onClick={(e) => e.currentTarget.select()}
                />
                <Button size="sm" className="w-full" onClick={copyExportString}>
                   {isCopied ? '✅ String Copied!' : '📋 Copy String'}
                </Button>
             </div>
           )}
        </div>

      </CardContent>
    </Card>
  );
};
