import { applyPunchyGrade, getCoverCrop, rgbaToRgb } from './frame.js';

const token = new URLSearchParams(location.search).get('token');
const elements = {
  video: document.querySelector('#camera'),
  canvas: document.querySelector('#frame-canvas'),
  preview: document.querySelector('#pixel-preview'),
  start: document.querySelector('#start-camera'),
  flip: document.querySelector('#flip-camera'),
  loop: document.querySelector('#loop-control'),
  loopSummary: document.querySelector('#loop-summary'),
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
let loopState = { mode: 'idle', frameCount: 0, durationMs: 0, maxDurationSeconds: 20 };

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

function renderLoopStatus(loop, announce = true) {
  if (!loop) return;
  loopState = loop;
  const seconds = (loop.durationMs / 1_000).toFixed(1);
  elements.loop.dataset.mode = loop.mode;
  elements.rate.disabled = loop.mode !== 'idle';
  elements.flip.disabled = !stream || loop.mode === 'recording';
  elements.loop.disabled = socket?.readyState !== WebSocket.OPEN
    || (!stream && loop.mode !== 'playing');

  if (loop.mode === 'recording') {
    elements.loop.textContent = 'Finish loop';
    elements.loopSummary.textContent = `REC ${seconds}s`;
    if (announce) {
      elements.message.textContent = `Recording processed frames · ${seconds}s of ${loop.maxDurationSeconds}s maximum.`;
      setStatus('live', 'Recording loop');
    }
  } else if (loop.mode === 'playing') {
    elements.loop.textContent = 'Stop loop';
    elements.loopSummary.textContent = `Loop ${seconds}s`;
    if (announce) {
      elements.message.textContent = `Looping ${seconds}s from server memory. It will continue if this phone disconnects.`;
      setStatus('live', 'Looping');
    }
  } else {
    elements.loop.textContent = 'Record loop';
    elements.loopSummary.textContent = 'Live';
    if (stream && announce) {
      elements.message.textContent = `Live frames are center-cropped and given a punchy, darker color grade for WLED's ${frameWidth}×${frameHeight} matrix.`;
      setStatus('live', 'Streaming');
    }
  }
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
      renderLoopStatus(message.loop);
      if (message.reason === 'wled-not-configured') {
        elements.message.textContent = 'Camera is ready. Configure WLED on the computer to begin output.';
        setStatus('waiting', 'Waiting for WLED');
      } else if (message.reason === 'loop-limit-reached') {
        elements.message.textContent = `Capture limit reached. Looping the saved ${loopState.durationMs / 1_000}s segment.`;
        setStatus('live', 'Looping');
      } else if (message.reason === 'loop-has-no-frames') {
        elements.message.textContent = 'Capture at least one frame before finishing the loop.';
      } else if (message.reason === 'invalid-control-message') {
        elements.message.textContent = 'The server rejected that loop command.';
      } else if (message.accepted && loopState.mode === 'idle') {
        setStatus('live', 'Streaming');
      }
    });
    candidate.addEventListener('close', () => {
      if (socket === candidate) socket = null;
      elements.loop.disabled = true;
      if (loopState.mode === 'recording' && loopState.frameCount > 0) {
        loopState = { ...loopState, mode: 'playing' };
      }
      if (loopState.mode === 'playing') {
        elements.message.textContent = 'The captured loop is continuing on the server.';
        setStatus('live', 'Looping on server');
      } else if (stream) {
        setStatus('error', 'Connection lost');
      }
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
    const imageData = context.getImageData(0, 0, frameWidth, frameHeight);
    applyPunchyGrade(imageData.data);
    context.putImageData(imageData, 0, 0);
    previewContext.drawImage(elements.canvas, 0, 0);

    if (loopState.mode !== 'playing' && socket.bufferedAmount < frameWidth * frameHeight * 3 * 2) {
      socket.send(rgbaToRgb(imageData.data));
      sentFrames += 1;
      elements.frames.textContent = sentFrames.toLocaleString();
      if (loopState.mode === 'recording') {
        const frameCount = loopState.frameCount + 1;
        loopState = {
          ...loopState,
          frameCount,
          durationMs: Math.round((frameCount / fps) * 1_000),
        };
        elements.loopSummary.textContent = `REC ${(loopState.durationMs / 1_000).toFixed(1)}s`;
      }
      if (sentFrames > 1 && loopState.mode === 'idle') setStatus('live', 'Streaming');
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
  renderLoopStatus(loopState);
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
  elements.loop.disabled = true;
  if (loopState.mode === 'recording' && loopState.frameCount > 0) {
    loopState = { ...loopState, mode: 'playing' };
  }
  if (loopState.mode === 'playing') {
    elements.message.textContent = 'Camera stopped. The captured loop is continuing on the server.';
    setStatus('live', 'Looping on server');
  } else {
    elements.message.textContent = 'Camera stopped. Tap Start camera to resume.';
    setStatus('ready', 'Ready');
  }
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

elements.loop.addEventListener('click', () => {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const action = loopState.mode === 'recording'
    ? 'play'
    : loopState.mode === 'playing' ? 'stop' : 'record';
  const message = { type: 'loop-control', action };
  if (action === 'record') message.fps = Number(elements.rate.value);
  elements.loop.disabled = true;
  socket.send(JSON.stringify(message));
});

window.addEventListener('pagehide', stopCamera);
