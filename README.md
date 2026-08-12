# NeuroOCR

**Client-side handwriting recognition.** A CNN trained in Python/TensorFlow, converted to
TensorFlow.js, and served from a React + TypeScript single-page app. Every inference runs
in the visitor's own browser — no image is ever uploaded to a server.

[![CI](https://github.com/bharat3645/NeuroOCR/actions/workflows/ci.yml/badge.svg)](https://github.com/bharat3645/NeuroOCR/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](frontend)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](frontend)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-4-FF6F00?logo=tensorflow&logoColor=white)](frontend/src/services/modelService.ts)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](frontend/vite.config.ts)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](frontend/Dockerfile)

---

## Overview

NeuroOCR takes a photo or scan of handwritten text, runs it through a convolutional
neural network entirely inside the browser via [TensorFlow.js](https://www.tensorflow.org/js),
and returns the recognized text — with a per-character confidence breakdown, not just one
opaque score. The model itself is trained offline in Python/Keras and shipped as a
~1.3MB TensorFlow.js artifact, so the deployed app has no backend, no server-side
inference cost, and no path for uploaded images to leave the device.

```
Image upload → canvas preprocessing → tfjs CNN inference → per-character decode → UI
        (all four steps run client-side, in the browser, offline after first load)
```

## Features

- **Fully client-side inference** — `@tensorflow/tfjs` loads and runs the model in the
  browser. No image is ever sent to a server.
- **Per-character confidence UI** — each recognized character is rendered underlined and
  tinted by its own confidence tier (green / yellow / red), with the exact percentage on
  hover, so you can see *which* characters the model is unsure about instead of a single
  aggregate number.
- **Recognition history** — a collapsible sidebar persists past recognitions (including
  their per-character confidence breakdown) to `localStorage`, so reopening a past result
  shows the same detail it did the first time.
- **Upload validation** — rejects non-image files, oversized files, and empty (0-byte)
  files with clear, specific error messages before they ever reach the model.
- **Automated test suite** — 19 tests (Vitest + React Testing Library) covering the pure
  model-output decoder, upload validation, and full component interaction flows,
  including explicit regression tests for two real bugs found earlier in this project's
  history (a padding-index collision and a shared-softmax-across-positions bug).
- **CI on every push/PR** — typecheck, lint, test, production build, and a Node-side
  sanity check that the *shipped* tfjs model actually loads and predicts the correct
  output shape, plus a syntax check on the Python training scripts. See
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- **Container-ready** — a multi-stage `Dockerfile` builds the app with Node and serves
  the static output from a small `nginx:alpine` image (no Node.js, source, or
  `node_modules` in the final image). See [`frontend/Dockerfile`](frontend/Dockerfile).
- **Two training architectures** — a lightweight per-position CNN classifier (what's
  actually shipped) and a CNN+BiLSTM+CTC sequence model (a stronger starting point for
  variable-length, real-transcription training). See [`training/README.md`](training/README.md).

## Tech stack

| Layer          | Technology                                                              |
| -------------- | ------------------------------------------------------------------------ |
| Frontend       | React 18, TypeScript, Vite, Tailwind CSS, React Router                   |
| Inference      | TensorFlow.js (`@tensorflow/tfjs`), running entirely client-side         |
| Model training | Python, TensorFlow / `tf_keras` (Keras 2), OpenCV-style preprocessing    |
| Testing        | Vitest, React Testing Library, jsdom                                     |
| CI/CD          | GitHub Actions (typecheck → lint → test → build → model verification)    |
| Deployment     | Docker (multi-stage build), nginx (static hosting + client-side routing) |

## Architecture

```
training/                                frontend/
┌─────────────────────────┐              ┌──────────────────────────────┐
│ data_subset/ (IAM forms)│              │  ImageProcessor.tsx           │
│         │                │              │   upload → preview → recognize│
│         ▼                │              │         │                    │
│ train_baseline.py        │              │         ▼                    │
│  CNN → GAP → 20×Dense    │   convert    │  ModelService (singleton)     │
│  (shipped architecture)  │───to tfjs───▶│   tf.loadLayersModel(...)     │
│                          │   .py        │   canvas → grayscale tensor   │
│ train_ctc.py             │              │   model.predict(...)          │
│  CNN → BiLSTM → CTC      │              │         │                    │
│  (not yet wired in)      │              │         ▼                    │
└─────────────────────────┘              │  decodeModelOutput()          │
                                          │   pure fn, unit-tested        │
                                          │   → text + per-char confidence│
                                          │         │                    │
                                          │         ▼                    │
                                          │  UI: colored per-char confidence,│
                                          │  History sidebar (localStorage) │
                                          └──────────────────────────────┘
```

The model outputs a `(20, 38)` tensor — 20 character positions, each a probability
distribution over 38 classes (`a`–`z`, `0`–`9`, space, plus a padding token). Each
position's argmax is decoded to a character; its softmax probability becomes that
character's own confidence score. Full details in
[`frontend/README.md`](frontend/README.md#how-recognition-works-srcservicesmodelservicets).

## Repository structure

```
NeuroOCR/
├── .github/workflows/ci.yml   CI: frontend typecheck/lint/test/build + model verify,
│                                training syntax check
├── frontend/                   React + TypeScript + Vite app (the actual product)
│   ├── src/                    components, services, tests, constants
│   ├── Dockerfile               multi-stage build → nginx:alpine runtime
│   ├── nginx.conf                client-side-routing fallback + asset caching
│   └── README.md                  frontend-specific docs (tests, Docker, internals)
├── training/                   Python scripts: train the model, convert it to tfjs
│   └── README.md                training-specific docs (data caveat, architectures)
├── LICENSE
└── README.md                   you are here
```

## Getting started

### Prerequisites

- Node.js 20+ and npm (for the frontend — a pre-trained model is already committed, so
  this is all you need to run the app)
- Python 3.11+ (only needed if you want to retrain the model — see
  [`training/README.md`](training/README.md))

### Clone and run

```bash
git clone https://github.com/bharat3645/NeuroOCR.git
cd NeuroOCR/frontend
npm install
npm run dev
```

Open the printed localhost URL, upload a handwriting image, and click **Recognize Text**.

### Other frontend scripts

```bash
npm run build          # typecheck + production build
npm run typecheck      # tsc only, no build output
npm run lint            # eslint
npm run test              # vitest, single run (what CI runs)
npm run test:watch         # vitest, watch mode
npm run preview               # serve the production build locally
npm run verify-model             # load the shipped model outside a browser and sanity-check its output shape
```

### Run with Docker

```bash
cd frontend
docker build -t neuroocr-frontend .
docker run --rm -p 8080:80 neuroocr-frontend
# open http://localhost:8080
```

### Retrain the model

```bash
cd training
python -m venv .venv
.venv\Scripts\activate        # Windows — use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
python train_baseline.py --epochs 20
python convert_to_tfjs.py --input artifacts/handwriting_model.h5 \
                            --output ../frontend/public/models/handwriting-model
```

See [`training/README.md`](training/README.md) for the full picture, including why the
converter has to work around a Keras-3-vs-2 model-format mismatch.

## Usage

1. Start the app (`npm run dev` in `frontend/`, or the Docker container).
2. Upload a JPEG/PNG image of handwritten text (max 5MB).
3. Click **Recognize Text**. The model runs locally in your browser — nothing is sent
   over the network.
4. Read the result: recognized text with each character tinted by its own confidence
   (hover any character for its exact percentage), plus an overall confidence score.
5. Past recognitions are saved to the **History** sidebar for the current browser, with
   the same per-character breakdown available on reopen.

## A note on accuracy: what this demo actually recognizes

`training/data_subset/` is a subset of the IAM handwriting forms dataset, and
`training/forms_for_parsing.txt` is IAM's **form-level metadata** file (form id, writer
id, segmentation counts, ...) — **not** a per-word transcription file. The real IAM
ground truth (`words.txt` / `lines.txt`, mapping each image to the word actually written
in it) isn't bundled here. In its absence, the training scripts use the writer-id field
as a stand-in label, so the whole pipeline (load → preprocess → train → convert → serve)
is real and runs end-to-end — but the model learns to associate handwriting *style* with
a writer-id-like code, not real word content. Treat this as a working ML/web pipeline
demo, not production-accuracy OCR. See [`training/README.md`](training/README.md) for how
to plug in real transcriptions.

## Testing

```bash
cd frontend
npm test
```

19 tests across three suites — see [`frontend/README.md`](frontend/README.md#tests) for
what each one covers, including the two historical-bug regression tests.

## Contributing

Issues and pull requests are welcome at
[github.com/bharat3645/NeuroOCR](https://github.com/bharat3645/NeuroOCR). Before opening a PR,
please make sure `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` all
pass in `frontend/`.

## License

MIT © bharat3645 — see [`LICENSE`](LICENSE).
