import assert from 'node:assert/strict';
import test from 'node:test';

import { StreamController } from '../src/stream-controller.js';

test('forwards the exact RGB frame size reported by WLED only after configuration', () => {
  const sent = [];
  const controller = new StreamController({
    sender: { send: (frame, host) => sent.push({ frame, host }) },
  });

  assert.deepEqual(controller.handleFrame(Buffer.alloc(12)), {
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

test('records RGB frames and replays them in order at the capture rate', () => {
  const sent = [];
  let tick = null;
  let intervalMs = null;
  let canceledTimer = null;
  const controller = new StreamController({
    sender: { send: (frame) => sent.push(frame[0]) },
    setIntervalImpl: (callback, delay) => {
      tick = callback;
      intervalMs = delay;
      return 42;
    },
    clearIntervalImpl: (timer) => { canceledTimer = timer; },
  });
  controller.setWled({
    host: '192.168.1.42',
    matrix: { width: 2, height: 1, pixelCount: 2 },
  });

  assert.equal(typeof controller.startLoopRecording, 'function');
  assert.equal(controller.startLoopRecording(10).accepted, true);
  controller.handleFrame(Buffer.alloc(6, 1));
  controller.handleFrame(Buffer.alloc(6, 2));
  const playback = controller.playLoop();

  assert.equal(playback.accepted, true);
  assert.equal(playback.loop.mode, 'playing');
  assert.equal(playback.loop.frameCount, 2);
  assert.equal(playback.loop.durationMs, 200);
  assert.equal(intervalMs, 100);
  tick();
  tick();
  tick();
  assert.deepEqual(sent, [1, 2, 1, 2, 1]);

  controller.stopLoop();
  assert.equal(canceledTimer, 42);
  assert.equal(controller.status().loop.mode, 'idle');
});

test('a playing loop owns WLED output instead of incoming live frames', () => {
  const sent = [];
  const controller = new StreamController({
    sender: { send: (frame) => sent.push(frame[0]) },
    setIntervalImpl: () => 42,
    clearIntervalImpl: () => {},
  });
  controller.setWled({
    host: '192.168.1.42',
    matrix: { width: 2, height: 1, pixelCount: 2 },
  });
  controller.startLoopRecording(15);
  controller.handleFrame(Buffer.alloc(6, 1));
  controller.playLoop();

  const result = controller.handleFrame(Buffer.alloc(6, 9));

  assert.equal(result.accepted, true);
  assert.equal(result.liveFrameIgnored, true);
  assert.deepEqual(sent, [1]);
});

test('automatically plays a captured loop when its memory limit is reached', () => {
  let scheduled = false;
  const controller = new StreamController({
    sender: { send: () => {} },
    setIntervalImpl: () => {
      scheduled = true;
      return 42;
    },
    clearIntervalImpl: () => {},
    maxLoopBytes: 12,
  });
  controller.setWled({
    host: '192.168.1.42',
    matrix: { width: 2, height: 1, pixelCount: 2 },
  });
  controller.startLoopRecording(10);
  controller.handleFrame(Buffer.alloc(6, 1));
  controller.handleFrame(Buffer.alloc(6, 2));

  const result = controller.handleFrame(Buffer.alloc(6, 3));

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'loop-limit-reached');
  assert.equal(result.loop.mode, 'playing');
  assert.equal(result.loop.frameCount, 2);
  assert.equal(scheduled, true);
});

test('cannot restart loop playback after the controller closes', () => {
  let scheduled = 0;
  const controller = new StreamController({
    sender: { send: () => {} },
    setIntervalImpl: () => {
      scheduled += 1;
      return 42;
    },
    clearIntervalImpl: () => {},
  });
  controller.setWled({
    host: '192.168.1.42',
    matrix: { width: 2, height: 1, pixelCount: 2 },
  });
  controller.startLoopRecording(10);
  controller.handleFrame(Buffer.alloc(6, 1));

  controller.close();
  const result = controller.playLoop();

  assert.equal(result.accepted, false);
  assert.equal(result.reason, 'controller-closed');
  assert.equal(result.loop.mode, 'idle');
  assert.equal(scheduled, 0);
});
