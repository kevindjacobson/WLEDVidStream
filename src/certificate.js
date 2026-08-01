import { X509Certificate } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import selfsigned from 'selfsigned';

export async function loadOrCreateCertificate(directory, lanAddresses) {
  const suffix = lanAddresses.join('_').replaceAll(/[^a-zA-Z0-9_.-]/g, '-');
  const keyPath = path.join(directory, `key-${suffix}.pem`);
  const certPath = path.join(directory, `cert-${suffix}.pem`);

  try {
    const [key, cert] = await Promise.all([readFile(keyPath), readFile(certPath)]);
    return { key, cert, der: new X509Certificate(cert).raw };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...lanAddresses.map((ip) => ({ type: 7, ip })),
  ];
  const generated = selfsigned.generate(
    [{ name: 'commonName', value: 'WLED Video Stream' }],
    {
      keySize: 2_048,
      days: 365,
      algorithm: 'sha256',
      extensions: [
        { name: 'basicConstraints', cA: true },
        { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true },
        { name: 'subjectAltName', altNames },
      ],
    },
  );

  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(keyPath, generated.private, { mode: 0o600 }),
    writeFile(certPath, generated.cert, { mode: 0o644 }),
  ]);
  return {
    key: Buffer.from(generated.private),
    cert: Buffer.from(generated.cert),
    der: new X509Certificate(generated.cert).raw,
  };
}
