import type { StrokeMetrics, SQIBreakdown, FeedbackMessage } from '../types'
import { getKneeControl } from './strokeDetector'

interface FeedbackRule {
  id: string
  check: (metrics: StrokeMetrics, sqi: SQIBreakdown, strokeCount: number) => boolean
  messageIt: string
  messageEn: string
  type: FeedbackMessage['type']
  category: string
  cooldownMs: number
  minStrokes: number
}

const rules: FeedbackRule[] = [
  {
    id: 'TRUNK_LEAN_HIGH',
    check: (m) => m.trunkLeanDeg > 15,
    messageIt: 'Riduci l\'oscillazione del busto',
    messageEn: 'Reduce trunk oscillation',
    type: 'high',
    category: 'posture',
    cooldownMs: 30000,
    minStrokes: 5,
  },
  {
    id: 'GOOD_ROTATION',
    check: (m) => m.trunkRotationDeg >= 40 && m.trunkRotationDeg <= 60,
    messageIt: 'Buona rotazione',
    messageEn: 'Good rotation',
    type: 'positive',
    category: 'technique',
    cooldownMs: 120000,
    minStrokes: 8,
  },
  {
    id: 'ASYMMETRY',
    check: (m) => m.shoulderAsymmetryDeg > 7,
    messageIt: 'Asimmetria rilevata',
    messageEn: 'Asymmetry detected',
    type: 'high',
    category: 'symmetry',
    cooldownMs: 30000,
    minStrokes: 3,
  },
  {
    id: 'LOW_AMPLITUDE',
    check: (m) => m.strokeAmplitude < 25,
    messageIt: 'Stai perdendo ampiezza',
    messageEn: 'You are losing amplitude',
    type: 'medium',
    category: 'technique',
    cooldownMs: 45000,
    minStrokes: 8,
  },
  {
    id: 'HIGH_JERK',
    check: (m) => m.jerkIndex > 1.5,
    messageIt: 'Migliora la fluidità del movimento',
    messageEn: 'Smooth out your movement',
    type: 'medium',
    category: 'fluidity',
    cooldownMs: 45000,
    minStrokes: 6,
  },
  {
    id: 'LOW_EXTENSION',
    check: (m) => m.armExtensionRatio < 0.75,
    messageIt: 'Estendi di più il braccio avanti',
    messageEn: 'Extend your forward arm more',
    type: 'medium',
    category: 'technique',
    cooldownMs: 40000,
    minStrokes: 5,
  },
  {
    id: 'SQI_EXCELLENT',
    check: (_m, s) => s.overall > 85,
    messageIt: 'Eccellente! SQI sopra 85',
    messageEn: 'Excellent! SQI above 85',
    type: 'positive',
    category: 'overall',
    cooldownMs: 180000,
    minStrokes: 10,
  },
  {
    id: 'HEAD_UNSTABLE',
    check: (m) => m.headStability > 0.06,
    messageIt: 'Mantieni la testa più ferma',
    messageEn: 'Keep your head more stable',
    type: 'medium',
    category: 'posture',
    cooldownMs: 40000,
    minStrokes: 6,
  },
  {
    id: 'ARMS_FIRST',
    check: (m) => m.sequenceErrors.includes('arms-first'),
    messageIt: 'Non tirare subito di braccia: parte con la spinta delle gambe',
    messageEn: 'Do not pull with the arms first: drive with the legs',
    type: 'high',
    category: 'technique',
    cooldownMs: 30000,
    minStrokes: 2,
  },
  {
    id: 'KNEES_EARLY',
    check: (m) => getKneeControl() === 'professional' && m.sequenceErrors.includes('knees-early'),
    messageIt: 'Nella ripresa pieghi le gambe troppo presto: prima le mani oltre le ginocchia',
    messageEn: 'In the recovery you bend the knees too early: hands past the knees first',
    type: 'high',
    category: 'technique',
    cooldownMs: 30000,
    minStrokes: 2,
  },
  {
    id: 'KNEES_OUT',
    check: (m) => getKneeControl() === 'professional' && m.kneeFlareIndex > 28,
    messageIt: 'Ginocchia troppo aperte in compressione: tieni le rotule allineate e scendi tra le gambe',
    messageEn: 'Knees are flaring outward at the catch: keep the patellas aligned',
    type: 'high',
    category: 'technique',
    cooldownMs: 30000,
    minStrokes: 2,
  },
  {
    id: 'HANDLE_WAVY',
    check: (m) => m.handleWaviness > 14,
    messageIt: 'Traiettoria del manubrio ondulata: mantieni le mani in linea retta, senza saltare le ginocchia',
    messageEn: 'Wavy handle path: keep the hands on a straight line, do not jump over the knees',
    type: 'high',
    category: 'technique',
    cooldownMs: 30000,
    minStrokes: 2,
  },
  {
    id: 'SYM_OSCILLATE',
    check: (m) => m.lateralOscillation > 5,
    messageIt: 'Oscilli a destra e a sinistra durante la passata: mantieni il busto stabile sulla linea mediana',
    messageEn: 'You are rocking sideways during the drive: keep the trunk stable on the midline',
    type: 'high',
    category: 'technique',
    cooldownMs: 30000,
    minStrokes: 2,
  },
  {
    id: 'NO_EXTRACTION',
    check: (m) => m.sequenceErrors.includes('no-extraction'),
    messageIt: 'Effettua lo svincolo: premi le mani verso il basso per estrarre le pale',
    messageEn: 'Do the release: press the hands down to extract the blade',
    type: 'medium',
    category: 'technique',
    cooldownMs: 30000,
    minStrokes: 2,
  },
  {
    id: 'RUSHED_RECOVERY',
    check: (m) => m.sequenceErrors.includes('rushed-recovery'),
    messageIt: 'Ripresa troppo rapida: fai scorrere il carrello in modo lento e controllato',
    messageEn: 'Recovery too fast: let the slide roll slowly and controlled',
    type: 'medium',
    category: 'technique',
    cooldownMs: 30000,
    minStrokes: 2,
  },
  {
    id: 'CATCH_ANGLE_LOW',
    check: (m) => m.catchAngleDeg < 35,
    messageIt: 'Inclina di più la pala all\'attacco',
    messageEn: 'Square the blade more at the catch',
    type: 'medium',
    category: 'technique',
    cooldownMs: 45000,
    minStrokes: 5,
  },
]

