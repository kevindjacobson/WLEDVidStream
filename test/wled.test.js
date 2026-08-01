import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectWled } from '../src/wled.js';

test('verifies a WLED target and returns useful matrix details', async () => {
  const result = await inspectWled('192.168.1.42', {
    fetchImpl: async (url) => {
      assert.equal(url, 'http://192.168.1.42/json/info');
      return {
        ok: true,
        json: async () => ({ name: 'Living Matrix', ver: '0.15.0', leds: { count: 4_096 } }),
      };
    },
  });

  assert.deepEqual(result, {
    host: '192.168.1.42',
    name: 'Living Matrix',
    version: '0.15.0',
    ledCount: 4_096,
    expectedLedCount: true,
  });
});

test('rejects a reachable server that is not WLED', async () => {
  await assert.rejects(
    inspectWled('matrix.local', {
      fetchImpl: async () => ({ ok: true, json: async () => ({ hello: 'world' }) }),
    }),
    /did not identify itself as WLED/,
  );
});
