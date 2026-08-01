import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectWled } from '../src/wled.js';

test('verifies a WLED target and returns useful matrix details', async () => {
  const result = await inspectWled('192.168.1.42', {
    fetchImpl: async (url) => {
      assert.equal(url, 'http://192.168.1.42/json/info');
      return {
        ok: true,
        json: async () => ({
          name: 'Living Matrix',
          ver: '0.15.0',
          leds: { count: 4_096, matrix: { w: 64, h: 64 } },
        }),
      };
    },
  });

  assert.deepEqual(result, {
    host: '192.168.1.42',
    address: '192.168.1.42',
    name: 'Living Matrix',
    version: '0.15.0',
    ledCount: 4_096,
    matrix: { width: 64, height: 64, pixelCount: 4_096 },
  });
});

test('resolves a local WLED name once and retains the numeric DDP address', async () => {
  let lookups = 0;
  const result = await inspectWled('matrix.local', {
    lookupImpl: async (host) => {
      assert.equal(host, 'matrix.local');
      lookups += 1;
      return { address: '192.168.1.42', family: 4 };
    },
    fetchImpl: async (url) => {
      assert.equal(url, 'http://192.168.1.42/json/info');
      return {
        ok: true,
        json: async () => ({
          name: 'Matrix', ver: '0.15.0', leds: { count: 4_096, matrix: { w: 64, h: 64 } },
        }),
      };
    },
  });

  assert.equal(lookups, 1);
  assert.equal(result.address, '192.168.1.42');
});

test('accepts the matrix dimensions reported by WLED instead of assuming 64x64', async () => {
  const result = await inspectWled('192.168.1.42', {
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          name: 'Wide Matrix', ver: '0.15.0', leds: { count: 512, matrix: { w: 32, h: 16 } },
        }),
      }),
    });

  assert.deepEqual(result.matrix, { width: 32, height: 16, pixelCount: 512 });
  assert.equal(result.ledCount, 512);
});

test('rejects a WLED target that has no 2D matrix configuration', async () => {
  await assert.rejects(inspectWled('192.168.1.42', {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ name: 'Strip', ver: '0.15.0', leds: { count: 300 } }),
    }),
  }), /does not report a 2D matrix/);
});

test('rejects a reachable server that is not WLED', async () => {
  await assert.rejects(
    inspectWled('matrix.local', {
      lookupImpl: async () => ({ address: '192.168.1.42', family: 4 }),
      fetchImpl: async () => ({ ok: true, json: async () => ({ hello: 'world' }) }),
    }),
    /did not identify itself as WLED/,
  );
});

test('rejects a local name that resolves outside the private network', async () => {
  await assert.rejects(inspectWled('matrix.local', {
    lookupImpl: async () => ({ address: '203.0.113.10', family: 4 }),
    fetchImpl: async () => assert.fail('public address was fetched'),
  }), /resolved outside the private local network/);
});
