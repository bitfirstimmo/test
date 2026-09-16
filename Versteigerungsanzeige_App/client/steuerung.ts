export {};

const API_BASE = '/api';
const state: any = {
  session: null,
  connectionStatus: 'connected',
  liveTimerId: null as number | null
};

const elements = {
  errorBox: document.querySelector('#errorBox') as HTMLDivElement,
  createSessionForm: document.querySelector('#createSessionForm') as HTMLDivElement,
  sessionInfoBox: document.querySelector('#sessionInfoBox') as HTMLDivElement,
  activeSessionBox: document.querySelector('#activeSessionBox') as HTMLDivElement,
  amtsgericht: document.querySelector('#amtsgericht') as HTMLInputElement,
  sitzungsbezeichnung: document.querySelector('#sitzungsbezeichnung') as HTMLInputElement,
  licenseConfirm: document.querySelector('#licenseConfirm') as HTMLInputElement,
  createSessionButton: document.querySelector('#createSessionButton') as HTMLButtonElement,
  licenseLink: document.querySelector('#licenseLink') as HTMLAnchorElement,
  footerLicenseLink: document.querySelector('#footerLicenseLink') as HTMLAnchorElement,
  sessionStatus: document.querySelector('#sessionStatus') as HTMLSpanElement,
  sessionMetaText: document.querySelector('#sessionMetaText') as HTMLDivElement,
  publicLinkInput: document.querySelector('#publicLinkInput') as HTMLInputElement,
  sessionKeyDisplay: document.querySelector('#sessionKeyDisplay') as HTMLDivElement,
  openDisplayLink: document.querySelector('#openDisplayLink') as HTMLAnchorElement,
  qrImage: document.querySelector('#qrImage') as HTMLImageElement,
  qrDialog: document.querySelector('#qrDialog') as HTMLDivElement,
  qrDialogImage: document.querySelector('#qrDialogImage') as HTMLImageElement,
  qrZoomButton: document.querySelector('#qrZoomButton') as HTMLButtonElement,
  closeQrDialog: document.querySelector('#closeQrDialog') as HTMLButtonElement,
  copyLinkButton: document.querySelector('#copyLinkButton') as HTMLButtonElement,
  copyKeyButton: document.querySelector('#copyKeyButton') as HTMLButtonElement,
  currentBidLabel: document.querySelector('#currentBidLabel') as HTMLDivElement,
  bidderSelect: document.querySelector('#bidderSelect') as HTMLSelectElement,
  newBidderInput: document.querySelector('#newBidderInput') as HTMLInputElement,
  addBidderButton: document.querySelector('#addBidderButton') as HTMLButtonElement,
  newBidInput: document.querySelector('#newBidInput') as HTMLInputElement,
  submitBidButton: document.querySelector('#submitBidButton') as HTMLButtonElement,
  resetBidButton: document.querySelector('#resetBidButton') as HTMLButtonElement,
  durationInput: document.querySelector('#durationInput') as HTMLInputElement,
  startTimerButton: document.querySelector('#startTimerButton') as HTMLButtonElement,
  extendPlus1: document.querySelector('#extendPlus1') as HTMLButtonElement,
  extendPlus5: document.querySelector('#extendPlus5') as HTMLButtonElement,
  extendPlus10: document.querySelector('#extendPlus10') as HTMLButtonElement,
  resetTimerButton: document.querySelector('#resetTimerButton') as HTMLButtonElement,
  timerStatusText: document.querySelector('#timerStatusText') as HTMLDivElement,
  countdownText: document.querySelector('#countdownText') as HTMLDivElement,
  previewCourt: document.querySelector('#previewCourt') as HTMLDivElement,
  previewTitle: document.querySelector('#previewTitle') as HTMLDivElement,
  previewBid: document.querySelector('#previewBid') as HTMLDivElement,
  previewCountdown: document.querySelector('#previewCountdown') as HTMLDivElement,
  previewTimerStatus: document.querySelector('#previewTimerStatus') as HTMLDivElement,
  connectionStatus: document.querySelector('#connectionStatus') as HTMLDivElement,
  saveStatus: document.querySelector('#saveStatus') as HTMLDivElement,
  publicUrlText: document.querySelector('#publicUrlText') as HTMLDivElement,
  endSessionButton: document.querySelector('#endSessionButton') as HTMLButtonElement,
};

function setError(message: string | null) {
  elements.errorBox.textContent = message ?? '';
  elements.errorBox.style.display = message ? 'block' : 'none';
}

async function fetchJson(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error ?? 'Es ist ein Fehler aufgetreten.');
  }
  return data;
}

function groupSessionKey(key: string) {
  const cleaned = key.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return cleaned.match(/.{1,4}/g)?.join('-') ?? cleaned;
}

