import React, { useRef, useEffect } from 'react'
import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { SKELETON_CONNECTIONS, POSE_LANDMARKS } from '../types'
import type { StrokePhase } from '../types'

interface Props {
  result: PoseLandmarkerResult | null
  phase: StrokePhase
  width: number
  height: number
}

const PHASE_COLORS: Record<StrokePhase, string> = {
  entry: '#10b981',
  pull: '#0ea5e9',
  exit: '#f59e0b',
  recovery: '#8b5cf6',
  none: '#64748b',
}

const KEYPOINT_INDICES = [
  POSE_LANDMARKS.LEFT_SHOULDER,
  POSE_LANDMARKS.RIGHT_SHOULDER,
  POSE_LANDMARKS.LEFT_ELBOW,
  POSE_LANDMARKS.RIGHT_ELBOW,
  POSE_LANDMARKS.LEFT_WRIST,
  POSE_LANDMARKS.RIGHT_WRIST,
  POSE_LANDMARKS.NOSE,
]

const SkeletonRenderer: React.FC<Props> = ({ result, phase, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)

    if (!result || !result.landmarks || result.landmarks.length === 0) return
    const lm = result.landmarks[0]
    const color = PHASE_COLORS[phase] || '#64748b'

    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.shadowColor = color
    ctx.shadowBlur = 6

    for (const [startIdx, endIdx] of SKELETON_CONNECTIONS) {
      const start = lm[startIdx]
      const end = lm[endIdx]
      if (!start || !end) continue
      if ((start.visibility ?? 0) < 0.3 || (end.visibility ?? 0) < 0.3) continue
      ctx.beginPath()
      ctx.moveTo(start.x * width, start.y * height)
      ctx.lineTo(end.x * width, end.y * height)
      ctx.stroke()
    }

    ctx.shadowBlur = 0

    for (const idx of KEYPOINT_INDICES) {
      const kp = lm[idx]
      if (!kp || (kp.visibility ?? 0) < 0.3) continue
      const x = kp.x * width
      const y = kp.y * height
      const isWrist =
        idx === POSE_LANDMARKS.LEFT_WRIST || idx === POSE_LANDMARKS.RIGHT_WRIST
      const radius = isWrist ? 7 : 5

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = isWrist ? color : '#f8fafc'
      ctx.fill()

      if (isWrist) {
        ctx.beginPath()
        ctx.arc(x, y, radius + 3, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }, [result, phase, width, height])

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="absolute inset-0 pointer-events-none"
    />
  )
}

export default SkeletonRenderer
