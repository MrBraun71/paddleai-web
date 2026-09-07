# VogaAI — Legenda sovrimpressione video

Colori di scheletro, landmark e analisi visiva sovrapposti all'immagine della webcam.

## Colore di scheletro e polsi (fase di vogata)

Lo scheletro e i polsi cambiano colore in base alla **fase di vogata** riconosciuta in tempo reale:

| Colore | Fase | Significato |
|---|---|---|
| Verde (`entry`) | **Attacco / Presa** | Braccia tese + busto avanti + ginocchia compresse. Il colpo viene contato in questo momento |
| Azzurro (`pull`) | **Passata** | Spinta: le gambe spingono, il busto si apre, poi le braccia piegano verso lo sterno |
| Arancio (`exit`) | **Finale / Svincolo** | Mani al petto, gomiti piegati. In questa fase viene controllato il "press-down" per estrarre le pale |
| Viola (`recovery`) | **Ripresa** | Mani in avanti, busto segue, il carrello scorre |
| Grigio (`none`) | — | Nessuna fase riconosciuta (posizione neutra o dati insufficienti) |

Definito in `src/components/SkeletonRenderer.tsx` → `PHASE_COLORS`.

## Scie dei polsi

- **Verde** = polso sinistro
- **Rosa** = polso destro

Tracciano il percorso del manubrio (traiettoria orizzontale) per controllare se le mani compiono movimenti ondulati o "salti" sopra le ginocchia.

## Ginocchia (Knee Flare)

Colore del marcatore rotula + linea coscia in base all'**apertura laterale delle rotule** rispetto alle anche (in % della larghezza delle spalle):

| Colore | Soglia | Significato |
|---|---|---|
| Verde | < 18% | Rotule allineate |
| Ambrac | 18% – 28% | Attenzione |
| Rosa (#ef4444) | > 28% | Knee flaring: ginocchia aperte all'esterno (scarsa mobilità o "aggiramento" della pancia) |

## Griglia di simmetria dinamica

- **Linea mediana verticale azzurra**: asse sterno/naso. Indica se l'atleta oscilla a destra/sinistra durante la passata.
- **Linee laterali tratteggiate bianche**: allineamento spalla → anca per lato.

## Overlay diagnostico (angolo alto sinistra)

- `app | modello` — stato dell'app e modello AI in uso
- `LM:xx/33` — numero di landmark visibili del corpo (33 = persona completamente inquadrata)
- `VS` — stato del video, `FPS` — fotogrammi al secondo, `INF:xxms` — millisecondi per inferenza
- `SYM`, `KNEE`, `MAN`, `SPK` — oscillazione laterale %, knee flare %, ondulazione del manubrio %, conteggio sintesi vocale