function formatSeconds(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const remainder = safe % 3600;
  const minutes = Math.floor(remainder / 60);
  const seconds = remainder % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimerDisplay(session: any) {
  const now = Date.now();
  let remainingMs = Number(session?.remainingMs ?? 0);
  if (session?.timerStatus === 'running' && session?.endAt) {
    remainingMs = Math.max(0, new Date(session.endAt).getTime() - now);
  } else if (session?.timerStatus !== 'running') {
    remainingMs = Number(session?.preparedDurationMinutes ?? 30) * 60 * 1000;
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const countdown = formatSeconds(totalSeconds);
  elements.countdownText.textContent = countdown;
  elements.previewCountdown.textContent = countdown;

  if (session?.timerStatus === 'running') {
    elements.timerStatusText.textContent = `Timerstatus: Laufend (${countdown})`;
    elements.previewTimerStatus.textContent = 'Laufend';
  } else if (session?.status === 'ended') {
    elements.timerStatusText.textContent = 'Timerstatus: Sitzung beendet';
    elements.previewTimerStatus.textContent = 'Sitzung beendet';
  } else {
    elements.timerStatusText.textContent = 'Timerstatus: Noch nicht gestartet';
    elements.previewTimerStatus.textContent = 'Noch nicht gestartet';
  }
}

function startLiveTimer() {
  if (state.liveTimerId !== null) {
    clearInterval(state.liveTimerId);
  }

  state.liveTimerId = window.setInterval(() => {
    if (!state.session) return;
    updateTimerDisplay(state.session);
  }, 250);
}

function renderSession(session: any) {
  state.session = session;
  const publicUrl = session?.publicUrl ?? '';
  const court = session?.amtsgericht ?? 'Amtsgericht';
  const title = session?.sitzungsbezeichnung ?? 'Keine Sitzungsbezeichnung';
  elements.previewCourt.textContent = court;
  elements.previewTitle.textContent = title;
  const bidderSuffix = session?.highestBidderName ? ` (${session.highestBidderName})` : '';
  elements.currentBidLabel.textContent = `Aktuelles Höchstgebot: ${session?.highestBidText ?? 'Noch kein Gebot erfasst'}${bidderSuffix}`;
  elements.previewBid.textContent = session?.highestBidText ?? 'Noch kein Gebot erfasst';
  elements.sessionStatus.textContent = session?.status === 'ended' ? 'Beendet' : 'Aktiv';
  elements.sessionMetaText.textContent = `${court || 'Amtsgericht'} • ${title || 'Keine Bezeichnung'}`;
  elements.publicLinkInput.value = publicUrl;
  elements.openDisplayLink.href = publicUrl;
  elements.publicUrlText.textContent = `Öffentliche Basisadresse: ${location.origin}`;
  elements.sessionKeyDisplay.textContent = groupSessionKey(session?.sessionKey ?? '');
  elements.durationInput.value = String(session?.preparedDurationMinutes ?? 30);
  const selectedBidder = session?.highestBidderName ?? elements.bidderSelect.value;
  elements.bidderSelect.replaceChildren(new Option('Kein Name ausgewählt', ''));
  for (const name of session?.bidders ?? []) {
    elements.bidderSelect.appendChild(new Option(name, name, false, name === selectedBidder));
  }
  elements.previewCountdown.textContent = formatSeconds((session?.preparedDurationMinutes ?? 30) * 60);
  updateTimerDisplay(session);
  elements.activeSessionBox.style.display = 'block';
  elements.createSessionForm.style.display = 'none';
  startLiveTimer();
}

async function loadConfig() {
  const config = await fetchJson('/api/config');
  const link = config.licenseEmail ? `mailto:${config.licenseEmail}` : '';
  elements.licenseLink.href = link;
  elements.footerLicenseLink.href = link;
  elements.licenseLink.textContent = config.licenseEmail ?? 'kontakt@example.de';
  elements.footerLicenseLink.textContent = config.licenseEmail ?? 'kontakt@example.de';
}

async function createSession() {
  if (!elements.licenseConfirm.checked) {
    setError('Bitte bestätigen Sie die Lizenzvorlage vor der Sitzungserstellung.');
    return;
  }
  try {
    const result = await fetchJson(`${API_BASE}/session`, {
      method: 'POST',
      body: JSON.stringify({
        amtsgericht: elements.amtsgericht.value,
        sitzungsbezeichnung: elements.sitzungsbezeichnung.value,
        confirmedLicense: true,
        licenseVersion: 'DE-2026-01'
      })
    });
    renderSession(result);
    setError('');
    elements.saveStatus.textContent = `Letzte erfolgreiche Speicherung: ${new Date().toLocaleTimeString('de-DE')}`;
    if (result.publicUrl) {
      const qrUrl = `${result.publicUrl}`;
      const qrResponse = await fetch(`/api/session/${result.id}/qr`);
      const blob = await qrResponse.blob();
      const qrData = URL.createObjectURL(blob);
      elements.qrImage.src = qrData;
      elements.qrDialogImage.src = qrData;
    }
  } catch (error) {
    setError((error as Error).message);
  }
}

async function refreshCurrentSession() {
  try {
    const session = await fetchJson(`${API_BASE}/session/current`);
    renderSession(session);
    state.connectionStatus = 'connected';
    elements.connectionStatus.textContent = 'Verbindungsstatus: Verbunden';
  } catch {
    state.connectionStatus = 'disconnected';
    elements.connectionStatus.textContent = 'Verbindungsstatus: Keine Verbindung zum Server';
  }
}

function startBackgroundSync() {
  window.setInterval(async () => {
    if (!state.session) return;
    try {
      const fresh = await fetchJson(`${API_BASE}/session/current`);
      renderSession(fresh);
      state.connectionStatus = 'connected';
      elements.connectionStatus.textContent = 'Verbindungsstatus: Verbunden';
    } catch {
      state.connectionStatus = 'disconnected';
      elements.connectionStatus.textContent = 'Verbindungsstatus: Keine Verbindung zum Server';
    }
  }, 4000);
}

async function saveBid() {
  const amount = elements.newBidInput.value.trim();
  if (!amount) {
    setError('Bitte geben Sie einen gültigen Eurobetrag ein.');
    return;
  }
  try {
    const result = await fetchJson(`${API_BASE}/session/current/bid`, {
      method: 'POST',
      body: JSON.stringify({ amount, bidderName: elements.bidderSelect.value, confirmLower: false })
    });
    renderSession(result);
    setError('');
  } catch (error) {
    setError((error as Error).message);
  }
}

async function addBidder() {
  const name = elements.newBidderInput.value.trim();
  if (!name) {
    setError('Bitte geben Sie einen Namen ein.');
    return;
  }
  try {
    const result = await fetchJson(`${API_BASE}/session/current/bidders`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
    elements.newBidderInput.value = '';
    renderSession(result);
    elements.bidderSelect.value = name;
    setError('');
  } catch (error) {
    setError((error as Error).message);
  }
}

async function startTimer() {
  try {
    const result = await fetchJson(`${API_BASE}/session/current/time/start`, { method: 'POST', body: JSON.stringify({}) });
    renderSession(result);
  } catch (error) {
    setError((error as Error).message);
  }
}

async function extendTimer(minutes: number) {
  try {
    const result = await fetchJson(`${API_BASE}/session/current/time/extend`, { method: 'POST', body: JSON.stringify({ minutes }) });
    renderSession(result);
  } catch (error) {
    setError((error as Error).message);
  }
}

async function resetTimer() {
  try {
    const result = await fetchJson(`${API_BASE}/session/current/time/reset`, { method: 'POST', body: JSON.stringify({}) });
    renderSession(result);
  } catch (error) {
    setError((error as Error).message);
  }
}

async function endSession() {
  try {
    const result = await fetchJson(`${API_BASE}/session/current/end`, { method: 'POST', body: JSON.stringify({}) });
    setError('');
    elements.activeSessionBox.style.display = 'none';
    elements.createSessionForm.style.display = 'block';
    elements.sessionInfoBox.innerHTML = '<p class="tiny">Sitzung beendet.</p>';
    elements.connectionStatus.textContent = `Verbindungsstatus: ${result.status === 'ended' ? 'Sitzung beendet' : 'Verbunden'}`;
  } catch (error) {
    setError((error as Error).message);
  }
}

async function copyText(value: string, successText: string) {
  try {
    await navigator.clipboard.writeText(value);
    setError(successText);
  } catch {
    setError('Bitte markieren und kopieren Sie den Link.');
  }
}

elements.createSessionButton.addEventListener('click', createSession);
elements.licenseConfirm.addEventListener('change', () => {
  elements.createSessionButton.disabled = !elements.licenseConfirm.checked;
});

elements.submitBidButton.addEventListener('click', saveBid);
elements.addBidderButton.addEventListener('click', addBidder);

elements.startTimerButton.addEventListener('click', startTimer);
elements.extendPlus1.addEventListener('click', () => extendTimer(1));
elements.extendPlus5.addEventListener('click', () => extendTimer(5));
elements.extendPlus10.addEventListener('click', () => extendTimer(10));

elements.resetTimerButton.addEventListener('click', resetTimer);
elements.endSessionButton.addEventListener('click', endSession);

elements.copyLinkButton.addEventListener('click', () => copyText(elements.publicLinkInput.value, 'Link kopiert'));
elements.copyKeyButton.addEventListener('click', () => copyText(elements.sessionKeyDisplay.textContent ?? '', 'Schlüssel kopiert'));
elements.qrZoomButton.addEventListener('click', () => {
  elements.qrDialog.classList.remove('sr-only');
  elements.qrDialog.setAttribute('aria-hidden', 'false');
});

elements.closeQrDialog.addEventListener('click', () => {
  elements.qrDialog.classList.add('sr-only');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    elements.qrDialog.classList.add('sr-only');
  }
});

window.addEventListener('load', async () => {
  await loadConfig();
  await refreshCurrentSession();
  startBackgroundSync();
});
