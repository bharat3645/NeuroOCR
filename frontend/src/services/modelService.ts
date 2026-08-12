import * as tf from '@tensorflow/tfjs';
import { CHARSET, IMG_HEIGHT, IMG_WIDTH, MAX_TEXT_LENGTH, MODEL_URL } from '../constants/model';

export interface CharacterPrediction {
  /** The decoded character at this position. */
  char: string;
  /** Softmax confidence for this specific character, 0-100. */
  confidence: number;
}

export interface RecognitionResult {
  /** Decoded text, in the model's lowercase/digit/space alphabet. */
  text: string;
  /** Mean softmax confidence across predicted (non-padding) positions, 0-100. */
  confidence: number;
  /**
   * Per-character breakdown, one entry per non-padding predicted position, in
   * left-to-right order. `characters.map(c => c.char).join('')` === `text`.
   * Exposed so the UI can flag individual low-confidence characters instead
   * of only showing one aggregate number.
   */
  characters: CharacterPrediction[];
}

/**
 * Pure decode step: turns the model's raw flattened
 * (MAX_TEXT_LENGTH * NUM_CLASSES) softmax output into text.
 *
 * Kept as a standalone, dependency-free function (no tf.* calls, no DOM) so
 * it can be unit-tested with plain arrays — see modelService.test.ts — which
 * is how the padding-index-collision and shared-softmax bugs described in
 * the project history would have been caught automatically instead of by
 * manual inspection.
 */
export function decodeModelOutput(
  output: ArrayLike<number>,
  charset: string = CHARSET,
  maxTextLength: number = MAX_TEXT_LENGTH
): RecognitionResult {
  const numClasses = output.length / maxTextLength;
  if (!Number.isInteger(numClasses)) {
    throw new Error(
      `Model output length ${output.length} is not divisible by maxTextLength ${maxTextLength}`
    );
  }

  const characters: CharacterPrediction[] = [];
  let confidenceSum = 0;

  for (let pos = 0; pos < maxTextLength; pos++) {
    const offset = pos * numClasses;
    let bestIndex = 0;
    let bestProb = output[offset];
    for (let c = 1; c < numClasses; c++) {
      const p = output[offset + c];
      if (p > bestProb) {
        bestProb = p;
        bestIndex = c;
      }
    }
    // Index 0 is the padding token (see constants/model.ts) — skip it.
    if (bestIndex > 0) {
      const char = charset[bestIndex - 1];
      if (char !== undefined) {
        const confidence = bestProb * 100;
        characters.push({ char, confidence });
        confidenceSum += confidence;
      }
    }
  }

  return {
    text: characters.map((c) => c.char).join(''),
    confidence: characters.length > 0 ? confidenceSum / characters.length : 0,
    characters,
  };
}

/**
 * Loads the TensorFlow.js-converted handwriting model and runs inference
 * entirely in the browser (no backend server involved).
 *
 * The original implementation tried `tf.loadLayersModel('/models/handwriting_model.h5')`,
 * which can never work: TensorFlow.js cannot parse a raw Keras HDF5 file, only
 * the converted `model.json` + weight-shard format produced by
 * `training/convert_to_tfjs.py`. It also preprocessed images to 224x224 RGB
 * and decoded output in 62-character (A-Z a-z 0-9) chunks, neither of which
 * matches this model's actual 32x128 grayscale input / 20x38 output shape.
 */
export class ModelService {
  private static instance: ModelService;
  private model: tf.LayersModel | null = null;
  private loadPromise: Promise<tf.LayersModel> | null = null;

  private constructor() {}

  public static getInstance(): ModelService {
    if (!ModelService.instance) {
      ModelService.instance = new ModelService();
    }
    return ModelService.instance;
  }

  public isReady(): boolean {
    return this.model !== null;
  }

  /** Kick off (or await) model loading without processing an image yet. */
  public preload(): Promise<void> {
    return this.loadModel().then(() => undefined);
  }

  private loadModel(): Promise<tf.LayersModel> {
    if (this.model) {
      return Promise.resolve(this.model);
    }
    if (!this.loadPromise) {
      this.loadPromise = tf.loadLayersModel(MODEL_URL).then(
        (model) => {
          this.model = model;
          return model;
        },
        (error) => {
          // Let the next caller retry instead of caching a permanent failure.
          this.loadPromise = null;
          throw error;
        }
      );
    }
    return this.loadPromise;
  }

  /**
   * Draws the uploaded image onto an IMG_WIDTH x IMG_HEIGHT canvas (matching
   * the non-aspect-preserving cv2.resize used at training time) and converts
   * it to a normalized grayscale tensor using the same luma weights OpenCV's
   * BGR2GRAY conversion uses.
   */
  private async imageFileToTensor(file: File): Promise<tf.Tensor4D> {
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = IMG_WIDTH;
      canvas.height = IMG_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Could not get a 2D canvas context');
      }
      ctx.drawImage(bitmap, 0, 0, IMG_WIDTH, IMG_HEIGHT);
      const { data } = ctx.getImageData(0, 0, IMG_WIDTH, IMG_HEIGHT);

      const gray = new Float32Array(IMG_WIDTH * IMG_HEIGHT);
      for (let i = 0; i < IMG_WIDTH * IMG_HEIGHT; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      }

      return tf.tensor4d(gray, [1, IMG_HEIGHT, IMG_WIDTH, 1]);
    } finally {
      bitmap.close();
    }
  }

  public async processImage(imageFile: File): Promise<RecognitionResult> {
    const model = await this.loadModel();
    const input = await this.imageFileToTensor(imageFile);
    try {
      const prediction = model.predict(input) as tf.Tensor;
      try {
        const data = await prediction.data();
        return decodeModelOutput(data);
      } finally {
        prediction.dispose();
      }
    } finally {
      input.dispose();
    }
  }

  public dispose(): void {
    this.model?.dispose();
    this.model = null;
    this.loadPromise = null;
  }
}
