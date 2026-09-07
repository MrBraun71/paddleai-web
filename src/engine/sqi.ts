import type { StrokeMetrics, SQIBreakdown } from '../types'

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 50
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function postureScore(metrics: StrokeMetrics): number {
  const lean = normalize(metrics.trunkLeanDeg, 0, 20)
  const head = normalize(metrics.headStability, 0, 0.1)
  const asym = normalize(metrics.shoulderAsymmetryDeg, 0, 10)
  return clamp(lean * 0.35 + (100 - head) * 0.25 + (100 - asym) * 0.4, 0, 100)
}

function techniqueScore(metrics: StrokeMetrics): number {
  const catchAngle = metrics.catchAngleDeg > 30 && metrics.catchAngleDeg < 70 ? 100 : normalize(metrics.catchAngleDeg, 30, 70)
  const amplitude = normalize(metrics.strokeAmplitude, 20, 60)
  const extension = normalize(metrics.armExtensionRatio, 0.7, 0.95)
  const exit = metrics.exitAngleDeg > 45 && metrics.exitAngleDeg < 85 ? 100 : normalize(metrics.exitAngleDeg, 45, 85)
  return clamp(catchAngle * 0.30 + amplitude * 0.30 + extension * 0.20 + exit * 0.20, 0, 100)
}

function symmetryScore(metrics: StrokeMetrics): number {
  return clamp(100 - normalize(metrics.shoulderAsymmetryDeg, 0, 10) * 1.0, 0, 100)
}

function fluidityScore(metrics: StrokeMetrics): number {
  const jerk = normalize(metrics.jerkIndex, 0, 2)
  return clamp(100 - jerk * 0.8, 0, 100)
}

function costanzaScore(recentMetrics: StrokeMetrics[]): number {
  if (recentMetrics.length < 2) return 70
  const amplitudes = recentMetrics.map((m) => m.strokeAmplitude)
  const mean = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length
  const variance = amplitudes.reduce((s, v) => s + (v - mean) ** 2, 0) / amplitudes.length
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 1
  return clamp(100 - cv * 150, 0, 100)
}

export function calculateSQI(
  currentMetrics: StrokeMetrics,
  recentMetrics: StrokeMetrics[]
): SQIBreakdown {
  const posture = postureScore(currentMetrics)
  const technique = techniqueScore(currentMetrics)
  const sym = symmetryScore(currentMetrics)
  const fluidity = fluidityScore(currentMetrics)
  const costanza = costanzaScore(recentMetrics)

  const overall =
    posture * 0.20 +
    technique * 0.25 +
    sym * 0.20 +
    fluidity * 0.15 +
    costanza * 0.20

  return {
    posture: Math.round(posture * 10) / 10,
    technique: Math.round(technique * 10) / 10,
    symmetry: Math.round(sym * 10) / 10,
    fluidity: Math.round(fluidity * 10) / 10,
    costanza: Math.round(costanza * 10) / 10,
    overall: Math.round(overall * 10) / 10,
  }
}

export function calculateFatigueIndex(
  sessionMetrics: StrokeMetrics[],
  _currentSqi: SQIBreakdown
): number {
  if (sessionMetrics.length < 10) return 0
  const baseline = sessionMetrics.slice(0, 10)
  const current = sessionMetrics.slice(-10)

  const baselineSqi =
    baseline.reduce((s, m) => s + postureScore(m) + techniqueScore(m), 0) /
    baseline.length / 2
  const currentAvg =
    current.reduce((s, m) => s + postureScore(m) + techniqueScore(m), 0) /
    current.length / 2

  if (baselineSqi === 0) return 0
  const decay = (baselineSqi - currentAvg) / baselineSqi
  return clamp(decay * 100, 0, 100)
}
