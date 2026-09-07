# 🚀 Aggiornamento dell'App PaddleAI

Questa guida spiega come **modificare, testare e pubblicare** nuove versioni dell'app su GitHub Pages.

A ogni modifica, il sito online si aggiorna **automaticamente** tramite GitHub Actions. Non serve eseguire nulla manualmente in produzione.

---

## 📌 Flusso rapido (versione breve)

```bash
cd C:\Users\ldetr\Documents\Canoa\paddleai-web

git add -A
git commit -m "Descrizione della modifica"
git push
```

E in 1-2 minuti il sito è aggiornato su:

```
https://mrbraun71.github.io/paddleai-web/
```

---

## 🧪 Flusso completo consigliato (test prima di pubblicare)

### 1. Testa in locale

```bash
cd C:\Users\ldetr\Documents\Canoa\paddleai-web
npm install          # solo se hai aggiunto nuove dipendenze
npm run dev
```

Apri `http://localhost:5173` e verifica le modifiche con la webcam.

### 2. Verifica che compili correttamente

```bash
npm run build
```

Deve terminare senza errori (output con `✓ built in ...`).

### 3. Committa le modifiche

```bash
git add -A
git commit -m "Descrizione chiara della modifica"
```

### 4. Pubblica su GitHub Pages

```bash
git push
```

### 5. Controlla il deploy

```bash
gh run watch --repo MrBraun71/paddleai-web
```

Attendi che entrambi i job (`build` e `deploy`) risultino `✓`.

### 6. Verifica che il sito sia online

```bash
curl -s -o /dev/null -w "%{http_code}" https://mrbraun71.github.io/paddleai-web/
```

Se risponde `200`, il sito è aggiornato e funzionante.

---

## 🧰 Comandi utili (cheatsheet)

| Situazione | Comando |
|---|---|
| Avvio server di sviluppo | `npm run dev` |
| Build di produzione | `npm run build` |
| Anteprima locale della build | `npm run preview` |
| Check lint | `npm run lint` |
| Vedi stato modifiche | `git status` |
| Vedi modifiche in dettaglio | `git diff` |
| Commit con messaggio | `git commit -m "testo"` |
| Push su GitHub | `git push` |
| Stato ultimi deploy | `gh run list --repo MrBraun71/paddleai-web` |
| Guardare un deploy in corso | `gh run watch --repo MrBraun71/paddleai-web` |
| Aprire il sito | `start https://mrbraun71.github.io/paddleai-web/` |

---

## ⚠️ Errori comuni e soluzioni

| Errore | Causa | Soluzione |
|---|---|---|
| `npm error ... package.json` su `C:\Users\ldetr\Documents\Canoa` | Comando eseguito nella cartella sbagliata | Esegui i comandi dentro `paddleai-web` (con `cd C:\Users\ldetr\Documents\Canoa\paddleai-web`) |
| `gh` non trovato | Shell senza PATH aggiornato | Apri una **nuova** finestra di terminale, o usa `$env:PATH = "C:\Program Files\GitHub CLI;" + $env:PATH` |
| Build fallisce con errori TS | Ci sono errori di tipo TypeScript | Leggi l'errore, correggi il codice, riprova `npm run build` |
| Il sito non si aggiorna dopo il push | Deploy ancora in corso o fallito | `gh run watch` e controlla lo stato del workflow |
| Webcam non parte | Accesso webcam richiede HTTPS | Il sito Pages è HTTPS, quindi ok; in locale usa `localhost` |
| Pagina 404 su Pages | Repo diventato privato | GitHub Pages non funziona su repo privati (Free); deve restare **public** |

---

## 🔁 Update automatico vs manuale

- **Push su `main`** → il workflow `.github/workflows/deploy.yml` ricostruisce e ripubblica automaticamente. Questa è la strada normale.
- **Nessun deploy manuale** → non serve eseguire `npm run dev` o servire file: Pages gestisce tutto.

---

*Se vuoi forzare un re-deploy senza modifiche al codice, vai su GitHub → Actions → "Deploy PaddleAI Web to GitHub Pages" → Run workflow.*
