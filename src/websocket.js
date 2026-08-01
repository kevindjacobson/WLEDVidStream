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