interface FeedbackState {
  lastEmissions: Map<string, number>
  strokeCountAtLastEmission: Map<string, number>
}

const fbState: FeedbackState = {
  lastEmissions: new Map(),
  strokeCountAtLastEmission: new Map(),
}

let lastInfoEmission = 0

export function resetFeedback(): void {
  fbState.lastEmissions.clear()
  fbState.strokeCountAtLastEmission.clear()
  lastInfoEmission = 0
}

export function evaluateFeedback(
  metrics: StrokeMetrics,
  sqi: SQIBreakdown,
  sessionDurationMs: number,
  strokeCount: number,
  currentRate: number
): FeedbackMessage | null {
  const now = Date.now()

  const priority: Record<FeedbackMessage['type'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
    positive: 5,
  }

  const sortedRules = [...rules].sort(
    (a, b) => priority[a.type] - priority[b.type]
  )

  for (const rule of sortedRules) {
    if (rule.minStrokes > 0 && strokeCount < rule.minStrokes) continue

    const lastEmit = fbState.lastEmissions.get(rule.id) ?? 0
    if (now - lastEmit < rule.cooldownMs) continue

    let isTriggered = rule.check(metrics, sqi, strokeCount)

    if (isTriggered && rule.type === 'info') {
      isTriggered = now - lastInfoEmission >= rule.cooldownMs
    }

    if (isTriggered) {
      fbState.lastEmissions.set(rule.id, now)
      lastInfoEmission = now

      return {
        id: rule.id + '-' + now,
        text: rule.messageIt,
        textEn: rule.messageEn,
        type: rule.type,
        category: rule.category,
        timestamp: now,
      }
    }
  }

  // Periodic stroke-rate info (every 2 min after the first minute)
  if (
    sessionDurationMs > 60000 &&
    now - lastInfoEmission > 120000
  ) {
    lastInfoEmission = now
    return {
      id: 'INFO_RATE-' + now,
      text: `Ritmo di voga: ${Math.round(currentRate)} colpi al minuto`,
      textEn: `Rating: ${Math.round(currentRate)} spm`,
      type: 'info',
      category: 'stats',
      timestamp: now,
    }
  }

  return null
}

let speechSynth: SpeechSynthesis | null = null
let italianVoice: SpeechSynthesisVoice | null = null
let keepAliveTimer: ReturnType<typeof setInterval> | null = null
let userUnlocked = false
let fallbackEngine = false
let lastAudioOk = false

