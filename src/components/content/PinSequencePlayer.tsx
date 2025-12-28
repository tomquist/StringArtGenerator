import React, { useReducer, useEffect, useRef, useMemo } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { compressSequence, decompressSequence } from '../../lib/utils/sequenceCompression';
import { calculatePins } from '../../lib/algorithms/pinCalculation';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
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
  X,
  Mic,
  MicOff
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

// State and Actions
interface PlayerState {
  currentStep: number;
  isPlaying: boolean;
  speed: number;
  voices: SpeechSynthesisVoice[];
  selectedVoice: SpeechSynthesisVoice | null;
  searchQuery: string;
  searchMessage: string | null;
  isCopied: boolean;
  showImport: boolean;
  importText: string;
  avgTimeMetric: number | null;
  sampleCount: number;
  compressedSeqString: string | null;
  error: string | null;
}

type PlayerAction =
  | { type: 'SET_CURRENT_STEP'; payload: number }
  | { type: 'SET_IS_PLAYING'; payload: boolean }
  | { type: 'SET_SPEED'; payload: number }
  | { type: 'SET_VOICES'; payload: SpeechSynthesisVoice[] }
  | { type: 'SET_SELECTED_VOICE'; payload: SpeechSynthesisVoice | null }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SEARCH_MESSAGE'; payload: string | null }
  | { type: 'SET_IS_COPIED'; payload: boolean }
  | { type: 'SET_SHOW_IMPORT'; payload: boolean }
  | { type: 'SET_IMPORT_TEXT'; payload: string }
  | { type: 'SET_AVG_TIME_METRIC'; payload: number | null }
  | { type: 'UPDATE_AVG_TIME_METRIC'; payload: number }
  | { type: 'INCREMENT_SAMPLE_COUNT' }
  | { type: 'SET_COMPRESSED_SEQ_STRING'; payload: string | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET_PLAYBACK'; payload: number }
  | { type: 'RESET_TIMING' };

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case 'SET_CURRENT_STEP':
      return { ...state, currentStep: action.payload };
    case 'SET_IS_PLAYING':
      return { ...state, isPlaying: action.payload };
    case 'SET_SPEED':
      return { ...state, speed: action.payload };
    case 'SET_VOICES':
      return { ...state, voices: action.payload };
    case 'SET_SELECTED_VOICE':
      return { ...state, selectedVoice: action.payload };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    case 'SET_SEARCH_MESSAGE':
      return { ...state, searchMessage: action.payload };
    case 'SET_IS_COPIED':
      return { ...state, isCopied: action.payload };
    case 'SET_SHOW_IMPORT':
      return { ...state, showImport: action.payload };
    case 'SET_IMPORT_TEXT':
      return { ...state, importText: action.payload };
    case 'SET_AVG_TIME_METRIC':
      return { ...state, avgTimeMetric: action.payload };
    case 'UPDATE_AVG_TIME_METRIC':
      return {
        ...state,
        avgTimeMetric: state.avgTimeMetric === null
          ? action.payload
          : state.avgTimeMetric * 0.8 + action.payload * 0.2
      };
    case 'INCREMENT_SAMPLE_COUNT':
      return { ...state, sampleCount: state.sampleCount + 1 };
    case 'SET_COMPRESSED_SEQ_STRING':
      return { ...state, compressedSeqString: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'RESET_PLAYBACK':
      return {
        ...state,
        currentStep: action.payload,
        isPlaying: false,
        avgTimeMetric: null,
        sampleCount: 0
      };
    case 'RESET_TIMING':
      return {
        ...state,
        avgTimeMetric: null,
        sampleCount: 0
      };
    default:
      return state;
  }
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
  const [state, dispatch] = useReducer(playerReducer, {
    currentStep: initialStep,
    isPlaying: false,
    speed: 1.0,
    voices: [],
    selectedVoice: null,
    searchQuery: '',
    searchMessage: null,
    isCopied: false,
    showImport: false,
    importText: '',
    avgTimeMetric: null,
    sampleCount: 0,
    compressedSeqString: null,
    error: null
  });

  // Refs
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastStepInfo = useRef<{ time: number; speed: number } | null>(null);
  const isPlayingRef = useRef(state.isPlaying);
  const speedRef = useRef(state.speed);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Speech Recognition Hook
  const speechRecognition = useSpeechRecognition({
    sequence,
    isPlaying: state.isPlaying,
    currentStep: state.currentStep,
    onStepAdvance: (step) => dispatch({ type: 'SET_CURRENT_STEP', payload: step }),
    onPlayingChange: (playing) => dispatch({ type: 'SET_IS_PLAYING', payload: playing })
  });

  const speechRecognitionEnabledRef = useRef(speechRecognition.speechRecognitionEnabled);

  // Sync refs with state
  useEffect(() => {
    isPlayingRef.current = state.isPlaying;
  }, [state.isPlaying]);

  useEffect(() => {
    speedRef.current = state.speed;
  }, [state.speed]);

  useEffect(() => {
    speechRecognitionEnabledRef.current = speechRecognition.speechRecognitionEnabled;
  }, [speechRecognition.speechRecognitionEnabled]);

  // Manage screen wake lock
  useEffect(() => {
    let isMounted = true;

    const handleWakeLockRelease = () => {
      wakeLockRef.current = null;
    };

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && isPlayingRef.current) {
          const wakeLock = await navigator.wakeLock.request('screen');

          // Check if still playing after async operation completes
          if (!isPlayingRef.current || !isMounted) {
            // User paused during the request, release immediately
            await wakeLock.release();
            return;
          }

          wakeLockRef.current = wakeLock;
          wakeLock.addEventListener('release', handleWakeLockRelease);
        }
      } catch {
        // Silently handle wake lock errors (not supported or permission denied)
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          wakeLockRef.current.removeEventListener('release', handleWakeLockRelease);
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
        } catch {
          // Silently handle release errors
        }
      }
    };

    if (state.isPlaying) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Cleanup on unmount
    return () => {
      isMounted = false;
      releaseWakeLock();
    };
  }, [state.isPlaying]);

  // Constants
  // Average speech time per number at 1x speed is approx 0.8s (e.g. "one hundred twenty three")
  // Delay floor is 0.5s.
  // Dynamic calculation matches the actual playback logic.
  const calculateTimePerPin = (s: number) => {
    return (0.8 / s) + Math.max(0.5, 1.5 / s);
  };

  // FIX: Reset state when sequence changes or initialStep changes
  useEffect(() => {
    dispatch({ type: 'RESET_PLAYBACK', payload: initialStep });
    lastStepInfo.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    window.speechSynthesis.cancel();
  }, [sequence, initialStep]);

  // Reset estimation when speed changes
  useEffect(() => {
    dispatch({ type: 'RESET_TIMING' });
    lastStepInfo.current = null;
  }, [state.speed]);

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

    // Draw progress lines (from start to current step)
    if (state.currentStep > 0) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 0.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      for (let i = 0; i < state.currentStep; i++) {
        const pin1Idx = sequence[i];
        const pin2Idx = sequence[i + 1];
        const pin1 = pinCoordinates[pin1Idx];
        const pin2 = pinCoordinates[pin2Idx];

        if (pin1 && pin2) {
          const p1x = offsetX + pin1[0] * scale;
          const p1y = offsetY + pin1[1] * scale;
          const p2x = offsetX + pin2[0] * scale;
          const p2y = offsetY + pin2[1] * scale;

          ctx.moveTo(p1x, p1y);
          ctx.lineTo(p2x, p2y);
        }
      }
      ctx.stroke();
    }

    // Draw all pins (faded)
    ctx.fillStyle = 'rgba(156, 163, 175, 0.3)'; // gray-400 with opacity
    pinCoordinates.forEach((pin) => {
      if (pin) {
        const px = offsetX + pin[0] * scale;
        const py = offsetY + pin[1] * scale;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, 2 * Math.PI);
        ctx.fill();
      }
    });

    // Draw Current Pin
    const currentPinIdx = sequence[state.currentStep];
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

  }, [state.currentStep, sequence, pinCoordinates, shape, width, height]);


  // Initialize Voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      dispatch({ type: 'SET_VOICES', payload: availableVoices });
      if (!state.selectedVoice) {
        const browserLang = navigator.language;
        const defaultVoice =
          availableVoices.find(v => v.lang === browserLang) ||
          availableVoices.find(v => v.lang.startsWith(browserLang.split('-')[0])) ||
          availableVoices.find(v => v.lang.startsWith('en')) ||
          availableVoices[0];
        dispatch({ type: 'SET_SELECTED_VOICE', payload: defaultVoice });
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [state.selectedVoice]);

  // Update compressed sequence string when inputs change
  useEffect(() => {
    let active = true;
    const compress = async () => {
      try {
        const compressed = await compressSequence(sequence, numberOfPins, shape, width, height);
        if (active) {
          dispatch({ type: 'SET_COMPRESSED_SEQ_STRING', payload: compressed });
        }
      } catch (e) {
        console.error('Failed to compress sequence', e);
      }
    };

    const timer = setTimeout(compress, 500); // Debounce compression
    return () => { active = false; clearTimeout(timer); };
  }, [sequence, numberOfPins, shape, width, height]);

  // URL Sync
  useEffect(() => {
    if (!state.compressedSeqString) return;

    const url = new URL(window.location.href);
    url.searchParams.set('seq', state.compressedSeqString);
    url.searchParams.set('step', state.currentStep.toString());
    window.history.replaceState({}, '', url.toString());
  }, [state.currentStep, state.compressedSeqString]);

  // Playback Logic
  const speakPin = (pinIndex: number) => {
    window.speechSynthesis.cancel();
    if (pinIndex >= sequence.length) return;
    const pin = sequence[pinIndex];
    const text = pin.toString();
    const utterance = new SpeechSynthesisUtterance(text);
    if (state.selectedVoice) utterance.voice = state.selectedVoice;
    utterance.rate = state.speed;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      // If speech recognition IS enabled, start listening shortly AFTER speaking starts
      // This allows the user to respond while the number is still being spoken
      if (speechRecognitionEnabledRef.current) {
        setTimeout(() => {
          if (isPlayingRef.current && speechRecognitionEnabledRef.current) {
            if (!speechRecognition.isListening) {
              speechRecognition.startListening(pinIndex);
            } else {
              // Already listening in continuous mode, just update the expected pin
              speechRecognition.updateExpectedPin(pinIndex);
            }
          }
        }, 300); // 300ms delay to avoid picking up the start of the synthesized voice
      }
    };

    utterance.onend = () => {
      // Use ref to check current playing state to avoid stale closure issues
      if (isPlayingRef.current) {
         // If speech recognition is NOT enabled, auto-advance
         if (!speechRecognitionEnabledRef.current) {
           const currentSpeed = speedRef.current;
           const delay = Math.max(500, 1500 / currentSpeed);
           timeoutRef.current = setTimeout(() => {
             if (pinIndex < sequence.length - 1) {
               dispatch({ type: 'SET_CURRENT_STEP', payload: pinIndex + 1 });
             } else {
               dispatch({ type: 'SET_IS_PLAYING', payload: false });
             }
           }, delay);
         }
         // If speech recognition IS enabled, we're already listening from onstart
         // The onresult handler will advance when it hears the correct word
      }
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (state.isPlaying) {
      const now = Date.now();

      // Calculate adaptive timing if we have a previous step record
      if (lastStepInfo.current) {
        const { time: startTime, speed: startSpeed } = lastStepInfo.current;
        const duration = (now - startTime) / 1000;
        // Normalize metric: duration * speed = constant "effort"
        const currentMetric = duration * startSpeed;

        dispatch({ type: 'UPDATE_AVG_TIME_METRIC', payload: currentMetric });
        dispatch({ type: 'INCREMENT_SAMPLE_COUNT' });
      }

      // Record start of this step
      lastStepInfo.current = { time: now, speed: state.speed };
      speakPin(state.currentStep);
    } else {
      // Reset tracking when paused/stopped
      lastStepInfo.current = null;
    }

    return () => {
      // Always cleanup on unmount or dependency change to prevent zombie audio
      window.speechSynthesis.cancel();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStep, state.isPlaying]); // speed is purposefully excluded to avoid re-triggering during playback

  const togglePlay = () => {
    if (state.isPlaying) {
      dispatch({ type: 'SET_IS_PLAYING', payload: false });
      lastStepInfo.current = null;
      window.speechSynthesis.cancel();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // Stop speech recognition
      speechRecognition.stopRecognition();
    } else {
      dispatch({ type: 'SET_IS_PLAYING', payload: true });
      if (state.currentStep >= sequence.length - 1) {
        dispatch({ type: 'SET_CURRENT_STEP', payload: 0 });
      } else {
        // speakPin call handled by effect when isPlaying becomes true
      }
    }
  };

  const handleNext = () => {
    if (state.currentStep < sequence.length - 1) {
      dispatch({ type: 'SET_CURRENT_STEP', payload: state.currentStep + 1 });
    }
  };

  const handlePrev = () => {
    if (state.currentStep > 0) {
      dispatch({ type: 'SET_CURRENT_STEP', payload: state.currentStep - 1 });
    }
  };

  const handleStepInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      const newIndex = Math.max(0, Math.min(sequence.length - 1, val - 1));
      dispatch({ type: 'SET_CURRENT_STEP', payload: newIndex });
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
    dispatch({ type: 'SET_SEARCH_MESSAGE', payload: null });
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
      dispatch({ type: 'SET_SEARCH_MESSAGE', payload: "No match found." });
    } else if (matches.length > 1) {
      dispatch({ type: 'SET_SEARCH_MESSAGE', payload: `Found ${matches.length} matches. Add more pins.` });
    } else {
      dispatch({ type: 'SET_SEARCH_MESSAGE', payload: `Found match at step ${matches[0] + 1}. Jumping...` });
      dispatch({ type: 'SET_CURRENT_STEP', payload: matches[0] + searchNums.length - 1 });
    }
  };

  const handleExportCopy = async () => {
    try {
      const compressed = await compressSequence(sequence, numberOfPins, shape, width, height);
      await navigator.clipboard.writeText(compressed);
      dispatch({ type: 'SET_IS_COPIED', payload: true });
      setTimeout(() => dispatch({ type: 'SET_IS_COPIED', payload: false }), 2000);
    } catch (e) {
      console.error('Export failed', e);
    }
  };

  const handleImportSubmit = async () => {
    try {
      dispatch({ type: 'SET_ERROR', payload: null });
      const data = await decompressSequence(state.importText);
      if (onImport) {
          onImport(data.sequence, data.numberOfPins, data.shape, data.width, data.height);
          dispatch({ type: 'SET_IMPORT_TEXT', payload: '' });
          dispatch({ type: 'SET_SHOW_IMPORT', payload: false });
      }
    } catch {
      dispatch({ type: 'SET_ERROR', payload: 'Invalid Share Code' });
    }
  };

  const remainingSteps = sequence.length - state.currentStep - 1;
  // Use measured average if available, otherwise heuristic
  const timePerStep = state.avgTimeMetric ? (state.avgTimeMetric / state.speed) : calculateTimePerPin(state.speed);
  const estimatedSeconds = Math.max(0, remainingSteps * timePerStep);

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
           <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'SET_SHOW_IMPORT', payload: !state.showImport })}>
             {state.showImport ? <X className="w-4 h-4 mr-1" /> : <FileDown className="w-4 h-4 mr-1" />}
             {state.showImport ? 'Close' : 'Share / Load'}
           </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">

        {/* Import / Export Section */}
        {state.showImport && (
          <div className="p-4 bg-muted/30 rounded-lg space-y-4 animate-in fade-in slide-in-from-top-2">
             <div className="flex gap-2">
                <Button className="flex-1" variant="secondary" onClick={handleExportCopy}>
                  {state.isCopied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                  {state.isCopied ? 'Copied!' : 'Copy Share Code'}
                </Button>
             </div>
             <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or Load</span>
                </div>
             </div>
             <div className="flex gap-2">
               <input
                 className="flex-1 p-2 text-xs font-mono border rounded"
                 placeholder="Paste Share Code..."
                 value={state.importText}
                 onChange={(e) => dispatch({ type: 'SET_IMPORT_TEXT', payload: e.target.value })}
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
               role="img"
               aria-label={`Visualization of pin ${sequence[state.currentStep]} position on the frame`}
             />
             <div className="absolute top-2 right-2 text-[10px] text-muted-foreground bg-white/80 px-1 rounded">
               {shape === 'rectangle' ? `${width}x${height}` : `Ø${width}`}
             </div>
          </div>

          {/* Number & Progress */}
          <div className="flex-1 flex flex-col items-center w-full">
            <div className="text-display-lg font-bold text-primary">
              {sequence[state.currentStep]}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-body-sm text-subtle">Step</span>
              <input
                type="number"
                className="w-20 p-1 text-center rounded border border-input bg-background text-lg font-medium"
                value={state.currentStep + 1}
                onChange={handleStepInput}
                min={1}
                max={sequence.length}
              />
              <span className="text-body-sm text-subtle">/ {sequence.length}</span>
            </div>
            <div className="text-xs text-subtle mt-2 font-medium">
              Est. remaining: {state.sampleCount < 5 ? "Calculating..." : formatTime(estimatedSeconds)}
            </div>

            <div className="w-full mt-4">
              <input
                type="range"
                min={0}
                max={sequence.length - 1}
                value={state.currentStep}
                onChange={(e) => dispatch({ type: 'SET_CURRENT_STEP', payload: parseInt(e.target.value, 10) })}
                className="w-full accent-primary cursor-pointer"
                style={{
                  background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${((state.currentStep + 1) / sequence.length) * 100}%, hsl(var(--muted)) ${((state.currentStep + 1) / sequence.length) * 100}%, hsl(var(--muted)) 100%)`
                }}
              />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-6">
          <Button variant="outline" size="icon" className="w-12 h-12" onClick={handlePrev} disabled={state.currentStep === 0}>
            <SkipBack className="w-5 h-5" />
          </Button>

          <Button
            size="lg"
            className="w-20 h-20 rounded-full text-3xl shadow-lg"
            onClick={togglePlay}
          >
            {state.isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
          </Button>

          <Button variant="outline" size="icon" className="w-12 h-12" onClick={handleNext} disabled={state.currentStep >= sequence.length - 1}>
            <SkipForward className="w-5 h-5" />
          </Button>
        </div>

        {/* Settings Row */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-border/50">
           <div className="flex-1 space-y-2">
             <label className="text-xs font-medium text-subtle">Speed: {state.speed}x</label>
             <input
               type="range"
               min="0.2"
               max="3"
               step="0.1"
               value={state.speed}
               onChange={(e) => dispatch({ type: 'SET_SPEED', payload: parseFloat(e.target.value) })}
               className="w-full accent-primary"
             />
           </div>

           <div className="flex-1 space-y-2">
             <label className="text-xs font-medium text-subtle">Voice</label>
             <select
               className="w-full p-1.5 rounded text-sm border border-input bg-background"
               value={state.selectedVoice?.name || ''}
               onChange={(e) => {
                 const voice = state.voices.find(v => v.name === e.target.value);
                 if (voice) dispatch({ type: 'SET_SELECTED_VOICE', payload: voice });
               }}
             >
               {state.voices.map(v => (
                 <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
               ))}
             </select>
           </div>
        </div>

        {/* Speech Recognition Settings */}
        {speechRecognition.isSpeechRecognitionSupported && (
          <div className="space-y-4 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {speechRecognition.speechRecognitionEnabled ? <Mic className="w-4 h-4 text-primary" /> : <MicOff className="w-4 h-4 text-muted-foreground" />}
                <label className="text-sm font-medium">Voice Confirmation</label>
              </div>
              <Button
                variant={speechRecognition.speechRecognitionEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => speechRecognition.setSpeechRecognitionEnabled(!speechRecognition.speechRecognitionEnabled)}
              >
                {speechRecognition.speechRecognitionEnabled ? 'Disable Voice Confirmation' : 'Enable Voice Confirmation'}
              </Button>
            </div>

            {speechRecognition.speechRecognitionEnabled && (
              <div className="space-y-3 pl-6 animate-in fade-in slide-in-from-top-1">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-subtle">Confirmation Mode</label>
                  <div className="flex gap-2">
                    <Button
                      variant={speechRecognition.recognitionMode === 'number' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => speechRecognition.setRecognitionMode('number')}
                    >
                      Say Number
                    </Button>
                    <Button
                      variant={speechRecognition.recognitionMode === 'keyword' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => speechRecognition.setRecognitionMode('keyword')}
                    >
                      Say Keyword
                    </Button>
                  </div>
                </div>

                {speechRecognition.recognitionMode === 'keyword' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-subtle">Confirmation Keyword</label>
                    <input
                      type="text"
                      className="w-full p-2 rounded text-sm border border-input bg-background"
                      value={speechRecognition.confirmationKeyword}
                      onChange={(e) => speechRecognition.setConfirmationKeyword(e.target.value)}
                      placeholder="e.g., okay, next, go"
                    />
                  </div>
                )}

                {speechRecognition.recognitionStatus && (
                  <div className="p-2 bg-muted/50 rounded text-xs text-center font-medium">
                    {speechRecognition.recognitionStatus}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search sequence (e.g. '10 45 12')..."
              value={state.searchQuery}
              onChange={handleSearch}
              className="w-full pl-9 p-2 rounded border border-input bg-background text-sm"
            />
          </div>
          {state.searchMessage && (
            <p className={`text-xs ${state.searchMessage.includes('Found') ? 'text-green-600' : 'text-amber-600'}`}>
              {state.searchMessage}
            </p>
          )}
          {state.error && (
            <p className="text-xs text-red-600 font-medium">
              {state.error}
            </p>
          )}
        </div>

      </CardContent>
    </Card>
  );
};
