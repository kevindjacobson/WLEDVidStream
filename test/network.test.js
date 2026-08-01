import assert from 'node:assert/strict';
import test from 'node:test';

import { isLoopbackAddress, normalizeWledHost } from '../src/network.js';

test('normalizes a local WLED hostname or IPv4 address', () => {
  assert.equal(normalizeWledHost(' 192.168.1.42 '), '192.168.1.42');
  assert.equal(normalizeWledHost('matrix.local'), 'matrix.local');
});

test('rejects URL syntax and public hostnames as WLED targets', () => {
  assert.throws(() => normalizeWledHost('http://192.168.1.42'), /host name or IP/);
  assert.throws(() => normalizeWledHost('example.com'), /local network/);
  assert.throws(() => normalizeWledHost('8.8.8.8'), /private IPv4/);
});

test('recognizes IPv4 and IPv6 loopback socket addresses', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackAddress('192.168.1.10'), false);
});
