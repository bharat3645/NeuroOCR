import { describe, expect, it } from 'vitest';
import { decodeModelOutput } from './modelService';

/**
 * Builds a fake flattened (maxTextLength * numClasses) model output where
 * position `pos` is a one-hot(ish) distribution peaking at `classIndex`
 * with probability `prob` (remaining mass split across the other classes).
 * Mirrors the real model's per-position softmax shape.
 */
function makeOutput(
  positions: Array<{ classIndex: number; prob: number }>,
  numClasses: number
): Float32Array {
  const out = new Float32Array(positions.length * numClasses);
  positions.forEach(({ classIndex, prob }, pos) => {
    const offset = pos * numClasses;
    const rest = (1 - prob) / (numClasses - 1);
    for (let c = 0; c < numClasses; c++) {
      out[offset + c] = c === classIndex ? prob : rest;
    }
  });
  return out;
}

// Small test charset: index 0 is the reserved padding token, so charset[0]
// ('a') lives at class index 1, charset[1] ('b') at class index 2, etc. —
// matches the real convention in constants/model.ts.
const CHARSET = 'ab';
const NUM_CLASSES = CHARSET.length + 1; // padding + 'a' + 'b'

describe('decodeModelOutput', () => {
  it('decodes the argmax character at each position, skipping padding', () => {
    // pos0 -> 'a' (class 1), pos1 -> padding (class 0), pos2 -> 'b' (class 2)
    const output = makeOutput(
      [
        { classIndex: 1, prob: 0.9 },
        { classIndex: 0, prob: 0.95 },
        { classIndex: 2, prob: 0.8 },
      ],
      NUM_CLASSES
    );

    const result = decodeModelOutput(output, CHARSET, 3);

    expect(result.text).toBe('ab');
    expect(result.characters).toHaveLength(2);
    expect(result.characters[0]).toMatchObject({ char: 'a' });
    expect(result.characters[1]).toMatchObject({ char: 'b' });
  });

  it('regression: gives every position its own probability mass instead of one shared distribution', () => {
    // This is the shape a *correctly* Softmax(axis=-1)-after-reshape model
    // produces: each position's row sums to ~1 independently. The bug this
    // guards against (Dense(softmax) applied before reshaping, over the
    // flattened 20*38 vector) would instead spread ~1/20th of a unit of
    // probability across each position, driving every per-character
    // confidence down near 1/numClasses regardless of how "sure" the model
    // actually is about any single position.
    const output = makeOutput(
      [
        { classIndex: 1, prob: 0.97 },
        { classIndex: 2, prob: 0.93 },
      ],
      NUM_CLASSES
    );

    const result = decodeModelOutput(output, CHARSET, 2);

    expect(result.characters[0].confidence).toBeGreaterThan(90);
    expect(result.characters[1].confidence).toBeGreaterThan(90);
  });

  it('does not let padding (index 0) collide with the first real character', () => {
    // If padding and charset[0] shared index 0, a position confidently
    // predicting padding would decode as 'a' instead of being dropped.
    const output = makeOutput([{ classIndex: 0, prob: 0.99 }], NUM_CLASSES);

    const result = decodeModelOutput(output, CHARSET, 1);

    expect(result.text).toBe('');
    expect(result.characters).toHaveLength(0);
  });

  it('returns confidence 0 and empty text when every position is padding', () => {
    const output = makeOutput(
      [
        { classIndex: 0, prob: 0.99 },
        { classIndex: 0, prob: 0.8 },
      ],
      NUM_CLASSES
    );

    const result = decodeModelOutput(output, CHARSET, 2);

    expect(result.text).toBe('');
    expect(result.confidence).toBe(0);
  });

  it('averages confidence only over predicted (non-padding) positions', () => {
    const output = makeOutput(
      [
        { classIndex: 1, prob: 1.0 }, // 'a' at 100%
        { classIndex: 0, prob: 1.0 }, // padding — must not drag the average down
      ],
      NUM_CLASSES
    );

    const result = decodeModelOutput(output, CHARSET, 2);

    expect(result.text).toBe('a');
    expect(result.confidence).toBeCloseTo(100, 5);
  });

  it('throws on a malformed output length instead of silently misreading it', () => {
    const bad = new Float32Array(NUM_CLASSES * 3 + 1);
    expect(() => decodeModelOutput(bad, CHARSET, 3)).toThrow();
  });
});
