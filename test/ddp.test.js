import assert from 'node:assert/strict';
import test from 'node:test';

import { createDdpPackets, DdpSender } from '../src/ddp.js';

test('packetizes an RGB frame with byte offsets and pushes only the final packet', () => {
  const frame = Buffer.alloc(1_500);
  for (let index = 0; index < frame.length; index += 1) {
    frame[index] = index % 251;
  }

  const packets = createDdpPackets(frame, 16);

  assert.equal(packets.length, 2);
  assert.deepEqual([...packets[0].subarray(0, 10)], [
    0x40, 2, 0x0b, 1, 0, 0, 0, 0, 0x05, 0xa0,
  ]);
  assert.deepEqual([...packets[1].subarray(0, 10)], [
    0x41, 2, 0x0b, 1, 0, 0, 0x05, 0xa0, 0, 60,
  ]);
  assert.deepEqual(
    Buffer.concat(packets.map((packet) => packet.subarray(10))),
    frame,
  );
});

test('rejects data that is not complete RGB pixels', () => {
  assert.throws(
    () => createDdpPackets(Buffer.alloc(4), 1),
    /complete RGB pixels/,
  );
});

test('a 64x64 frame fits into Ethernet-sized DDP packets', () => {
  const packets = createDdpPackets(Buffer.alloc(64 * 64 * 3), 1);

  assert.equal(packets.length, 9);
  assert.ok(packets.every((packet) => packet.length <= 1_450));
  assert.equal(packets.at(-1)[0], 0x41);
});

test('closing an unused DDP sender is safe and idempotent', () => {
  const sender = new DdpSender();

  assert.doesNotThrow(() => sender.close());
  assert.doesNotThrow(() => sender.close());
});

test('reports asynchronous UDP resolution errors instead of crashing', async () => {
  const error = await new Promise((resolve) => {
    const sender = new DdpSender({ onError: resolve });
    sender.send(Buffer.alloc(3), '256.256.256.256');
    setTimeout(() => sender.close(), 250);
  });

  assert.match(error.message, /ENOTFOUND|getaddrinfo/);
});
