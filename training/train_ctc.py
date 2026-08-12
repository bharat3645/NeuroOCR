"""
train_ctc.py — CNN + BiLSTM + CTC handwriting-word recognizer.

A more realistic OCR architecture than train_baseline.py: a small CNN
extracts features, the feature map's height is fully pooled away so the
remaining width axis becomes a time axis, a 2-layer BiLSTM reads that
sequence, and CTC loss lets the model learn alignment-free
sequence-to-sequence decoding (no need to know which pixel column maps to
which character).

Same data caveat as train_baseline.py applies here: `forms_for_parsing.txt`
only gives per-form writer-id metadata, not real per-word transcriptions,
so labels are a demo stand-in — see the module docstring in
train_baseline.py for details and how to plug in real IAM word labels.

Usage:
    python train_ctc.py --epochs 20 --limit 800
    python train_ctc.py --help
"""
import argparse
import gc
import logging
import string
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from pathlib import Path

import cv2
import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split

# See the equivalent comment in train_baseline.py: tf_keras (legacy Keras 2)
# is used for anything that ends up serialized to disk so the resulting
# model_config JSON is shaped the way the tfjs-layers JS deserializer
# expects. Raw tensor ops (tf.shape, tf.cast, tf.reduce_sum, ...) still come
# from plain `tensorflow`.
import tf_keras as keras
from tf_keras import layers, models
from tf_keras.callbacks import EarlyStopping, ReduceLROnPlateau

SCRIPT_DIR = Path(__file__).resolve().parent

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
IMG_HEIGHT = 32
IMG_WIDTH = 128
MAX_TEXT_LENGTH = 20
LEARNING_RATE = 0.001
LSTM_UNITS = 256

# CTC convention: real characters are 0-indexed and the blank symbol is the
# implicit *last* class (index len(CHARSET), i.e. NUM_CLASSES - 1), which is
# how tf.keras.backend.ctc_batch_cost / ctc_decode expect it. This is
# deliberately different from train_baseline.py's scheme (which reserves
# index 0 for padding) — the two scripts use different loss functions with
# different index conventions and are not interchangeable.
CHARSET = string.ascii_lowercase + string.digits + ' '
CHAR_TO_NUM = {char: idx for idx, char in enumerate(CHARSET)}
NUM_TO_CHAR = {idx: char for idx, char in enumerate(CHARSET)}
NUM_CLASSES = len(CHARSET) + 1  # +1 for the CTC blank symbol
PAD_VALUE = -1  # sentinel for unused tail positions in a fixed-length label array


def clear_memory():
    gc.collect()
    keras.backend.clear_session()


def ctc_loss(y_true, y_pred):
    """CTC loss. label_length is derived from PAD_VALUE-padded y_true.

    keras.backend.ctc_batch_cost (tf_keras / Keras 2) expects input_length
    and label_length as shape (batch, 1).
    """
    batch_size = tf.shape(y_true)[0]
    max_length = tf.shape(y_pred)[1]

    input_length = tf.fill([batch_size, 1], max_length)
    label_length = tf.reduce_sum(tf.cast(y_true >= 0, tf.int32), axis=1, keepdims=True)

    y_true = tf.cast(tf.maximum(y_true, 0), tf.int32)  # clip sentinel before dense->sparse conversion
    y_pred = tf.cast(y_pred, tf.float32)
    input_length = tf.cast(input_length, tf.int32)
    label_length = tf.cast(label_length, tf.int32)

    loss = keras.backend.ctc_batch_cost(y_true, y_pred, input_length, label_length)
    return tf.reduce_mean(loss)


def cer_metric(y_true, y_pred):
    """Approximate Character Error Rate via greedy CTC decode + edit distance.

    Best-effort metric for monitoring training only: because word lengths
    vary, both the decoded and reference sequences are sparsified with
    default padding value 0, so a handful of edge cases (very short
    predictions containing character index 0) can be mis-scored. Treat the
    trend across epochs as signal, not the absolute number.
    """
    try:
        batch_size = tf.cast(tf.shape(y_true)[0], dtype="int64")
        input_length = tf.ones(shape=(batch_size,), dtype="int64") * tf.cast(tf.shape(y_pred)[1], dtype="int64")

        decoded, _ = keras.backend.ctc_decode(y_pred, input_length, greedy=True)
        decoded = tf.cast(decoded[0], tf.int32)
        decoded = tf.where(decoded < 0, tf.zeros_like(decoded), decoded)

        y_true_clipped = tf.cast(tf.maximum(y_true, 0), tf.int32)

        edit_dist = tf.edit_distance(
            tf.sparse.from_dense(decoded), tf.sparse.from_dense(y_true_clipped), normalize=True
        )
        return tf.reduce_mean(edit_dist)
    except Exception as e:
        logger.error(f"Error in CER computation: {e}")
        return tf.constant(1.0)


