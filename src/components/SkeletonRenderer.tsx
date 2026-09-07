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
  POSE_LANDMARKS.LEFT_HIP,
  POSE_LANDMARKS.RIGHT_HIP,
  POSE_LANDMARKS.LEFT_KNEE,
  POSE_LANDMARKS.RIGHT_KNEE,
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

    // --- Dynamic Symmetry Grid ---
    // Median axis (sternum/nose line) + lateral shoulder->hip axes, so a
    // left/right rocking during the power stroke is visible.
    const lSh = person[POSE_LANDMARKS.LEFT_SHOULDER]
    const rSh = person[POSE_LANDMARKS.RIGHT_SHOULDER]
    if (lSh && rSh && (lSh.visibility ?? 0) > 0.3 && (rSh.visibility ?? 0) > 0.3) {
      const midX = ((lSh.x + rSh.x) / 2) * width
      ctx.save()
      ctx.setLineDash([6, 6])
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(midX, 0)
      ctx.lineTo(midX, height)
      ctx.stroke()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      for (const side of ['left', 'right'] as const) {
        const sh = side === 'left' ? lSh : rSh
        const hip =
          person[
            side === 'left'
              ? POSE_LANDMARKS.LEFT_HIP
              : POSE_LANDMARKS.RIGHT_HIP
          ]
        if (!hip || (hip.visibility ?? 0) < 0.3) continue
        ctx.beginPath()
        ctx.moveTo(sh.x * width, sh.y * height)
        ctx.lineTo(hip.x * width, hip.y * height)
        ctx.stroke()
      }
      ctx.restore()
    }

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

    // --- Knee Flaring: thigh line + patella marker + lateral offset needle.
    // The color shows how far each knee opens outward from its hip (green =
    // aligned, amber = warning, red = flaring) relative to shoulder width.
    const torsoW = Math.abs(lSh.x - rSh.x) || 0.001
    const KNEE_PAIRS = [
      [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE],
      [POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE],
    ] as const
    for (const [hipIdx, kneeIdx] of KNEE_PAIRS) {
      const h = person[hipIdx]
      const k = person[kneeIdx]
      if (!h || !k) continue
      if ((h.visibility ?? 0) < 0.3 || (k.visibility ?? 0) < 0.3) continue
      const flare = torsoW > 0.001 ? (Math.abs(k.x - h.x) / torsoW) * 100 : 0
      const col = flare > 28 ? '#ef4444' : flare > 18 ? '#f59e0b' : '#34d399'

      ctx.beginPath()
      ctx.moveTo(h.x * width, h.y * height)
      ctx.lineTo(k.x * width, k.y * height)
      ctx.strokeStyle = col
      ctx.lineWidth = 3
      ctx.stroke()

      ctx.beginPath()
      ctx.arc(k.x * width, k.y * height, 9, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(2, 6, 23, 0.75)'
      ctx.fill()
      ctx.beginPath()
      ctx.arc(k.x * width, k.y * height, 6, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()

      ctx.setLineDash([3, 3])
      ctx.strokeStyle = col
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(h.x * width, k.y * height)
      ctx.lineTo(k.x * width, k.y * height)
      ctx.stroke()
      ctx.setLineDash([])
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
