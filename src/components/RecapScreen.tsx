import React from 'react'
import {
  Award,
  Crown,
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  Home,
} from 'lucide-react'
import type { SessionData, FeedbackMessage } from '../types'
import SQIGauge from './SQIGauge'

interface Props {
  session: SessionData
  onHome: () => void
  onPlayAnother: () => void
}

const RecapScreen: React.FC<Props> = ({ session, onHome }) => {
  const sqi = session.sqi
  const mmss = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${(s % 60).toString().padStart(2, '0')}`
  }

  const breakdown = [
    { label: 'Postura', value: sqi?.posture ?? 0, color: '#0ea5e9', icon: '🧍' },
    { label: 'Tecnica', value: sqi?.technique ?? 0, color: '#10b981', icon: '🏊' },
    { label: 'Simmetria', value: sqi?.symmetry ?? 0, color: '#a78bfa', icon: '⚖️' },
    { label: 'Fluidità', value: sqi?.fluidity ?? 0, color: '#f59e0b', icon: '💧' },
    { label: 'Costanza', value: sqi?.costanza ?? 0, color: '#f472b6', icon: '🎯' },
  ]

  const positive = session.feedbackMessages.filter(
    (f) => f.type === 'positive'
  ).length

  const fatigueStatus =
    session.fatigueIndex < 30
      ? { label: 'Bassa', color: '#10b981' }
      : session.fatigueIndex < 60
      ? { label: 'Moderata', color: '#f59e0b' }
      : { label: 'Elevata', color: '#ef4444' }

  const strengths = [
    ...(sqi && sqi.symmetry > 80 ? [{ text: 'Ottima simmetria destra/sinistra' }] : []),
    ...(sqi && sqi.posture > 80 ? [{ text: 'Postura stabile e controllata' }] : []),
    ...(session.strokeCount > 0
      ? [{ text: `${session.strokeCount} pagaiate registrate` }]
      : []),
    ...(positive > 3
      ? [{ text: 'Elevata consistenza durante la sessione' }]
      : []),
  ]

  const issues = [
    ...(sqi && sqi.fluidity < 70
      ? [{ text: 'Fluidità del movimento da migliorare' }]
      : []),
    ...(sqi && sqi.technique < 70
      ? [{ text: 'Angolo di ingresso/uscita pala non ottimale' }]
      : []),
    ...(session.fatigueIndex > 40
      ? [{ text: `Tecnica in decadimento verso fine sessione (fatigue ${Math.round(session.fatigueIndex)}%)` }]
      : []),
  ]

  const tips = [
    ...(sqi && sqi.fluidity < 70
      ? [{ text: 'Focalizza sul rilassare il polso durante la recovery: riduce il jerk' }]
      : []),
    ...(sqi && sqi.technique < 70
      ? [{ text: 'Esercizio: pagaiata lenta con focus sull\'ingresso pala a 50°' }]
      : []),
    ...(session.fatigueIndex > 40
      ? [{ text: 'Integra intervalli: 4x500m con focus sulla costanza tecnica' }]
      : []),
    ...(strengths.length > 0
      ? [{ text: 'Mantieni la qualità delle tue aree di forza nei prossimi allenamenti' }]
      : []),
  ]

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-950">
      <div className="max-w-3xl mx-auto p-4 pb-16 space-y-4 animate-fade-in-up">
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className="text-xl font-bold text-white">Sessione Completata</h1>
            <p className="text-sm text-slate-400">
              {new Date(session.startTime).toLocaleString('it-IT')}
            </p>
          </div>
          <button onClick={onHome} className="btn-primary !px-4 !py-2 text-sm">
            <span className="flex items-center gap-1.5"><Home size={16} /> Home</span>
          </button>
        </div>

        <div className="flex items-center justify-around bg-slate-900 rounded-2xl p-4 border border-slate-800">
          <SQIGauge value={sqi?.overall ?? 0} size={140} label="SQI GLOBALE" />
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Clock size={16} className="text-sky-400" />
              Durata: {mmss(session.durationMs)}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Award size={16} className="text-sky-400" />
              Pagaiate: {session.strokeCount}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <TrendingUp size={16} className="text-sky-400" />
              Stroke Rate: {Math.round(session.avgStrokeRate)} spm
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <AlertCircle size={16} className="text-sky-400" />
              Fatigue: <span style={{ color: fatigueStatus.color }} className="font-bold">{fatigueStatus.label}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <Crown size={16} className="text-amber-400" />
            <h2 className="text-sm font-semibold text-white">Dettaglio Componenti SQI</h2>
          </div>
          {breakdown.map((b) => (
            <div key={b.label} className="flex items-center gap-2 py-1.5">
              <span className="text-lg">{b.icon}</span>
              <span className="w-24 text-sm text-slate-300">{b.label}</span>
              <div className="metric-bar flex-1">
                <div
                  className="metric-bar-fill"
                  style={{ width: `${b.value}%`, background: b.color }}
                />
              </div>
              <span className="w-8 text-right text-sm font-bold" style={{ color: b.color }}>
                {Math.round(b.value)}
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-900 rounded-2xl p-4 border border-emerald-900/40">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} className="text-emerald-400" />
              <h3 className="text-sm font-semibold text-emerald-300">Punti di Forza</h3>
            </div>
            {strengths.length === 0 && (
              <p className="text-xs text-slate-500">Rilevazione dati in corso...</p>
            )}
            <ul className="space-y-1.5">
              {strengths.map((s, i) => (
                <li key={i} className="text-sm text-slate-300 flex gap-2">
                  <span className="text-emerald-400">•</span>{s.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-slate-900 rounded-2xl p-4 border border-red-900/40">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={16} className="text-red-400" />
              <h3 className="text-sm font-semibold text-red-300">Criticità</h3>
            </div>
            {issues.length === 0 && (
              <p className="text-xs text-slate-500">Nessuna criticità rilevata</p>
            )}
            <ul className="space-y-1.5">
              {issues.map((s, i) => (
                <li key={i} className="text-sm text-slate-300 flex gap-2">
                  <span className="text-red-400">•</span>{s.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-sky-400" />
            <h3 className="text-sm font-semibold text-white">Suggerimenti per il Miglioramento</h3>
          </div>
          <ol className="space-y-2">
            {tips.map((t, i) => (
              <li key={i} className="text-sm text-slate-300 flex gap-2">
                <span className="text-sky-400 font-bold w-5">[{i + 1}]</span>
                {t.text}
              </li>
            ))}
          </ol>
        </div>

        {session.feedbackMessages.length > 0 && (
          <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800">
            <h3 className="text-sm font-semibold text-white mb-2">
              Feedback Ricevuti ({session.feedbackMessages.length})
            </h3>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {session.feedbackMessages
                .slice(0, 30)
                .map((f: FeedbackMessage, i) => (
                  <div key={i} className="text-xs text-slate-400 flex gap-2">
                    <span className="text-slate-600">{new Date(f.timestamp).toLocaleTimeString('it-IT')}</span>
                    <span>{f.text}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="flex justify-center pt-2">
          <button onClick={onHome} className="btn-primary">
            Torna alla Home
          </button>
        </div>
      </div>
    </div>
  )
}

export default RecapScreen
