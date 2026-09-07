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

  // Low-frequency push from the loop -> state
  const pushUiRef = useRef<(force?: boolean) => void>(() => {})
  pushUiRef.current = (force) => {
    const e = engineRef.current
    const s = e.lastSqi
    setUi((prev) => {
      if (
        !force &&
        prev.strokeCount === e.strokes.length &&
        prev.posture === (s?.posture ?? 0) &&
        prev.technique === (s?.technique ?? 0)
      ) {
        return prev
      }
      return {
        duration: performance.now() - e.startTime,
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
    phase,
  }

  // ---- Load AI model once (with fallback to lighter models / CPU) ----
  useEffect(() => {
    let cancelled = false

    const CANDIDATES = [
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

    async function loadModel() {
      try {
        setAppState('loading-model')
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        )
        if (cancelled) return

        let lastErr: unknown = null
        for (const cand of CANDIDATES) {
          // Try GPU first, then fall back to CPU for the same model
          for (const delegate of ['GPU', 'CPU'] as const) {
            try {
              console.log(`PaddleAI: trying ${cand.name} on ${delegate}`)
              const lm = await PoseLandmarker.createFromOptions(vision, {
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
              if (cancelled) return
              landmarkerRef.current = lm
              setDebug((d) => ({
                ...d,
                lm: -1,
                model: `${cand.name}/${delegate}`,
              }))
              setAppState('ready')
              return
            } catch (e) {
              lastErr = e
              console.warn(`PaddleAI: ${cand.name}/${delegate} failed`, e)
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

    return () => {
      cancelled = true
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
      if (performance.now() - engineRef.current.startTime > 0) {
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
  useEffect(() => {
    if (appState !== 'ready') return
    let active = true

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
        if (!active) {
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
        await video.play().catch(() => {})

        engineRef.current.startTime = performance.now()
        resetStrokeDetector()
        resetBiomechanics()
        resetFeedback()
        setAppState('recording')
      } catch (err) {
        console.error('Camera error', err)
        if (active) {
          setCameraError(
            'Impossibile accedere alla fotocamera. Controlla i permessi del browser.'
          )
        }
      }
    }

    startCamera()

    return () => {
      active = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [appState])

  const handleStop = () => {
    const e = engineRef.current
    const session: SessionData = {
      id: Math.random().toString(36).substring(2, 9),
      startTime: e.startTime,
      endTime: Date.now(),
      durationMs: Date.now() - e.startTime,
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
          <span className="font-bold text-white">PaddleAI</span>
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
        <div className="flex-1 relative min-h-[300px] lg:min-h-0 flex flex-col">
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

          <div className="relative flex-1 bg-black rounded-xl overflow-hidden">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="absolute inset-0 w-full h-full object-cover"
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
