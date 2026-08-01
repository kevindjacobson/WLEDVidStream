import assert from 'node:assert/strict';
import test from 'node:test';

import { DDP_FRAME_BYTES } from '../src/ddp.js';
import { StreamController } from '../src/stream-controller.js';

test('forwards the exact RGB frame size reported by WLED only after configuration', () => {
  const sent = [];
  const controller = new StreamController({
    sender: { send: (frame, host) => sent.push({ frame, host }) },
  });

  assert.deepEqual(controller.handleFrame(Buffer.alloc(DDP_FRAME_BYTES)), {
    accepted: false,
    reason: 'wled-not-configured',
  });

  controller.setWled({
    host: 'matrix.local',
    address: '192.168.1.42',
    name: 'Matrix',
    matrix: { width: 2, height: 1, pixelCount: 2 },
  });
  assert.deepEqual(controller.handleFrame(Buffer.alloc(6, 7)), {
    accepted: true,
    frameNumber: 1,
    matrix: { width: 2, height: 1, pixelCount: 2 },
  });
  assert.equal(controller.status().framesSent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].host, '192.168.1.42');
});

test('rejects malformed frames without forwarding them', () => {
  const controller = new StreamController({
    sender: { send: () => assert.fail('malformed frame was forwarded') },
  });
  controller.setWled({
    host: '192.168.1.42',
    name: 'Matrix',
    matrix: { width: 2, height: 1, pixelCount: 2 },
  });

  assert.deepEqual(controller.handleFrame(Buffer.alloc(100)), {
    accepted: false,
    reason: 'frame-must-be-6-bytes',
    expectedFrameBytes: 6,
    matrix: { width: 2, height: 1, pixelCount: 2 },
  });
  assert.equal(controller.status().framesSent, 0);
});
