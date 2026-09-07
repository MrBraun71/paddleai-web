import type { StrokeMetrics, SQIBreakdown, FeedbackMessage } from '../types'

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
    check: (m) => m.sequenceErrors.includes('knees-early'),
    messageIt: 'Nella ripresa pieghi le gambe troppo presto: prima le mani oltre le ginocchia',
    messageEn: 'In the recovery you bend the knees too early: hands past the knees first',
    type: 'high',
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

function pickItalianVoice(synth: SpeechSynthesis): void {
  const voices = synth.getVoices()
  italianVoice =
    voices.find((v) => v.lang.toLowerCase().startsWith('it')) ??
    voices[0] ??
    null
}

export function initSpeech(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
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

  // Known Chrome/Android bug: the synth goes silent after ~15s with no speech
  // unless it is periodically nudged. Keep it alive for the whole session.
  if (!keepAliveTimer) {
    keepAliveTimer = setInterval(() => {
      if (!speechSynth) return
      try {
        speechSynth.resume()
        if (speechSynth.speaking || speechSynth.pending) {
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
// user gesture. Call this from a tap/click handler once (e.g. the "Start"
// button) to unlock the audio API silently.
export function primeSpeech(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  try {
    const synth = window.speechSynthesis
    synth.cancel()
    const silent = new SpeechSynthesisUtterance(' ')
    silent.volume = 0
    synth.speak(silent)
  } catch {
    /* noop */
  }
}

export function speak(text: string): void {
  if (!speechSynth) return
  if (!italianVoice) pickItalianVoice(speechSynth)
  speechSynth.cancel()
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'it-IT'
  if (italianVoice) utter.voice = italianVoice
  utter.rate = 1.0
  utter.pitch = 1.0
  utter.volume = 0.95
  utter.onerror = (e) => console.warn('VogaAI: speech error', e)
  speechSynth.speak(utter)
}
