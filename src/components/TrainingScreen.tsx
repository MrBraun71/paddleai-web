import React, { useCallback, useEffect, useRef, useState } from 'react'
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

const TrainingScreen: React.FC<Props> = ({ onComplete, onExit, voiceEnabled }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<PoseLandmarker | null>(null)

  const [appState, setAppState] = useState<AppState>('initializing')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [modelError, setModelError] = useState<string | null>(null)

  const [poseResult, setPoseResult] = useState<PoseLandmarkerResult | null>(null)
  const [phase, setPhase] = useState<StrokePhase>('none')

  const [sqi, setSqi] = useState<SQIBreakdown | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<FeedbackMessage | null>(null)

  const rafRef = useRef<number | null>(null)
  const lastVideoTimeRef = useRef(-1)

  const sessionRef = useRef<{
    startTime: number
    strokes: StrokeMetrics[]
    feedback: FeedbackMessage[]
    currentStrokePartial: Partial<StrokeMetrics>[]
    currentStrokeStart: number
    currentStrokeSide: 'left' | 'right'
    fatigueSegments: { index: number; fatigue: number; timestamp: number }[]
    lastFeedbackTime: number
  }>({
    startTime: 0,
    strokes: [],
    feedback: [],
    currentStrokePartial: [],
    currentStrokeStart: 0,
    currentStrokeSide: 'left',
    fatigueSegments: [],
    lastFeedbackTime: 0,
  })

  const statsRef = useRef({
    duration: 0,
    rate: 0,
    amplitude: 0,
    fatigue: 0,
  })

  const [stats, setStats] = useState({
    duration: 0,
    rate: 0,
    amplitude: 0,
    fatigue: 0,
  })

  // Format live stats for display
  const liveDisplay = {
    sqi: sqi?.overall ?? 0,
    strokeRate: stats.rate,
    strokeCount: sessionRef.current.strokes.length,
    posture: sqi?.posture ?? 0,
    technique: sqi?.technique ?? 0,
    symmetry: sqi?.symmetry ?? 0,
    fluidity: sqi?.fluidity ?? 0,
    costanza: sqi?.costanza ?? 0,
    fatigue: stats.fatigue,
    amplitude: stats.amplitude,
    duration: stats.duration,
    phase,
  }

  // Load model
  useEffect(() => {
    let cancelled = false

    async function loadModel() {
      try {
        setAppState('loading-model')
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        )
        if (cancelled) return
        const lm = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
        if (cancelled) return
        landmarkerRef.current = lm
        setAppState('ready')
      } catch (e) {
        console.error('Model load failed', e)
        if (!cancelled) setModelError('Errore nel caricamento del modello AI. Verifica la connessione.')
      }
    }

    loadModel()
    initSpeech()

    return () => {
      cancelled = true
    }
  }, [])

  // Start camera when model ready
  useEffect(() => {
    if (appState !== 'ready') return
    let cancelled = false

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        sessionRef.current.startTime = Date.now()
        setAppState('recording')
        resetStrokeDetector()
        resetBiomechanics()
        resetFeedback()
        requestAnimationFrame(frameLoop)
      } catch (e) {
        console.error('Camera error', e)
        if (!cancelled) setCameraError('Impossibile accedere alla fotocamera. Controlla i permessi.')
      }
    }

    startCamera()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState])

  const frameLoop = useCallback((time: number) => {
    const video = videoRef.current
    const lm = landmarkerRef.current
    if (!video || !lm) return

    if ((video.currentTime as number) !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime
      try {
        const result = lm.detectForVideo(video, time)
        if (result && result.landmarks && result.landmarks.length > 0) {
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

          if (strokeDetection.newStrokeDetected) {
            const s = sessionRef.current
            const partialList = s.currentStrokePartial
            if (partialList.length > 0) {
              const metrics = computeFullStrokeMetrics(
                time - s.currentStrokeStart,
                s.currentStrokeSide,
                partialList,
                s.strokes.length + 1,
                s.currentStrokeStart,
                time
              )
              s.strokes.push(metrics)

              const recent = s.strokes.slice(-20)
              const newSqi = calculateSQI(metrics, recent)
              setSqi(newSqi)

              const fatigue = calculateFatigueIndex(s.strokes, newSqi)
              statsRef.current.fatigue = fatigue

              const rate = 60000 / metrics.durationMs
              statsRef.current.rate = rate
              statsRef.current.amplitude = metrics.strokeAmplitude

              const fb = evaluateFeedback(
                metrics,
                newSqi,
                time - s.startTime,
                s.strokes.length,
                rate
              )
              if (fb) {
                s.feedback.push(fb)
                setFeedbackMsg(fb)
                if (voiceEnabled && fb.type !== 'info') {
                  speak(fb.text)
                }
              }

              if (
                s.strokes.length % 50 === 0 &&
                statsRef.current.fatigue !== undefined
              ) {
                s.fatigueSegments.push({
                  index: Math.floor(s.strokes.length / 50),
                  fatigue: statsRef.current.fatigue,
                  timestamp: time,
                })
              }
            }
            s.currentStrokePartial = []
            s.currentStrokeStart = time
            s.currentStrokeSide = strokeDetection.currentSide
          } else {
            sessionRef.current.currentStrokePartial.push(partial)
          }

          const todayStats = statsRef.current
          setStats({
            duration: time - sessionRef.current.startTime,
            rate: todayStats.rate,
            amplitude: todayStats.amplitude,
            fatigue: todayStats.fatigue,
          })
        }
      } catch (e) {
        console.error('Detection error', e)
      }
    }

    rafRef.current = requestAnimationFrame(frameLoop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled, sqi, phase])

  const handleStop = useCallback(() => {
    const s = sessionRef.current
    const finalModel = sqi
    const session: SessionData = {
      id: Math.random().toString(36).substring(2, 9),
      startTime: s.startTime,
      endTime: Date.now(),
      durationMs: Date.now() - s.startTime,
      strokes: s.strokes,
      sqi: finalModel,
      avgStrokeRate: statsRef.current.rate,
      strokeCount: s.strokes.length,
      feedbackMessages: s.feedback,
      fatigueIndex:
        s.fatigueSegments.length > 0
          ? s.fatigueSegments[s.fatigueSegments.length - 1].fatigue
          : statsRef.current.fatigue,
      fatigueSegments: s.fatigueSegments,
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setAppState('stopped')
    onComplete(session)
  }, [onComplete, sqi])

  const handlePause = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setAppState('stopped')
    onExit()
  }, [onExit])

  const mmss = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${(s % 60).toString().padStart(2, '0')}`
  }

  return (
    <div className="w-full h-full bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${
            appState === 'recording' ? 'bg-red-500 animate-pulse' : 'bg-slate-500'
          }`} />
          <Activity size={18} className="text-sky-400" />
          <span className="font-bold text-white">PaddleAI</span>
        </div>
        <div className="text-sm font-mono text-slate-300">{mmss(stats.duration)}</div>
        <div className="flex gap-2">
          <button
            onClick={handlePause}
            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-semibold text-slate-200 transition-colors"
          >
            Chiudi
          </button>
          <button
            onClick={handleStop}
            className="btn-danger !px-3 !py-1.5 text-xs"
          >
            Stop
          </button>
        </div>
      </div>

      {/* Main content - responsive: row on desktop, column on mobile */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 p-3 overflow-hidden">
        {/* Video area */}
        <div className="flex-1 relative min-h-0 flex flex-col">
          {cameraError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/90 rounded-xl">
              <div className="text-center p-6">
                <p className="text-red-400 font-semibold mb-2">Errore Fotocamera</p>
                <p className="text-sm text-slate-400">{cameraError}</p>
                <button onClick={onExit} className="btn-primary mt-4 text-sm">Torna Indietro</button>
              </div>
            </div>
          )}

          {modelError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/90 rounded-xl">
              <div className="text-center p-6">
                <p className="text-red-400 font-semibold mb-2">Errore Modello AI</p>
                <p className="text-sm text-slate-400">{modelError}</p>
                <button onClick={onExit} className="btn-primary mt-4 text-sm">Torna Indietro</button>
              </div>
            </div>
          )}

          {(appState === 'initializing' || appState === 'loading-model') && !cameraError && !modelError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/90 rounded-xl">
              <div className="text-center">
                <div className="w-14 h-14 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-300 font-medium">
                  {appState === 'loading-model' ? 'Caricamento modello AI...' : 'Avvio fotocamera...'}
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  Prima volta: scarica ~20MB modello pose (on-device)
                </p>
              </div>
            </div>
          )}

          <div className="video-container flex-1 bg-black">
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
          </div>

          {/* Feedback overlay - overlaid on video bottom (mobile) */}
          <div className="lg:hidden absolute bottom-3 left-3 right-3 z-10 pointer-events-none">
            <FeedbackOverlay current={feedbackMsg} />
          </div>
        </div>

        {/* Right panel (desktop) */}
        <div className="hidden lg:flex w-80 flex-col gap-3 overflow-y-auto">
          <SQIGauge value={sqi?.overall ?? 0} size={130} label="SQI LIVE" />
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
          <div className="hidden lg:block">
            <FeedbackOverlay current={feedbackMsg} />
          </div>
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
