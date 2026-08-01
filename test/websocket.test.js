import assert from 'node:assert/strict';
import test from 'node:test';

import { StreamController } from '../src/stream-controller.js';
import * as websocket from '../src/websocket.js';

const { createUpgradeHandler } = websocket;

function fakeSocket() {
  return {
    output: '',
    destroyed: false,
    write(value) { this.output += value; },
    destroy() { this.destroyed = true; },
  };
}

test('rejects malformed upgrade URLs without throwing out of the server', () => {
  const socket = fakeSocket();
  const handler = createUpgradeHandler({
    pairingToken: 'correct-token',
    sockets: { handleUpgrade: () => assert.fail('malformed request was upgraded') },
  });

  assert.doesNotThrow(() => handler({ url: '%', headers: { host: '[' } }, socket, Buffer.alloc(0)));
  assert.match(socket.output, /400 Bad Request/);
  assert.equal(socket.destroyed, true);
});

test('rejects a valid stream upgrade with the wrong pairing token', () => {
  const socket = fakeSocket();
  const handler = createUpgradeHandler({
    pairingToken: 'correct-token',
    sockets: { handleUpgrade: () => assert.fail('unauthorized request was upgraded') },
  });

  handler({ url: '/stream?token=wrong', headers: { host: 'matrix.local' } }, socket, Buffer.alloc(0));
  assert.match(socket.output, /401 Unauthorized/);
  assert.equal(socket.destroyed, true);
});

test('processes loop recording controls over the paired phone session', () => {
  const controller = new StreamController({
    sender: { send: () => {} },
    setIntervalImpl: () => 42,
    clearIntervalImpl: () => {},
  });
  controller.setWled({
    host: '192.168.1.42',
    matrix: { width: 2, height: 1, pixelCount: 2 },
  });
  assert.equal(typeof websocket.processPhoneMessage, 'function');

  const recording = websocket.processPhoneMessage({
    data: Buffer.from(JSON.stringify({
      type: 'loop-control', action: 'record', fps: 10, boomerang: true,
    })),
    isBinary: false,
    controller,
  });
  websocket.processPhoneMessage({ data: Buffer.alloc(6, 7), isBinary: true, controller });
  const playing = websocket.processPhoneMessage({
    data: Buffer.from(JSON.stringify({ type: 'loop-control', action: 'play' })),
    isBinary: false,
    controller,
  });
  const stopped = websocket.processPhoneMessage({
    data: Buffer.from(JSON.stringify({ type: 'loop-control', action: 'stop' })),
    isBinary: false,
    controller,
  });

  assert.equal(recording.type, 'loop-status');
  assert.equal(recording.accepted, true);
  assert.equal(recording.loop.mode, 'recording');
  assert.equal(recording.loop.boomerang, true);
  assert.equal(playing.loop.mode, 'playing');
  assert.equal(playing.loop.frameCount, 1);
  assert.equal(stopped.loop.mode, 'idle');
});

test('rejects malformed phone control messages without throwing', () => {
  const controller = new StreamController({ sender: { send: () => {} } });
  assert.equal(typeof websocket.processPhoneMessage, 'function');

  const result = websocket.processPhoneMessage({
    data: Buffer.from('{'),
    isBinary: false,
    controller,
  });

  assert.deepEqual(result, {
    type: 'loop-status',
    accepted: false,
    reason: 'invalid-control-message',
    loop: controller.status().loop,
  });
});
