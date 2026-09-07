import type { PoseLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { POSE_LANDMARKS } from '../types'
import type { StrokePhase, StrokeCycle } from '../types'

interface ReachSample {
  reach: number
  timestamp: number
  side: 'left' | 'right'
}

interface StrokeDetectorState {
  reachHistory: ReachSample[]
  emaReach: Record<'left' | 'right', number>
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
const MIN_SAMPLES = 8
const MIN_REACH_RANGE = 0.02
const SIDE_HYSTERESIS = 0.04

const state: StrokeDetectorState = {
  reachHistory: [],
  emaReach: { left: 0, right: 0 },
  currentPhase: 'none',
  currentSide: 'left',
  strokeCount: 0,
  cycleStart: 0,
  lastCycleDuration: 1000,
  dominantSideBuffer: [],
}

export function resetStrokeDetector(): void {
  state.reachHistory = []
  state.emaReach = { left: 0, right: 0 }
  state.currentPhase = 'none'
  state.currentSide = 'left'
  state.strokeCount = 0
  state.cycleStart = 0
  state.lastCycleDuration = 1000
  state.dominantSideBuffer = []
}

/**
 * How far the hand is IN FRONT of the body for a given side, taken from the
 * landmark depth (z), scaled by the shoulder width so people and camera
 * distance don't matter. Positive = wrist closer to the camera than its
 * shoulder = arm extended forward.
 *
 * This is the only cue that stays stable in a frontal view: when the rower
 * reaches forward (catch/attacco) the wrist moves TOWARD the camera, which
 * projects to almost no x/y change on screen but a clear change in depth.
 */
function depthReach(lm: NormalizedLandmark[], side: 'left' | 'right'): number {
  const shoulder =
    side === 'left'
      ? lm[POSE_LANDMARKS.LEFT_SHOULDER]
      : lm[POSE_LANDMARKS.RIGHT_SHOULDER]
  const wrist =
    side === 'left'
      ? lm[POSE_LANDMARKS.LEFT_WRIST]
      : lm[POSE_LANDMARKS.RIGHT_WRIST]
  if (!shoulder || !wrist) return Number.NaN
  if (!isFinite(wrist.z) || !isFinite(shoulder.z)) return Number.NaN
  const torsoWidth = Math.abs(
    lm[POSE_LANDMARKS.LEFT_SHOULDER].x - lm[POSE_LANDMARKS.RIGHT_SHOULDER].x
  ) || 0.001
  return (shoulder.z - wrist.z) / torsoWidth
}

function detectDominantSide(result: PoseLandmarkerResult): 'left' | 'right' {
  const lm = result.landmarks[0]
  const lVis = lm[POSE_LANDMARKS.LEFT_WRIST]?.visibility ?? 0
  const rVis = lm[POSE_LANDMARKS.RIGHT_WRIST]?.visibility ?? 0
  // Hysteresis: don't flip side on every frame where both wrists are visible
  // (typical in sculling), only when one side is clearly more tracked.
  if (lVis > rVis + SIDE_HYSTERESIS) return 'left'
  if (rVis > lVis + SIDE_HYSTERESIS) return 'right'
  return state.currentSide
}

function detectPhaseReach(side: 'left' | 'right'): StrokePhase {
  const samples = state.reachHistory.filter((s) => s.side === side).slice(-60)
  if (samples.length < MIN_SAMPLES) return 'none'

  const values = samples.map((s) => s.reach)
  const current = values[values.length - 1]
  if (!isFinite(current)) return 'none'

  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const range = hi - lo
  // No real reach cycle happening (too little depth variation): hold state.
  if (range < MIN_REACH_RANGE) return 'none'

  const p = Math.min(1, Math.max(0, (current - lo) / range))

  // Arms fully extended forward (just before the drive): catch / ATTACCO.
  if (p >= 0.75) return 'entry'
  // Arms pulled to the body: finish / FINALE.
  if (p <= 0.25) return 'exit'

  // Between the extremes the trend tells us if the hands are going out
  // (RECUPERO) or coming back (TRAZIONE).
  const prev = samples[samples.length - 2]?.reach ?? current
  return current >= prev ? 'recovery' : 'pull'
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
  const stale = {
    currentPhase: state.currentPhase,
    currentSide: state.currentSide,
    strokeCount: state.strokeCount,
    lastCycleDurationMs: state.lastCycleDuration,
    newStrokeDetected: false,
  }

  if (!result.landmarks || result.landmarks.length === 0) return stale

  const lm = result.landmarks[0]
  const side = detectDominantSide(result)
  const reach = depthReach(lm, side)

  // Depth unavailable: hold the machine so a few bad frames don't reset it.
  if (!isFinite(reach)) return stale

  // EMA smoothing: the depth channel is noisier than x/y.
  const base = state.emaReach[side] || reach
  const ema = base * 0.65 + reach * 0.35
  state.emaReach[side] = ema
  state.reachHistory.push({ reach: ema, timestamp: timestampMs, side })

  const cutoff = timestampMs - historyDurationMs
  state.reachHistory = state.reachHistory.filter((w) => w.timestamp > cutoff)

  const newPhase = detectPhaseReach(side)

  // Transient/insufficient signal: keep the current phase (and the
  // recovery->entry machine) intact.
  if (newPhase === 'none') {
    if (state.currentPhase === 'none') state.currentSide = side
    return stale
  }

  let newStrokeDetected = false
  let lastStroke: StrokeCycle | undefined

  // One vogata is counted when the hands finish their extension (recovery) and
  // reach full extension (catch) again — that is the start of the next drive.
  if (
    state.currentPhase === 'recovery' &&
    (newPhase === 'entry' || newPhase === 'pull')
  ) {
    const cycleDuration = timestampMs - state.cycleStart
    if (
      cycleDuration >= minStrokeDurationMs &&
      cycleDuration <= maxStrokeDurationMs
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
  state.currentSide = side

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