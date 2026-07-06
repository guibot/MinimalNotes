const note          = document.getElementById('note');
const status        = document.getElementById('status');
const pinBtn        = document.getElementById('pin-btn');
const tabbar        = document.getElementById('tabbar');
const tabbarActions = document.getElementById('tabbar-actions');
const addTabBtn     = document.getElementById('add-tab-btn');
const expandBtn     = document.getElementById('expand-btn');
const splitContainer = document.getElementById('split-container');

const MAX_TABS = 5;
const DEFAULT_COL_WIDTH = 260;
const MIN_COL_WIDTH = 80;

let notes = [''];
let activeTab = 0;
let debounceTimer = null;
let dirty = false;

let splitMode = false;
let colWidths = [];
const splitDebounce = {};

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
  const idx = activeTab;
  setStatus('saving');
  const t = timeStr();
  const content = note.value;
  const result = await window.api.writeNote(idx, content);
  if (result && result.ok === false) setStatus('error');
  else setStatus('saved', t);
  if (idx === activeTab && note.value === content) dirty = false;
}

async function saveIdx(idx, content) {
  await window.api.writeNote(idx, content);
}

function renderTabs() {
  tabbar.querySelectorAll('.tab').forEach((el) => el.remove());
  notes.forEach((_, idx) => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (idx === activeTab && !splitMode ? ' active' : '');
    const label = document.createElement('span');
    label.textContent = idx + 1;
    tab.appendChild(label);

    if (idx !== 0) {
      const close = document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '−';
      close.title = 'Close tab';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTab(idx);
      });
      tab.appendChild(close);
    }

    tab.addEventListener('click', () => switchTab(idx));
    tabbar.insertBefore(tab, tabbarActions);
  });

  addTabBtn.disabled = notes.length >= MAX_TABS;
}

async function switchTab(idx) {
  if (splitMode) {
    await exitSplitView();
  }
  if (idx === activeTab) return;
  clearTimeout(debounceTimer);
  if (dirty) await save();
  activeTab = idx;
  await window.api.setActiveTab(activeTab);
  note.value = notes[activeTab];
  dirty = false;
  renderTabs();
  note.focus();
  note.setSelectionRange(note.value.length, note.value.length);
}

async function addTab() {
  const result = await window.api.addTab();
  if (!result.ok) return;
  notes = result.notes;
  if (splitMode) {
    buildSplitView();
    renderTabs();
  } else {
    await switchTab(notes.length - 1);
  }
}

async function removeTab(idx) {
  if (idx === 0) return;
  const confirmed = window.confirm('Delete this tab? This cannot be undone.');
  if (!confirmed) return;
  const result = await window.api.removeTab(idx);
  if (!result.ok) return;
  notes = result.notes;
  if (activeTab >= notes.length) activeTab = notes.length - 1;
  else if (activeTab > idx) activeTab -= 1;
  await window.api.setActiveTab(activeTab);
  note.value = notes[activeTab];
  if (splitMode) buildSplitView();
  renderTabs();
}

note.addEventListener('input', () => {
  notes[activeTab] = note.value;
  dirty = true;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(save, 800);
});

// Flush pending changes synchronously so closing within the debounce
// window (or quitting the app) never loses the last edit.
window.addEventListener('beforeunload', () => {
  clearTimeout(debounceTimer);
  if (dirty) window.api.writeNoteSync(activeTab, note.value);
});

function buildSplitView() {
  splitContainer.innerHTML = '';
  notes.forEach((content, idx) => {
    const col = document.createElement('div');
    col.className = 'split-col';

    const isLast = idx === notes.length - 1;
    if (isLast) {
      col.style.flex = '1 1 0';
    } else {
      const w = colWidths[idx] || DEFAULT_COL_WIDTH;
      col.style.flex = `0 0 ${w}px`;
    }

    const ta = document.createElement('textarea');
    ta.placeholder = 'start typing…';
    ta.spellcheck = false;
    ta.value = content;
    ta.addEventListener('input', () => {
      notes[idx] = ta.value;
      clearTimeout(splitDebounce[idx]);
      splitDebounce[idx] = setTimeout(() => saveIdx(idx, ta.value), 800);
    });

    col.appendChild(ta);
    splitContainer.appendChild(col);

    if (!isLast) {
      const resizer = document.createElement('div');
      resizer.className = 'split-resizer';
      resizer.addEventListener('mousedown', (e) => startResize(e, idx, col));
      splitContainer.appendChild(resizer);
    }
  });
}

function startResize(e, idx, col) {
  e.preventDefault();
  const resizer = e.target;
  resizer.classList.add('dragging');
  const startX = e.clientX;
  const startWidth = col.getBoundingClientRect().width;

  function onMove(ev) {
    const newWidth = Math.max(MIN_COL_WIDTH, startWidth + (ev.clientX - startX));
    col.style.flex = `0 0 ${newWidth}px`;
  }

  function onUp() {
    resizer.classList.remove('dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    colWidths[idx] = col.getBoundingClientRect().width;
    window.api.setColumnWidths(colWidths);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

async function flushSplitView() {
  Object.keys(splitDebounce).forEach((idx) => clearTimeout(splitDebounce[idx]));
  const textareas = splitContainer.querySelectorAll('textarea');
  await Promise.all(Array.from(textareas).map((ta, idx) => saveIdx(idx, ta.value)));
}

async function enterSplitView() {
  clearTimeout(debounceTimer);
  if (dirty) await save();
  splitMode = true;
  await window.api.setSplitMode(true);
  note.style.display = 'none';
  splitContainer.style.display = 'flex';
  expandBtn.classList.add('active');
  buildSplitView();
  renderTabs();
}

async function exitSplitView() {
  await flushSplitView();
  splitMode = false;
  await window.api.setSplitMode(false);
  splitContainer.style.display = 'none';
  note.style.display = '';
  expandBtn.classList.remove('active');
  note.value = notes[activeTab];
  renderTabs();
}

expandBtn.addEventListener('click', async () => {
  if (splitMode) await exitSplitView();
  else await enterSplitView();
});

// Init
(async () => {
  const result = await window.api.readNotes();
  notes = result.notes;
  activeTab = result.activeTab;
  colWidths = await window.api.getColumnWidths();

  note.value = notes[activeTab];
  note.focus();
  note.setSelectionRange(note.value.length, note.value.length);

  const savedSplitMode = await window.api.getSplitMode();
  if (savedSplitMode && notes.length > 1) {
    await enterSplitView();
  } else {
    renderTabs();
  }

  const pinned = await window.api.getAlwaysOnTop();
  pinBtn.classList.toggle('active', pinned);
})();

pinBtn.addEventListener('click', async () => {
  const pinned = await window.api.toggleAlwaysOnTop();
  pinBtn.classList.toggle('active', pinned);
});

addTabBtn.addEventListener('click', addTab);

document.getElementById('min-btn').addEventListener('click', () => window.api.minimize());
document.getElementById('max-btn').addEventListener('click', () => window.api.maximize());
document.getElementById('close-btn').addEventListener('click', () => window.api.close());
