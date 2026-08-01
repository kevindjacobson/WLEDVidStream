import { DDP_FRAME_BYTES } from './ddp.js';

export class StreamController {
  #sender;
  #wled = null;
  #phoneConnected = false;
  #framesSent = 0;
  #lastFrameAt = null;
  #lastError = null;

  constructor({ sender }) {
    this.#sender = sender;
  }

  setWled(wled) {
    this.#wled = { ...wled };
    this.#lastError = null;
  }

  setPhoneConnected(connected) {
    this.#phoneConnected = connected;
  }

  setError(error) {
    this.#lastError = error instanceof Error ? error.message : String(error);
  }

  handleFrame(frame) {
    if (frame.length !== DDP_FRAME_BYTES) {
      return { accepted: false, reason: `frame-must-be-${DDP_FRAME_BYTES}-bytes` };
    }
    if (!this.#wled) {
      return { accepted: false, reason: 'wled-not-configured' };
    }

    try {
      this.#sender.send(frame, this.#wled.host);
      this.#framesSent += 1;
      this.#lastFrameAt = new Date().toISOString();
      this.#lastError = null;
      return { accepted: true, frameNumber: this.#framesSent };
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
    };
  }
}
