import { normalizeWledHost } from './network.js';

export async function inspectWled(input, { fetchImpl = fetch, timeoutMs = 3_000 } = {}) {
  const host = normalizeWledHost(input);
  let response;

  try {
    response = await fetchImpl(`http://${host}/json/info`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    throw new Error(`Could not reach WLED at ${host}: ${error.message}`, { cause: error });
  }

  if (!response.ok) {
    throw new Error(`WLED at ${host} returned HTTP ${response.status ?? 'error'}`);
  }

  let info;
  try {
    info = await response.json();
  } catch (error) {
    throw new Error(`WLED at ${host} returned invalid JSON`, { cause: error });
  }

  if (typeof info?.ver !== 'string' || typeof info?.name !== 'string') {
    throw new Error(`Device at ${host} did not identify itself as WLED`);
  }

  const ledCount = Number(info.leds?.count ?? 0);
  return {
    host,
    name: info.name,
    version: info.ver,
    ledCount,
    expectedLedCount: ledCount === 64 * 64,
  };
}
