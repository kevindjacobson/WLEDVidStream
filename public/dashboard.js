const elements = {
  address: document.querySelector('#network-address'),
  qr: document.querySelector('#pair-qr'),
  form: document.querySelector('#wled-form'),
  host: document.querySelector('#wled-host'),
  result: document.querySelector('#wled-result'),
  overall: document.querySelector('#overall-status'),
  phoneDot: document.querySelector('#phone-dot'),
  phoneLabel: document.querySelector('#phone-label'),
  wledDot: document.querySelector('#wled-dot'),
  wledLabel: document.querySelector('#wled-label'),
  frameCount: document.querySelector('#frame-count'),
  matrixSize: document.querySelector('#matrix-size'),
};

function setChip(kind, text) {
  elements.overall.dataset.kind = kind;
  elements.overall.lastChild.textContent = ` ${text}`;
}

function renderStatus(status) {
  elements.phoneDot.classList.toggle('connected', status.phoneConnected);
  elements.phoneLabel.textContent = status.phoneConnected ? 'Camera connected' : 'Not paired';
  elements.wledDot.classList.toggle('connected', Boolean(status.wled));
  elements.wledLabel.textContent = status.wled ? status.wled.name : 'Not configured';
  elements.frameCount.textContent = Number(status.framesSent ?? 0).toLocaleString();
  elements.matrixSize.textContent = status.wled
    ? `${status.wled.matrix.width}×${status.wled.matrix.height}`
    : '—';

  const loopSeconds = ((status.loop?.durationMs ?? 0) / 1_000).toFixed(1);
  if (status.lastError) setChip('error', status.lastError);
  else if (status.loop?.mode === 'playing') setChip('live', `Looping ${loopSeconds}s segment`);
  else if (status.loop?.mode === 'recording') setChip('live', `Recording loop · ${loopSeconds}s`);
  else if (status.phoneConnected && status.wled) setChip('live', 'Streaming live');
  else if (status.wled) setChip('ready', 'Scan the QR code');
  else setChip('waiting', 'Connect your WLED');
}

async function loadBootstrap() {
  const response = await fetch('/api/bootstrap');
  if (!response.ok) throw new Error('Could not load pairing details');
  const bootstrap = await response.json();

  for (const phoneUrl of bootstrap.phoneUrls) {
    const url = new URL(phoneUrl);
    const option = new Option(url.hostname, url.hostname);
    elements.address.add(option);
  }
  updateQr();
  renderStatus(bootstrap.status);

  const savedHost = localStorage.getItem('wled-host');
  if (savedHost) {
    elements.host.value = savedHost;
    await configureWled(savedHost, false);
  }
}

function updateQr() {
  const address = elements.address.value;
  elements.qr.src = `/pair.svg?address=${encodeURIComponent(address)}`;
}

async function configureWled(host, announce = true) {
  elements.result.className = 'form-note pending';
  elements.result.textContent = `Checking ${host}…`;
  const response = await fetch('/api/wled', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ host }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);

  localStorage.setItem('wled-host', result.host);
  elements.host.value = result.host;
  elements.result.className = 'form-note success';
  const mappingLabel = result.mappingMode === 'legacy-always'
    ? 'legacy mapping active'
    : 'LED maps respected';
  elements.result.textContent = `Connected to ${result.name} · ${result.matrix.width}×${result.matrix.height} logical matrix · ${mappingLabel} · WLED ${result.version}`;
  if (announce) setChip('ready', 'WLED connected — scan QR');
}

elements.address.addEventListener('change', updateQr);
elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await configureWled(elements.host.value.trim());
  } catch (error) {
    elements.result.className = 'form-note error';
    elements.result.textContent = error.message;
    setChip('error', 'Could not connect to WLED');
  }
});

loadBootstrap().catch((error) => setChip('error', error.message));
setInterval(async () => {
  try {
    const response = await fetch('/api/status');
    if (response.ok) renderStatus(await response.json());
  } catch {
    setChip('error', 'Server disconnected');
  }
}, 1_000);