// iOS Chrome/Firefox expose a speechSynthesis object that never emits sound
// (WebKit stub without a system TTS hook for third-party browsers). On iOS we
// always prefer the HTMLAudio fallback instead.
function mustUseFallback(): boolean {
  return isIOS() || fallbackEngine || !hasNativeSpeech()
}

// On iOS we always play prerecorded Italian TTS clips shipped with the app
// (public/tts/*.mp3, generated by scripts/gen-tts.mjs). They play through a
// plain <audio> element, which works on every browser including iOS Chrome.
let fallbackAudio: HTMLAudioElement | null = null

function hasNativeSpeech(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.speechSynthesis &&
    typeof window.speechSynthesis.speak === 'function'
  )
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

// Texts that have a prerecorded clip in public/tts/. Keep in sync with
// scripts/gen-tts.mjs.
const TTS_CLIP_HASHES: Record<string, string> = {
  "Riduci l'oscillazione del busto": 'deae8f7e',
  'Buona rotazione': '4b5c0aeb',
  'Asimmetria rilevata': '3eaf3e9f',
  'Stai perdendo ampiezza': 'd8ed010e',
  'Migliora la fluidità del movimento': '7b6e94d8',
  'Estendi di più il braccio avanti': 'b14d8f93',
  'Eccellente! SQI sopra 85': '133629bf',
  'Mantieni la testa più ferma': 'c0d1af53',
  'Non tirare subito di braccia: parte con la spinta delle gambe': '95e13585',
  'Nella ripresa pieghi le gambe troppo presto: prima le mani oltre le ginocchia': 'e4a2ed98',
  'Ginocchia troppo aperte in compressione: tieni le rotule allineate e scendi tra le gambe': '8b9d3328',
  'Traiettoria del manubrio ondulata: mantieni le mani in linea retta, senza saltare le ginocchia': '99060211',
  'Oscilli a destra e a sinistra durante la passata: mantieni il busto stabile sulla linea mediana': 'c0cf2d8c',
  'Effettua lo svincolo: premi le mani verso il basso per estrarre le pale': '7d3136fa',
  'Ripresa troppo rapida: fai scorrere il carrello in modo lento e controllato': 'ceab0a0c',
  "Inclina di più la pala all'attacco": '5489ccbe',
  'La voce è attiva': '674eacd8',
}

function clipUrl(text: string): string | null {
  const hash = TTS_CLIP_HASHES[text]
  if (!hash) return null
  return `${import.meta.env.BASE_URL}tts/${hash}.mp3`
}

function liveTtsUrl(text: string): string {
  return (
    'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=it&q=' +
    encodeURIComponent(text)
  )
}

function speakFallback(text: string): void {
  speakCount++
  lastAudioOk = false
  const playUrl = (url: string, onFail: () => void): void => {
    try {
      if (fallbackAudio) {
        fallbackAudio.pause()
        fallbackAudio.src = ''
      }
      const audio = new Audio(url)
      fallbackAudio = audio
      audio.volume = 1
      const ok = () => {
        lastAudioOk = true
      }
      audio.oncanplay = ok
      audio.ondurationchange = ok
      audio.onerror = () => {
        console.warn('VogaAI: TTS audio fallback failed', url)
        onFail()
      }
      void audio.play().then(ok).catch(onFail)
    } catch {
      onFail()
    }
  }
  // Primary: local prerecorded clip. Fallback: live Google Translate TTS
  // (used only for messages that have no local clip, e.g. the live rate one).
  const local = clipUrl(text)
  if (local) {
    playUrl(local, () => {})
  } else {
    playUrl(liveTtsUrl(text), () => {})
  }
}

function pickItalianVoice(synth: SpeechSynthesis): void {
  const voices = synth.getVoices()
  italianVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith('it')) ??
    voices[0] ??
    null
}

