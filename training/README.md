# Training

Two handwriting-recognition model architectures, trained on `data_subset/` (a subset of
the IAM handwriting forms dataset), plus a script to convert the result for the browser.

**Read the data caveat in the root README before trusting any accuracy numbers** —
labels here are a writer-id stand-in, not real per-word transcriptions.

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

## `train_baseline.py` — simple per-position classifier

CNN → GlobalAveragePooling → Dense → 20 independent per-position softmaxes over a
38-class alphabet (`a-z`, `0-9`, space, plus a padding token). This is what's actually
shipped in `frontend/public/models/handwriting-model/`.

```bash
python train_baseline.py --epochs 20
python train_baseline.py --epochs 2 --limit 300   # quick smoke test
python train_baseline.py --help                   # all options
```

Saves `artifacts/handwriting_model.h5` and `artifacts/training_history.png`.

## `train_ctc.py` — CNN + BiLSTM + CTC

A more realistic sequence-to-sequence OCR architecture: CNN features → BiLSTM → CTC
loss, so the model doesn't need to know in advance how many characters are in the image.
Not currently wired into the frontend (CTC decoding is straightforward to add in
TypeScript — greedy argmax per timestep, collapse repeats, drop blanks — but hasn't been
done here); useful as a stronger starting point if you plug in real transcriptions.

```bash
python train_ctc.py --epochs 20
python train_ctc.py --epochs 2 --limit 200   # quick smoke test
```

## `convert_to_tfjs.py` — ship a model to the frontend

```bash
python convert_to_tfjs.py \
  --input artifacts/handwriting_model.h5 \
  --output ../frontend/public/models/handwriting-model
```

This does more than call the `tensorflowjs` converter: TensorFlow 2.16+'s default
`tf.keras` is Keras 3, which serializes models with a JSON shape (`InputLayer.batch_shape`,
per-layer `dtype` as a nested policy object, a different functional-graph connectivity
format) that `@tensorflow/tfjs`'s JavaScript deserializer does not understand — loading
such a model in the browser fails before your code ever runs, even though the Python
converter itself reports success. Both training scripts here build with `tf_keras` (the
standalone legacy Keras 2 package) specifically to avoid this, and the conversion script
also normalizes a couple of remaining Keras-3-shaped keys as a safety net. After
converting, sanity-check the result without a browser:

```bash
cd ../frontend
npm run verify-model
```

## Why the model is ~1.3MB, not ~100MB

An earlier iteration of this architecture flattened its conv output straight into a wide
Dense layer (`Flatten` → `Dense(256)` from a 32,768-wide vector ≈ 8.4M params on that
layer alone), producing a ~100MB `.h5` file — well past the point where committing it to
git (no LFS) becomes impractical. Using `GlobalAveragePooling2D` before the dense head
gives a model of comparable capacity for this task at a few percent of the size, which is
why `frontend/public/models/handwriting-model/` is ~1.3MB instead.
