import React from 'react'

interface Props {
  value: number
  size?: number
  label?: string
}

const SQIGauge: React.FC<Props> = ({ value, size = 120, label = 'SQI' }) => {
  const radius = (size - 16) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.max(0, Math.min(100, value))
  const offset = circumference - (progress / 100) * circumference

  const getColor = (v: number) => {
    if (v >= 85) return '#10b981'
    if (v >= 70) return '#0ea5e9'
    if (v >= 50) return '#f59e0b'
    return '#ef4444'
  }

  const color = getColor(progress)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#334155"
            strokeWidth={8}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={8}
            className="sqi-ring"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>
            {Math.round(progress)}
          </span>
          <span className="text-[10px] text-slate-400">/100</span>
        </div>
      </div>
      <span className="text-xs text-slate-400 font-medium">{label}</span>
    </div>
  )
}

export default SQIGauge
