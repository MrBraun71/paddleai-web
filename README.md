# VogaAI Web — AI Coach Canottaggio (voga con i remi)

Web app che usa la **webcam frontale** del telefono o tablet per valutare automaticamente
la tecnica di vogata dell'atleta in tempo reale, generando un **Stroke Quality Index (SQI)**
e feedback vocali.

**Tutto elaborato ON-DEVICE** nel browser: nessun video viene caricato online (privacy by design).

---

## ✨ Funzionalità

- 🎥 Acquisizione video real-time dalla webcam (fotocamera frontale)
- 🤖 **Pose estimation** on-device con MediaPipe (33 keypoints, scheletro sovrapposto al video)
- 🔄 **Stroke Cycle Detection**: segmentazione automatica entry → pull → exit → recovery
- 📐 **Analisi biomeccanica** real-time: rotazione tronco, inclinazione, simmetria, ampiezza,
  angolo di attacco/finale della pala, fluidità (jerk), stabilità testa
- 🎯 **Stroke Quality Index (SQI)**: indice proprietario 0-100 a 5 componenti
  (Postura 20%, Tecnica 25%, Simmetria 20%, Fluidità 15%, Costanza 20%)
- 🔊 **Feedback vocali** in italiano (Web Speech API): "Riduci l'oscillazione del busto",
  "Buona rotazione", "Stai perdendo ampiezza", "Asimmetria rilevata" ...
- 🥵 **Indice di fatica**: rileva il decadimento tecnico durante la sessione
- 📊 **Riepilogo post-sessione**: SQI dettagliato, punti di forza, criticità, suggerimenti

---

## 🧱 Stack

- **Vite + React + TypeScript**
- **Tailwind CSS** (v4)
- **@mediapipe/tasks-vision** — pose estimation (modello `pose_landmarker_heavy`, GPU)
- **Web Speech API** — sintesi vocale in italiano
- **lucide-react** — icone

---

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

---

## 🧪 Come Testare in Locale

### Prerequisiti

- **Node.js 18+** ([download](https://nodejs.org/))
- Un dispositivo con **webcam** (il movimento del polso viene rilevato dalla fotocamera)
- **HTTPS o `localhost`** — obbligatorio per l'accesso alla webcam (`getUserMedia`)

### Procedura passo-passo

```bash
# 1. Entra nella cartella del progetto
cd C:\Users\ldetr\Documents\Canoa\paddleai-web

# 2. Installa le dipendenze (solo la prima volta)
npm install

# 3. Avvia il server di sviluppo
npm run dev
```

Dopo il comando `npm run dev`, l'app è disponibile all'indirizzo:

```
http://localhost:5173
```

### Cosa aspettarsi

1. **Primo accesso** — Il browser chiede il permesso di usare la webcam: clicca **"Consenti"**.
2. **Caricamento modello AI (~20MB)** — Al primo accesso il modello MediaPipe viene scaricato
   dal CDN. Serve una connessione attiva. La seconda volta è in cache locale e parte subito.
3. **Schermata Home** — Scegli la tipologia di allenamento (Tecnica / Resistenza / Velocità)
   e premi **"Inizia Allenamento"**.
4. **Schermata real-time** — Appare il feed della webcam con:
   - **Scheletro sovrapposto** (linee e punti colorati) che segue il movimento
   - **SQI live** (gauge circolare)
   - **Statistiche** in tempo reale (stroke rate, postura, tecnica, simmetria, fatica)
   - **Feedback vocali** e messaggi visivi quando rileva anomalie
5. **Stop sessione** — Premi **"Stop"** per visualizzare il **riepilogo post-sessione** con
   SQI dettagliato, punti di forza, criticità e suggerimenti.

### Come simulare la vogata senza essere in acqua

Posizionati davanti alla webcam e fai movimenti simulati di vogata:
- Muovi le **braccia avanti e indietro** come se impugnassi un remo
- **Spingi con le gambe** e ruota il **busto** mantenendo i piedi fermi
- Il sistema riconosce il ciclo di remata (attacco → trazione → finale → recupero)
- Dopo qualche vogata inizierai a vedere il **SQI** e i **feedback**

> 💡 **Suggerimento per il test**: usa un remo reale o un bastone lungo per rendere
> il movimento più realistico e migliorare il riconoscimento.

### Comandi utili

| Comando | Scopo |
|---|---|
| `npm run dev` | Server di sviluppo con hot-reload |
| `npm run build` | Build di produzione (in `dist/`) |
| `npm run preview` | Anteprima locale della build di produzione |
| `npm run lint` | Controllo linting |

### Risoluzione problemi in locale

| Problema | Soluzione |
|---|---|
| Webcam non accessibile | Usa `localhost` (non `127.0.0.1`), controlla i permessi browser, assicurati che la webcam non sia usata da un'altra app |
| "Errore modello AI" | Verifica la connessione internet (il modello viene dal CDN MediaPipe) |
| App lenta | Chiudi altre schede/app; la GPU viene usata per l'inferenza |
| Feedback vocali non funzionano | Su alcuni browser la `speechSynthesis` richiede un'interazione prima (es. un click); verifica il volume |

---

## 🚀 Pubblicazione su GitHub

La web app è già configurata con un workflow **GitHub Actions** che pubblica automaticamente
il sito su **GitHub Pages**.

### 1. Crea un repository vuoto su GitHub

- Vai su [github.com/new](https://github.com/new)
- **Repository name**: `paddleai-web` (o il nome che preferisci)
- **Lascia vuoto** (NON spuntare "Add a README" — lo abbiamo già)
- Scegli **Public** o **Private** a tua scelta

### 2. Collega il repository e fai il push

Apri un terminale nella cartella del progetto ed esegui:

```bash
git remote add origin https://github.com/TUO-USERNAME/paddleai-web.git
git branch -M main
git push -u origin main
```

*(sostituisci `TUO-USERNAME` con il tuo username GitHub)*

> 🔑 Se la prima volta ti chiede le credenziali e non compare la finestra di login GitHub,
> puoi usare un **Personal Access Token** al posto della password.

### 3. Attiva GitHub Pages

1. Vai nel repo su GitHub → **Settings → Pages**
2. In **Source**, seleziona **"GitHub Actions"**
3. Il workflow `.github/workflows/deploy.yml` builda e pubblica automaticamente ad ogni push su `main`
4. L'app sarà disponibile su:
   ```
   https://TUO-USERNAME.github.io/paddleai-web/
   ```

### 4. Verificare il deploy

- Vai in **Actions** nel repo GitHub: vedrai il workflow "Deploy PaddleAI Web to GitHub Pages"
- Una volta `✅ green` (build + deploy), il sito è online
- **Nota sui tempi**: il primo deploy può richiedere 1-2 minuti

### Aggiornare l'app dopo modifiche

```bash
git add -A
git commit -m "Descrizione della modifica"
git push
```

`push` su `main` → il workflow ricostruisce e ripubblica automaticamente.

---

## ⚠️ Nota importante (webcam in produzione)

`getUserMedia` (accesso webcam) **richiede HTTPS** su dispositivi reali e su rete non-locale.

- **Locale**: `http://localhost` funziona (localhost è considerato sicuro)
- **Produzione**: **GitHub Pages fornisce già HTTPS** → nessun problema su mobile
- **Altro hosting**: usa sempre HTTPS (es. Vercel, Netlify, Cloudflare Pages)

---

## 📄 Licenza

MIT

---

*Progetto demo del concept VogaAI — AI Coach personale per il canottaggio (voga con i remi).*
