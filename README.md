# WLED Video Stream

Stream a phone camera to a 64×64 WLED matrix. The app displays a pairing QR code on your computer; scanning it opens a local camera page on your phone. Frames are center-cropped to a square, reduced to 64×64 RGB pixels, sent to the computer over a paired WebSocket, and forwarded to WLED with DDP over UDP.

The stream stays on your LAN. No cloud service, account, microphone access, or video recording is involved.

## Requirements

- Node.js 20 or newer
- A phone and computer on the same Wi-Fi network
- WLED on the same network, configured for a 64×64 (4,096 pixel) 2D matrix
- WLED's normal DDP listener on UDP port 4048

Configure panel orientation and serpentine wiring in WLED's **Config → 2D Configuration** page. WLED applies that logical-to-physical matrix mapping when it renders the incoming row-major frame.

## Run

```bash
npm install
npm start
```

Then:

1. The dashboard opens automatically at `http://127.0.0.1:8788`.
2. Enter the WLED device address, such as `192.168.1.42` or `wled.local`.
3. Scan the dashboard QR code with the phone.
4. Accept the phone's local certificate warning. HTTPS is required for camera access.
5. Tap **Start camera** and grant camera permission.

The dashboard saves the WLED address in that browser's local storage. A new random phone pairing token is generated each time the server starts.

### Certificate help on iPhone

The generated certificate protects traffic on your local network but is not issued by a public certificate authority. Safari will normally show a warning the first time. Choose **Show Details → visit this website**. If Safari still reports that camera access is unavailable, use the dashboard's **Download certificate** link, install the profile in **Settings → General → VPN & Device Management**, then enable it in **Settings → General → About → Certificate Trust Settings** and reopen the pairing link.

## Configuration

Environment variables are optional:

```bash
PORT=8787 DASHBOARD_PORT=8788 HOST_IP=192.168.1.10 npm start
```

- `PORT` changes the HTTPS and WebSocket port.
- `DASHBOARD_PORT` changes the loopback-only desktop dashboard port.
- `HOST_IP` selects the computer's LAN address when automatic selection chooses the wrong interface.
- `PAIR_TOKEN` supplies a fixed pairing token for development; the default random token is safer.

## Verification

```bash
npm test
npm run check
```

Automated tests cover the centered cover-crop calculation, RGBA-to-RGB conversion, exact 64×64 frame validation, WLED inspection, pairing route protection, and WLED-compatible DDP packet headers and chunking.

## Hardware note

A 64×64 matrix can draw substantial current. Use a correctly sized external supply, appropriate fusing and power injection, common ground, and a conservative WLED current limit. Do not power a 4,096-pixel matrix from the controller board or a computer USB port.
