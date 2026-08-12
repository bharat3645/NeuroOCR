/**
 * Constants describing the shipped handwriting-recognition model's expected
 * input/output shape. These MUST stay in sync with `training/train_baseline.py`
 * (IMG_HEIGHT, IMG_WIDTH, MAX_TEXT_LENGTH, CHARSET, and the "index 0 is
 * padding" convention) — the two are not auto-synced, so if you retrain with
 * different values, update this file too.
 */

export const IMG_HEIGHT = 32;
export const IMG_WIDTH = 128;
export const MAX_TEXT_LENGTH = 20;

// Order must match training/train_baseline.py's CHARSET exactly.
export const CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789 ';

// +1 because index 0 is reserved for the padding token (real characters
// start at index 1 == CHARSET[0]).
export const NUM_CLASSES = CHARSET.length + 1;

// `${import.meta.env.BASE_URL}` makes this work whether the app is served
// from `/` or from a sub-path (e.g. GitHub Pages project sites).
export const MODEL_URL = `${import.meta.env.BASE_URL}models/handwriting-model/model.json`;
