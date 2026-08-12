#!/usr/bin/env node
/**
 * Sanity-checks a converted TensorFlow.js model without a browser: loads it
 * with plain @tensorflow/tfjs (Node's CPU backend), runs one forward pass on
 * random input, and checks the output shape matches (1, MAX_TEXT_LENGTH,
 * NUM_CLASSES). Run after `python training/convert_to_tfjs.py`.
 *
 * Usage: node scripts/verify-model.mjs [path/to/model/dir]
 */
import fs from 'fs';
import path from 'path';
import * as tf from '@tensorflow/tfjs';

const IMG_HEIGHT = 32;
const IMG_WIDTH = 128;
const MAX_TEXT_LENGTH = 20;
const NUM_CLASSES = 38; // 26 letters + 10 digits + space + padding token

const modelDir = process.argv[2] ?? path.join('public', 'models', 'handwriting-model');
const modelJsonPath = path.join(modelDir, 'model.json');

if (!fs.existsSync(modelJsonPath)) {
  console.error(`No model.json found at ${modelJsonPath}`);
  console.error('Train + convert a model first (see training/README.md).');
  process.exit(1);
}

function localFileIOHandler(jsonPath) {
  return {
    load: async () => {
      const modelJSON = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      const dir = path.dirname(jsonPath);
      const weightSpecs = modelJSON.weightsManifest.flatMap((g) => g.weights);
      const buffers = modelJSON.weightsManifest
        .flatMap((g) => g.paths)
        .map((p) => fs.readFileSync(path.join(dir, p)));
      return {
        modelTopology: modelJSON.modelTopology,
        weightSpecs,
        weightData: Buffer.concat(buffers).buffer,
        format: modelJSON.format,
        generatedBy: modelJSON.generatedBy,
        convertedBy: modelJSON.convertedBy,
      };
    },
  };
}

const model = await tf.loadLayersModel(localFileIOHandler(modelJsonPath));
console.log(`Loaded model from ${modelJsonPath}`);
console.log('Input shape:', JSON.stringify(model.inputs[0].shape));
console.log('Output shape:', JSON.stringify(model.outputs[0].shape));

const input = tf.randomUniform([1, IMG_HEIGHT, IMG_WIDTH, 1], 0, 1);
const output = model.predict(input);
const data = await output.data();
const sum = data.reduce((a, b) => a + b, 0);

const shapeOk = output.shape.length === 3 && output.shape[1] === MAX_TEXT_LENGTH && output.shape[2] === NUM_CLASSES;
const sumOk = Math.abs(sum - MAX_TEXT_LENGTH) < 0.5; // MAX_TEXT_LENGTH independent softmaxes should sum to ~MAX_TEXT_LENGTH

console.log(`Output shape ${shapeOk ? 'OK' : 'MISMATCH'}: expected (1, ${MAX_TEXT_LENGTH}, ${NUM_CLASSES})`);
console.log(`Softmax sum sanity ${sumOk ? 'OK' : 'MISMATCH'}: ${sum.toFixed(3)} (expected ~${MAX_TEXT_LENGTH})`);

input.dispose();
output.dispose();
model.dispose();

if (!shapeOk || !sumOk) {
  process.exit(1);
}
console.log('Model verification passed.');
