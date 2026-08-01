import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { createRequestHandler } from '../src/app.js';

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('serves the phone camera only for the QR pairing token', async () => {
  const handler = createRequestHandler({
    pairingToken: 'correct-token',
    lanAddresses: ['192.168.1.10'],
    port: 8787,
    controller: { status: () => ({}) },
  });

  await withServer(handler, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/phone?token=wrong`)).status, 403);
    const paired = await fetch(`${baseUrl}/phone?token=correct-token`);
    assert.equal(paired.status, 200);
    assert.match(await paired.text(), /Phone camera/);
  });
});

test('provides the local dashboard with a scannable phone URL', async () => {
  const handler = createRequestHandler({
    pairingToken: 'correct-token',
    lanAddresses: ['192.168.1.10'],
    port: 8787,
    controller: { status: () => ({ phoneConnected: false }) },
  });

  await withServer(handler, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/bootstrap`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      phoneUrls: ['https://192.168.1.10:8787/phone?token=correct-token'],
      status: { phoneConnected: false },
    });
  });
});

test('configures WLED only after inspecting the device', async () => {
  let configured = null;
  const handler = createRequestHandler({
    pairingToken: 'correct-token',
    lanAddresses: ['192.168.1.10'],
    port: 8787,
    controller: {
      setWled: (wled) => { configured = wled; },
      status: () => ({ wled: configured }),
    },
    inspectWledImpl: async (host) => ({
      host,
      name: 'Test Matrix',
      version: '0.15.0',
      ledCount: 4_096,
      matrix: { width: 64, height: 64, pixelCount: 4_096 },
    }),
  });

  await withServer(handler, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wled`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ host: '192.168.1.42' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).name, 'Test Matrix');
    assert.equal(configured.host, '192.168.1.42');
  });
});
