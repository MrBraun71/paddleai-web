import {
  PoseLandmarker,
  FilesetResolver,
  PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'

export type PoseCallback = (result: PoseLandmarkerResult) => void

let poseLandmarker: PoseLandmarker | null = null
let isInitializing = false

export async function initPoseLandmarker(
  onReady?: () => void
): Promise<PoseLandmarker> {
  if (poseLandmarker) return poseLandmarker
  if (isInitializing) {
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (poseLandmarker) {
          clearInterval(check)
          resolve()
        }
      }, 100)
    })
    return poseLandmarker!
  }

  isInitializing = true

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
  )

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
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

  isInitializing = false
  onReady?.()
  return poseLandmarker
}

export function detectPose(
  video: HTMLVideoElement,
  timestamp: number
): PoseLandmarkerResult | null {
  if (!poseLandmarker) return null
  try {
    return poseLandmarker.detectForVideo(video, timestamp)
  } catch {
    return null
  }
}

export function isPoseReady(): boolean {
  return poseLandmarker !== null
}
