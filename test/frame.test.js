import assert from 'node:assert/strict';
import test from 'node:test';

import * as frame from '../public/frame.js';

const { canvasToRgb, getCoverCrop, rgbaToRgb } = frame;

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

test('center-crops video to a rectangular matrix aspect ratio without stretching', () => {
  assert.deepEqual(getCoverCrop(1_920, 1_080, 32, 16), {
    x: 0,
    y: 60,
    width: 1_920,
    height: 960,
  });
});

test('removes canvas alpha bytes while preserving RGB channel order', () => {
  const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 128]);

  assert.deepEqual([...rgbaToRgb(rgba)], [10, 20, 30, 40, 50, 60]);
});

test('reads the current WLED matrix dimensions from the canvas', () => {
  const calls = [];
  const context = {
    getImageData: (...args) => {
      calls.push(args);
      return { data: new Uint8ClampedArray(32 * 16 * 4) };
    },
  };

  assert.equal(canvasToRgb(context, 32, 16).length, 32 * 16 * 3);
  assert.deepEqual(calls, [[0, 0, 32, 16]]);
});

test('punchy color grade darkens midtones and increases color separation', () => {
  assert.equal(typeof frame.applyPunchyGrade, 'function');
  const pixels = new Uint8ClampedArray([
    64, 64, 64, 255,
    128, 128, 128, 255,
    192, 192, 192, 255,
    180, 140, 100, 77,
  ]);

  frame.applyPunchyGrade(pixels);

  assert.ok(pixels[0] < 32, `expected deep shadows, got ${pixels[0]}`);
  assert.ok(pixels[4] < 115, `expected darker midtones, got ${pixels[4]}`);
  assert.ok(pixels[8] > 195, `expected retained highlights, got ${pixels[8]}`);
  assert.ok(pixels[12] - pixels[14] > 100, 'expected stronger color separation');
  assert.deepEqual([pixels[3], pixels[7], pixels[11], pixels[15]], [255, 255, 255, 77]);
});
