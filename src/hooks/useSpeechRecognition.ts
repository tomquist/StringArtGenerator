import { useState, useEffect, useRef } from 'react';
import n2words, { type LanguageCode } from 'n2words';

export type SpeechRecognitionMode = 'number' | 'keyword';

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

// Language code mapping: browser language codes -> n2words language codes
const languageCodeMap: Record<string, LanguageCode> = {
  'en': 'en', 'ar': 'ar', 'az': 'az', 'bn': 'bn', 'cs': 'cs', 'de': 'de',
  'da': 'da', 'el': 'el', 'es': 'es', 'fa': 'fa', 'fr': 'fr', 'gu': 'gu',
  'he': 'he', 'hi': 'hi', 'hr': 'hr', 'hu': 'hu', 'id': 'id', 'it': 'it',
  'ja': 'ja', 'kn': 'kn', 'ko': 'ko', 'lt': 'lt', 'lv': 'lv', 'mr': 'mr',
  'ms': 'ms', 'nl': 'nl', 'nb': 'nb', 'no': 'nb', 'pa': 'pa-Guru', 'pl': 'pl',
  'pt': 'pt', 'ro': 'ro', 'ru': 'ru', 'sr': 'sr-Latn', 'sv': 'sv', 'sw': 'sw',
  'ta': 'ta', 'te': 'te', 'th': 'th', 'fil': 'fil', 'tr': 'tr', 'uk': 'uk',
  'ur': 'ur', 'vi': 'vi', 'zh': 'zh-Hans'
};

// Helper function to check if transcript matches a number in any supported language
function matchesSpokenNumber(transcript: string, expectedNumber: number, language: string): boolean {
  try {
    // Get the language code (e.g., 'en' from 'en-US')
    const baseLangCode = language.split('-')[0];

    // Map to n2words language code
    const n2wordsLang = languageCodeMap[baseLangCode];

    if (!n2wordsLang) {
      return false;
    }

    // Generate the word form of the expected number in the detected language
    const numberAsWords = n2words(expectedNumber, { lang: n2wordsLang }).toLowerCase();

    // Check if the transcript contains the number as words
    return transcript.includes(numberAsWords);
  } catch {
    // If language not supported by n2words or conversion fails, return false
    return false;
  }
}

export interface UseSpeechRecognitionProps {
  sequence: number[];
  isPlaying: boolean;
  currentStep: number;
  onStepAdvance: (nextStep: number) => void;
  onPlayingChange: (playing: boolean) => void;
}

export function useSpeechRecognition({
  sequence,
  isPlaying,
  currentStep,
  onStepAdvance,
  onPlayingChange
}: UseSpeechRecognitionProps) {
  // State
  const [speechRecognitionEnabled, setSpeechRecognitionEnabled] = useState(false);
  const [recognitionMode, setRecognitionMode] = useState<SpeechRecognitionMode>('keyword');
  const [confirmationKeyword, setConfirmationKeyword] = useState('okay');
  const [recognitionStatus, setRecognitionStatus] = useState<string | null>(null);
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(false);

  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const waitingForConfirmationRef = useRef(false);
  const expectedPinIndexRef = useRef(currentStep);
  const isPlayingRef = useRef(isPlaying);

  // Sync refs with props
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Check for Speech Recognition support
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSpeechRecognitionSupported(!!SpeechRecognitionAPI);
  }, []);

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
            onStepAdvance(nextIndex);
            expectedPinIndexRef.current = nextIndex;
            const nextPinNumber = sequence[nextIndex];
            setRecognitionStatus(`Waiting for ${recognitionMode === 'number' ? `"${nextPinNumber}"` : `"${confirmationKeyword}"`}...`);
          } else {
            onPlayingChange(false);
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

  // Update expected pin when spoken
  const updateExpectedPin = (pinIndex: number) => {
    if (speechRecognitionEnabled && recognitionRef.current) {
      expectedPinIndexRef.current = pinIndex;
      const currentPinNumber = sequence[pinIndex];
      setRecognitionStatus(`Waiting for ${recognitionMode === 'number' ? `"${currentPinNumber}"` : `"${confirmationKeyword}"`}...`);
    }
  };

  // Stop recognition
  const stopRecognition = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    waitingForConfirmationRef.current = false;
    setRecognitionStatus(null);
  };

  return {
    // State
    speechRecognitionEnabled,
    setSpeechRecognitionEnabled,
    recognitionMode,
    setRecognitionMode,
    confirmationKeyword,
    setConfirmationKeyword,
    recognitionStatus,
    isSpeechRecognitionSupported,

    // Methods
    startListening,
    stopRecognition,
    updateExpectedPin,

    // Refs
    isListening: !!recognitionRef.current
  };
}
