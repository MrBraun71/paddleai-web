import React, { useEffect, useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import {
  PoseLandmarker,
  FilesetResolver,
} from '@mediapipe/tasks-vision'
import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import SkeletonRenderer from './SkeletonRenderer'
import LiveStatsPanel from './LiveStats'
import FeedbackOverlay from './FeedbackOverlay'
import SQIGauge from './SQIGauge'
import {
  processFrame as processStrokeFrame,
  resetStrokeDetector,
} from '../engine/strokeDetector'
import {
  processFrame as processBioFrame,
  computeFullStrokeMetrics,
  resetBiomechanics,
} from '../engine/biomechanics'
import {
  calculateSQI,
  calculateFatigueIndex,
} from '../engine/sqi'
import {
  evaluateFeedback,
  resetFeedback,
  initSpeech,
  primeSpeech,
  speak,
} from '../engine/feedback'
import type {
  StrokeMetrics,
  SQIBreakdown,
  FeedbackMessage,
  SessionData,
  StrokePhase,
} from '../types'

interface Props {
  onComplete: (session: SessionData) => void
  onExit: () => void
  voiceEnabled: boolean
}

type AppState = 'initializing' | 'loading-model' | 'ready' | 'recording' | 'stopped'

// Rowing phases (voga) labels shown in the UI.
const PHASE_LABEL_IT: Record<StrokePhase, string> = {
  entry: 'Attacco',
  pull: 'Trazione',
  exit: 'Finale',
  recovery: 'Recupero',
  none: '—',
}

// Model candidates, heaviest first. Order matters: we start with the highest
// accuracy the device can handle and auto-downgrade (see loop) if inference
// time is too high.
const POSE_MODELS = [
  {
    name: 'heavy',
    path: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
  },
  {
    name: 'full',
    path: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  },
  {
    name: 'lite',
    path: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
]

// If the average inference time over a 3s window exceeds this (ms), the model
// is too slow for this device: downgrade to the next lighter one.
const INF_THRESHOLD_MS = 100

// Engine state kept entirely in refs so it never triggers re-renders or
// recreates the frame loop.
interface EngineState {
  startTime: number
  strokes: StrokeMetrics[]
  feedback: FeedbackMessage[]
  currentStrokePartial: Partial<StrokeMetrics>[]
  currentStrokeStart: number
  currentStrokeSide: 'left' | 'right'
  fatigueSegments: { index: number; fatigue: number; timestamp: number }[]
  lastSqi: SQIBreakdown | null
  rate: number
  amplitude: number
  fatigue: number
}

function createEngineState(): EngineState {
  return {
    startTime: 0,
    strokes: [],
    feedback: [],
    currentStrokePartial: [],
    currentStrokeStart: 0,
    currentStrokeSide: 'left',
    fatigueSegments: [],
    lastSqi: null,
    rate: 0,
    amplitude: 0,
    fatigue: 0,
  }
}

const TrainingScreen: React.FC<Props> = ({ onComplete, onExit, voiceEnabled }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<PoseLandmarker | null>(null)

  const [appState, setAppState] = useState<AppState>('initializing')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)

  const [poseResult, setPoseResult] = useState<PoseLandmarkerResult | null>(null)
  const [phase, setPhase] = useState<StrokePhase>('none')
  const [feedbackMsg, setFeedbackMsg] = useState<FeedbackMessage | null>(null)
  // Aspect ratio (w/h) of the live camera frame, used to size the video
  // container so the normalized skeleton landmarks align with the pixels.
  const [videoAspect, setVideoAspect] = useState<number | null>(null)

  // ---- Diagnostic state (helps identify "no skeleton" root cause) ----
  const [debug, setDebug] = useState<{
    lm: number
    vs: string
    fps: number
    app: string
    model: string
    detMs: number
  }>({ lm: -1, vs: '?', fps: 0, app: 'init', model: '-', detMs: 0 })

  // Ref mirror of appState for the debug ticker inside the rAF loop
  const appStateRef = useRef(appState)
  appStateRef.current = appState

  const rafRef = useRef<number | null>(null)
  const lastVideoTimeRef = useRef(-1)
  const lastInferTimeRef = useRef(0)

  // Model adaptivity
  const visionRef = useRef<Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>> | null>(null)
  const modelIndexRef = useRef(0)
  const infRef = useRef({ sum: 0, count: 0 })

  // Diagnostics
  const statsRef = useRef({ frames: 0, lastLm: -1, lastT: 0, fps: 0 })

  // UI state that updates at low frequency (throttled)
  const [ui, setUi] = useState({
    duration: 0,
    strokeCount: 0,
    posture: 0,
    technique: 0,
    symmetry: 0,
    fluidity: 0,
    costanza: 0,
  })

  // Refs mirror of UI to avoid stale closures in the frame loop
  const engineRef = useRef<EngineState>(createEngineState())
  const voiceRef = useRef(voiceEnabled)
  voiceRef.current = voiceEnabled

  // Low-frequency push from the loop -> state. The duration always ticks
  // (~4x/sec), while the heavier SQI stats only update when they change.
  const pushUiRef = useRef<(force?: boolean) => void>(() => {})
  pushUiRef.current = (force) => {
    const e = engineRef.current
    const s = e.lastSqi
    const duration = performance.now() - e.startTime
    setUi((prev) => {
      if (
        !force &&
        prev.strokeCount === e.strokes.length &&
        prev.posture === (s?.posture ?? 0) &&
        prev.technique === (s?.technique ?? 0) &&
        Math.abs(prev.duration - duration) < 400
      ) {
        return prev
      }
      return {
        duration,
        strokeCount: e.strokes.length,
        posture: s?.posture ?? 0,
        technique: s?.technique ?? 0,
        symmetry: s?.symmetry ?? 0,
        fluidity: s?.fluidity ?? 0,
        costanza: s?.costanza ?? 0,
      }
    })
  }

  const liveDisplay = {
    sqi: engineRef.current.lastSqi?.overall ?? 0,
    strokeRate: engineRef.current.rate,
    strokeCount: ui.strokeCount,
    posture: ui.posture,
    technique: ui.technique,
    symmetry: ui.symmetry,
    fluidity: ui.fluidity,
    costanza: ui.costanza,
    fatigue: engineRef.current.fatigue,
    amplitude: engineRef.current.amplitude,
    duration: ui.duration,
    phase: PHASE_LABEL_IT[phase],
  }

  // ---- Load AI model (with fallback to lighter models / CPU) ----
  async function createLandmarker(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
    index: number,
    delegate: 'GPU' | 'CPU'
  ) {
    const cand = POSE_MODELS[index]
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: cand.path,
        delegate,
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  }

  // Swap to a lighter model while the session is running. Kept in a ref so the
  // rAF loop (mounted once) can call the latest version.
  const downgradeRef = useRef<() => void>(() => {})
  downgradeRef.current = async () => {
    const vision = visionRef.current
    if (!vision) return
    if (modelIndexRef.current >= POSE_MODELS.length - 1) return
    const target = modelIndexRef.current + 1
    // Detach the current (too slow) model immediately so the loop stops using
    // it, letting the video play smoothly while we load the lighter one.
    landmarkerRef.current = null
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        console.log(`PaddleAI: downgrading to ${POSE_MODELS[target].name}/${delegate}`)
        const lm = await createLandmarker(vision, target, delegate)
        landmarkerRef.current = lm
        modelIndexRef.current = target
        infRef.current = { sum: 0, count: 0 }
        setDebug((d) => ({
          ...d,
          lm: -1,
          model: `${POSE_MODELS[target].name}/${delegate}`,
        }))
        return
      } catch (e) {
        console.warn(`PaddleAI: downgrade to ${POSE_MODELS[target].name}/${delegate} failed`, e)
      }
    }
    // Could not build a lighter model: restore the old one.
    try {
      const lm = await createLandmarker(vision, modelIndexRef.current, 'GPU')
      landmarkerRef.current = lm
    } catch {
      landmarkerRef.current = null
    }
  }

  // ---- Init once: load model, then start camera, then record ----
  // A single mount-only effect so that transitioning appState to 'recording'
  // never re-runs a cleanup that would stop the just-started webcam stream.
  useEffect(() => {
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 320 },
            height: { ideal: 240 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        video.srcObject = stream
        // Wait for metadata/ready before starting the loop
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2) return resolve()
          video.onloadeddata = () => resolve()
        })
        if (cancelled) return
        await video.play().catch(() => {})

        const w = video.videoWidth
        const h = video.videoHeight
        if (w && h) setVideoAspect(w / h)

        engineRef.current.startTime = performance.now()
        resetStrokeDetector()
        resetBiomechanics()
        resetFeedback()
        setAppState('recording')
      } catch (err) {
        console.error('Camera error', err)
        if (!cancelled) {
          setCameraError(
            'Impossibile accedere alla fotocamera. Controlla i permessi.'
          )
        }
      }
    }

    async function loadModel() {
      try {
        setAppState('loading-model')
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        )
        if (cancelled) return
        visionRef.current = vision

        // Mobile devices rarely handle the heavy model's warm-up without
        // freezing the webcam feed, so start from 'full' there; desktops can
        // try the most accurate 'heavy' first. The auto-downgrade in the loop
        // will move to a lighter model if inference is still too slow.
        const isMobile =
          /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
          (window.matchMedia?.('(pointer: coarse)').matches ?? false)
        modelIndexRef.current = isMobile ? 1 : 0

        let lastErr: unknown = null
        for (let i = modelIndexRef.current; i < POSE_MODELS.length; i++) {
          // Try GPU first, then fall back to CPU for the same model
          for (const delegate of ['GPU', 'CPU'] as const) {
            try {
              console.log(`PaddleAI: trying ${POSE_MODELS[i].name} on ${delegate}`)
              const lm = await createLandmarker(vision, i, delegate)
              if (cancelled) return
              landmarkerRef.current = lm
              modelIndexRef.current = i
              setDebug((d) => ({
                ...d,
                lm: -1,
                model: `${POSE_MODELS[i].name}/${delegate}`,
              }))
              setAppState('ready')
              await startCamera()
              return
            } catch (e) {
              lastErr = e
              console.warn(`PaddleAI: ${POSE_MODELS[i].name}/${delegate} failed`, e)
            }
          }
        }
        throw lastErr
      } catch (e) {
        console.error('Model load failed', e)
        if (!cancelled) {
          setModelError(
            'Errore nel caricamento del modello AI. Verifica la connessione.'
          )
        }
      }
    }

    loadModel()
    initSpeech()

    // Fallback unlock: some browsers lose the Start-gesture context after the
    // camera grant dialog; the next tap anywhere re-unlocks the speech API.
    const unlock = () => {
      initSpeech()
      primeSpeech()
    }
    window.addEventListener('pointerdown', unlock, { once: true })

    return () => {
      cancelled = true
      window.removeEventListener('pointerdown', unlock)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  // ---- Fast loop: pose + engine + throttled UI ----
  useEffect(() => {
    const loop = (time: number) => {
      const video = videoRef.current
      const lm = landmarkerRef.current
      if (!video || !lm) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      // Keep the UI clock ticking without depending on new strokes
      if (engineRef.current.startTime > 0) {
        pushUiRef.current()
      }

      // Always ticking diag (once per second) so we can see the loop is alive,
      // what readyState the video is in, and the app state — even when the
      // inference gate below never passes.
      const s = statsRef.current
      s.frames++
      if (time - s.lastT >= 1000) {
        s.fps = Math.round((s.frames * 1000) / (time - s.lastT))
        s.frames = 0
        s.lastT = time
        setDebug((d) => ({
          ...d,
          vs: video.readyState.toString(),
          fps: s.fps,
          app: appStateRef.current,
        }))

        // Auto-downgrade: if the model is too slow for this device, switch to a
        // lighter one after a 4s warm-up so the webcam feed never freezes.
        const inf = infRef.current
        if (
          appStateRef.current === 'recording' &&
          inf.count > 5 &&
          inf.sum / inf.count > INF_THRESHOLD_MS &&
          modelIndexRef.current < POSE_MODELS.length - 1 &&
          performance.now() - engineRef.current.startTime > 4000
        ) {
          console.log(
            `PaddleAI: avg inference ${Math.round(inf.sum / inf.count)}ms > ${INF_THRESHOLD_MS}ms, downgrading`
          )
          inf.sum = 0
          inf.count = 0
          void downgradeRef.current()
        } else if (inf.count > 0) {
          inf.sum = 0
          inf.count = 0
        }
      }

      // Do not run inference for the first ~1s of the feed: the very first
      // detectForVideo call does GPU/model warm-up and can block the main
      // thread long enough to stall the webcam. Let it stabilize first.
      if (performance.now() - engineRef.current.startTime < 800) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }

      // Only run inference on a new video frame, throttled to ~12 fps so the
      // heavy pose model doesn't freeze the webcam feed.
      if (
        video.readyState >= 2 &&
        video.currentTime !== lastVideoTimeRef.current &&
        time - lastInferTimeRef.current >= 83
      ) {
        lastVideoTimeRef.current = video.currentTime
        lastInferTimeRef.current = time
        try {
          const t0 = performance.now()
          const result = lm.detectForVideo(video, time)
          const detMs = Math.round(performance.now() - t0)
          infRef.current.sum += detMs
          infRef.current.count++
          setDebug((d) => (detMs !== d.detMs ? { ...d, detMs } : d))
          if (result && result.landmarks && result.landmarks.length > 0) {
            setDebug((d) => ({ ...d, lm: result.landmarks.length }))
            setPoseResult(result)

            const strokeDetection = processStrokeFrame(result, time)
            setPhase(strokeDetection.currentPhase)

            const partial = processBioFrame(
              result,
              time,
              strokeDetection.currentPhase,
              strokeDetection.currentSide,
              strokeDetection.lastCycleDurationMs
            )

            const e = engineRef.current

            if (strokeDetection.newStrokeDetected) {
              const partialList = e.currentStrokePartial
              if (partialList.length > 0) {
                const metrics = computeFullStrokeMetrics(
                  time - e.currentStrokeStart,
                  e.currentStrokeSide,
                  partialList,
                  e.strokes.length + 1,
                  e.currentStrokeStart,
                  time
                )
                metrics.sequenceErrors =
                  strokeDetection.lastStroke?.sequenceErrors ?? []
                e.strokes.push(metrics)

                const recent = e.strokes.slice(-20)
                const newSqi = calculateSQI(metrics, recent)
                e.lastSqi = newSqi

                e.fatigue = calculateFatigueIndex(e.strokes, newSqi)
                e.rate = 60000 / metrics.durationMs
                e.amplitude = metrics.strokeAmplitude

                const fb = evaluateFeedback(
                  metrics,
                  newSqi,
                  time - e.startTime,
                  e.strokes.length,
                  e.rate
                )
                if (fb) {
                  e.feedback.push(fb)
                  setFeedbackMsg(fb)
                  if (voiceRef.current && fb.type !== 'info') {
                    speak(fb.text)
                  }
                }

                if (e.strokes.length % 50 === 0) {
                  e.fatigueSegments.push({
                    index: Math.floor(e.strokes.length / 50),
                    fatigue: e.fatigue,
                    timestamp: time,
                  })
                }
              }
              e.currentStrokePartial = []
              e.currentStrokeStart = time
              e.currentStrokeSide = strokeDetection.currentSide
            } else {
              e.currentStrokePartial.push(partial)
            }

            // Throttle: update UI ~4x/sec to avoid render flood
            if (time % 250 < 40) {
              pushUiRef.current(true)
            }
          } else {
            setDebug((d) => (d.lm === 0 ? d : { ...d, lm: 0 }))
          }
        } catch (err) {
          console.error('Pose/engine error', err)
          setDebug((d) => ({ ...d, detMs: -1 }))
        }
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  // ---- Start camera when model is ready ----
  const handleStop = () => {
    const e = engineRef.current
    const durationMs = performance.now() - e.startTime
    const session: SessionData = {
      id: Math.random().toString(36).substring(2, 9),
      startTime: Date.now() - durationMs,
      endTime: Date.now(),
      durationMs,
      strokes: e.strokes,
      sqi: e.lastSqi,
      avgStrokeRate: e.rate,
      strokeCount: e.strokes.length,
      feedbackMessages: e.feedback,
      fatigueIndex:
        e.fatigueSegments.length > 0
          ? e.fatigueSegments[e.fatigueSegments.length - 1].fatigue
          : e.fatigue,
      fatigueSegments: e.fatigueSegments,
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setAppState('stopped')
    onComplete(session)
  }

  const handlePause = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setAppState('stopped')
    onExit()
  }

  const mmss = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${(s % 60).toString().padStart(2, '0')}`
  }

  const showLoading =
    (appState === 'initializing' || appState === 'loading-model') &&
    !cameraError &&
    !modelError

  return (
    <div className="w-full h-full bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              appState === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-slate-500'
            }`}
          />
          <Activity size={18} className="text-sky-400" />
          <span className="font-bold text-white">VogaAI</span>
        </div>
        <div className="text-sm font-mono text-slate-300">{mmss(ui.duration)}</div>
        <div className="flex gap-2">
          <button
            onClick={handlePause}
            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-200 transition-colors"
          >
            Chiudi
          </button>
          <button onClick={handleStop} className="btn-danger !px-3 !py-1.5 text-xs">
            Stop
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 p-3 overflow-hidden">
        {/* Video area */}
        <div className="flex-1 relative min-h-[300px] lg:min-h-0 flex items-center justify-center">
          {cameraError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/95 rounded-xl">
              <div className="text-center p-6">
                <p className="text-red-400 font-semibold mb-2">Errore Fotocamera</p>
                <p className="text-sm text-slate-400">{cameraError}</p>
                <button onClick={onExit} className="btn-primary mt-4 text-sm">
                  Torna Indietro
                </button>
              </div>
            </div>
          )}

          {modelError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/95 rounded-xl">
              <div className="text-center p-6">
                <p className="text-red-400 font-semibold mb-2">Errore Modello AI</p>
                <p className="text-sm text-slate-400">{modelError}</p>
                <button onClick={onExit} className="btn-primary mt-4 text-sm">
                  Torna Indietro
                </button>
              </div>
            </div>
          )}

          {showLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/95 rounded-xl">
              <div className="text-center">
                <div className="w-14 h-14 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-300 font-medium">
                  {appState === 'loading-model'
                    ? 'Caricamento modello AI...'
                    : 'Avvio fotocamera...'}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Prima volta: scarica ~20MB modello pose (on-device)
                </p>
              </div>
            </div>
          )}

          <div
            className="relative w-full max-w-full bg-black rounded-xl overflow-hidden"
            style={{ aspectRatio: videoAspect ?? 4 / 3 }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 w-full h-full object-cover -scale-x-100"
            />
            <SkeletonRenderer
              result={poseResult}
              phase={phase}
              width={640}
              height={480}
            />

            {/* Diagnostic overlay */}
            <div className="absolute top-2 left-2 z-10 px-2 py-1 rounded bg-black/60 text-[10px] font-mono text-lime-300 pointer-events-none">
              {debug.app} | {debug.model}
              <br />
              LM:{debug.lm} VS:{debug.vs} FPS:{debug.fps} INF:{debug.detMs}ms
              <br />
              <span className="text-green-400">polso sx=verde</span>{' '}
              <span className="text-rose-400">polso dx=rosa</span>
            </div>

            {/* Feedback overlay on video (mobile) */}
            <div className="absolute bottom-3 left-3 right-3 z-10 pointer-events-none lg:hidden">
              <FeedbackOverlay current={feedbackMsg} />
            </div>
          </div>
        </div>

        {/* Right panel (desktop) */}
        <div className="hidden lg:flex w-80 flex-col gap-3 overflow-y-auto">
          <div className="flex items-center justify-center">
            <SQIGauge value={liveDisplay.sqi} size={130} label="SQI LIVE" />
          </div>
          <LiveStatsPanel
            strokeRate={liveDisplay.strokeRate}
            strokeCount={liveDisplay.strokeCount}
            posture={liveDisplay.posture}
            technique={liveDisplay.technique}
            symmetry={liveDisplay.symmetry}
            fluidity={liveDisplay.fluidity}
            costanza={liveDisplay.costanza}
            fatigue={liveDisplay.fatigue}
            amplitude={liveDisplay.amplitude}
            duration={liveDisplay.duration}
            phase={liveDisplay.phase}
          />
          <FeedbackOverlay current={feedbackMsg} />
        </div>
      </div>

      {/* Mobile bottom stats */}
      <div className="lg:hidden border-t border-slate-800 bg-slate-900/90 backdrop-blur p-3 max-h-48 overflow-y-auto">
        <LiveStatsPanel
          strokeRate={liveDisplay.strokeRate}
          strokeCount={liveDisplay.strokeCount}
          posture={liveDisplay.posture}
          technique={liveDisplay.technique}
          symmetry={liveDisplay.symmetry}
          fluidity={liveDisplay.fluidity}
          costanza={liveDisplay.costanza}
          fatigue={liveDisplay.fatigue}
          amplitude={liveDisplay.amplitude}
          duration={liveDisplay.duration}
          phase={liveDisplay.phase}
        />
      </div>
    </div>
  )
}

export default TrainingScreen
