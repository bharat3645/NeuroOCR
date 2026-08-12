"""
train_baseline.py — Baseline CNN handwriting-word classifier.

Architecture: small CNN -> GlobalAveragePooling -> Dense -> per-position
softmax over a fixed-length character sequence (MAX_TEXT_LENGTH positions).
This is intentionally simple (no CTC / no RNN) so it is fast to train and
trivial to run inference for (both in Python and in TensorFlow.js in the
browser after conversion — see frontend/README.md).

IMPORTANT DATA CAVEAT
----------------------
`forms_for_parsing.txt` is the IAM *forms* metadata file (one row per scanned
form page: form id, writer id, sentence/line/word segmentation counts, ...).
It is NOT a per-word transcription file. The IAM dataset's real ground-truth
text lives in `words.txt` / `lines.txt`, which is not bundled in this
repository's data_subset. In the absence of that file, this script uses the
writer-id field (column 2) as a stand-in label so the full pipeline
(load -> preprocess -> train -> save -> convert -> serve) is real, runs
end-to-end, and is easy to demo. The model therefore learns to associate
handwriting *style* with a writer-id-like code, not real word content —
swap in a real `words.txt` mapping (image id -> transcribed word) for
genuine handwriting-to-text OCR quality.

Usage:
    python train_baseline.py --epochs 8 --limit 800
    python train_baseline.py --help
"""
import argparse
import string
from pathlib import Path

import cv2
import numpy as np
from sklearn.model_selection import train_test_split

# tf_keras (the standalone legacy Keras 2 package) is used instead of the
# `tf.keras` that ships inside TensorFlow 2.16+ (which is Keras 3). Keras 3
# saves a structurally different model_config JSON (e.g. InputLayer's
# "batch_shape" instead of "batch_input_shape", a graph-connectivity format
# the tfjs-layers JS deserializer does not understand yet) that breaks
# `tf.loadLayersModel()` in the browser even though the Python-side
# tensorflowjs converter itself runs without error. Building with tf_keras
# produces a genuinely Keras-2-shaped model the whole tfjs toolchain (Python
# converter AND JS runtime) actually supports end-to-end.
import tf_keras as keras
from tf_keras import layers, models

SCRIPT_DIR = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
IMG_HEIGHT = 32
IMG_WIDTH = 128
MAX_TEXT_LENGTH = 20  # max characters per label

# Index 0 is reserved for the padding/blank token so it can never collide
# with a real character (the original script mapped 'a' and padding to the
# same index 0, which made every 'a' in a label undecodable).
CHARSET = string.ascii_lowercase + string.digits + ' '
CHAR_TO_NUM = {char: idx + 1 for idx, char in enumerate(CHARSET)}
NUM_TO_CHAR = {idx + 1: char for idx, char in enumerate(CHARSET)}
NUM_CLASSES = len(CHARSET) + 1  # +1 for the padding token


def load_image(image_path):
    """Load a PNG as grayscale, resize to the fixed input size, normalize."""
    img = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    img = cv2.resize(img, (IMG_WIDTH, IMG_HEIGHT), interpolation=cv2.INTER_AREA)
    return img.astype(np.float32) / 255.0


def encode_text(text):
    """Convert text to a fixed-length sequence of character indices."""
    encoded = [CHAR_TO_NUM[c] for c in text.lower() if c in CHAR_TO_NUM]
    if len(encoded) > MAX_TEXT_LENGTH:
        encoded = encoded[:MAX_TEXT_LENGTH]
    else:
        encoded.extend([0] * (MAX_TEXT_LENGTH - len(encoded)))
    return np.array(encoded, dtype=np.int32)


def decode_text(numbers):
    """Convert a sequence of character indices back to text."""
    return ''.join(NUM_TO_CHAR[int(n)] for n in numbers if int(n) > 0 and int(n) in NUM_TO_CHAR)


def build_model():
    """Small CNN classifier producing MAX_TEXT_LENGTH independent softmaxes.

    Uses GlobalAveragePooling2D (instead of Flatten straight into a wide
    Dense layer) to keep the parameter count -- and therefore the saved
    model size -- small. The original version flattened a (8, 32, 128)
    feature map into a 32768-wide vector feeding a Dense(256), which alone
    accounted for ~8.4M parameters (~33MB) and pushed the saved .h5 file to
    ~100MB, right at GitHub's 100MB hard file-size limit.
    """
    inputs = layers.Input(shape=(IMG_HEIGHT, IMG_WIDTH, 1), name='image')

    x = layers.Conv2D(32, 3, activation='relu', padding='same')(inputs)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D()(x)

    x = layers.Conv2D(64, 3, activation='relu', padding='same')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D()(x)

    x = layers.Conv2D(128, 3, activation='relu', padding='same')(x)
    x = layers.BatchNormalization()(x)
    x = layers.GlobalAveragePooling2D()(x)

    x = layers.Dense(256, activation='relu')(x)
    x = layers.Dropout(0.5)(x)
    # No activation here: softmax must be applied *after* reshaping to
    # (MAX_TEXT_LENGTH, NUM_CLASSES), not before. A Dense(..., activation=
    # 'softmax') normalizes over its whole flat 20*38-wide output, so all 20
    # character positions would compete for one shared unit of probability
    # mass instead of each position getting its own distribution over the 38
    # classes -- both semantically wrong and much harder to train.
    outputs = layers.Dense(MAX_TEXT_LENGTH * NUM_CLASSES)(x)
    outputs = layers.Reshape((MAX_TEXT_LENGTH, NUM_CLASSES))(outputs)
    outputs = layers.Softmax(axis=-1, name='char_probs')(outputs)

    return models.Model(inputs=inputs, outputs=outputs, name='baseline_ocr_cnn')


