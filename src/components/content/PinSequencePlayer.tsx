import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader } from '../ui/card';
import { compressSequence, decompressSequence } from '../../lib/utils/sequenceCompression';
import { calculatePins } from '../../lib/algorithms/pinCalculation';
import n2words from 'n2words';
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

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
  length: number;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

type SpeechRecognitionMode = 'number' | 'keyword';

// Supported language codes by n2words
type N2WordsLang = 'en' | 'ar' | 'cz' | 'dk' | 'de' | 'es' | 'fr' | 'fa' | 'he' | 'hr' | 'hu' | 'id' | 'it' | 'ko' | 'lt' | 'lv' | 'nl' | 'no' | 'pl' | 'pt' | 'ru' | 'sr' | 'tr' | 'uk' | 'vi' | 'zh';

// Helper function to check if transcript matches a number in any supported language
function matchesSpokenNumber(transcript: string, expectedNumber: number, language: string): boolean {
  try {
    // Get the language code (e.g., 'en' from 'en-US')
    const langCode = language.split('-')[0];

    // Supported languages by n2words
    const supportedLangs: N2WordsLang[] = ['en', 'ar', 'cz', 'dk', 'de', 'es', 'fr', 'fa', 'he', 'hr', 'hu', 'id', 'it', 'ko', 'lt', 'lv', 'nl', 'no', 'pl', 'pt', 'ru', 'sr', 'tr', 'uk', 'vi', 'zh'];

    if (!supportedLangs.includes(langCode as N2WordsLang)) {
      return false;
    }

    // Generate the word form of the expected number in the detected language
    const numberAsWords = n2words(expectedNumber, { lang: langCode as N2WordsLang }).toLowerCase();

    // Check if the transcript contains the number as words
    return transcript.includes(numberAsWords);
  } catch {
    // If language not supported by n2words or conversion fails, return false
    return false;
  }
}

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
  const [avgTimeMetric, setAvgTimeMetric] = useState<number | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [compressedSeqString, setCompressedSeqString] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Speech Recognition State
  const [speechRecognitionEnabled, setSpeechRecognitionEnabled] = useState(false);
  const [recognitionMode, setRecognitionMode] = useState<SpeechRecognitionMode>('keyword');
  const [confirmationKeyword, setConfirmationKeyword] = useState('okay');
  const [recognitionStatus, setRecognitionStatus] = useState<string | null>(null);
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(false);

  // Refs
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastStepInfo = useRef<{ time: number; speed: number } | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const speedRef = useRef(speed);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const waitingForConfirmationRef = useRef(false);
  const expectedPinIndexRef = useRef(currentStep);

  // Sync refs with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  // Check for Speech Recognition support
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSpeechRecognitionSupported(!!SpeechRecognitionAPI);
  }, []);

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

    if (isPlaying) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Cleanup on unmount
    return () => {
      isMounted = false;
      releaseWakeLock();
    };
  }, [isPlaying]);

  // Constants
  // Average speech time per number at 1x speed is approx 0.8s (e.g. "one hundred twenty three")
  // Delay floor is 0.5s.
  // Dynamic calculation matches the actual playback logic.
  const calculateTimePerPin = (s: number) => {
    return (0.8 / s) + Math.max(0.5, 1.5 / s);
  };

  // FIX: Reset state when sequence changes or initialStep changes
  useEffect(() => {
    setCurrentStep(initialStep);
    setIsPlaying(false);
    setAvgTimeMetric(null);
    setSampleCount(0);
    lastStepInfo.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    window.speechSynthesis.cancel();
  }, [sequence, initialStep]);

  // Reset estimation when speed changes
  useEffect(() => {
    setAvgTimeMetric(null);
    setSampleCount(0);
    lastStepInfo.current = null;
  }, [speed]);

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
    if (currentStep > 0) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.lineWidth = 0.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      for (let i = 0; i < currentStep; i++) {
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
        const browserLang = navigator.language;
        const defaultVoice =
          availableVoices.find(v => v.lang === browserLang) ||
          availableVoices.find(v => v.lang.startsWith(browserLang.split('-')[0])) ||
          availableVoices.find(v => v.lang.startsWith('en')) ||
          availableVoices[0];
        setSelectedVoice(defaultVoice);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [selectedVoice]);

  // Update compressed sequence string when inputs change
  useEffect(() => {
    let active = true;
    const compress = async () => {
      try {
        const compressed = await compressSequence(sequence, numberOfPins, shape, width, height);
        if (active) {
          setCompressedSeqString(compressed);
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
    if (!compressedSeqString) return;

    const url = new URL(window.location.href);
    url.searchParams.set('seq', compressedSeqString);
    url.searchParams.set('step', currentStep.toString());
    window.history.replaceState({}, '', url.toString());
  }, [currentStep, compressedSeqString]);

  // Speech Recognition Logic
  const startListening = (pinIndex: number) => {
    if (!speechRecognitionEnabled || !isSpeechRecognitionSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    // Stop any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore errors from stopping (e.g., if already stopped)
      }
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';

    expectedPinIndexRef.current = pinIndex;
    waitingForConfirmationRef.current = true;

    const currentPinNumber = sequence[pinIndex];
    setRecognitionStatus(`Waiting for ${recognitionMode === 'number' ? `"${currentPinNumber}"` : `"${confirmationKeyword}"`}...`);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Use the latest result from the continuous recognition
      const lastResultIndex = event.results.length - 1;
      const transcript = event.results[lastResultIndex][0].transcript.toLowerCase().trim();

      // Get the current expected pin from the ref (may have changed during continuous recognition)
      const expectedPinIndex = expectedPinIndexRef.current;
      const expectedPinNumber = sequence[expectedPinIndex];

      let isMatch = false;
      if (recognitionMode === 'number') {
        // Strategy 1: Check if transcript contains the expected number as digits
        const digitMatch = transcript.match(/\d+/);
        if (digitMatch && parseInt(digitMatch[0], 10) === expectedPinNumber) {
          isMatch = true;
        }

        // Strategy 2: Check if transcript matches spoken number in the recognition language
        if (!isMatch) {
          isMatch = matchesSpokenNumber(transcript, expectedPinNumber, recognition.lang);
        }

        // Strategy 3: Check if transcript includes the number as a string (fallback)
        if (!isMatch) {
          const expectedString = expectedPinNumber.toString();
          if (transcript.includes(expectedString)) {
            isMatch = true;
          }
        }
      } else {
        // Check if transcript contains the confirmation keyword
        isMatch = transcript.includes(confirmationKeyword.toLowerCase());
      }

      if (isMatch) {
        setRecognitionStatus('✓ Confirmed');

        // Move to next step
        setTimeout(() => {
          if (expectedPinIndex < sequence.length - 1) {
            const nextIndex = expectedPinIndex + 1;
            setCurrentStep(nextIndex);
            expectedPinIndexRef.current = nextIndex;
            const nextPinNumber = sequence[nextIndex];
            setRecognitionStatus(`Waiting for ${recognitionMode === 'number' ? `"${nextPinNumber}"` : `"${confirmationKeyword}"`}...`);
          } else {
            setIsPlaying(false);
            waitingForConfirmationRef.current = false;
          }
        }, 300);
      } else {
        setRecognitionStatus(`❌ Said "${transcript}" - try again`);
        // In continuous mode, just keep listening - no need to restart
        setTimeout(() => {
          if (isPlayingRef.current && waitingForConfirmationRef.current) {
            setRecognitionStatus(`Waiting for ${recognitionMode === 'number' ? `"${expectedPinNumber}"` : `"${confirmationKeyword}"`}...`);
          }
        }, 800);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Handle different error types
      if (event.error === 'no-speech') {
        // In continuous mode, this is just a warning - recognition will continue
        // Don't show anything, as continuous listening should keep going
      } else if (event.error === 'aborted') {
        // Aborted errors happen when stop() is called intentionally
        // This is expected when pausing or disabling, don't restart
      } else if (event.error === 'audio-capture' || event.error === 'not-allowed') {
        // Permission or hardware errors - disable the feature
        setRecognitionStatus(`Microphone error: ${event.error}`);
        waitingForConfirmationRef.current = false;
        setSpeechRecognitionEnabled(false);
      } else {
        // Other errors - try to restart in continuous mode
        console.warn('Speech recognition error:', event.error);
        if (isPlayingRef.current && waitingForConfirmationRef.current) {
          setTimeout(() => {
            if (isPlayingRef.current && waitingForConfirmationRef.current) {
              startListening(expectedPinIndexRef.current);
            }
          }, 500);
        }
      }
    };

    recognition.onend = () => {
      // In continuous mode, this shouldn't fire unless there's an error
      // Restart if we're still waiting and playing
      if (waitingForConfirmationRef.current && isPlayingRef.current) {
        setTimeout(() => {
          if (isPlayingRef.current && waitingForConfirmationRef.current) {
            startListening(expectedPinIndexRef.current);
          }
        }, 200);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Cleanup speech recognition on unmount or when disabled
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!speechRecognitionEnabled && recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      waitingForConfirmationRef.current = false;
      setRecognitionStatus(null);
    } else if (speechRecognitionEnabled && isSpeechRecognitionSupported && isPlaying) {
      // When enabling voice confirmation while playing, start listening immediately
      // This also handles the initial permission request
      if (!recognitionRef.current) {
        startListening(currentStep);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechRecognitionEnabled]);

  // Update status message when recognition mode or keyword changes
  useEffect(() => {
    if (speechRecognitionEnabled && recognitionRef.current && waitingForConfirmationRef.current) {
      const expectedPinIndex = expectedPinIndexRef.current;
      const expectedPinNumber = sequence[expectedPinIndex];
      setRecognitionStatus(`Waiting for ${recognitionMode === 'number' ? `"${expectedPinNumber}"` : `"${confirmationKeyword}"`}...`);
    }
  }, [recognitionMode, confirmationKeyword, speechRecognitionEnabled, sequence]);

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

    // If speech recognition is enabled, start listening BEFORE speaking
    // This ensures the user can respond immediately when they hear the number
    if (speechRecognitionEnabled && !recognitionRef.current) {
      startListening(pinIndex);
    } else if (speechRecognitionEnabled && recognitionRef.current) {
      // Already listening in continuous mode, just update the expected pin
      expectedPinIndexRef.current = pinIndex;
      const currentPinNumber = sequence[pinIndex];
      setRecognitionStatus(`Waiting for ${recognitionMode === 'number' ? `"${currentPinNumber}"` : `"${confirmationKeyword}"`}...`);
    }

    utterance.onend = () => {
      // Use ref to check current playing state to avoid stale closure issues
      if (isPlayingRef.current) {
         // If speech recognition is NOT enabled, auto-advance
         if (!speechRecognitionEnabled) {
           const currentSpeed = speedRef.current;
           const delay = Math.max(500, 1500 / currentSpeed);
           timeoutRef.current = setTimeout(() => {
             if (pinIndex < sequence.length - 1) {
               setCurrentStep(pinIndex + 1);
             } else {
               setIsPlaying(false);
             }
           }, delay);
         }
         // If speech recognition IS enabled, we're already listening in continuous mode
         // The onresult handler will advance when it hears the correct word
      }
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (isPlaying) {
      const now = Date.now();

      // Calculate adaptive timing if we have a previous step record
      if (lastStepInfo.current) {
        const { time: startTime, speed: startSpeed } = lastStepInfo.current;
        const duration = (now - startTime) / 1000;
        // Normalize metric: duration * speed = constant "effort"
        const currentMetric = duration * startSpeed;

        setAvgTimeMetric(prev => {
          if (prev === null) return currentMetric;
          // Exponential Moving Average (alpha = 0.2)
          return prev * 0.8 + currentMetric * 0.2;
        });
        setSampleCount(prev => prev + 1);
      }

      // Record start of this step
      lastStepInfo.current = { time: now, speed };
      speakPin(currentStep);
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
  }, [currentStep, isPlaying]); // speed is purposefully excluded to avoid re-triggering during playback

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      lastStepInfo.current = null;
      window.speechSynthesis.cancel();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      // Stop speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      waitingForConfirmationRef.current = false;
      setRecognitionStatus(null);
    } else {
      setIsPlaying(true);
      if (currentStep >= sequence.length - 1) {
        setCurrentStep(0);
      } else {
        // speakPin call handled by effect when isPlaying becomes true
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

  const handleImportSubmit = async () => {
    try {
      setError(null);
      const data = await decompressSequence(importText);
      if (onImport) {
          onImport(data.sequence, data.numberOfPins, data.shape, data.width, data.height);
          setImportText('');
          setShowImport(false);
      }
    } catch {
      setError('Invalid Share Code');
    }
  };

  const remainingSteps = sequence.length - currentStep - 1;
  // Use measured average if available, otherwise heuristic
  const timePerStep = avgTimeMetric ? (avgTimeMetric / speed) : calculateTimePerPin(speed);
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
           <Button variant="outline" size="sm" onClick={() => setShowImport(!showImport)}>
             {showImport ? <X className="w-4 h-4 mr-1" /> : <FileDown className="w-4 h-4 mr-1" />}
             {showImport ? 'Close' : 'Share / Load'}
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
                  {isCopied ? 'Copied!' : 'Copy Share Code'}
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
               role="img"
               aria-label={`Visualization of pin ${sequence[currentStep]} position on the frame`}
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
              Est. remaining: {sampleCount < 5 ? "Calculating..." : formatTime(estimatedSeconds)}
            </div>

            <div className="w-full mt-4">
              <input
                type="range"
                min={0}
                max={sequence.length - 1}
                value={currentStep}
                onChange={(e) => setCurrentStep(parseInt(e.target.value, 10))}
                className="w-full accent-primary cursor-pointer"
                style={{
                  background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${((currentStep + 1) / sequence.length) * 100}%, hsl(var(--muted)) ${((currentStep + 1) / sequence.length) * 100}%, hsl(var(--muted)) 100%)`
                }}
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
                 <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
               ))}
             </select>
           </div>
        </div>

        {/* Speech Recognition Settings */}
        {isSpeechRecognitionSupported && (
          <div className="space-y-4 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {speechRecognitionEnabled ? <Mic className="w-4 h-4 text-primary" /> : <MicOff className="w-4 h-4 text-muted-foreground" />}
                <label className="text-sm font-medium">Voice Confirmation</label>
              </div>
              <Button
                variant={speechRecognitionEnabled ? "default" : "outline"}
                size="sm"
                onClick={() => setSpeechRecognitionEnabled(!speechRecognitionEnabled)}
              >
                {speechRecognitionEnabled ? 'Disable Voice Confirmation' : 'Enable Voice Confirmation'}
              </Button>
            </div>

            {speechRecognitionEnabled && (
              <div className="space-y-3 pl-6 animate-in fade-in slide-in-from-top-1">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-subtle">Confirmation Mode</label>
                  <div className="flex gap-2">
                    <Button
                      variant={recognitionMode === 'number' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setRecognitionMode('number')}
                    >
                      Say Number
                    </Button>
                    <Button
                      variant={recognitionMode === 'keyword' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setRecognitionMode('keyword')}
                    >
                      Say Keyword
                    </Button>
                  </div>
                </div>

                {recognitionMode === 'keyword' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-subtle">Confirmation Keyword</label>
                    <input
                      type="text"
                      className="w-full p-2 rounded text-sm border border-input bg-background"
                      value={confirmationKeyword}
                      onChange={(e) => setConfirmationKeyword(e.target.value)}
                      placeholder="e.g., okay, next, go"
                    />
                  </div>
                )}

                {recognitionStatus && (
                  <div className="p-2 bg-muted/50 rounded text-xs text-center font-medium">
                    {recognitionStatus}
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
          {error && (
            <p className="text-xs text-red-600 font-medium">
              {error}
            </p>
          )}
        </div>

      </CardContent>
    </Card>
  );
};