export function initSpeech(): void {
  if (typeof window === 'undefined') return
  if (!hasNativeSpeech()) {
    // No SpeechSynthesis (e.g. iOS Chrome): a real <audio> fallback is used.
    fallbackEngine = true
    return
  }
  fallbackEngine = false
  speechSynth = window.speechSynthesis
  pickItalianVoice(speechSynth)

  // Voices are loaded asynchronously on some browsers.
  speechSynth.onvoiceschanged = () => {
    if (speechSynth) pickItalianVoice(speechSynth)
  }
  let tries = 0
  const retry = setInterval(() => {
    if (!speechSynth || speechSynth.getVoices().length > 0) {
      clearInterval(retry)
      return
    }
    if (++tries > 6) {
      clearInterval(retry)
      return
    }
    pickItalianVoice(speechSynth)
  }, 300)

  // Keep the synthesis alive for the whole session. Chrome/Android has a known
  // bug where the synth goes silent after ~15s unless nudged; iOS silently
  // suspends the audio session and needs its own gentle resume + re-prime.
  if (!keepAliveTimer) {
    keepAliveTimer = setInterval(() => {
      if (!speechSynth) return
      try {
        speechSynth.resume()
        if (isIOS()) {
          if (userUnlocked && !speechSynth.speaking) {
            primeSpeech()
          }
        } else if (speechSynth.speaking || speechSynth.pending) {
          speechSynth.pause()
          speechSynth.resume()
        }
      } catch {
        /* noop */
      }
    }, 10000)
  }
}

// iOS/Safari only allows speechSynthesis.speak() when it's triggered from a
// user gesture. Call this from a tap/click handler (e.g. the "Start" button or
// a dedicated audio-unlock button) to unlock the audio API. When the native
// API is absent we unlock HTMLAudio playback instead. NOTE: never cancel()
// here — on iOS a cancel right before speak silences the synth.
export function primeSpeech(): void {
  if (typeof window === 'undefined') return
  if (!hasNativeSpeech() || isIOS()) {
    // Unlock HTMLAudio with a real in-gesture play of a shipped clip (nearly
    // inaudible so it only warms the media session).
    try {
      const a = new Audio(`${import.meta.env.BASE_URL}tts/674eacd8.mp3`)
      a.volume = 0.01
      void a.play().catch(() => {
        /* noop */
      })
      userUnlocked = true
    } catch {
      /* noop */
    }
    return
  }
  try {
    const synth = window.speechSynthesis
    synth.getVoices()
    const silent = new SpeechSynthesisUtterance(' ')
    silent.volume = 0.01
    silent.rate = 10
    synth.speak(silent)
    synth.resume()
    userUnlocked = true
  } catch {
    /* noop */
  }
}

let speakCount = 0

// Diagnostics for the on-screen debug overlay.
export function getSpeechStatus(): {
  count: number
  unlocked: boolean
  speaking: boolean
  paused: boolean
  engine: 'native' | 'audio' | 'none'
  audioOk: boolean
} {
  const synthed = typeof window !== 'undefined' && window.speechSynthesis
  return {
    count: speakCount,
    unlocked: userUnlocked,
    speaking: !!synthed && (window.speechSynthesis.speaking ?? false),
    paused: !!synthed && (window.speechSynthesis.paused ?? false),
    engine: mustUseFallback() ? 'audio' : 'native',
    audioOk: lastAudioOk,
  }
}

export function speak(text: string): void {
  if (mustUseFallback()) {
    speakFallback(text)
    return
  }
  if (!speechSynth) return
  if (!italianVoice) pickItalianVoice(speechSynth)
  speakCount++
  const iosDevice = isIOS()
  try {
    // Only cancel when there is an actual queue to replace. On iOS a cancel()
    // right before speak() is known to silence the synth entirely.
    if (!iosDevice && (speechSynth.speaking || speechSynth.pending)) {
      speechSynth.cancel()
    }
    if (iosDevice) speechSynth.resume()

    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'it-IT'
    if (italianVoice) utter.voice = italianVoice
    utter.rate = 1.0
    utter.pitch = 1.0
    utter.volume = 0.95
    utter.onstart = () => {
      // iOS sometimes goes suspended right when an utterance starts.
      try {
        speechSynth?.resume()
      } catch {
        /* noop */
      }
    }
    if (iosDevice) {
      // iOS lets the synth drop to "suspended" right after an utterance ends.
      utter.onend = () => {
        try {
          speechSynth?.resume()
        } catch {
          /* noop */
        }
      }
    }
    utter.onerror = (e) => console.warn('VogaAI: speech error', e)
    speechSynth.speak(utter)
    speechSynth.resume()
    // Second kick a few ms later: iOS stalls unless resume() is re-called.
    if (iosDevice) {
      window.setTimeout(() => {
        try {
          speechSynth?.resume()
        } catch {
          /* noop */
        }
      }, 400)
    }
  } catch {
    /* noop */
  }
}
