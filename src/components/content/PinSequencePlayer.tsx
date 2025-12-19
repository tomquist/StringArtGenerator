
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { compressSequence } from '../../lib/utils/sequenceCompression';

interface PinSequencePlayerProps {
  sequence: number[];
  numberOfPins: number;
  initialStep?: number;
}

export const PinSequencePlayer: React.FC<PinSequencePlayerProps> = ({
  sequence,
  numberOfPins,
  initialStep = 0
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

  // Effect to trigger speech when step changes AND playing
  // But wait, if we change step manually, we might not want to speak immediately unless playing?
  // Actually, standard players usually don't speak on manual seek unless requested.
  // BUT the requirement is "reads out loud... in the right order".
  // If I press Next, it should probably speak.
  // Let's modify: separate the "speak" trigger.

  // Revised Playback Logic:
  // We use an effect that watches `currentStep`. If `isPlaying` is true, we speak.
  // If we just seek, we don't necessarily speak, unless we want to confirm the position.
  // User "can enter their current position... even while it's playing".

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
  // We don't include selectedVoice/speed here to avoid restarting current speech mid-utterance unexpectedly,
  // though typically you might want real-time update.
  // For simplicity, speed/voice changes apply to NEXT utterance.

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
        // Trigger the effect
        speakPin(currentStep);
      }
    }
  };

  const handleNext = () => {
    if (currentStep < sequence.length - 1) {
      setCurrentStep(prev => prev + 1);
      // If paused, maybe read the new pin once?
      if (!isPlaying) {
        // Optional: read single pin on manual navigation
        // speakPin(currentStep + 1); // This would conflict with effect if we enabled it for all changes
      }
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
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

    // Naive search is O(N*M), fine for N=4000
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
      // Unique match!
      setSearchMessage(`Found unique match at step ${matches[0] + 1}. Jumping...`);
      setCurrentStep(matches[0] + searchNums.length - 1); // Jump to the LAST pin in the sequence entered? Or the start?
      // "The user can enter their current position" -> usually means "I just did pin X, Y, Z".
      // So we should be at Z (ready for next).
      // So matches[0] + searchNums.length - 1 is the index of the last entered pin.
      // The player should probably be ready to play the *next* one?
      // Or if the player plays the *current* step, then we set it to matches[0] + searchNums.length - 1
      // and let it play that (re-confirming) or just wait.
      // Let's set it to the last matched pin index.
    }
  };

  const copyShareLink = () => {
    // The URL is already updated by the effect
    navigator.clipboard.writeText(window.location.href);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <Card className="card-hover border-2 mt-8">
      <CardHeader className="pb-4">
        <h3 className="text-heading-md font-semibold flex items-center gap-2">
          <span>🎧</span> Hands-free Player
        </h3>
        <p className="text-body-sm text-subtle">
          Audio guide for your pin sequence. Bookmark this page to resume later.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Display */}
        <div className="flex flex-col items-center justify-center p-6 bg-muted/30 rounded-lg">
          <div className="text-display-sm font-bold text-primary">
            {sequence[currentStep]}
          </div>
          <div className="text-body-sm text-subtle mt-1">
            Step {currentStep + 1} / {sequence.length}
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

        {/* Share */}
        <div className="pt-2">
           <Button variant="outline" className="w-full" onClick={copyShareLink}>
             {isCopied ? '✅ Link Copied!' : '🔗 Copy Share Link'}
           </Button>
        </div>

      </CardContent>
    </Card>
  );
};
