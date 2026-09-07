import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { POSE_LANDMARKS } from '../types'
import type { StrokeMetrics } from '../types'

function deg(a: [number, number], b: [number, number], c: [number, number]): number {
  const v1 = [a[0] - b[0], a[1] - b[1]]
  const v2 = [c[0] - b[0], c[1] - b[1]]
  const dot = v1[0] * v2[0] + v1[1] * v2[1]
  const mag1 = Math.sqrt(v1[0] ** 2 + v1[1] ** 2)
  const mag2 = Math.sqrt(v2[0] ** 2 + v2[1] ** 2)
  if (mag1 === 0 || mag2 === 0) return 0
  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)))
  return (Math.acos(cosAngle) * 180) / Math.PI
}

function dist2D(a: [number, number], b: [number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
}

interface BiomechanicsState {
  wristHistoryLeft: { x: number; y: number; t: number }[]
  wristHistoryRight: { x: number; y: number; t: number }[]
  headHistory: { x: number; y: number }[]
  shoulderHistory: { yLeft: number; yRight: number }[]
  trunkHistory: { angle: number }[]
  strokeAmplitudes: number[]
  lastStrokeTimestamp: number
}

const bioState: BiomechanicsState = {
  wristHistoryLeft: [],
  wristHistoryRight: [],
  headHistory: [],
  shoulderHistory: [],
  trunkHistory: [],
  strokeAmplitudes: [],
  lastStrokeTimestamp: 0,
}

export function resetBiomechanics(): void {
  bioState.wristHistoryLeft = []
  bioState.wristHistoryRight = []
  bioState.headHistory = []
  bioState.shoulderHistory = []
  bioState.trunkHistory = []
  bioState.strokeAmplitudes = []
  bioState.lastStrokeTimestamp = 0
}

export function processFrame(
  result: PoseLandmarkerResult,
  timestampMs: number,
  _phase: string,
  _side: 'left' | 'right',
  _cycleDuration: number
): Partial<StrokeMetrics> {
  if (!result.landmarks || result.landmarks.length === 0) return {}
  const lm = result.landmarks[0]

  const nose = lm[POSE_LANDMARKS.NOSE]
  const lShoulder = lm[POSE_LANDMARKS.LEFT_SHOULDER]
  const rShoulder = lm[POSE_LANDMARKS.RIGHT_SHOULDER]
  const lElbow = lm[POSE_LANDMARKS.LEFT_ELBOW]
  const rElbow = lm[POSE_LANDMARKS.RIGHT_ELBOW]
  const lWrist = lm[POSE_LANDMARKS.LEFT_WRIST]
  const rWrist = lm[POSE_LANDMARKS.RIGHT_WRIST]
  const lHip = lm[POSE_LANDMARKS.LEFT_HIP]
  const rHip = lm[POSE_LANDMARKS.RIGHT_HIP]

  bioState.headHistory.push({ x: nose.x, y: nose.y })
  bioState.shoulderHistory.push({
    yLeft: lShoulder.y,
    yRight: rShoulder.y,
  })

  if (bioState.headHistory.length > 300) bioState.headHistory.shift()
  if (bioState.shoulderHistory.length > 300) bioState.shoulderHistory.shift()

  const hipCenterX = (lHip.x + rHip.x) / 2
  const hipCenterY = (lHip.y + rHip.y) / 2

  const trunkAngleDeg = deg(
    [lShoulder.x, lShoulder.y],
    [hipCenterX, hipCenterY],
    [rShoulder.x, rShoulder.y]
  )

  bioState.trunkHistory.push({ angle: trunkAngleDeg })
  if (bioState.trunkHistory.length > 300) bioState.trunkHistory.shift()

  const shoulderAsymmetry = Math.abs(
    (lShoulder.y - rShoulder.y) * 100
  )

  const headStability =
    bioState.headHistory.length > 10
      ? (() => {
          const recent = bioState.headHistory.slice(-30)
          const meanX = recent.reduce((s, h) => s + h.x, 0) / recent.length
          const meanY = recent.reduce((s, h) => s + h.y, 0) / recent.length
          const variance =
            recent.reduce((s, h) => s + (h.x - meanX) ** 2 + (h.y - meanY) ** 2, 0) /
            recent.length
          return Math.sqrt(variance)
        })()
      : 0

  const dominantSide = _side
  const wrist = dominantSide === 'left' ? lWrist : rWrist
  const oppositeWrist = dominantSide === 'left' ? rWrist : lWrist
  const elbow = dominantSide === 'left' ? lElbow : rElbow

  const hist = dominantSide === 'left' ? bioState.wristHistoryLeft : bioState.wristHistoryRight
  hist.push({ x: wrist.x, y: wrist.y, t: timestampMs })
  if (hist.length > 300) hist.shift()

  const recentHist = hist.slice(-60)
  let strokeAmplitude = 0
  if (recentHist.length > 5) {
    const xs = recentHist.map((h) => h.x)
    const ys = recentHist.map((h) => h.y)
    const rangeX = Math.max(...xs) - Math.min(...xs)
    const rangeY = Math.max(...ys) - Math.min(...ys)
    strokeAmplitude = Math.sqrt(rangeX ** 2 + rangeY ** 2) * 100
  }

  const armLength = dist2D(
    [lShoulder.x, lShoulder.y],
    [rShoulder.x, rShoulder.y]
  )
  const shoulderToWrist = dist2D(
    [dominantSide === 'left' ? lShoulder.x : rShoulder.x, dominantSide === 'left' ? lShoulder.y : rShoulder.y],
    [wrist.x, wrist.y]
  )
  const shoulderToElbow = dist2D(
    [dominantSide === 'left' ? lShoulder.x : rShoulder.x, dominantSide === 'left' ? lShoulder.y : rShoulder.y],
    [elbow.x, elbow.y]
  )
  const elbowToWrist = dist2D(
    [elbow.x, elbow.y],
    [wrist.x, wrist.y]
  )
  const armExtension =
    armLength > 0
      ? Math.min(1, shoulderToWrist / (shoulderToElbow + elbowToWrist + 0.001))
      : 0.8

  const catchAngle = deg(
    [wrist.x, wrist.y],
    [lShoulder.x, lShoulder.y],
    [hipCenterX, hipCenterY]
  )

  const exitAngle = deg(
    [oppositeWrist.x, oppositeWrist.y],
    [rShoulder.x, rShoulder.y],
    [hipCenterX, hipCenterY]
  )

  let jerkIndex = 0
  if (recentHist.length > 10) {
    const velocities = recentHist.slice(1).map((h, i) => ({
      vx: h.x - recentHist[i].x,
      vy: h.y - recentHist[i].y,
      dt: (h.t - recentHist[i].t) / 1000,
    }))
    const accels = velocities.slice(1).map((v, i) => ({
      ax: (v.vx - velocities[i].vx) / (v.dt || 0.033),
      ay: (v.vy - velocities[i].vy) / (v.dt || 0.033),
    }))
    if (accels.length > 2) {
      const jerks = accels.slice(1).map((a, i) => {
        const dt = accels[i + 1] ? 0.033 : 0.033
        return Math.sqrt(
          ((a.ax - accels[i].ax) / dt) ** 2 +
          ((a.ay - accels[i].ay) / dt) ** 2
        )
      })
      jerkIndex = jerks.reduce((s, j) => s + j, 0) / jerks.length
    }
  }

  return {
    trunkRotationDeg: trunkAngleDeg,
    trunkLeanDeg: Math.abs((lShoulder.y - rShoulder.y) * 90),
    shoulderAsymmetryDeg: shoulderAsymmetry,
    headStability,
    strokeAmplitude,
    catchAngleDeg: catchAngle,
    exitAngleDeg: exitAngle,
    armExtensionRatio: armExtension,
    jerkIndex,
    pullRatio: 0.6,
  }
}

export function computeFullStrokeMetrics(
  strokeDurationMs: number,
  dominantSide: 'left' | 'right',
  partialMetrics: Partial<StrokeMetrics>[],
  strokeNumber: number,
  startTime: number,
  endTime: number
): StrokeMetrics {
  const avg = <T extends number>(arr: T[]): number =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  const metrics: StrokeMetrics = {
    strokeNumber,
    startTime,
    endTime,
    durationMs: strokeDurationMs,
    dominantSide,
    phase: 'pull',
    trunkRotationDeg: avg(partialMetrics.map((m) => m.trunkRotationDeg ?? 0)),
    trunkLeanDeg: avg(partialMetrics.map((m) => m.trunkLeanDeg ?? 0)),
    shoulderAsymmetryDeg: avg(partialMetrics.map((m) => m.shoulderAsymmetryDeg ?? 0)),
    headStability: avg(partialMetrics.map((m) => m.headStability ?? 0)),
    strokeAmplitude: avg(partialMetrics.map((m) => m.strokeAmplitude ?? 0)),
    catchAngleDeg: avg(partialMetrics.map((m) => m.catchAngleDeg ?? 0)),
    exitAngleDeg: avg(partialMetrics.map((m) => m.exitAngleDeg ?? 0)),
    armExtensionRatio: avg(partialMetrics.map((m) => m.armExtensionRatio ?? 0.8)),
    pullRatio: 0.6,
    jerkIndex: avg(partialMetrics.map((m) => m.jerkIndex ?? 0)),
    phaseDuration: {
      entry: strokeDurationMs * 0.15,
      pull: strokeDurationMs * 0.45,
      exit: strokeDurationMs * 0.15,
      recovery: strokeDurationMs * 0.25,
    },
    sequenceErrors: [],
  }
  return metrics
}
