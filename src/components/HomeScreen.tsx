import React, { useState } from 'react'
import {
  Camera,
  PlayCircle,
  Activity,
  ListChecks,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { APP_VERSION, BUILD_DATE, hardReset } from '../version'
import { initSpeech, primeSpeech } from '../engine/feedback'

interface Props {
  onStart: (mode: 'training') => void
}

const HomeScreen: React.FC<Props> = ({ onStart }) => {
  const [selectedGoal, setSelectedGoal] = useState<'tecnica' | 'resistenza' | 'velocita'>('tecnica')
  const [resetting, setResetting] = useState(false)

  const handleReset = async () => {
    if (resetting) return
    setResetting(true)
    await hardReset()
  }

  const goals = [
    {
      id: 'tecnica' as const,
      label: 'Tecnica',
      desc: 'Focus su postura e gesto',
      icon: '🎯',
    },
    {
      id: 'resistenza' as const,
      label: 'Resistenza',
      desc: 'Costanza nel tempo',
      icon: '⏱️',
    },
    {
      id: 'velocita' as const,
      label: 'Velocità',
      desc: 'Ritmo di voga elevato',
      icon: '⚡',
    },
  ]

  return (
    <div className="w-full h-full overflow-y-auto bg-slate-950">
      <div className="max-w-md mx-auto p-4 pb-16 space-y-5 animate-fade-in-up">
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center">
              <Activity size={20} className="text-white" />
            </div>
            <span className="text-lg font-bold text-white">VogaAI</span>
          </div>
          <span className="text-xs text-slate-400">AI Coach</span>
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className="px-2 py-1 rounded-full bg-sky-500/10 border border-sky-500/30 text-[11px] font-mono font-semibold text-sky-300">
            v{APP_VERSION}
          </span>
          <span className="px-2 py-1 rounded-full bg-slate-800/60 border border-slate-700 text-[11px] font-mono text-slate-400">
            build {BUILD_DATE}
          </span>
          <button
            onClick={handleReset}
            disabled={resetting}
            title="Svuota cache e ricarica l'app"
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-slate-800/60 border border-slate-700 text-[11px] font-mono text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <RefreshCw size={11} className={resetting ? 'animate-spin' : ''} />
            Hard Reset
          </button>
        </div>

        <div className="text-center pt-4">
          <h1 className="text-2xl font-bold text-white leading-tight">
            Il tuo Coach<br />
            <span className="text-sky-400">AI personale</span> in acqua
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Analizza la tua vogata in tempo reale con la fotocamera del telefono
          </p>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Camera size={16} className="text-sky-400" />
            <span className="text-sm font-semibold text-white">Come funziona</span>
          </div>
          <ol className="space-y-2 text-sm text-slate-300">
            <li className="flex gap-2"><span className="text-sky-400 font-bold">1.</span>Posiziona il telefono davanti a te, webcam frontale</li>
            <li className="flex gap-2"><span className="text-sky-400 font-bold">2.</span>Inquadra busto, spalle e braccia (e il remo)</li>
            <li className="flex gap-2"><span className="text-sky-400 font-bold">3.</span>Inizia a vogare: l'AI valuta tecnica e fatica</li>
            <li className="flex gap-2"><span className="text-sky-400 font-bold">4.</span>Ricevi feedback vocali in tempo reale</li>
          </ol>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <ListChecks size={16} className="text-sky-400" />
            <span className="text-sm font-semibold text-white">Tipologia allenamento</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {goals.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGoal(g.id)}
                className={`p-3 rounded-xl border text-center transition-all ${
                  selectedGoal === g.id
                    ? 'border-sky-500 bg-sky-500/10'
                    : 'border-slate-700 bg-slate-800'
                }`}
              >
                <div className="text-2xl mb-1">{g.icon}</div>
                <div className={`text-xs font-bold ${
                  selectedGoal === g.id ? 'text-sky-300' : 'text-slate-300'
                }`}>{g.label}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{g.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => {
            initSpeech()
            primeSpeech()
            onStart('training')
          }}
          className="btn-primary w-full !py-4 text-lg flex items-center justify-center gap-2"
        >
          <PlayCircle size={22} />
          Inizia Allenamento
        </button>

        <div className="flex items-center justify-center gap-1 text-xs text-slate-500">
          <ChevronRight size={12} />
          Tutto elaborato ON-DEVICE: nessun video viene caricato online
        </div>

        <div className="bg-slate-900/60 rounded-xl border border-slate-800 p-3">
          <div className="text-xs text-slate-400 mb-2 font-medium">Metriche misurate in tempo reale</div>
          <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-300">
            <div>📐 Angolo di attacco della pala</div>
            <div>🔄 Rotazione del tronco</div>
            <div>⚖️ Simmetria dx/sx</div>
            <div>💧 Fluidità del gesto</div>
            <div>🎯 Stroke Quality Index (SQI)</div>
            <div>🥵 Indice di fatica</div>
            <div>🔢 Ritmo di voga (colpi/min)</div>
            <div>📏 Ampiezza della remata</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomeScreen
