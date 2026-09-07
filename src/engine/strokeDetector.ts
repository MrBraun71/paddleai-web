import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { POSE_LANDMARKS } from '../types'
import type { StrokePhase, StrokeCycle } from '../types'

interface WristPosition {
  x: number
  y: number
  timestamp: number
  side: 'left' | 'right'
}

interface StrokeDetectorState {
  wristHistory: WristPosition[]
  currentPhase: StrokePhase
  currentSide: 'left' | 'right'
  strokeCount: number
  cycleStart: number
  lastCycleDuration: number
  dominantSideBuffer: number[]
}

const historyDurationMs = 2000
const minStrokeDurationMs = 400
const maxStrokeDurationMs = 3000

const state: StrokeDetectorState = {
  wristHistory: [],
  currentPhase: 'none',
  currentSide: 'left',
  strokeCount: 0,
  cycleStart: 0,
  lastCycleDuration: 1000,
  dominantSideBuffer: [],
}

export function resetStrokeDetector(): void {
  state.wristHistory = []
  state.currentPhase = 'none'
  state.currentSide = 'left'
  state.strokeCount = 0
  state.cycleStart = 0
  state.lastCycleDuration = 1000
  state.dominantSideBuffer = []
}

function detectDominantSide(
  result: PoseLandmarkerResult
): 'left' | 'right' {
  if (!result.landmarks || result.landmarks.length === 0) return 'left'
  const lm = result.landmarks[0]
  const leftWrist = lm[POSE_LANDMARKS.LEFT_WRIST]
  const rightWrist = lm[POSE_LANDMARKS.RIGHT_WRIST]
  const leftVis = leftWrist.visibility ?? 0
  const rightVis = rightWrist.visibility ?? 0
  if (leftVis > rightVis) return 'left'
  if (rightVis > leftVis) return 'right'
  return 'left'
}

function detectPhase(
  dominantWrist: WristPosition,
  _oppositeWrist: WristPosition,
  centerX: number
): StrokePhase {
  const dx = dominantWrist.x - centerX

  const phaseHistory: WristPosition[] = state.wristHistory
    .filter((w) => w.side === dominantWrist.side)
    .slice(-60)

  if (phaseHistory.length < 10) return 'none'

  const velocities = phaseHistory.map((p, i) => {
    if (i === 0) return 0
    return p.x - phaseHistory[i - 1].x
  })

  const recentVels = velocities.slice(-15)
  const avgVel = recentVels.reduce((a, b) => a + b, 0) / recentVels.length

  if (dx > 0.15 && avgVel > 0.001) {
    return 'entry'
  } else if (dx > 0.05 && avgVel >= -0.002) {
    return 'pull'
  } else if (dx < -0.1 && avgVel < -0.001) {
    return 'exit'
  } else if (dx < 0 && avgVel <= 0.001) {
    return 'recovery'
  }

  const peakX = Math.max(...phaseHistory.slice(-30).map((p) => p.x))
  const troughX = Math.min(...phaseHistory.slice(-30).map((p) => p.x))
  const range = peakX - troughX
  const position =
    range > 0 ? (dominantWrist.x - troughX) / range : 0.5

  if (position > 0.85) return 'entry'
  if (position > 0.5) return 'pull'
  if (position > 0.2) return 'exit'
  return 'recovery'
}

export interface StrokeDetectorOutput {
  currentPhase: StrokePhase
  currentSide: 'left' | 'right'
  strokeCount: number
  lastCycleDurationMs: number
  newStrokeDetected: boolean
  lastStroke?: StrokeCycle
}

export function processFrame(
  result: PoseLandmarkerResult,
  timestampMs: number
): StrokeDetectorOutput {
  if (!result.landmarks || result.landmarks.length === 0) {
    return {
      currentPhase: state.currentPhase,
      currentSide: state.currentSide,
      strokeCount: state.strokeCount,
      lastCycleDurationMs: state.lastCycleDuration,
      newStrokeDetected: false,
    }
  }

  const lm = result.landmarks[0]
  const side = detectDominantSide(result)

  const leftWrist = lm[POSE_LANDMARKS.LEFT_WRIST]
  const rightWrist = lm[POSE_LANDMARKS.RIGHT_WRIST]
  const leftShoulder = lm[POSE_LANDMARKS.LEFT_SHOULDER]
  const rightShoulder = lm[POSE_LANDMARKS.RIGHT_SHOULDER]
  const centerX = (leftShoulder.x + rightShoulder.x) / 2

  const dominantWrist = side === 'left' ? leftWrist : rightWrist
  const oppositeWrist = side === 'left' ? rightWrist : leftWrist

  const wristPos: WristPosition = {
    x: dominantWrist.x,
    y: dominantWrist.y,
    timestamp: timestampMs,
    side,
  }
  state.wristHistory.push(wristPos)

  const cutoff = timestampMs - historyDurationMs
  state.wristHistory = state.wristHistory.filter((w) => w.timestamp > cutoff)

  const newPhase = detectPhase(
    { x: dominantWrist.x, y: dominantWrist.y, timestamp: timestampMs, side },
    { x: oppositeWrist.x, y: oppositeWrist.y, timestamp: timestampMs, side: side === 'left' ? 'right' : 'left' },
    centerX
  )

  let newStrokeDetected = false
  let lastStroke: StrokeCycle | undefined

  if (
    state.currentPhase === 'recovery' &&
    (newPhase === 'entry' || newPhase === 'pull')
  ) {
    const cycleDuration = timestampMs - state.cycleStart
    if (
      cycleDuration > minStrokeDurationMs &&
      cycleDuration < maxStrokeDurationMs
    ) {
      state.strokeCount++
      state.lastCycleDuration = cycleDuration
      state.dominantSideBuffer.push(side === 'left' ? 0 : 1)
      if (state.dominantSideBuffer.length > 20) {
        state.dominantSideBuffer.shift()
      }
      const leftCount = state.dominantSideBuffer.filter((s) => s === 0).length
      const rightCount = state.dominantSideBuffer.length - leftCount
      state.currentSide = leftCount >= rightCount ? 'left' : 'right'

      lastStroke = {
        id: state.strokeCount,
        startTime: state.cycleStart,
        endTime: timestampMs,
        phase: newPhase,
        durationMs: cycleDuration,
        dominantSide: state.currentSide,
      }
      newStrokeDetected = true
    }
    state.cycleStart = timestampMs
  }

  state.currentPhase = newPhase
  if (newPhase !== 'none') state.currentSide = side

  return {
    currentPhase: state.currentPhase,
    currentSide: state.currentSide,
    strokeCount: state.strokeCount,
    lastCycleDurationMs: state.lastCycleDuration,
    newStrokeDetected,
    lastStroke,
  }
}

export function getStrokeDetectorState() {
  return { ...state }
}
