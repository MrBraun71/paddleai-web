export interface Point2D {
  x: number
  y: number
  z?: number
  visibility?: number
}

export type PoseKeypoints = Point2D[]

export interface SkeletonFrame {
  keypoints: PoseKeypoints
  timestamp: number
  confidence: number
}

export type StrokePhase = 'entry' | 'pull' | 'exit' | 'recovery' | 'none'

export interface StrokeCycle {
  id: number
  startTime: number
  endTime: number
  phase: StrokePhase
  durationMs: number
  dominantSide: 'left' | 'right'
  sequenceErrors?: string[]
}

export interface StrokeMetrics {
  strokeNumber: number
  startTime: number
  endTime: number
  durationMs: number
  dominantSide: 'left' | 'right'
  phase: StrokePhase
  trunkRotationDeg: number
  trunkLeanDeg: number
  shoulderAsymmetryDeg: number
  headStability: number
  strokeAmplitude: number
  catchAngleDeg: number
  exitAngleDeg: number
  armExtensionRatio: number
  pullRatio: number
  jerkIndex: number
  phaseDuration: { entry: number; pull: number; exit: number; recovery: number }
  sequenceErrors: string[]
  lateralOscillation: number
  kneeFlareIndex: number
  handleWaviness: number
}

export interface SQIBreakdown {
  posture: number
  technique: number
  symmetry: number
  fluidity: number
  costanza: number
  overall: number
}

export interface FeedbackMessage {
  id: string
  text: string
  textEn: string
  type: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'positive'
  category: string
  timestamp: number
}

export interface SessionData {
  id: string
  startTime: number
  endTime?: number
  durationMs: number
  strokes: StrokeMetrics[]
  sqi: SQIBreakdown | null
  avgStrokeRate: number
  strokeCount: number
  feedbackMessages: FeedbackMessage[]
  fatigueIndex: number
  fatigueSegments: { index: number; fatigue: number; timestamp: number }[]
}

export interface LiveStats {
  sqi: number
  strokeRate: number
  strokeCount: number
  posture: number
  technique: number
  symmetry: number
  fluidity: number
  costanza: number
  fatigue: number
  duration: number
  amplitude: number
}

// MediaPipe Pose landmarks
// 0: nose, 11: left_shoulder, 12: right_shoulder,
// 13: left_elbow, 14: right_elbow, 15: left_wrist, 16: right_wrist
export const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
} as const

export const SKELETON_CONNECTIONS: [number, number][] = [
  [11, 12], // shoulders
  [11, 13], [13, 15], // left arm
  [12, 14], [14, 16], // right arm
  [11, 23], [12, 24], // torso
  [23, 24], // hips
  [0, 11], [0, 12], // neck
]
