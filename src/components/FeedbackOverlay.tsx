import React, { useEffect, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Info,
  MessageCircle,
} from 'lucide-react'
import type { FeedbackMessage } from '../types'

interface Props {
  current: FeedbackMessage | null
}

const typeStyles: Record<FeedbackMessage['type'], string> = {
  critical: 'border-red-500/50 bg-red-500/10 text-red-300',
  high: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  medium: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  low: 'border-slate-600/50 bg-slate-500/10 text-slate-300',
  info: 'border-slate-600/50 bg-slate-500/10 text-slate-300',
  positive: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
}

const typeIcons = {
  critical: AlertTriangle,
  high: AlertTriangle,
  medium: MessageCircle,
  low: MessageCircle,
  info: Info,
  positive: CheckCircle2,
}

interface DisplayMsg {
  msg: FeedbackMessage
  id: number
}

const FeedbackOverlay: React.FC<Props> = ({ current }) => {
  const [displayMsgs, setDisplayMsgs] = useState<DisplayMsg[]>([])

  useEffect(() => {
    if (!current) return
    const id = Date.now()
    setDisplayMsgs((prev) => [...prev.slice(-2), { msg: current, id }])
    const timer = setTimeout(() => {
      setDisplayMsgs((prev) => prev.filter((d) => d.id !== id))
    }, 5000)
    return () => clearTimeout(timer)
  }, [current])

  return (
    <div className="w-full space-y-2">
      <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
        <Activity size={14} className="text-sky-400" />
        FEEDBACK AI
      </div>

      {displayMsgs.length === 0 && (
        <div className="text-xs text-slate-500 italic">
          In attesa di dati biomeccanici... Inizia a vogare
        </div>
      )}

      <div className="space-y-2">
        {displayMsgs.map(({ msg, id }) => {
          const Icon = typeIcons[msg.type]
          return (
            <div
              key={id}
              className={`feedback-toast flex items-start gap-2.5 px-3 py-2.5 rounded-lg border ${typeStyles[msg.type]}`}
            >
              <Icon size={16} className="mt-0.5 shrink-0" />
              <div className="text-sm font-medium">{msg.text}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default FeedbackOverlay
