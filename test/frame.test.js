import assert from 'node:assert/strict';
import test from 'node:test';

import { getCoverCrop, rgbaToRgb } from '../public/frame.js';

test('crops widescreen video at the sides instead of stretching it square', () => {
  assert.deepEqual(getCoverCrop(1_920, 1_080, 64, 64), {
    x: 420,
    y: 0,
    width: 1_080,
    height: 1_080,
  });
});

test('crops portrait video at the top and bottom instead of stretching it square', () => {
  assert.deepEqual(getCoverCrop(1_080, 1_920, 64, 64), {
    x: 0,
    y: 420,
    width: 1_080,
    height: 1_080,
  });
});

test('removes canvas alpha bytes while preserving RGB channel order', () => {
  const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]);

  assert.deepEqual([...rgbaToRgb(rgba)], [10, 20, 30, 40, 50, 60]);
});
