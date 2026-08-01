import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WebSocket, WebSocketServer } from 'ws';

import { createRequestHandler } from './app.js';
import { loadOrCreateCertificate } from './certificate.js';
import { DdpSender } from './ddp.js';
import { getLanIpv4Addresses } from './network.js';
import { StreamController } from './stream-controller.js';
import { createUpgradeHandler, processPhoneMessage } from './websocket.js';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number.parseInt(process.env.PORT ?? '8787', 10);
const dashboardPort = Number.parseInt(process.env.DASHBOARD_PORT ?? '8788', 10);
const lanAddresses = process.env.HOST_IP
  ? [process.env.HOST_IP]
  : getLanIpv4Addresses();

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer from 1 to 65535');
}
if (!Number.isInteger(dashboardPort) || dashboardPort < 1 || dashboardPort > 65_535 || dashboardPort === port) {
  throw new Error('DASHBOARD_PORT must be a different integer from 1 to 65535');
}
if (lanAddresses.length === 0) {
  throw new Error('No private LAN IPv4 address found. Connect to Wi-Fi or set HOST_IP.');
}

const pairingToken = process.env.PAIR_TOKEN ?? crypto.randomBytes(18).toString('base64url');
const certificate = await loadOrCreateCertificate(path.join(projectDirectory, '.cert'), lanAddresses);
let controller;
const sender = new DdpSender({ onError: (error) => controller?.setError(error) });
controller = new StreamController({ sender });
const handler = createRequestHandler({
  pairingToken,
  lanAddresses,
  port,
  controller,
  certificateDer: certificate.der,
});
const server = https.createServer({ key: certificate.key, cert: certificate.cert }, handler);
const dashboardServer = http.createServer(handler);
const sockets = new WebSocketServer({ noServer: true, maxPayload: 3_000_000 });
let activePhone = null;

server.on('upgrade', createUpgradeHandler({ pairingToken, sockets }));

sockets.on('connection', (phone) => {
  if (activePhone && activePhone.readyState === WebSocket.OPEN) {
    activePhone.close(1000, 'A new phone connected');
  }
  activePhone = phone;
  controller.setPhoneConnected(true);
  const status = controller.status();
  phone.send(JSON.stringify({ type: 'connected', wled: status.wled, loop: status.loop }));

  phone.on('message', (data, isBinary) => {
    const result = processPhoneMessage({ data, isBinary, controller });
    if (!isBinary || !result.accepted || result.frameNumber % 15 === 0) {
      phone.send(JSON.stringify(result));
    }
  });

  phone.on('error', (error) => controller.setError(error));
  phone.on('close', () => {
    if (activePhone === phone) {
      activePhone = null;
      controller.setPhoneConnected(false);
      controller.playLoop();
    }
  });
});

dashboardServer.listen(dashboardPort, '127.0.0.1', () => {
  const dashboardUrl = `http://127.0.0.1:${dashboardPort}`;
  if (process.platform === 'darwin' && process.env.NO_OPEN !== '1') {
    spawn('open', [dashboardUrl], { detached: true, stdio: 'ignore' }).unref();
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`\nWLED Video Stream is running`);
  console.log(`Dashboard: http://127.0.0.1:${dashboardPort}`);
  console.log(`Phone:     https://${lanAddresses[0]}:${port}/phone?token=${pairingToken}`);
  console.log('Keep this process running while streaming.\n');
});

function shutDown() {
  for (const client of sockets.clients) client.close(1001, 'Server shutting down');
  dashboardServer.close();
  server.close(() => {
    controller.close();
    sender.close();
  });
}

process.on('SIGINT', shutDown);
process.on('SIGTERM', shutDown);
