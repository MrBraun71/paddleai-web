# PaddleAI Web — AI Coach per Canoa & Kayak

Web app che usa la **webcam frontale** del telefono o tablet per valutare automaticamente
la tecnica di pagaiata dell'atleta in tempo reale, generando un **Stroke Quality Index (SQI)**
e feedback vocali.

**Tutto elaborato ON-DEVICE** nel browser: nessun video viene caricato online (privacy by design).

## ✨ Funzionalità

- 🎥 Acquisizione video real-time dalla webcam (fotocamera frontale)
- 🤖 **Pose estimation** on-device con MediaPipe (33 keypoints, scheletro sovrapposto al video)
- 🔄 **Stroke Cycle Detection**: segmentazione automatica entry → pull → exit → recovery
- 📐 **Analisi biomeccanica** real-time: rotazione tronco, inclinazione, simmetria, ampiezza,
  angolo di ingresso/uscita pala, fluidità (jerk), stabilità testa
- 🎯 **Stroke Quality Index (SQI)**: indice proprietario 0-100 a 5 componenti
  (Postura 20%, Tecnica 25%, Simmetria 20%, Fluidità 15%, Costanza 20%)
- 🔊 **Feedback vocali** in italiano (Web Speech API): "Riduci l'oscillazione del busto",
  "Buona rotazione", "Stai perdendo ampiezza", "Asimmetria rilevata" ...
- 🥵 **Indice di fatica**: rileva il decadimento tecnico durante la sessione
- 📊 **Riepilogo post-sessione**: SQI dettagliato, punti di forza, criticità, suggerimenti

## 🚀 Avvio Locale

```bash
npm install
npm run dev
```

Apri `http://localhost:5173` e **consenti l'accesso alla fotocamera**.

> ⚠️ La webcam funziona via `getUserMedia` che richiede HTTPS o `localhost`.
> Su un telefono, apri l'app da un URL HTTPS (es. GitHub Pages).

## 🧱 Stack

- **Vite + React + TypeScript**
- **Tailwind CSS** (v4)
- **@mediapipe/tasks-vision** — pose estimation (modello `pose_landmarker_heavy`, GPU)
- **Web Speech API** — sintesi vocale in italiano
- **lucide-react** — icone

## 🗂️ Struttura

```
src/
├── types/             # Modelli dati (Skeleton, Stroke, SQI, Session)
├── engine/            # Logica AI (eseguita nel browser)
│   ├── poseDetection.ts   # Loader/inferenza MediaPipe
│   ├── strokeDetector.ts  # Rilevamento fasi del ciclo di pagaiata
│   ├── biomechanics.ts    # Calcolo metriche biomeccaniche
│   ├── sqi.ts             # Stroke Quality Index + Fatigue Index
│   └── feedback.ts        # Motore feedback vocali + regole
└── components/        # UI
    ├── HomeScreen.tsx      # Landing + setup
    ├── TrainingScreen.tsx  # Schermata real-time (webcam + skeleton + stats)
    ├── RecapScreen.tsx     # Riepilogo post-sessione
    ├── SkeletonRenderer.tsx# Overlay scheletro sul video (Canvas)
    ├── SQIGauge.tsx        # Gauge circolare SQI
    ├── LiveStats.tsx       # Statistiche live
    └── FeedbackOverlay.tsx # Toast feedback
```

## 🚀 Deploy su GitHub Pages

1. Pusha il repo su GitHub (branch `main`)
2. Il workflow `.github/workflows/deploy.yml` builda e pubblica automaticamente
3. Vai in **Settings → Pages** e imposta la sorgente su "GitHub Actions"

## 📄 Licenza

MIT

---

*Progetto demo del concept PaddleAI — AI Coach personale per canoe e kayak agonistico.*
