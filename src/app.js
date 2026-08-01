import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import QRCode from 'qrcode';

import { isLoopbackAddress } from './network.js';
import { inspectWled } from './wled.js';

const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const assets = new Map([
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/dashboard.js', ['dashboard.js', 'text/javascript; charset=utf-8']],
  ['/phone.js', ['phone.js', 'text/javascript; charset=utf-8']],
  ['/frame.js', ['frame.js', 'text/javascript; charset=utf-8']],
]);

function tokenMatches(actual, expected) {
  const left = Buffer.from(actual ?? '');
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function setSecurityHeaders(response) {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('permissions-policy', 'camera=(self), microphone=()');
  response.setHeader(
    'content-security-policy',
    "default-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; style-src 'self'; script-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'",
  );
}

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
  setSecurityHeaders(response);
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

function sendJson(response, status, value) {
  send(response, status, JSON.stringify(value), 'application/json; charset=utf-8');
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 2_048) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createRequestHandler({
  pairingToken,
  lanAddresses,
  port,
  controller,
  inspectWledImpl = inspectWled,
  certificateDer = null,
}) {
  const phoneUrls = lanAddresses.map(
    (address) => `https://${address}:${port}/phone?token=${encodeURIComponent(pairingToken)}`,
  );

  async function handle(request, response) {
    const url = new URL(request.url, `https://${request.headers.host ?? 'localhost'}`);
    const isLocal = isLoopbackAddress(request.socket.remoteAddress);

    if (request.method === 'GET' && url.pathname === '/') {
      if (!isLocal) return send(response, 403, 'The dashboard is available only on this computer.');
      return send(response, 200, await readFile(path.join(publicDirectory, 'index.html')), 'text/html; charset=utf-8');
    }

    if (request.method === 'GET' && url.pathname === '/phone') {
      if (!tokenMatches(url.searchParams.get('token'), pairingToken)) {
        return send(response, 403, 'This pairing link is invalid or expired.');
      }
      return send(response, 200, await readFile(path.join(publicDirectory, 'phone.html')), 'text/html; charset=utf-8');
    }

    if (request.method === 'GET' && assets.has(url.pathname)) {
      const [file, contentType] = assets.get(url.pathname);
      return send(response, 200, await readFile(path.join(publicDirectory, file)), contentType);
    }

    if (request.method === 'GET' && url.pathname === '/api/bootstrap') {
      if (!isLocal) return sendJson(response, 403, { error: 'Local access only' });
      return sendJson(response, 200, { phoneUrls, status: controller.status() });
    }

    if (request.method === 'GET' && url.pathname === '/api/status') {
      if (!isLocal) return sendJson(response, 403, { error: 'Local access only' });
      return sendJson(response, 200, controller.status());
    }

    if (request.method === 'POST' && url.pathname === '/api/wled') {
      if (!isLocal) return sendJson(response, 403, { error: 'Local access only' });
      try {
        const { host } = await readJson(request);
        const wled = await inspectWledImpl(host);
        controller.setWled(wled);
        return sendJson(response, 200, wled);
      } catch (error) {
        return sendJson(response, 400, { error: error.message });
      }
    }

    if (request.method === 'GET' && url.pathname === '/pair.svg') {
      if (!isLocal) return send(response, 403, 'Local access only');
      const address = url.searchParams.get('address');
      const index = lanAddresses.indexOf(address);
      if (index === -1) return send(response, 400, 'Unknown network address');
      const svg = await QRCode.toString(phoneUrls[index], {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 2,
        color: { dark: '#101416', light: '#ffffff' },
      });
      return send(response, 200, svg, 'image/svg+xml; charset=utf-8');
    }

    if (request.method === 'GET' && url.pathname === '/certificate' && certificateDer) {
      setSecurityHeaders(response);
      response.writeHead(200, {
        'content-type': 'application/x-x509-ca-cert',
        'content-disposition': 'attachment; filename="wled-video-stream.cer"',
      });
      return response.end(certificateDer);
    }

    return send(response, 404, 'Not found');
  }

  return (request, response) => {
    handle(request, response).catch((error) => {
      if (!response.headersSent) sendJson(response, 500, { error: error.message });
      else response.destroy(error);
    });
  };
}
