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
  enabled: boolean;
  mode: SpeechRecognitionMode;
  keyword: string;
  onStepAdvance: (nextStep: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onStatusChange: (status: string | null) => void;
}

export function useSpeechRecognition({
  sequence,
  isPlaying,
  currentStep,
  enabled,
  mode,
  keyword,
  onStepAdvance,
  onPlayingChange,
  onStatusChange
}: UseSpeechRecognitionProps) {
  // Support check
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(false);

  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const waitingForConfirmationRef = useRef(false);
  const expectedPinIndexRef = useRef(currentStep);
  const isPlayingRef = useRef(isPlaying);
  const enabledRef = useRef(enabled);
  const modeRef = useRef(mode);
  const keywordRef = useRef(keyword);

  // Sync refs with props
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    keywordRef.current = keyword;
  }, [keyword]);

  // Check for Speech Recognition support
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSpeechRecognitionSupported(!!SpeechRecognitionAPI);
  }, []);

  // Speech Recognition Logic
  const startListening = (pinIndex: number) => {
    if (!enabled || !isSpeechRecognitionSupported) return;

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
    onStatusChange(`Waiting for ${mode === 'number' ? `"${currentPinNumber}"` : `"${keyword}"`}...`);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Use the latest result from the continuous recognition
      const lastResultIndex = event.results.length - 1;
      const transcript = event.results[lastResultIndex][0].transcript.toLowerCase().trim();

      // Get the current expected pin from the ref (may have changed during continuous recognition)
      const expectedPinIndex = expectedPinIndexRef.current;
      const expectedPinNumber = sequence[expectedPinIndex];

      // Use refs to get current mode and keyword (they may have changed)
      const currentMode = modeRef.current;
      const currentKeyword = keywordRef.current;

      let isMatch = false;
      if (currentMode === 'number') {
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
        isMatch = transcript.includes(currentKeyword.toLowerCase());
      }

      if (isMatch) {
        onStatusChange('✓ Confirmed');

        // Move to next step
        setTimeout(() => {
          if (expectedPinIndex < sequence.length - 1) {
            const nextIndex = expectedPinIndex + 1;
            onStepAdvance(nextIndex);
            expectedPinIndexRef.current = nextIndex;
            const nextPinNumber = sequence[nextIndex];
            onStatusChange(`Waiting for ${modeRef.current === 'number' ? `"${nextPinNumber}"` : `"${keywordRef.current}"`}...`);
          } else {
            onPlayingChange(false);
            waitingForConfirmationRef.current = false;
          }
        }, 300);
      } else {
        onStatusChange(`❌ Said "${transcript}" - try again`);
        // In continuous mode, just keep listening - no need to restart
        setTimeout(() => {
          if (isPlayingRef.current && waitingForConfirmationRef.current) {
            onStatusChange(`Waiting for ${modeRef.current === 'number' ? `"${expectedPinNumber}"` : `"${keywordRef.current}"`}...`);
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
        waitingForConfirmationRef.current = false;
      } else if (event.error === 'audio-capture' || event.error === 'not-allowed') {
        // Permission or hardware errors - disable the feature
        onStatusChange(`Microphone error: ${event.error}`);
        waitingForConfirmationRef.current = false;
      } else {
        // Other errors - just log and stop
        console.warn('Speech recognition error:', event.error);
        waitingForConfirmationRef.current = false;
        onStatusChange(`Recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Recognition ended - clear the waiting flag
      // Component is responsible for restarting if needed
      waitingForConfirmationRef.current = false;
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  // Handle enabled state changes
  useEffect(() => {
    if (!enabled && recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      waitingForConfirmationRef.current = false;
      onStatusChange(null);
    }
  }, [enabled, onStatusChange]);

  // Update expected pin when current step changes
  const updateExpectedPin = (pinIndex: number) => {
    if (enabled && recognitionRef.current) {
      expectedPinIndexRef.current = pinIndex;
      const currentPinNumber = sequence[pinIndex];
      onStatusChange(`Waiting for ${mode === 'number' ? `"${currentPinNumber}"` : `"${keyword}"`}...`);
    }
  };

  // Stop recognition
  const stopRecognition = () => {
    // Set waiting flag to false FIRST to prevent onend from restarting
    waitingForConfirmationRef.current = false;

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    onStatusChange(null);
  };

  return {
    isSpeechRecognitionSupported,
    startListening,
    stopRecognition,
    updateExpectedPin,
    isListening: !!recognitionRef.current
  };
}
