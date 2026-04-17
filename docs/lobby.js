'use strict';

// ─────────────────────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const screens = {
  menu:     $('screen-menu'),
  lobby:    $('screen-lobby'),
  game:     $('screen-game'),
  gameover: $('screen-gameover')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// Menu elements
const inpName      = $('inp-name');
const btnCreate    = $('btn-create');    // tab button
const btnShowJoin  = $('btn-show-join'); // tab button
const createPanel  = $('create-panel');
const joinPanel    = $('join-panel');
const btnDoCreate  = $('btn-do-create');
const inpCode      = $('inp-code');
const btnJoin      = $('btn-join');
const menuError    = $('menu-error');

// Lobby elements
const lobbyHeading = $('lobby-heading');
const codeBlock    = $('code-block');
const roomCodeEl   = $('room-code');
const playerListEl = $('player-list');
const btnStart     = $('btn-start');
const btnLobbyBack = $('btn-lobby-back');
const lobbyStatus  = $('lobby-status');

// Game over elements
const goWinner    = $('go-winner');
const goScores    = $('go-scores');
const btnRematch  = $('btn-rematch');
const btnGoBack   = $('btn-go-back');
const rematchWait = $('rematch-wait');

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────

let socket        = null;
let myPlayerIndex = null;
let isHost        = false;
let currentCode   = '';
let mode          = 'create';    // 'create' | 'join'
let responseTimer = null;        // timeout if server never replies

// ─────────────────────────────────────────────────────────────
// ERROR / STATUS HELPERS
// ─────────────────────────────────────────────────────────────

function showError(msg) {
  menuError.textContent = msg;
  menuError.classList.remove('hidden');
}
function clearError() {
  menuError.textContent = '';
  menuError.classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────
// BUTTON LOADING STATE
// ─────────────────────────────────────────────────────────────

function setLoading(btn, loading, label) {
  btn.disabled   = loading;
  btn.textContent = loading ? 'Connecting…' : label;
}

// ─────────────────────────────────────────────────────────────
// MODE TABS (Create / Join)
// ─────────────────────────────────────────────────────────────

function setMode(m) {
  mode = m;
  clearError();

  // Update tab active states
  btnCreate.classList.toggle('active',   m === 'create');
  btnShowJoin.classList.toggle('active', m === 'join');

  // Show/hide panels
  if (m === 'create') {
    createPanel.classList.remove('hidden');
    joinPanel.classList.add('hidden');
  } else {
    joinPanel.classList.remove('hidden');
    createPanel.classList.add('hidden');
    inpCode.focus();
  }

  // Reset button labels when switching
  setLoading(btnDoCreate, false, 'Create →');
  setLoading(btnJoin,     false, 'Join →');
}

// Wire up tabs
btnCreate.addEventListener('click',   () => setMode('create'));
btnShowJoin.addEventListener('click', () => setMode('join'));

// ─────────────────────────────────────────────────────────────
// SOCKET
// ─────────────────────────────────────────────────────────────

function connectSocket(onReady) {
  // On GitHub Pages (not localhost) BACKEND_URL must be set
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!isLocal && !window.BACKEND_URL) {
    clearTimeout(responseTimer);
    setLoading(btnDoCreate, false, 'Create →');
    setLoading(btnJoin,     false, 'Join →');
    showError('Paste your Railway URL into docs/config.js then redeploy. See DEPLOYMENT.md.');
    return;
  }

  // Already connected — go straight to the action
  if (socket && socket.connected) { onReady(); return; }

  // Disconnect any stale socket first
  if (socket) { socket.disconnect(); socket = null; }

  socket = window.BACKEND_URL ? io(window.BACKEND_URL) : io();
  setupSocketHandlers();

  socket.once('connect', onReady);

  socket.once('connect_error', () => {
    clearTimeout(responseTimer);
    socket = null;
    setLoading(btnDoCreate, false, 'Create →');
    setLoading(btnJoin,     false, 'Join →');
    showError('Cannot reach server. Make sure BACKEND_URL is set in config.js.');
  });
}