def load_label_map(label_file):
    """Map an IAM form/line base id (e.g. 'a01-000u') -> a training label.

    Falls back to the writer-id column (see module docstring caveat above).
    """
    label_map = {}
    with open(label_file, 'r', encoding='utf-8') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) < 2:
                continue
            form_id = parts[0]          # e.g. 'a01-000u'
            writer_id = parts[1]        # e.g. '000'
            label_map[form_id] = writer_id
    return label_map


def load_dataset(data_dir, label_file, limit=None):
    """Load and preprocess PNG images, pairing each with its training label.

    Image filenames follow the IAM segmentation convention
    '<form_id>-s<sentence>-<word>.png' (e.g. 'a01-000u-s00-00.png'), so the
    form id is recovered by joining every dash-separated part except the
    last two ('s00', '00').
    """
    data_dir = Path(data_dir)
    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")
    if not Path(label_file).exists():
        raise FileNotFoundError(f"Label file not found: {label_file}")

    label_map = load_label_map(label_file)
    print(f"Loaded {len(label_map)} form labels from {label_file}")

    image_paths = sorted(data_dir.glob('*.png'))
    if limit:
        image_paths = image_paths[:limit]
    print(f"Found {len(image_paths)} candidate images in {data_dir}")

    images, labels = [], []
    matched, skipped = 0, 0
    for img_path in image_paths:
        parts = img_path.stem.split('-')
        form_id = '-'.join(parts[:-2]) if len(parts) > 2 else img_path.stem
        if form_id not in label_map:
            skipped += 1
            continue
        img = load_image(img_path)
        if img is None:
            skipped += 1
            continue
        images.append(img)
        labels.append(encode_text(label_map[form_id]))
        matched += 1

    print(f"Matched {matched} images to labels ({skipped} skipped)")
    if not images:
        raise ValueError(
            "No valid images found. Check that data_dir image filenames share "
            "a prefix with the ids in label_file."
        )
    return np.array(images, dtype=np.float32), np.array(labels, dtype=np.int32)


def to_one_hot(labels):
    one_hot = np.zeros((len(labels), MAX_TEXT_LENGTH, NUM_CLASSES), dtype=np.float32)
    for i, label in enumerate(labels):
        for j, char_idx in enumerate(label):
            one_hot[i, j, char_idx] = 1.0  # index 0 (padding) is a valid class too
    return one_hot


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--data-dir', default=str(SCRIPT_DIR / 'data_subset' / 'data_subset'))
    p.add_argument('--label-file', default=str(SCRIPT_DIR / 'forms_for_parsing.txt'))
    p.add_argument('--output', default=str(SCRIPT_DIR / 'artifacts' / 'handwriting_model.h5'))
    p.add_argument('--history-plot', default=str(SCRIPT_DIR / 'artifacts' / 'training_history.png'))
    p.add_argument('--epochs', type=int, default=30)
    p.add_argument('--batch-size', type=int, default=32)
    p.add_argument('--limit', type=int, default=None, help='Cap the number of images loaded (useful for quick smoke tests)')
    return p.parse_args()


def main():
    args = parse_args()
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    print("Loading data...")
    images, labels = load_dataset(args.data_dir, args.label_file, limit=args.limit)
    print(f"Processed {len(images)} samples")

    labels_one_hot = to_one_hot(labels)
    images = images[..., np.newaxis]

    X_train, X_val, y_train, y_val = train_test_split(
        images, labels_one_hot, test_size=0.2, random_state=42
    )
    print(f"Training samples: {len(X_train)}")
    print(f"Validation samples: {len(X_val)}")

    print("Building model...")
    model = build_model()
    model.summary()
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

    print("Training model...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=[
            keras.callbacks.EarlyStopping(patience=5, restore_best_weights=True),
            keras.callbacks.ReduceLROnPlateau(factor=0.5, patience=2),
        ],
    )

    model.save(args.output)
    print(f"Model saved as {args.output}")

    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        plt.figure(figsize=(12, 4))
        plt.subplot(1, 2, 1)
        plt.plot(history.history['loss'], label='Training Loss')
        plt.plot(history.history['val_loss'], label='Validation Loss')
        plt.title('Model Loss')
        plt.xlabel('Epoch')
        plt.ylabel('Loss')
        plt.legend()

        plt.subplot(1, 2, 2)
        plt.plot(history.history['accuracy'], label='Training Accuracy')
        plt.plot(history.history['val_accuracy'], label='Validation Accuracy')
        plt.title('Model Accuracy')
        plt.xlabel('Epoch')
        plt.ylabel('Accuracy')
        plt.legend()

        plt.tight_layout()
        plt.savefig(args.history_plot)
        print(f"Training history plot saved as {args.history_plot}")
    except Exception as e:  # pragma: no cover - plotting is best-effort
        print(f"Skipped history plot ({e})")


if __name__ == "__main__":
    main()
