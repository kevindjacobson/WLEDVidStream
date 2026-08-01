import { lookup } from 'node:dns/promises';
import net from 'node:net';

import { normalizeWledHost } from './network.js';

export async function inspectWled(input, {
  fetchImpl = fetch,
  lookupImpl = lookup,
  timeoutMs = 3_000,
} = {}) {
  const host = normalizeWledHost(input);
  let address = host;
  if (!net.isIPv4(host)) {
    try {
      address = (await lookupImpl(host, { family: 4 })).address;
    } catch (error) {
      throw new Error(`Could not resolve WLED host ${host}: ${error.message}`, { cause: error });
    }
  }
  try {
    normalizeWledHost(address);
  } catch (error) {
    throw new Error(`WLED host ${host} resolved outside the private local network`, { cause: error });
  }
  async function fetchJson(path) {
    let response;
    try {
      response = await fetchImpl(`http://${address}${path}`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json' },
      });
    } catch (error) {
      throw new Error(`Could not reach WLED at ${host}: ${error.message}`, { cause: error });
    }
    if (!response.ok) {
      throw new Error(`WLED at ${host} returned HTTP ${response.status ?? 'error'} for ${path}`);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new Error(`WLED at ${host} returned invalid JSON for ${path}`, { cause: error });
    }
  }

  const info = await fetchJson('/json/info');
  if (typeof info?.ver !== 'string' || typeof info?.name !== 'string') {
    throw new Error(`Device at ${host} did not identify itself as WLED`);
  }

  const ledCount = Number(info.leds?.count ?? 0);
  const width = Number(info.leds?.matrix?.w ?? 0);
  const height = Number(info.leds?.matrix?.h ?? 0);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`WLED at ${host} does not report a 2D matrix configuration`);
  }
  const pixelCount = width * height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > 1_000_000) {
    throw new Error(`WLED at ${host} reports unsupported matrix dimensions ${width}x${height}`);
  }
  const config = await fetchJson('/json/cfg');
  if (config?.if?.live?.rlm !== true) {
    throw new Error(
      'Enable “Respect LED maps” in WLED Config → Sync Interfaces → Realtime before streaming',
    );
  }
  return {
    host,
    address,
    name: info.name,
    version: info.ver,
    ledCount,
    matrix: { width, height, pixelCount },
    respectsLedMaps: true,
  };
}
