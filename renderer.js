const note   = document.getElementById('note');
const status = document.getElementById('status');
const pinBtn = document.getElementById('pin-btn');

let debounceTimer = null;
let dirty = false;

function pad(n) { return String(n).padStart(2, '0'); }
function timeStr() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setStatus(state, time) {
  status.className = state;
  if (state === 'saving') status.textContent = 'saving…';
  else if (state === 'saved') status.textContent = `saved ${time}`;
  else if (state === 'error') status.textContent = 'error saving';
  else status.textContent = '';
}

async function save() {
  setStatus('saving');
  const t = timeStr();
  const content = note.value;
  const result = await window.api.writeNote(content);
  if (result && result.ok === false) setStatus('error');
  else setStatus('saved', t);
  // Only clear dirty if nothing was typed while the write was in flight
  if (note.value === content) dirty = false;
}

note.addEventListener('input', () => {
  dirty = true;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(save, 800);
});

// Flush pending changes synchronously so closing within the debounce
// window (or quitting the app) never loses the last edit.
window.addEventListener('beforeunload', () => {
  clearTimeout(debounceTimer);
  if (dirty) window.api.writeNoteSync(note.value);
});

// Init
(async () => {
  const content = await window.api.readNote();
  note.value = content;
  note.focus();
  note.setSelectionRange(note.value.length, note.value.length);

  const pinned = await window.api.getAlwaysOnTop();
  pinBtn.classList.toggle('active', pinned);
})();

pinBtn.addEventListener('click', async () => {
  const pinned = await window.api.toggleAlwaysOnTop();
  pinBtn.classList.toggle('active', pinned);
});

document.getElementById('min-btn').addEventListener('click', () => window.api.minimize());
document.getElementById('max-btn').addEventListener('click', () => window.api.maximize());
document.getElementById('close-btn').addEventListener('click', () => window.api.close());
