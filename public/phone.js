import { canvasToRgb, getCoverCrop } from './frame.js';

const token = new URLSearchParams(location.search).get('token');
const elements = {
  video: document.querySelector('#camera'),
  canvas: document.querySelector('#frame-canvas'),
  preview: document.querySelector('#pixel-preview'),
  start: document.querySelector('#start-camera'),
  flip: document.querySelector('#flip-camera'),
  rate: document.querySelector('#frame-rate'),
  frames: document.querySelector('#phone-frames'),
  status: document.querySelector('#phone-status'),
  message: document.querySelector('#phone-message'),
  secureHelp: document.querySelector('#secure-context-help'),
};
const context = elements.canvas.getContext('2d', { willReadFrequently: true });
const previewContext = elements.preview.getContext('2d');
context.imageSmoothingEnabled = true;
context.imageSmoothingQuality = 'high';
previewContext.imageSmoothingEnabled = false;

let stream = null;
let socket = null;
let animationFrame = null;
let facingMode = 'environment';
let sentFrames = 0;
let lastSentAt = 0;
let wakeLock = null;
let frameWidth = 1;
let frameHeight = 1;

function configureMatrix(matrix) {
  if (!matrix?.width || !matrix?.height) return;
  frameWidth = matrix.width;
  frameHeight = matrix.height;
  elements.canvas.width = frameWidth;
  elements.canvas.height = frameHeight;
  elements.preview.width = frameWidth;
  elements.preview.height = frameHeight;
  elements.preview.style.aspectRatio = `${frameWidth} / ${frameHeight}`;
  elements.preview.parentElement.style.aspectRatio = `${frameWidth} / ${frameHeight}`;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  previewContext.imageSmoothingEnabled = false;
}

function setStatus(kind, text) {
  elements.status.dataset.kind = kind;
  elements.status.lastChild.textContent = ` ${text}`;
}

function openSocket() {
  return new Promise((resolve, reject) => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const candidate = new WebSocket(`${protocol}//${location.host}/stream?token=${encodeURIComponent(token)}`);
    candidate.binaryType = 'arraybuffer';
    candidate.addEventListener('open', () => {
      socket = candidate;
      resolve(candidate);
    }, { once: true });
    candidate.addEventListener('error', () => reject(new Error('Could not connect to the streaming server')), { once: true });
    candidate.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      configureMatrix(message.matrix ?? message.wled?.matrix);
      if (message.reason === 'wled-not-configured') {
        elements.message.textContent = 'Camera is ready. Configure WLED on the computer to begin output.';
        setStatus('waiting', 'Waiting for WLED');
      } else if (message.accepted) {
        setStatus('live', 'Streaming');
      }
    });
    candidate.addEventListener('close', () => {
      if (socket === candidate) socket = null;
      if (stream) setStatus('error', 'Connection lost');
    });
  });
}

function captureFrame(timestamp) {
  if (!stream || !socket) return;
  const fps = Number(elements.rate.value);
  if (timestamp - lastSentAt >= 1_000 / fps && socket.readyState === WebSocket.OPEN) {
    lastSentAt = timestamp;
    const crop = getCoverCrop(
      elements.video.videoWidth,
      elements.video.videoHeight,
      frameWidth,
      frameHeight,
    );
    context.drawImage(
      elements.video,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      frameWidth,
      frameHeight,
    );
    previewContext.drawImage(elements.canvas, 0, 0);

    if (socket.bufferedAmount < frameWidth * frameHeight * 3 * 2) {
      socket.send(canvasToRgb(context, frameWidth, frameHeight));
      sentFrames += 1;
      elements.frames.textContent = sentFrames.toLocaleString();
      if (sentFrames > 1) setStatus('live', 'Streaming');
    }
  }
  animationFrame = requestAnimationFrame(captureFrame);
}

async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    elements.secureHelp.hidden = false;
    throw new Error('Trust this local HTTPS page before using the camera');
  }

  setStatus('waiting', 'Starting camera');
  elements.message.textContent = 'Requesting camera permission…';
  await openSocket();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1_280 },
      height: { ideal: 720 },
    },
  });
  elements.video.srcObject = stream;
  await elements.video.play();

  elements.start.textContent = 'Stop camera';
  elements.flip.disabled = false;
  elements.message.textContent = `Live frames are center-cropped to WLED's ${frameWidth}×${frameHeight} aspect ratio — never stretched.`;
  setStatus('live', 'Streaming');
  if ('wakeLock' in navigator) {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch { /* optional */ }
  }
  animationFrame = requestAnimationFrame(captureFrame);
}

function stopCamera() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  elements.video.srcObject = null;
  socket?.close(1000, 'Camera stopped');
  socket = null;
  wakeLock?.release();
  wakeLock = null;
  elements.start.textContent = 'Start camera';
  elements.flip.disabled = true;
  elements.message.textContent = 'Camera stopped. Tap Start camera to resume.';
  setStatus('ready', 'Ready');
}

elements.start.addEventListener('click', async () => {
  if (stream) {
    stopCamera();
    return;
  }
  elements.start.disabled = true;
  try {
    await startCamera();
  } catch (error) {
    stopCamera();
    elements.message.textContent = error.message;
    setStatus('error', 'Camera unavailable');
  } finally {
    elements.start.disabled = false;
  }
});

elements.flip.addEventListener('click', async () => {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  stopCamera();
  elements.start.disabled = true;
  try { await startCamera(); }
  catch (error) {
    stopCamera();
    elements.message.textContent = error.message;
    setStatus('error', 'Camera unavailable');
  }
  finally { elements.start.disabled = false; }
});

window.addEventListener('pagehide', stopCamera);
