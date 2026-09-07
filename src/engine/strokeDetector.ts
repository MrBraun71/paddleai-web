import type { PoseLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import { POSE_LANDMARKS } from '../types'
import type { StrokePhase, StrokeCycle } from '../types'

interface ReachSample {
  reach: number
  timestamp: number
  side: 'left' | 'right'
}

interface FoldSample {
  v: number
  timestamp: number
}

interface LegSample {
  v: number
  timestamp: number
}

interface StrokeDetectorState {
  reachHistory: ReachSample[]
  emaReach: Record<'left' | 'right', number>
  emaFold: number
  foldHistory: FoldSample[]
  emaLeg: number
  legHistory: LegSample[]
  currentPhase: StrokePhase
  currentSide: 'left' | 'right'
  strokeCount: number
  cycleStart: number
  lastCycleDuration: number
  dominantSideBuffer: number[]
  pendingErrors: string[]
}

const historyDurationMs = 2000
const minStrokeDurationMs = 400
const maxStrokeDurationMs = 3000
const MIN_SAMPLES = 8
const MIN_REACH_RANGE = 0.02
const MIN_FOLD_RANGE = 0.04
const MIN_LEG_RANGE = 0.02
const SIDE_HYSTERESIS = 0.04

// Posture thresholds (normalized 0..1 against each channel's own recent range).
const ARM_EXTENDED = 0.75 // arms fully extended -> could be catch or drive
const ARM_BENT = 0.3 // arms pulled to the body -> finish
const LEG_COMPRESSED = 0.55 // knees bent, shins near vertical -> catch
const TRUNK_FOLDED = 0.4 // shoulders ahead of hips -> catch/recovery

const TREND_LAG = 4

const state: StrokeDetectorState = {
  reachHistory: [],
  emaReach: { left: 0, right: 0 },
  emaFold: 0,
  foldHistory: [],
  emaLeg: 0,
  legHistory: [],
  currentPhase: 'none',
  currentSide: 'left',
  strokeCount: 0,
  cycleStart: 0,
  lastCycleDuration: 1000,
  dominantSideBuffer: [],
  pendingErrors: [],
}

export function resetStrokeDetector(): void {
  state.reachHistory = []
  state.emaReach = { left: 0, right: 0 }
  state.emaFold = 0
  state.foldHistory = []
  state.emaLeg = 0
  state.legHistory = []
  state.currentPhase = 'none'
  state.currentSide = 'left'
  state.strokeCount = 0
  state.cycleStart = 0
  state.lastCycleDuration = 1000
  state.dominantSideBuffer = []
  state.pendingErrors = []
}

// ---- Signals ---------------------------------------------------------------

/**
 * How far the hand is IN FRONT of the body (landmark depth z), scaled by the
 * shoulder width. High = arm extended toward the camera (catch/recovery-opener).
 */
function depthReach(
  lm: NormalizedLandmark[],
  side: 'left' | 'right',
  torsoWidth: number
): number {
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
  return (shoulder.z - wrist.z) / torsoWidth
}

/**
 * Trunk fold: shoulders ahead of the hips (the catch posture). Positive =
 * shoulders closer to the camera than the hips.
 */
function trunkFoldValue(lm: NormalizedLandmark[], torsoWidth: number): number {
  const lShoulder = lm[POSE_LANDMARKS.LEFT_SHOULDER]
  const rShoulder = lm[POSE_LANDMARKS.RIGHT_SHOULDER]
  const lHip = lm[POSE_LANDMARKS.LEFT_HIP]
  const rHip = lm[POSE_LANDMARKS.RIGHT_HIP]
  if (!lShoulder || !rShoulder || !lHip || !rHip) return Number.NaN
  if (
    !isFinite(lShoulder.z) ||
    !isFinite(rShoulder.z) ||
    !isFinite(lHip.z) ||
    !isFinite(rHip.z)
  ) {
    return Number.NaN
  }
  const shoulderZ = (lShoulder.z + rShoulder.z) / 2
  const hipZ = (lHip.z + rHip.z) / 2
  return (hipZ - shoulderZ) / torsoWidth
}

/**
 * Leg flexion via knee height relative to the hips (image y, camera-independent).
 * 0 when the knees are raised next to the hips (compressed catch), growing as
 * the legs straighten at the finish. Then normalized so "compressed = 1".
 */
function legFlexValue(lm: NormalizedLandmark[]): number {
  const hipY =
    (lm[POSE_LANDMARKS.LEFT_HIP].y + lm[POSE_LANDMARKS.RIGHT_HIP].y) / 2
  const lKnee = lm[POSE_LANDMARKS.LEFT_KNEE]
  const rKnee = lm[POSE_LANDMARKS.RIGHT_KNEE]
  if (!isFinite(hipY)) return Number.NaN
  if (lKnee && isFinite(lKnee.y)) return lKnee.y - hipY
  if (rKnee && isFinite(rKnee.y)) return rKnee.y - hipY
  return Number.NaN
}

function lagValue(values: number[], back: number, current: number): number {
  if (values.length <= back) return current
  return values[values.length - 1 - back]
}

function normalizeRange(values: number[], current: number, minRange: number): number {
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const range = hi - lo
  if (range < minRange) return Number.NaN
  return Math.min(1, Math.max(0, (current - lo) / range))
}

// ---- Side selection --------------------------------------------------------

function detectDominantSide(result: PoseLandmarkerResult): 'left' | 'right' {
  const lm = result.landmarks[0]
  const lVis = lm[POSE_LANDMARKS.LEFT_WRIST]?.visibility ?? 0
  const rVis = lm[POSE_LANDMARKS.RIGHT_WRIST]?.visibility ?? 0
  // Hysteresis: don't flip side on every frame where both wrists are visible.
  if (lVis > rVis + SIDE_HYSTERESIS) return 'left'
  if (rVis > lVis + SIDE_HYSTERESIS) return 'right'
  return state.currentSide
}

// ---- Phase classification ---------------------------------------------------

interface PostureState {
  pArm: number
  pTrunk: number
  pLeg: number
  armPrev: number
  legPrev: number
}

function currentPosture(side: 'left' | 'right'): PostureState {
  const armVals = state.reachHistory
    .filter((s) => s.side === side)
    .slice(-60)
    .map((s) => s.reach)
  const trunkVals = state.foldHistory.slice(-60).map((s) => s.v)
  const legVals = state.legHistory.slice(-60).map((s) => s.v)

  const pArm = armVals.length >= MIN_SAMPLES
    ? normalizeRange(armVals, armVals[armVals.length - 1], MIN_REACH_RANGE)
    : Number.NaN
  const pTrunk = trunkVals.length >= MIN_SAMPLES
    ? normalizeRange(trunkVals, trunkVals[trunkVals.length - 1], MIN_FOLD_RANGE)
    : Number.NaN
  const pLegRaw = legVals.length >= MIN_SAMPLES
    ? normalizeRange(legVals, legVals[legVals.length - 1], MIN_LEG_RANGE)
    : Number.NaN
  // Leg flexion reads "compressed = 0" from raw knee height, so invert it.
  const pLeg = Number.isNaN(pLegRaw) ? Number.NaN : 1 - pLegRaw
  const pLegRawPrev = legVals.length >= MIN_SAMPLES
    ? normalizeRange(legVals, lagValue(legVals, TREND_LAG, legVals[legVals.length - 1]), MIN_LEG_RANGE)
    : Number.NaN
  const legPrev = Number.isNaN(pLegRawPrev) ? Number.NaN : 1 - pLegRawPrev

  return {
    pArm,
    pTrunk,
    pLeg,
    armPrev: armVals.length >= MIN_SAMPLES
      ? normalizeRange(armVals, lagValue(armVals, TREND_LAG, armVals[armVals.length - 1]), MIN_REACH_RANGE)
      : Number.NaN,
    legPrev,
  }
}

/**
 * Professional stroke machine. A phase is decided by the COMBINED posture:
 * only when the arms are extended AND the trunk is folded AND the legs are
 * compressed do we call it a catch (entry). Everything less is drive/pull,
 * broken arm bend = finish (exit), arm re-extension = recovery.
 *
 * KEY: once the arms are fully extended the arm trend is useless to tell the
 * drive from the recovery apart (both hold the arms open), so the LEG trend
 * discriminates: legs extending = drive (pull), legs compressing = recovery
 * approaching the catch. If the legs (or trunk) are not tracked, the machine
 * degrades gracefully to whatever postural channels are available.
 */
function classifyPhase(p: PostureState): StrokePhase {
  if (!Number.isFinite(p.pArm)) return 'none'
  const hasLegs = !Number.isNaN(p.pLeg)
  const hasTrunk = !Number.isNaN(p.pTrunk)
  if (!hasLegs && !hasTrunk) return 'none'

  const catchPose =
    (hasLegs ? p.pLeg >= LEG_COMPRESSED : true) &&
    (hasTrunk ? p.pTrunk >= TRUNK_FOLDED : true)

  if (p.pArm >= ARM_EXTENDED && catchPose) return 'entry'
  if (p.pArm <= ARM_BENT) return 'exit'

  // Arms fully extended but not yet a catch: which direction are the legs
  // going? Extending = pushing (drive), compressing = heading back to catch.
  if (p.pArm >= ARM_EXTENDED) {
    if (hasLegs) {
      const legDelta = p.pLeg - p.legPrev
      if (legDelta >= 0.06) return 'recovery'
      if (legDelta <= -0.06) return 'pull'
    }
    return state.currentPhase === 'pull' ? 'pull' : 'recovery'
  }

  // Arms between finish and extension: follow the arm trend.
  if (p.pArm - p.armPrev >= 0.08) return 'recovery'
  if (p.pArm - p.armPrev <= -0.08) return 'pull'
  return state.currentPhase === 'pull' ? 'pull' : 'recovery'
}

function flagArmsFirst(p: PostureState): void {
  // "Tirare subito di braccia": arms start bending while the legs are still
  // compressed (push comes from the legs first).
  if (p.pArm <= ARM_EXTENDED - 0.2 && p.pArm > ARM_BENT && p.pLeg >= LEG_COMPRESSED) {
    if (!state.pendingErrors.includes('arms-first')) {
      state.pendingErrors.push('arms-first')
    }
  }
}

function flagKneesEarly(p: PostureState): void {
  // "Piegare le ginocchia troppo presto": legs start compressing during the
  // recovery while the hands have not yet passed the knees (arms still bent).
  const legsRising = p.pLeg - p.legPrev >= 0.12
  if (p.pArm < 0.7 && legsRising && state.currentPhase === 'recovery') {
    if (!state.pendingErrors.includes('knees-early')) {
      state.pendingErrors.push('knees-early')
    }
  }
}

// ---- Public API ------------------------------------------------------------

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
  const torsoWidth =
    Math.abs(
      lm[POSE_LANDMARKS.LEFT_SHOULDER].x -
        lm[POSE_LANDMARKS.RIGHT_SHOULDER].x
    ) || 0.001

  const reach = depthReach(lm, side, torsoWidth)
  const fold = trunkFoldValue(lm, torsoWidth)
  const legFlex = legFlexValue(lm)

  // Depth unavailable: hold the machine so a few bad frames don't reset it.
  if (!isFinite(reach) || !isFinite(fold) || !isFinite(legFlex)) return stale

  // EMA smoothing of all three channels.
  const eReach = (state.emaReach[side] || reach) * 0.65 + reach * 0.35
  state.emaReach[side] = eReach
  state.reachHistory.push({ reach: eReach, timestamp: timestampMs, side })

  state.emaFold = state.emaFold === 0 ? fold : state.emaFold * 0.65 + fold * 0.35
  state.foldHistory.push({ v: state.emaFold, timestamp: timestampMs })

  state.emaLeg = state.emaLeg === 0 ? legFlex : state.emaLeg * 0.65 + legFlex * 0.35
  state.legHistory.push({ v: state.emaLeg, timestamp: timestampMs })

  const cutoff = timestampMs - historyDurationMs
  state.reachHistory = state.reachHistory.filter((w) => w.timestamp > cutoff)
  state.foldHistory = state.foldHistory.filter((w) => w.timestamp > cutoff)
  state.legHistory = state.legHistory.filter((w) => w.timestamp > cutoff)

  const p = currentPosture(side)

  // Professional errors, detected live on the sequence of postures.
  flagArmsFirst(p)
  flagKneesEarly(p)

  let newPhase = classifyPhase(p)
  if (newPhase === 'none') {
    // Transient/insufficient signal: keep the machine intact rather than reset.
    if (state.currentPhase === 'none') state.currentSide = side
    return stale
  }

  let newStrokeDetected = false
  let lastStroke: StrokeCycle | undefined

  // One vogata is counted ONLY at the full catch posture: arms extended AND
  // trunk folded AND legs compressed. Arm-only or arm+trunk moves never count.
  if (state.currentPhase === 'recovery' && newPhase === 'entry') {
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
        sequenceErrors: [...state.pendingErrors],
      }
      state.pendingErrors = []
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