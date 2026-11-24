export interface FeedbackPreferences {
  sound: boolean;
  vibration: boolean;
}

export type FeedbackScope = 'master' | 'player';
export type FeedbackCue = 'tap' | 'confirm' | 'warning';

const DEFAULT_PREFERENCES: FeedbackPreferences = { sound: false, vibration: false };
const STORAGE_KEYS: Readonly<Record<FeedbackScope, string>> = {
  master: 'dm-cockpit:feedback:master:v1',
  player: 'dm-cockpit:feedback:player:v1',
};
const volatilePreferences: Record<FeedbackScope, FeedbackPreferences> = {
  master: { ...DEFAULT_PREFERENCES },
  player: { ...DEFAULT_PREFERENCES },
};
let audioContext: AudioContext | null = null;

function isPreferences(value: unknown): value is FeedbackPreferences {
  return typeof value === 'object' && value !== null
    && typeof (value as FeedbackPreferences).sound === 'boolean'
    && typeof (value as FeedbackPreferences).vibration === 'boolean';
}

export function getFeedbackPreferences(scope: FeedbackScope): FeedbackPreferences {
  if (typeof window === 'undefined') return volatilePreferences[scope];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS[scope]);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isPreferences(parsed)) {
        volatilePreferences[scope] = { sound: parsed.sound, vibration: parsed.vibration };
        return volatilePreferences[scope];
      }
    }
    volatilePreferences[scope] = { ...DEFAULT_PREFERENCES };
  } catch {
    // Storage can be blocked in private browsing; this preference remains usable in memory.
  }
  return volatilePreferences[scope];
}

export function saveFeedbackPreferences(scope: FeedbackScope, next: FeedbackPreferences): void {
  volatilePreferences[scope] = { sound: next.sound, vibration: next.vibration };
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEYS[scope], JSON.stringify(volatilePreferences[scope]));
  } catch {
    // Continue with the in-memory value for this page.
  }
}

export function supportsAudioFeedback(): boolean {
  return typeof window !== 'undefined' && Boolean(window.AudioContext
    || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
}

export function supportsVibrationFeedback(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext
    || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try {
    audioContext ??= new AudioContextConstructor();
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
  } catch {
    return null;
  }
  return audioContext;
}

function playTone(frequency: number, startAt: number, duration: number, volume: number): boolean {
  const context = getAudioContext();
  if (!context) return false;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.004);
  return true;
}

export function emitFeedback(cue: FeedbackCue, scope: FeedbackScope, channels: Partial<FeedbackPreferences> = {}): {
  audioAvailable: boolean;
  vibrationAccepted: boolean | null;
} {
  const preferences = getFeedbackPreferences(scope);
  const sound = channels.sound ?? preferences.sound;
  const vibration = channels.vibration ?? preferences.vibration;
  const audioAvailable = supportsAudioFeedback();
  const vibrationAvailable = supportsVibrationFeedback();
  let vibrationAccepted: boolean | null = vibration ? false : null;
  if (vibration && vibrationAvailable) {
    try {
      vibrationAccepted = navigator.vibrate(cue === 'tap' ? 10 : cue === 'confirm' ? [14, 28, 22] : [24, 35, 24]);
    } catch {
      vibrationAccepted = false;
    }
  }

  if (sound && audioAvailable) {
    const now = getAudioContext()?.currentTime ?? 0;
    const notes = cue === 'tap' ? [[440, 0, 0.035]]
      : cue === 'confirm' ? [[523, 0, 0.06], [784, 0.075, 0.075]]
        : [[330, 0, 0.08], [262, 0.105, 0.09]];
    try {
      for (const [frequency, offset, duration] of notes) {
        playTone(frequency!, now + offset!, duration!, cue === 'tap' ? 0.035 : 0.045);
      }
    } catch {
      // A browser may expose Web Audio but still refuse playback in the current context.
    }
  }

  return { audioAvailable, vibrationAccepted };
}

/** Called synchronously from click capture so audio and vibration remain user initiated. */
export function emitControlFeedback(event: { target: EventTarget | null }, scope: FeedbackScope): void {
  if (typeof Element === 'undefined' || !(event.target instanceof Element) || event.target.closest('[data-feedback-skip]')) return;
  const control = event.target.closest('button:not(:disabled), a[href], summary');
  if (control) emitFeedback('tap', scope);
}
