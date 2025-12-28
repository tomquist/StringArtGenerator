import { useRef, useEffect, useState } from 'react';
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
// Only includes codes actually supported by n2words v1.24.0
const languageCodeMap: Record<string, LanguageCode> = {
  'en': 'en', 'ar': 'ar', 'az': 'az', 'cs': 'cz', 'de': 'de',
  'da': 'dk', 'es': 'es', 'fa': 'fa', 'fr': 'fr',
  'he': 'he', 'hr': 'hr', 'hu': 'hu', 'id': 'id', 'it': 'it',
  'ko': 'ko', 'lt': 'lt', 'lv': 'lv',
  'nl': 'nl', 'nb': 'nb', 'no': 'no', 'pl': 'pl',
  'pt': 'pt', 'ru': 'ru', 'sr': 'sr',
  'tr': 'tr', 'uk': 'uk', 'vi': 'vi', 'zh': 'zh'
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
  mode: SpeechRecognitionMode;
  keyword: string;
  onMatch: () => void;
  onError: (error: string) => void;
  onUnexpectedEnd: () => void;
}

export function useSpeechRecognition({
  sequence,
  mode,
  keyword,
  onMatch,
  onError,
  onUnexpectedEnd
}: UseSpeechRecognitionProps) {
  // State
  const [isListening, setIsListening] = useState(false);

  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const modeRef = useRef(mode);
  const keywordRef = useRef(keyword);
  const expectedPinIndexRef = useRef<number | null>(null);

  // Sync refs with props
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    keywordRef.current = keyword;
  }, [keyword]);

  // Check for Speech Recognition support
  const isSpeechRecognitionSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Start listening for a specific pin index
  const startListening = (pinIndex: number) => {
    if (!isSpeechRecognitionSupported) return;

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    // Stop any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore errors from stopping
      }
      recognitionRef.current = null;
      setIsListening(false);
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || 'en-US';

    expectedPinIndexRef.current = pinIndex;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const lastResultIndex = event.results.length - 1;
      const transcript = event.results[lastResultIndex][0].transcript.toLowerCase().trim();

      const expectedPinIndex = expectedPinIndexRef.current;
      if (expectedPinIndex === null) return;

      const expectedPinNumber = sequence[expectedPinIndex];
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
        onMatch();
      }
      // Ignore non-matches - continuous listening will keep trying
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn('Speech recognition error:', event.error);
      // Report errors to component for handling
      if (event.error === 'audio-capture' || event.error === 'not-allowed') {
        onError(event.error);
      }
      // Ignore other errors (no-speech, network, etc.) - continuous mode handles them
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
      // Recognition ended unexpectedly (browser may end continuous mode on some events)
      // Notify component so it can restart if still in LISTENING phase
      onUnexpectedEnd();
    };

    try {
      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch (error) {
      // Handle errors like microphone permission denied
      recognitionRef.current = null;
      setIsListening(false);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start speech recognition';
      console.warn('Failed to start speech recognition:', errorMessage);
      onError(errorMessage);
    }
  };

  // Stop recognition
  const stopRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore errors from stopping
      }
      recognitionRef.current = null;
      setIsListening(false);
    }
    expectedPinIndexRef.current = null;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore errors from stopping
        }
        recognitionRef.current = null;
        setIsListening(false);
      }
    };
  }, []);

  return {
    isSpeechRecognitionSupported,
    startListening,
    stopRecognition,
    isListening
  };
}
