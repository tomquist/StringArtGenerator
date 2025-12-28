import { describe, it, expect } from 'vitest';

// Voice Control State Machine Types
type VoiceControlPhase =
  | 'DISABLED'
  | 'IDLE'
  | 'WAITING_TO_LISTEN'
  | 'LISTENING'
  | 'CONFIRMED';

interface VoiceControlState {
  enabled: boolean;
  mode: 'number' | 'keyword';
  keyword: string;
  phase: VoiceControlPhase;
  statusMessage: string | null;
  scheduledListenTime: number | null;
  listeningForPinIndex: number | null;
}

type VoiceControlEvent =
  | { type: 'ENABLE' }
  | { type: 'DISABLE' }
  | { type: 'SET_MODE'; payload: 'number' | 'keyword' }
  | { type: 'SET_KEYWORD'; payload: string }
  | { type: 'SPEECH_STARTED'; payload: { pinIndex: number; scheduledTime: number } }
  | { type: 'START_LISTENING'; payload: { pinIndex: number; statusMessage: string } }
  | { type: 'UPDATE_STATUS'; payload: string }
  | { type: 'CONFIRMED' }
  | { type: 'RESET' }
  | { type: 'ERROR'; payload: string };

// State Machine Reducer
function voiceControlReducer(state: VoiceControlState, event: VoiceControlEvent): VoiceControlState {
  switch (event.type) {
    case 'ENABLE':
      if (state.enabled) return state; // Already enabled
      return {
        ...state,
        enabled: true,
        phase: 'IDLE',
        statusMessage: null,
        scheduledListenTime: null,
        listeningForPinIndex: null
      };

    case 'DISABLE':
      if (!state.enabled) return state; // Already disabled
      return {
        ...state,
        enabled: false,
        phase: 'DISABLED',
        statusMessage: null,
        scheduledListenTime: null,
        listeningForPinIndex: null
      };

    case 'SET_MODE':
      // Can change mode anytime when enabled
      if (!state.enabled) return state;
      return {
        ...state,
        mode: event.payload
      };

    case 'SET_KEYWORD':
      // Can change keyword anytime when enabled
      if (!state.enabled) return state;
      return {
        ...state,
        keyword: event.payload
      };

    case 'SPEECH_STARTED':
      // Can only schedule listening from IDLE or CONFIRMED phase when enabled
      // CONFIRMED is allowed because we may start next speech before RESET is dispatched
      if (!state.enabled ||
          (state.phase !== 'IDLE' && state.phase !== 'CONFIRMED')) {
        return state;
      }
      return {
        ...state,
        phase: 'WAITING_TO_LISTEN',
        scheduledListenTime: event.payload.scheduledTime,
        listeningForPinIndex: event.payload.pinIndex,
        statusMessage: null
      };

    case 'START_LISTENING':
      // Can only start listening from WAITING_TO_LISTEN phase
      if (!state.enabled || state.phase !== 'WAITING_TO_LISTEN') return state;
      return {
        ...state,
        phase: 'LISTENING',
        listeningForPinIndex: event.payload.pinIndex,
        scheduledListenTime: null,
        statusMessage: event.payload.statusMessage
      };

    case 'UPDATE_STATUS':
      // Can only update status when in LISTENING phase
      if (!state.enabled || state.phase !== 'LISTENING') return state;
      return {
        ...state,
        statusMessage: event.payload
      };

    case 'CONFIRMED':
      // Can only confirm from LISTENING phase
      if (!state.enabled || state.phase !== 'LISTENING') return state;
      return {
        ...state,
        phase: 'CONFIRMED',
        statusMessage: '✓ Confirmed'
      };

    case 'RESET':
      // Can reset from CONFIRMED or any phase back to IDLE
      if (!state.enabled) return state;
      return {
        ...state,
        phase: 'IDLE',
        scheduledListenTime: null,
        listeningForPinIndex: null,
        statusMessage: null
      };

    case 'ERROR':
      // Error can happen from any phase, resets to IDLE
      if (!state.enabled) return state;
      return {
        ...state,
        phase: 'IDLE',
        scheduledListenTime: null,
        listeningForPinIndex: null,
        statusMessage: `Error: ${event.payload}`
      };

    default:
      return state;
  }
}

