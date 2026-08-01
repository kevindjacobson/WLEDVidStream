import os from 'node:os';
import net from 'node:net';

function isPrivateIpv4(host) {
  const octets = host.split('.').map(Number);
  return (
    octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 169 && octets[1] === 254)
  );
}

export function normalizeWledHost(input) {
  const host = String(input ?? '').trim().toLowerCase();
  if (!host || /[:/?#@\[\]]/.test(host)) {
    throw new TypeError('Enter only a WLED host name or IP address');
  }

  if (net.isIPv4(host)) {
    if (!isPrivateIpv4(host)) {
      throw new TypeError('WLED must use a private IPv4 address');
    }
    return host;
  }

  const isLocalName = host.endsWith('.local') || !host.includes('.');
  if (!isLocalName || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)) {
    throw new TypeError('WLED must be on the local network');
  }
  return host;
}

export function isLoopbackAddress(address) {
  return address === '::1'
    || address === '127.0.0.1'
    || address?.startsWith('127.')
    || address?.startsWith('::ffff:127.');
}

export function getLanIpv4Addresses() {
  const addresses = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal && isPrivateIpv4(entry.address)) {
        addresses.push({ address: entry.address, name });
      }
    }
  }

  return addresses
    .sort((left, right) => {
      const score = (item) => (item.name === 'en0' ? 0 : item.address.startsWith('192.168.') ? 1 : 2);
      return score(left) - score(right);
    })
    .map(({ address }) => address);
}