def preprocess_image(image):
    if len(image.shape) == 3:
        image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    image = cv2.adaptiveThreshold(image, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 11, 2)
    image = cv2.fastNlMeansDenoising(image, None, 7, 5, 11)
    return image


def load_image(image_path, augment=False):
    try:
        if isinstance(image_path, np.ndarray):
            img = image_path
        else:
            img = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
            if img is None:
                return None

        img = preprocess_image(img)
        if img is None:
            return None

        aspect_ratio = img.shape[1] / img.shape[0]
        new_width = max(1, int(IMG_HEIGHT * aspect_ratio))
        img = cv2.resize(img, (new_width, IMG_HEIGHT), interpolation=cv2.INTER_LINEAR)

        if new_width < IMG_WIDTH:
            img = np.pad(img, ((0, 0), (0, IMG_WIDTH - new_width)), mode='edge')
        elif new_width > IMG_WIDTH:
            img = img[:, :IMG_WIDTH]

        if augment:
            if np.random.rand() > 0.5:
                img = cv2.GaussianBlur(img, (3, 3), 0)
            if np.random.rand() > 0.5:
                img = np.clip(img * (0.8 + np.random.rand() * 0.4), 0, 255)

        return img.astype(np.float32) / 255.0
    except Exception as e:
        logger.error(f"Error in image loading ({image_path}): {e}")
        return None


def encode_text(text):
    text = ''.join(c for c in text.lower() if c in CHAR_TO_NUM)
    encoded = [CHAR_TO_NUM[c] for c in text]
    if len(encoded) > MAX_TEXT_LENGTH:
        encoded = encoded[:MAX_TEXT_LENGTH]
    else:
        encoded.extend([PAD_VALUE] * (MAX_TEXT_LENGTH - len(encoded)))
    return np.array(encoded, dtype=np.int32)


def decode_text(numbers):
    return ''.join(NUM_TO_CHAR[int(n)] for n in numbers if int(n) >= 0 and int(n) in NUM_TO_CHAR)


def decode_predictions(pred):
    input_len = np.ones(pred.shape[0]) * pred.shape[1]
    decoded, _ = keras.backend.ctc_decode(pred, input_length=input_len, greedy=True)
    decoded = decoded[0].numpy()
    return [decode_text(seq) for seq in decoded]


def load_label_map(label_file):
    """See train_baseline.load_label_map — same data-source caveat applies."""
    label_map = {}
    with open(label_file, 'r', encoding='utf-8') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 2:
                label_map[parts[0]] = parts[1]
    logger.info(f"Loaded {len(label_map)} form labels")
    return label_map


def load_dataset(data_dir, label_file, limit=None):
    data_dir = Path(data_dir)
    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory not found: {data_dir}")
    if not Path(label_file).exists():
        raise FileNotFoundError(f"Label file not found: {label_file}")

    label_map = load_label_map(label_file)

    def process_single_image(img_path, label_map):
        parts = img_path.stem.split('-')
        form_id = '-'.join(parts[:-2]) if len(parts) > 2 else img_path.stem
        if form_id in label_map:
            img = load_image(img_path, augment=True)
            if img is not None:
                return img, encode_text(label_map[form_id])
        return None, None

    image_paths = sorted(data_dir.glob('*.png'))
    if limit:
        image_paths = image_paths[:limit]
    logger.info(f"Found {len(image_paths)} candidate images")

    results = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        for result in executor.map(partial(process_single_image, label_map=label_map), image_paths):
            if result[0] is not None:
                results.append(result)
            if len(results) % 200 == 0 and results:
                clear_memory()

    if not results:
        raise ValueError(
            "No valid images found. Check that data_dir image filenames share "
            "a prefix with the ids in label_file."
        )

    images, labels = zip(*results)
    images = np.array(images, dtype=np.float32)
    labels = np.array(labels, dtype=np.int32)
    logger.info(f"Loaded {len(images)} images. Image shape: {images.shape}, labels shape: {labels.shape}")
    return images, labels


