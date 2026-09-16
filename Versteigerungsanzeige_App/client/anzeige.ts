export {};

const state: { session: any; sessionKey: string | null; liveTimerId: number | null } = { session: null, sessionKey: null, liveTimerId: null };
const elements = {
  court: document.querySelector('#court') as HTMLDivElement,
  title: document.querySelector('#title') as HTMLDivElement,
  amount: document.querySelector('#amount') as HTMLDivElement,
  bidder: document.querySelector('#bidder') as HTMLDivElement,
  countdown: document.querySelector('#countdown') as HTMLDivElement,
  statusline: document.querySelector('#statusline') as HTMLDivElement,
  note: document.querySelector('#note') as HTMLDivElement,
  sessionKeyInput: document.querySelector('#sessionKeyInput') as HTMLInputElement,
  errorBox: document.querySelector('#errorBox') as HTMLDivElement,
  connectButton: document.querySelector('#connectButton') as HTMLButtonElement,
  connectAnother: document.querySelector('#connectAnother') as HTMLButtonElement,
  connectForm: document.querySelector('#connectForm') as HTMLDivElement,
};

function setError(message: string | null) {
  elements.errorBox.textContent = message ?? '';
  elements.errorBox.style.display = message ? 'block' : 'none';
}

function normalizeKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g)?.join('-') ?? value.toUpperCase();
}

function renderConnectedState(session: any) {
  state.session = session;
  if (state.liveTimerId !== null) {
    clearInterval(state.liveTimerId);
  }

  const updateDisplay = () => {
    const current = state.session;
    if (!current) return;
    elements.court.textContent = current.amtsgericht ?? 'Amtsgericht';
    elements.title.textContent = current.sitzungsbezeichnung ?? 'Sitzungsbezeichnung';
    elements.amount.textContent = current.highestBidText ?? 'Noch kein Gebot erfasst';
    elements.bidder.textContent = current.highestBidderName ? `Höchstbietend: ${current.highestBidderName}` : '';

    const preparedSeconds = Number(current.preparedDurationMinutes ?? 30) * 60;
    let remainingMs = preparedSeconds * 1000;
    if (current.timerStatus === 'running' && current.endAt) {
      remainingMs = Math.max(0, new Date(current.endAt).getTime() - Date.now());
      elements.statusline.textContent = 'Laufend';
    } else {
      elements.statusline.textContent = 'Noch nicht gestartet';
    }

    const totalSeconds = Math.ceil(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    elements.countdown.textContent = hours > 0 ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  updateDisplay();
  state.liveTimerId = window.setInterval(updateDisplay, 250);
  elements.connectForm.classList.add('hidden');
  elements.connectAnother.classList.remove('hidden');
}

async function connectBySessionKey(sessionKey: string) {
  if (!sessionKey.trim()) {
    setError('Bitte geben Sie einen gültigen Sitzungsschlüssel ein.');
    return;
  }
  try {
    const response = await fetch('/api/anzeige/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionKey })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Fehler beim Verbinden.');
    renderConnectedState(data);
    setError(null);
    state.sessionKey = sessionKey;
    sessionStorage.setItem('auction_session_key', sessionKey);
    if (window.history.replaceState) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  } catch (error) {
    setError((error as Error).message);
  }
}

function startBackgroundSync() {
  window.setInterval(async () => {
    if (!state.sessionKey) return;
    try {
      const response = await fetch('/api/anzeige/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey: state.sessionKey })
      });
      if (response.ok) {
        renderConnectedState(await response.json());
      }
    } catch {
      // The local timer continues while the server is temporarily unreachable.
    }
  }, 4000);
}

function readFragmentSessionKey() {
  const match = window.location.hash.match(/session=([^&]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

async function autoConnect() {
  const fragmentKey = readFragmentSessionKey();
  if (fragmentKey) {
    await connectBySessionKey(fragmentKey);
    if (window.history.replaceState && window.location.hash) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    return;
  }
  const stored = sessionStorage.getItem('auction_session_key');
  if (stored) {
    await connectBySessionKey(stored);
  }
}

function resetConnection() {
  sessionStorage.removeItem('auction_session_key');
  state.session = null;
  state.sessionKey = null;
  elements.connectForm.classList.remove('hidden');
  elements.connectAnother.classList.add('hidden');
  setError('');
  elements.sessionKeyInput.value = '';
}

elements.connectButton.addEventListener('click', () => connectBySessionKey(elements.sessionKeyInput.value));
elements.connectAnother.addEventListener('click', resetConnection);

document.addEventListener('DOMContentLoaded', async () => {
  await autoConnect();
  startBackgroundSync();
});