// ─────────────────────────────────────────────────────────────
// MENU ACTIONS
// ─────────────────────────────────────────────────────────────

btnDoCreate.addEventListener('click', doCreate);
btnJoin.addEventListener('click', doJoin);

// Enter key: create if on create panel, focus code if on join panel
inpName.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  mode === 'join' ? inpCode.focus() : doCreate();
});
// Enter on code input triggers join
inpCode.addEventListener('keydown', e => {
  if (e.key === 'Enter') doJoin();
  // Auto-uppercase as you type
  setTimeout(() => { inpCode.value = inpCode.value.toUpperCase(); }, 0);
});

function doCreate() {
  clearError();
  const name = inpName.value.trim() || 'Anonymous';
  setLoading(btnDoCreate, true, 'Create →');

  // 8-second timeout in case server never replies
  responseTimer = setTimeout(() => {
    setLoading(btnDoCreate, false, 'Create →');
    showError('Server did not respond. Check your connection.');
  }, 8000);

  connectSocket(() => {
    socket.emit('create_lobby', { name });
  });
}

function doJoin() {
  clearError();
  const name = inpName.value.trim() || 'Anonymous';
  const code = inpCode.value.trim().toUpperCase();
  if (!code) { showError('Enter a room code first.'); return; }

  setLoading(btnJoin, true, 'Join →');

  responseTimer = setTimeout(() => {
    setLoading(btnJoin, false, 'Join →');
    showError('Server did not respond. Check your connection.');
  }, 8000);

  connectSocket(() => {
    socket.emit('join_lobby', { name, roomCode: code });
  });
}

// ─────────────────────────────────────────────────────────────
// LOBBY HELPERS
// ─────────────────────────────────────────────────────────────

function renderPlayerList(players) {
  playerListEl.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const p    = players.find(p => p.index === i);
    const slot = document.createElement('div');
    slot.className = `player-slot ${p ? (i === 0 ? 'p1' : 'p2') : 'empty'}`;
    const youTag = (p && p.index === myPlayerIndex)
      ? ' <span class="you-tag">(you)</span>' : '';
    slot.innerHTML =
      `<span class="slot-num">P${i + 1}</span>` +
      `<span class="slot-name">${p ? p.name : 'Waiting…'}</span>` +
      youTag;
    playerListEl.appendChild(slot);
  }
}

function updateStartButton(players) {
  const ready   = players.length >= 2;
  const canStart = ready && isHost;
  btnStart.disabled = !canStart;

  if (!ready)        lobbyStatus.textContent = 'Waiting for opponent to join…';
  else if (!isHost)  lobbyStatus.textContent = 'Waiting for host to start…';
  else               lobbyStatus.textContent = 'Both players ready — hit Start!';
}

// ─────────────────────────────────────────────────────────────
// LOBBY ACTIONS
// ─────────────────────────────────────────────────────────────

// Click room code to copy it
roomCodeEl.addEventListener('click', () => {
  const prev = roomCodeEl.textContent;
  const copy = () => {
    roomCodeEl.textContent = 'COPIED!';
    setTimeout(() => { roomCodeEl.textContent = prev; }, 1400);
  };
  if (navigator.clipboard) {
    navigator.clipboard.writeText(currentCode).then(copy).catch(copy);
  } else {
    const t = Object.assign(document.createElement('textarea'),
      { value: currentCode, style: 'position:fixed;opacity:0' });
    document.body.appendChild(t); t.select();
    document.execCommand('copy');
    document.body.removeChild(t); copy();
  }
});

btnStart.addEventListener('click', () => {
  if (!btnStart.disabled) socket.emit('start_game');
});

btnLobbyBack.addEventListener('click', () => {
  clearTimeout(responseTimer);
  if (socket) { socket.emit('leave_room'); socket.disconnect(); socket = null; }
  setMode('create');   // reset tabs for next time
  setLoading(btnDoCreate, false, 'Create →');
  setLoading(btnJoin,     false, 'Join →');
  showScreen('menu');
});

