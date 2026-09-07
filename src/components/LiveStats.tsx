import React from 'react'
import { Gauge, Waves } from 'lucide-react'

interface Props {
  label: string
  value: number
  color: string
}

const MetricBar: React.FC<Props> = ({ label, value, color }) => {
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-300 font-medium">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>
          {Math.round(value)}
        </span>
      </div>
      <div className="metric-bar">
        <div
          className="metric-bar-fill"
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            background: color,
          }}
        />
      </div>
    </div>
  )
}

interface StatsPanelProps {
  strokeRate: number
  strokeCount: number
  posture: number
  technique: number
  symmetry: number
  fluidity: number
  costanza: number
  fatigue: number
  amplitude: number
  duration: number
  phase: string
}

const LiveStatsPanel: React.FC<StatsPanelProps> = ({
  strokeRate,
  strokeCount,
  posture,
  technique,
  symmetry,
  fluidity,
  costanza,
  fatigue,
  amplitude,
  duration,
  phase,
}) => {
  const mmss = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${(s % 60).toString().padStart(2, '0')}`
  }

  return (
    <div className="w-full bg-slate-800/90 backdrop-blur rounded-xl p-3 border border-slate-700 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Waves size={14} className="text-sky-400" />
          <span>FASE:</span>
          <span className="font-bold uppercase text-sky-300">{phase}</span>
        </div>
        <div className="text-xs text-slate-400 font-mono">{mmss(duration)}</div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] text-slate-400">STROKE RATE</div>
          <div className="text-xl font-bold text-sky-300">
            {Math.round(strokeRate)}
            <span className="text-xs text-slate-500"> spm</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400">STROKES</div>
          <div className="text-xl font-bold text-slate-100">{strokeCount}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-400">AMPIEZZA</div>
          <div className="text-xl font-bold text-emerald-400">
            {Math.round(amplitude)}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-700 pt-2 space-y-2">
        <MetricBar label="Postura" value={posture} color="#0ea5e9" />
        <MetricBar label="Tecnica" value={technique} color="#10b981" />
        <MetricBar label="Simmetria" value={symmetry} color="#a78bfa" />
        <MetricBar label="Fluidità" value={fluidity} color="#f59e0b" />
        <MetricBar label="Costanza" value={costanza} color="#f472b6" />
      </div>

      <div className="border-t border-slate-700 pt-2">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <Gauge size={14} className="text-slate-400" />
            Fatigue
          </div>
          <span
            className={`text-xs font-bold ${
              fatigue < 30
                ? 'text-emerald-400'
                : fatigue < 60
                ? 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {Math.round(fatigue)}%
          </span>
        </div>
        <div className="metric-bar">
          <div
            className="metric-bar-fill"
            style={{
              width: `${Math.min(100, fatigue)}%`,
              background:
                fatigue < 30 ? '#10b981' : fatigue < 60 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default LiveStatsPanel
