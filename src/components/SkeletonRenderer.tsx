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

// Wrist-trail buffer (normalized coords). Used to visualize the actual wrist
// trajectory so we can verify/diagnose stroke detection. Reset per mount.
interface TrailPoint {
  x: number
  y: number
}

const TRAIL_LENGTH = 36
const TRAIL_COLORS = {
  left: '#4ade80',
  right: '#fb7185',
}

const SkeletonRenderer: React.FC<Props> = ({ result, phase, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const trailRef = useRef<{ left: TrailPoint[]; right: TrailPoint[] }>({
    left: [],
    right: [],
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)

    // Accumulate the current wrist positions into the trail buffer.
    const lm = result?.landmarks?.[0]
    if (lm) {
      for (const side of ['left', 'right'] as const) {
        const idx =
          side === 'left'
            ? POSE_LANDMARKS.LEFT_WRIST
            : POSE_LANDMARKS.RIGHT_WRIST
        const kp = lm[idx]
        if (kp && (kp.visibility ?? 0) >= 0.3) {
          const trail = trailRef.current[side]
          trail.push({ x: kp.x, y: kp.y })
          if (trail.length > TRAIL_LENGTH) trail.shift()
        }
      }
    }

    // Always drawn (even when the skeleton is gone) so the recent trajectory
    // stays visible; the tail fades out quickly so the screen doesn't fill up.
    const drawTrail = (pts: TrailPoint[], color: string) => {
      if (pts.length < 2) return
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 3
      for (let i = 1; i < pts.length; i++) {
        const a = Math.pow(i / pts.length, 1.6)
        ctx.globalAlpha = 0.05 + a * 0.9
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.moveTo(pts[i - 1].x * width, pts[i - 1].y * height)
        ctx.lineTo(pts[i].x * width, pts[i].y * height)
        ctx.stroke()
      }
      ctx.restore()
    }

    drawTrail(trailRef.current.left, TRAIL_COLORS.left)
    drawTrail(trailRef.current.right, TRAIL_COLORS.right)

    if (!result || !result.landmarks || result.landmarks.length === 0) return
    const person = result.landmarks[0]
    const color = PHASE_COLORS[phase] || '#64748b'

    ctx.strokeStyle = color
    ctx.lineWidth = 4
    ctx.shadowColor = color
    ctx.shadowBlur = 6

    for (const [startIdx, endIdx] of SKELETON_CONNECTIONS) {
      const start = person[startIdx]
      const end = person[endIdx]
      if (!start || !end) continue
      if ((start.visibility ?? 0) < 0.3 || (end.visibility ?? 0) < 0.3) continue
      ctx.beginPath()
      ctx.moveTo(start.x * width, start.y * height)
      ctx.lineTo(end.x * width, end.y * height)
      ctx.stroke()
    }

    ctx.shadowBlur = 0

    for (const idx of KEYPOINT_INDICES) {
      const kp = person[idx]
      if (!kp || (kp.visibility ?? 0) < 0.3) continue
      const x = kp.x * width
      const y = kp.y * height
      const isWrist =
        idx === POSE_LANDMARKS.LEFT_WRIST || idx === POSE_LANDMARKS.RIGHT_WRIST
      const radius = isWrist ? 12 : 8

      // Dark halo behind each point so it stands out on any background.
      ctx.beginPath()
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(2, 6, 23, 0.75)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = isWrist ? color : '#ffffff'
      ctx.fill()

      if (isWrist) {
        ctx.beginPath()
        ctx.arc(x, y, radius + 6, 0, Math.PI * 2)
        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.stroke()
      }
    }
  }, [result, phase, width, height])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%' }}
      className="absolute inset-0 pointer-events-none -scale-x-100"
    />
  )
}

export default SkeletonRenderer