// ─────────────────────────────────────────────────────────────
// GAME OVER ACTIONS
// ─────────────────────────────────────────────────────────────

btnRematch.addEventListener('click', () => {
  btnRematch.disabled = true;
  rematchWait.classList.remove('hidden');
  socket.emit('rematch_vote');
});

btnGoBack.addEventListener('click', () => {
  if (socket) { socket.emit('leave_room'); socket.disconnect(); socket = null; }
  location.reload();
});

// ─────────────────────────────────────────────────────────────
// SOCKET HANDLERS
// ─────────────────────────────────────────────────────────────

function setupSocketHandlers() {

  socket.on('lobby_created', ({ roomCode, playerIndex, players }) => {
    clearTimeout(responseTimer);
    setLoading(btnDoCreate, false, 'Create →');
    myPlayerIndex = playerIndex;
    currentCode   = roomCode;
    isHost        = true;

    lobbyHeading.textContent = 'Your game room';
    codeBlock.classList.remove('hidden');
    roomCodeEl.textContent = roomCode;

    renderPlayerList(players);
    updateStartButton(players);
    showScreen('lobby');
  });

  socket.on('lobby_joined', ({ roomCode, playerIndex, players }) => {
    clearTimeout(responseTimer);
    setLoading(btnJoin, false, 'Join →');
    myPlayerIndex = playerIndex;
    currentCode   = roomCode;
    isHost        = false;

    lobbyHeading.textContent = `Room ${roomCode}`;
    codeBlock.classList.add('hidden');   // guest doesn't need to share code

    renderPlayerList(players);
    updateStartButton(players);
    showScreen('lobby');
  });

  socket.on('lobby_error', ({ message }) => {
    clearTimeout(responseTimer);
    setLoading(btnDoCreate, false, 'Create →');
    setLoading(btnJoin,     false, 'Join →');
    showError(message);
  });

  socket.on('lobby_update', ({ players }) => {
    renderPlayerList(players);
    updateStartButton(players);
  });

  socket.on('game_start', ({ gameState, yourIndex }) => {
    myPlayerIndex = yourIndex;
    showScreen('game');
    initGame(socket, gameState, yourIndex);
  });

  socket.on('game_over', ({ winner, winnerName, playerNames, scores }) => {
    if (typeof stopGame === 'function') stopGame();
    const cls = winner === 0 ? 'p1-wins' : 'p2-wins';
    goWinner.textContent = `${winnerName} wins!`;
    goWinner.className   = `winner-name ${cls}`;
    goScores.innerHTML   =
      `<span class="sp1">${playerNames[0]}: ${scores[0]}</span>` +
      `<span class="sdiv">vs</span>` +
      `<span class="sp2">${playerNames[1]}: ${scores[1]}</span>`;
    btnRematch.disabled = false;
    rematchWait.classList.add('hidden');
    showScreen('gameover');
  });

  socket.on('rematch_ready', ({ votes }) => {
    rematchWait.textContent = `Waiting for opponent… (${votes}/2 ready)`;
    rematchWait.classList.remove('hidden');
  });

  socket.on('rematch_start', ({ gameState, yourIndex }) => {
    myPlayerIndex = yourIndex;
    btnRematch.disabled = false;
    rematchWait.classList.add('hidden');
    showScreen('game');
    initGame(socket, gameState, yourIndex);
  });

  socket.on('player_disconnected', ({ name }) => {
    if (typeof stopGame === 'function') stopGame();
    $('disc-msg').textContent = `${name} disconnected.`;
    const overlay = $('disc-overlay');
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
    $('btn-disc-back').addEventListener('click', () => {
      if (socket) { socket.disconnect(); socket = null; }
      location.reload();
    }, { once: true });
  });

  socket.on('disconnect', (reason) => {
    // Only show alert if we were actively in a game/lobby (not intentional leave)
    if (reason !== 'io client disconnect') {
      if (typeof stopGame === 'function') stopGame();
      showScreen('menu');
      showError('Disconnected from server. Please try again.');
      socket = null;
    }
  });
}
