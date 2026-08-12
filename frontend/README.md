# NeuroOCR — Frontend

React + TypeScript + Vite single-page app. Recognition runs entirely client-side with
[TensorFlow.js](https://www.tensorflow.org/js) — an uploaded image is never sent
anywhere.

> **Demo model, not production OCR.** See the data caveat in the repo root README —
> labels used at training time are a stand-in (writer id), not real transcribed text.

## Develop

```bash
npm install
npm run dev
```

## Other scripts

```bash
npm run build          # tsc typecheck + production build
npm run typecheck       # tsc only, no build output
npm run lint             # eslint
npm run test              # vitest, single run (what CI runs)
npm run test:watch         # vitest, watch mode
npm run preview              # serve the production build locally
npm run verify-model           # load the shipped model outside a browser and sanity-check its output shape
```

## Tests

`vitest` + `@testing-library/react`, config in `vitest.config.ts` (kept separate from
`vite.config.ts` so test-only setup can't leak into the production bundle):

- `src/services/modelService.test.ts` — unit tests for `decodeModelOutput`, the pure
  function that turns the model's raw `(20, 38)` output into text. Includes regression
  tests for two of the bugs found in this project's history: the padding-index/`'a'`
  collision, and the shared-softmax-across-positions bug (Dense→softmax applied before
  reshaping instead of after).
- `src/utils/validation.test.ts` — unit tests for upload validation (file type, size
  limit, empty files).
- `src/components/ImageProcessor.test.tsx` — component tests (with `ModelService`
  mocked) covering the loading/ready/error states, rejected uploads, a full
  recognize-and-render pass, and a recognition failure.

## Docker

```bash
docker build -t neuroocr-frontend .
docker run --rm -p 8080:80 neuroocr-frontend
# open http://localhost:8080
```

Multi-stage build (`Dockerfile`): a Node stage runs `typecheck` + `vite build`, and only
the static output is copied into a small `nginx:alpine` runtime image (`nginx.conf`
handles client-side-routing fallback and long-lived caching for the hashed
JS/CSS/model assets). No Node.js, source, or `node_modules` ship in the final image.

## How recognition works (`src/services/modelService.ts`)

1. `tf.loadLayersModel()` loads `public/models/handwriting-model/model.json` (a
   TensorFlow.js Layers-model export produced by `training/convert_to_tfjs.py` — **not**
   a raw `.h5` file; TensorFlow.js cannot parse those in the browser).
2. The uploaded image is drawn to a 128×32 canvas and converted to a normalized
   grayscale tensor, matching exactly how `training/train_baseline.py` preprocesses
   images at training time.
3. The model outputs a `(20, 38)` tensor — 20 character positions, each a probability
   distribution over 38 classes (`a-z`, `0-9`, space, plus a padding token at index 0).
   Each position's argmax is decoded to a character (skipping the padding token); its
   softmax probability becomes that character's own confidence score, and the mean
   across predicted characters becomes the overall confidence. The UI renders each
   character underlined by its individual confidence tier (see `ImageProcessor.tsx`)
   instead of only showing one aggregate number, so a mostly-confident recognition with
   one bad character is visibly distinguishable from a uniformly-uncertain one.

`src/constants/model.ts` holds the shape/alphabet constants and **must stay in sync**
with whatever model config trained the file in `public/models/handwriting-model/` — they
aren't auto-synced.

## Project structure

```
src/
├── components/
│   ├── Home.tsx                 landing page: upload + history + features
│   ├── ImageProcessor.tsx       upload / preview / recognize / confidence UI
│   ├── ImageProcessor.test.tsx
│   ├── History.tsx              collapsible sidebar of past recognitions (localStorage)
│   ├── Navbar.tsx
│   ├── About.tsx
│   └── Features.tsx
├── services/
│   ├── modelService.ts          tfjs model loading + preprocessing + decoding
│   └── modelService.test.ts
├── utils/
│   ├── validation.ts             upload validation (type/size/empty)
│   └── validation.test.ts
├── constants/
│   └── model.ts                   shape/alphabet constants shared with training/
├── test/setup.ts                    vitest + jest-dom setup
└── App.tsx                           react-router routes ("/", "/about")

Dockerfile / nginx.conf / .dockerignore   containerized static build (see "Docker" above)
```

## Retraining / replacing the model

See `../training/README.md`. After converting a new model to
`public/models/handwriting-model/`, run `npm run verify-model` before trusting it in the
browser — it catches shape/format mismatches without needing devtools.