def build_model():
    """CNN -> (height fully pooled away) -> BiLSTM x2 -> per-timestep softmax."""
    inputs = layers.Input(shape=(IMG_HEIGHT, IMG_WIDTH, 1), name="image")

    x = layers.Conv2D(64, (3, 3), padding='same', activation='relu')(inputs)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D((2, 2))(x)  # H32 W128 -> H16 W64

    x = layers.Conv2D(128, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D((2, 2))(x)  # H16 W64 -> H8 W32

    x = layers.Conv2D(256, (3, 3), padding='same', activation='relu')(x)
    x = layers.BatchNormalization()(x)
    x = layers.MaxPooling2D((8, 1))(x)  # H8 W32 -> H1 W32 (collapse height fully, keep width as time)

    # Static reshape (height is fully known at graph-build time, so no need
    # for the original custom dynamic ReshapeLayer -- that also removes the
    # need to pass custom_objects when loading this model back later).
    x = layers.Reshape((IMG_WIDTH // 4, 256))(x)

    x = layers.Bidirectional(layers.LSTM(LSTM_UNITS, return_sequences=True))(x)
    x = layers.Dropout(0.25)(x)
    x = layers.Bidirectional(layers.LSTM(LSTM_UNITS // 2, return_sequences=True))(x)
    x = layers.Dropout(0.25)(x)

    outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

    model = models.Model(inputs=inputs, outputs=outputs, name='ctc_ocr_cnn_bilstm')
    model.summary()
    return model


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--data-dir', default=str(SCRIPT_DIR / 'data_subset' / 'data_subset'))
    p.add_argument('--label-file', default=str(SCRIPT_DIR / 'forms_for_parsing.txt'))
    p.add_argument('--output', default=str(SCRIPT_DIR / 'artifacts' / 'handwriting_model_ctc.keras'))
    p.add_argument('--history-plot', default=str(SCRIPT_DIR / 'artifacts' / 'training_history_ctc.png'))
    p.add_argument('--epochs', type=int, default=30)
    p.add_argument('--batch-size', type=int, default=32)
    p.add_argument('--limit', type=int, default=None, help='Cap the number of images loaded (useful for quick smoke tests)')
    return p.parse_args()


def main():
    args = parse_args()
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    clear_memory()

    try:
        logger.info("Loading data...")
        images, labels = load_dataset(args.data_dir, args.label_file, limit=args.limit)

        images = images[..., np.newaxis]

        # NOTE: deliberately not stratifying by label. With writer-id-style
        # labels many classes have only one example, and scikit-learn's
        # stratify option raises ValueError as soon as any class has fewer
        # members than the number of splits.
        X_train, X_val, y_train, y_val = train_test_split(images, labels, test_size=0.2, random_state=42)
        logger.info(f"Training samples: {len(X_train)}")
        logger.info(f"Validation samples: {len(X_val)}")

        logger.info("Building model...")
        model = build_model()

        optimizer = keras.optimizers.Adam(learning_rate=LEARNING_RATE, clipnorm=1.0, beta_1=0.9, beta_2=0.999)
        model.compile(optimizer=optimizer, loss=ctc_loss, metrics=[cer_metric])

        logger.info("Training model...")
        history = model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=args.epochs,
            batch_size=args.batch_size,
            callbacks=[
                EarlyStopping(monitor='val_loss', patience=7, restore_best_weights=True, verbose=1),
                ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=3, verbose=1, min_lr=1e-6),
            ],
        )

        model.save(args.output)
        logger.info(f"Model saved as {args.output}")

        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt

            plt.figure(figsize=(15, 5))
            plt.subplot(1, 2, 1)
            plt.plot(history.history['loss'], label='Training Loss')
            plt.plot(history.history['val_loss'], label='Validation Loss')
            plt.title('Model Loss')
            plt.xlabel('Epoch')
            plt.ylabel('Loss')
            plt.legend()
            plt.grid(True)

            plt.subplot(1, 2, 2)
            plt.plot(history.history['cer_metric'], label='Training CER')
            plt.plot(history.history['val_cer_metric'], label='Validation CER')
            plt.title('Character Error Rate (approximate)')
            plt.xlabel('Epoch')
            plt.ylabel('CER')
            plt.legend()
            plt.grid(True)

            plt.tight_layout()
            plt.savefig(args.history_plot, dpi=150, bbox_inches='tight')
            logger.info(f"Training history plot saved as {args.history_plot}")
        except Exception as e:
            logger.warning(f"Skipped history plot ({e})")

    except Exception:
        logger.error("An error occurred during training", exc_info=True)
        raise
    finally:
        clear_memory()


if __name__ == "__main__":
    main()
