import crypto from 'node:crypto';

function rejectUpgrade(socket, status) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function createUpgradeHandler({ pairingToken, sockets }) {
  return (request, socket, head) => {
    try {
      const url = new URL(request.url, `https://${request.headers.host ?? 'localhost'}`);
      const suppliedToken = Buffer.from(url.searchParams.get('token') ?? '');
      const expectedToken = Buffer.from(pairingToken);
      const authorized = url.pathname === '/stream'
        && suppliedToken.length === expectedToken.length
        && crypto.timingSafeEqual(suppliedToken, expectedToken);

      if (!authorized) {
        rejectUpgrade(socket, '401 Unauthorized');
        return;
      }

      sockets.handleUpgrade(request, socket, head, (webSocket) => {
        sockets.emit('connection', webSocket);
      });
    } catch {
      rejectUpgrade(socket, '400 Bad Request');
    }
  };
}

export function processPhoneMessage({ data, isBinary, controller }) {
  if (isBinary) {
    return { type: 'frame-status', ...controller.handleFrame(data) };
  }

  try {
    const message = JSON.parse(Buffer.from(data).toString('utf8'));
    if (message?.type !== 'loop-control') throw new Error('Unknown control message');

    let result;
    if (message.action === 'record') result = controller.startLoopRecording(message.fps);
    else if (message.action === 'play') result = controller.playLoop();
    else if (message.action === 'stop') result = controller.stopLoop();
    else throw new Error('Unknown loop action');
    return { type: 'loop-status', ...result };
  } catch {
    return {
      type: 'loop-status',
      accepted: false,
      reason: 'invalid-control-message',
      loop: controller.status().loop,
    };
  }
}
