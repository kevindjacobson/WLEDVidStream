export class StreamController {
  #sender;
  #setInterval;
  #clearInterval;
  #maxLoopBytes;
  #maxLoopSeconds;
  #wled = null;
  #phoneConnected = false;
  #framesSent = 0;
  #lastFrameAt = null;
  #lastError = null;
  #loopMode = 'idle';
  #loopFrames = [];
  #loopBytes = 0;
  #loopFps = null;
  #loopFrameIndex = 0;
  #loopDirection = 1;
  #loopBoomerang = false;
  #loopTimer = null;
  #closed = false;

  constructor({
    sender,
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
    maxLoopBytes = 64 * 1024 * 1024,
    maxLoopSeconds = 20,
  }) {
    this.#sender = sender;
    this.#setInterval = setIntervalImpl;
    this.#clearInterval = clearIntervalImpl;
    this.#maxLoopBytes = maxLoopBytes;
    this.#maxLoopSeconds = maxLoopSeconds;
  }

  setWled(wled) {
    this.stopLoop();
    this.#wled = { ...wled };
    this.#lastError = null;
  }

  setPhoneConnected(connected) {
    this.#phoneConnected = connected;
  }

  setError(error) {
    this.#lastError = error instanceof Error ? error.message : String(error);
  }

  #loopStatus() {
    return {
      mode: this.#loopMode,
      frameCount: this.#loopFrames.length,
      fps: this.#loopFps,
      boomerang: this.#loopBoomerang,
      durationMs: this.#loopFps
        ? Math.round((this.#loopFrames.length / this.#loopFps) * 1_000)
        : 0,
      maxDurationSeconds: this.#maxLoopSeconds,
    };
  }

  #clearLoopTimer() {
    if (this.#loopTimer === null) return;
    this.#clearInterval(this.#loopTimer);
    this.#loopTimer = null;
  }

  #transmit(frame) {
    this.#sender.send(frame, this.#wled.address ?? this.#wled.host);
    this.#framesSent += 1;
    this.#lastFrameAt = new Date().toISOString();
    this.#lastError = null;
  }

  startLoopRecording(fps, boomerang = false) {
    if (this.#closed) {
      return { accepted: false, reason: 'controller-closed', loop: this.#loopStatus() };
    }
    if (!this.#wled) {
      return { accepted: false, reason: 'wled-not-configured', loop: this.#loopStatus() };
    }
    if (!Number.isInteger(fps) || fps < 1 || fps > 30) {
      return { accepted: false, reason: 'loop-fps-must-be-1-to-30', loop: this.#loopStatus() };
    }
    if (typeof boomerang !== 'boolean') {
      return { accepted: false, reason: 'boomerang-must-be-boolean', loop: this.#loopStatus() };
    }

    this.#clearLoopTimer();
    this.#loopMode = 'recording';
    this.#loopFrames = [];
    this.#loopBytes = 0;
    this.#loopFps = fps;
    this.#loopFrameIndex = 0;
    this.#loopDirection = 1;
    this.#loopBoomerang = boomerang;
    return { accepted: true, loop: this.#loopStatus() };
  }

  playLoop() {
    if (this.#closed) {
      return { accepted: false, reason: 'controller-closed', loop: this.#loopStatus() };
    }
    if (this.#loopMode !== 'recording' || this.#loopFrames.length === 0) {
      return { accepted: false, reason: 'loop-has-no-frames', loop: this.#loopStatus() };
    }

    this.#loopMode = 'playing';
    this.#loopFrameIndex = 0;
    this.#loopDirection = 1;
    this.#clearLoopTimer();
    this.#loopTimer = this.#setInterval(() => {
      const frame = this.#loopFrames[this.#loopFrameIndex];
      if (this.#loopBoomerang && this.#loopFrames.length > 1) {
        let nextIndex = this.#loopFrameIndex + this.#loopDirection;
        if (nextIndex >= this.#loopFrames.length) {
          this.#loopDirection = -1;
          nextIndex = this.#loopFrames.length - 2;
        } else if (nextIndex < 0) {
          this.#loopDirection = 1;
          nextIndex = 1;
        }
        this.#loopFrameIndex = nextIndex;
      } else {
        this.#loopFrameIndex = (this.#loopFrameIndex + 1) % this.#loopFrames.length;
      }
      try {
        this.#transmit(frame);
      } catch (error) {
        this.setError(error);
      }
    }, 1_000 / this.#loopFps);
    return { accepted: true, loop: this.#loopStatus() };
  }

  stopLoop() {
    this.#clearLoopTimer();
    this.#loopMode = 'idle';
    this.#loopFrames = [];
    this.#loopBytes = 0;
    this.#loopFps = null;
    this.#loopFrameIndex = 0;
    this.#loopDirection = 1;
    this.#loopBoomerang = false;
    return { accepted: true, loop: this.#loopStatus() };
  }

  handleFrame(frame) {
    if (this.#closed) {
      return { accepted: false, reason: 'controller-closed' };
    }
    if (!this.#wled) {
      return { accepted: false, reason: 'wled-not-configured' };
    }
    const expectedFrameBytes = this.#wled.matrix.pixelCount * 3;
    if (frame.length !== expectedFrameBytes) {
      return {
        accepted: false,
        reason: `frame-must-be-${expectedFrameBytes}-bytes`,
        expectedFrameBytes,
        matrix: { ...this.#wled.matrix },
      };
    }

    if (this.#loopMode === 'playing') {
      return {
        accepted: true,
        liveFrameIgnored: true,
        frameNumber: this.#framesSent,
        matrix: { ...this.#wled.matrix },
        loop: this.#loopStatus(),
      };
    }

    if (this.#loopMode === 'recording') {
      const maxFrames = this.#loopFps * this.#maxLoopSeconds;
      if (this.#loopFrames.length >= maxFrames || this.#loopBytes + frame.length > this.#maxLoopBytes) {
        const playback = this.playLoop();
        return {
          accepted: false,
          reason: 'loop-limit-reached',
          matrix: { ...this.#wled.matrix },
          loop: playback.loop,
        };
      }
    }

    try {
      this.#transmit(frame);
      if (this.#loopMode === 'recording') {
        const storedFrame = Buffer.from(frame);
        this.#loopFrames.push(storedFrame);
        this.#loopBytes += storedFrame.length;
      }
      const result = {
        accepted: true,
        frameNumber: this.#framesSent,
        matrix: { ...this.#wled.matrix },
      };
      if (this.#loopMode !== 'idle') result.loop = this.#loopStatus();
      return result;
    } catch (error) {
      this.setError(error);
      return { accepted: false, reason: 'ddp-send-failed' };
    }
  }

  status() {
    return {
      wled: this.#wled ? { ...this.#wled } : null,
      phoneConnected: this.#phoneConnected,
      framesSent: this.#framesSent,
      lastFrameAt: this.#lastFrameAt,
      lastError: this.#lastError,
      loop: this.#loopStatus(),
    };
  }

  close() {
    if (this.#closed) return;
    this.stopLoop();
    this.#closed = true;
  }
}
