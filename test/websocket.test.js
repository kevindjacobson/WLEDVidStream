import assert from 'node:assert/strict';
import test from 'node:test';

import { createUpgradeHandler } from '../src/websocket.js';

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
