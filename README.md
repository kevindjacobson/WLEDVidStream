# WLED Video Stream

Stream a phone camera to any 2D matrix configured in WLED or WLED MoonModules. The app displays a pairing QR code on your computer; scanning it opens a local camera page on your phone. It reads the logical matrix width and height from WLED, center-crops video to that aspect ratio, reduces it to the exact matrix resolution, applies a dark, high-contrast color grade, and forwards RGB frames with DDP over UDP.

The stream stays on your LAN. No cloud service, account, microphone access, upload, or disk recording is involved. Captured loops live only in temporary server memory.

## Requirements

- Node.js 20 or newer
- A phone and computer on the same Wi-Fi network
- WLED or WLED MoonModules on the same network, configured for a 2D matrix
- WLED's normal DDP listener on UDP port 4048

Configure matrix dimensions, panel orientation, serpentine wiring, gaps, and rotation in WLED's **Config → 2D Configuration** page. On newer WLED, also enable **Respect LED maps** under **Config → Sync Interfaces → Realtime**. Older MoonModules builds do not expose that option because their realtime path always applies the mapping. The app detects both behaviors through `/json/info` and `/json/cfg`. It does not assume HUB75, 64×64, or any physical wiring layout.

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

Tap **Record loop** to capture the cropped, color-graded frames in server memory, then tap **Finish loop** to replay the segment continuously. The loop keeps running if the phone disconnects. Reconnect and tap **Stop loop** to return to the live camera. Captures are limited to 20 seconds and 64 MiB, are never written to disk, and disappear when stopped or when the server exits.

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

Automated tests cover aspect-preserving cover crops, RGBA-to-RGB conversion, WLED-reported dynamic frame sizes, WLED inspection, pairing route protection, and WLED-compatible DDP packet headers and chunking.

## Hardware note

Large matrices can draw substantial current. Use a correctly sized external supply, appropriate fusing and power injection, common ground, and a conservative WLED current limit. Do not power a large matrix from the controller board or a computer USB port.
