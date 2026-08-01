import dgram from 'node:dgram';

const DDP_PORT = 4048;
const DDP_HEADER_LENGTH = 10;
const DDP_MAX_DATA_LENGTH = 1_440;
const DDP_VERSION_1 = 0x40;
const DDP_PUSH = 0x01;
const DDP_RGB8 = 0x0b;
const DDP_DEFAULT_DESTINATION = 0x01;

export function createDdpPackets(frame, frameNumber) {
  const bytes = Buffer.from(frame);
  if (bytes.length === 0 || bytes.length % 3 !== 0) {
    throw new RangeError('DDP frame must contain complete RGB pixels');
  }

  const sequence = (frameNumber % 15) + 1;
  const packets = [];

  for (let offset = 0; offset < bytes.length; offset += DDP_MAX_DATA_LENGTH) {
    const payload = bytes.subarray(offset, offset + DDP_MAX_DATA_LENGTH);
    const isLast = offset + payload.length === bytes.length;
    const packet = Buffer.allocUnsafe(DDP_HEADER_LENGTH + payload.length);

    packet[0] = DDP_VERSION_1 | (isLast ? DDP_PUSH : 0);
    packet[1] = sequence;
    packet[2] = DDP_RGB8;
    packet[3] = DDP_DEFAULT_DESTINATION;
    packet.writeUInt32BE(offset, 4);
    packet.writeUInt16BE(payload.length, 8);
    payload.copy(packet, DDP_HEADER_LENGTH);
    packets.push(packet);
  }

  return packets;
}

export class DdpSender {
  #socket;
  #frameNumber = 0;

  constructor({ port = DDP_PORT } = {}) {
    this.port = port;
    this.#socket = dgram.createSocket('udp4');
  }

  send(frame, host) {
    this.#frameNumber += 1;
    for (const packet of createDdpPackets(frame, this.#frameNumber)) {
      this.#socket.send(packet, this.port, host);
    }
  }

  close() {
    this.#socket.close();
  }
}

export const DDP_FRAME_BYTES = 64 * 64 * 3;