const initialState: VoiceControlState = {
  enabled: false,
  mode: 'keyword',
  keyword: 'okay',
  phase: 'DISABLED',
  statusMessage: null,
  scheduledListenTime: null,
  listeningForPinIndex: null
};

describe('Voice Control State Machine', () => {
  describe('Enable/Disable Transitions', () => {
    it('should enable from DISABLED', () => {
      const state = voiceControlReducer(initialState, { type: 'ENABLE' });
      expect(state.enabled).toBe(true);
      expect(state.phase).toBe('IDLE');
    });

    it('should disable from any phase', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });
      state = voiceControlReducer(state, { type: 'DISABLE' });
      expect(state.enabled).toBe(false);
      expect(state.phase).toBe('DISABLED');
    });

    it('should ignore duplicate ENABLE', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });
      const beforeSecondEnable = state;
      state = voiceControlReducer(state, { type: 'ENABLE' });
      expect(state).toEqual(beforeSecondEnable);
    });
  });

  describe('Mode/Keyword Changes', () => {
    it('should allow mode change when enabled', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });
      state = voiceControlReducer(state, { type: 'SET_MODE', payload: 'number' });
      expect(state.mode).toBe('number');
    });

    it('should ignore mode change when disabled', () => {
      const state = voiceControlReducer(initialState, { type: 'SET_MODE', payload: 'number' });
      expect(state.mode).toBe('keyword'); // Unchanged
    });

    it('should allow mode change while LISTENING', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });
      state = voiceControlReducer(state, { type: 'SPEECH_STARTED', payload: { pinIndex: 0, scheduledTime: Date.now() + 600 } });
      state = voiceControlReducer(state, { type: 'START_LISTENING', payload: { pinIndex: 0, statusMessage: 'Waiting...' } });
      state = voiceControlReducer(state, { type: 'SET_MODE', payload: 'number' });
      expect(state.mode).toBe('number');
      expect(state.phase).toBe('LISTENING'); // Phase unchanged
    });
  });

  describe('Speech Flow', () => {
    it('should complete full flow: IDLE → WAITING → LISTENING → CONFIRMED → IDLE', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });
      expect(state.phase).toBe('IDLE');

      // Speech starts
      state = voiceControlReducer(state, { type: 'SPEECH_STARTED', payload: { pinIndex: 0, scheduledTime: Date.now() + 600 } });
      expect(state.phase).toBe('WAITING_TO_LISTEN');
      expect(state.listeningForPinIndex).toBe(0);

      // Delay expires, start listening
      state = voiceControlReducer(state, { type: 'START_LISTENING', payload: { pinIndex: 0, statusMessage: 'Waiting for "okay"...' } });
      expect(state.phase).toBe('LISTENING');
      expect(state.statusMessage).toBe('Waiting for "okay"...');

      // Match found
      state = voiceControlReducer(state, { type: 'CONFIRMED' });
      expect(state.phase).toBe('CONFIRMED');
      expect(state.statusMessage).toBe('✓ Confirmed');

      // Reset for next pin
      state = voiceControlReducer(state, { type: 'RESET' });
      expect(state.phase).toBe('IDLE');
      expect(state.statusMessage).toBe(null);
    });

    it('should reject SPEECH_STARTED when not in IDLE', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });
      state = voiceControlReducer(state, { type: 'SPEECH_STARTED', payload: { pinIndex: 0, scheduledTime: Date.now() + 600 } });
      expect(state.phase).toBe('WAITING_TO_LISTEN');

      // Try to start speech again while waiting - should be rejected
      const prevState = state;
      state = voiceControlReducer(state, { type: 'SPEECH_STARTED', payload: { pinIndex: 1, scheduledTime: Date.now() + 600 } });
      expect(state).toEqual(prevState); // Unchanged
    });

    it('should reject START_LISTENING when not in WAITING_TO_LISTEN', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });

      // Try to start listening from IDLE - should be rejected
      const prevState = state;
      state = voiceControlReducer(state, { type: 'START_LISTENING', payload: { pinIndex: 0, statusMessage: 'Waiting...' } });
      expect(state).toEqual(prevState);
    });

    it('should reject CONFIRMED when not in LISTENING', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });

      // Try to confirm from IDLE - should be rejected
      const prevState = state;
      state = voiceControlReducer(state, { type: 'CONFIRMED' });
      expect(state).toEqual(prevState);
    });
  });

  describe('Error Handling', () => {
    it('should reset to IDLE on error from any phase', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });
      state = voiceControlReducer(state, { type: 'SPEECH_STARTED', payload: { pinIndex: 0, scheduledTime: Date.now() + 600 } });
      state = voiceControlReducer(state, { type: 'START_LISTENING', payload: { pinIndex: 0, statusMessage: 'Waiting...' } });

      state = voiceControlReducer(state, { type: 'ERROR', payload: 'Recognition failed' });
      expect(state.phase).toBe('IDLE');
      expect(state.statusMessage).toBe('Error: Recognition failed');
      expect(state.listeningForPinIndex).toBe(null);
    });
  });

  describe('Disable During Flow', () => {
    it('should allow disable from LISTENING', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });
      state = voiceControlReducer(state, { type: 'SPEECH_STARTED', payload: { pinIndex: 0, scheduledTime: Date.now() + 600 } });
      state = voiceControlReducer(state, { type: 'START_LISTENING', payload: { pinIndex: 0, statusMessage: 'Waiting...' } });

      state = voiceControlReducer(state, { type: 'DISABLE' });
      expect(state.enabled).toBe(false);
      expect(state.phase).toBe('DISABLED');
      expect(state.listeningForPinIndex).toBe(null);
    });
  });

  describe('Mode Change During Flow', () => {
    it('should allow mode change during WAITING_TO_LISTEN', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });
      state = voiceControlReducer(state, { type: 'SPEECH_STARTED', payload: { pinIndex: 0, scheduledTime: Date.now() + 600 } });

      state = voiceControlReducer(state, { type: 'SET_MODE', payload: 'number' });
      expect(state.mode).toBe('number');
      expect(state.phase).toBe('WAITING_TO_LISTEN'); // Phase unchanged
    });

    it('should allow UPDATE_STATUS during LISTENING', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });
      state = voiceControlReducer(state, { type: 'SPEECH_STARTED', payload: { pinIndex: 0, scheduledTime: Date.now() + 600 } });
      state = voiceControlReducer(state, { type: 'START_LISTENING', payload: { pinIndex: 0, statusMessage: 'Waiting for "okay"...' } });

      state = voiceControlReducer(state, { type: 'UPDATE_STATUS', payload: 'Waiting for "123"...' });
      expect(state.statusMessage).toBe('Waiting for "123"...');
      expect(state.phase).toBe('LISTENING'); // Phase unchanged
    });

    it('should reject UPDATE_STATUS when not in LISTENING', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });

      const prevState = state;
      state = voiceControlReducer(state, { type: 'UPDATE_STATUS', payload: 'test' });
      expect(state).toEqual(prevState); // Unchanged
    });
  });

  describe('SPEECH_STARTED from CONFIRMED', () => {
    it('should allow SPEECH_STARTED from CONFIRMED phase', () => {
      let state = voiceControlReducer(initialState, { type: 'ENABLE' });
      state = voiceControlReducer(state, { type: 'SPEECH_STARTED', payload: { pinIndex: 0, scheduledTime: Date.now() + 600 } });
      state = voiceControlReducer(state, { type: 'START_LISTENING', payload: { pinIndex: 0, statusMessage: 'Waiting...' } });
      state = voiceControlReducer(state, { type: 'CONFIRMED' });
      expect(state.phase).toBe('CONFIRMED');

      // Should allow SPEECH_STARTED from CONFIRMED (for next pin)
      state = voiceControlReducer(state, { type: 'SPEECH_STARTED', payload: { pinIndex: 1, scheduledTime: Date.now() + 600 } });
      expect(state.phase).toBe('WAITING_TO_LISTEN');
      expect(state.listeningForPinIndex).toBe(1);
    });
  });
});
