'use strict';

// ─────────────────────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const LOBBY_COLORS = [
  '#00ffff','#ff00ff','#ffff00','#00ff88','#ff8844',
  '#8888ff','#ff4488','#44ffaa','#ff6666','#66aaff',
  '#aaff66','#ffaa44','#cc44ff','#44ffff','#ff44cc',
];

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
const publicGamesList  = $('public-games-list');
const publicGamesEmpty = $('public-games-empty');
const btnRefreshPublic = $('btn-refresh-public');
const visButtons       = Array.from(document.querySelectorAll('.vis-btn'));

// Lobby elements
const lobbyHeading   = $('lobby-heading');
const codeBlock      = $('code-block');
const roomCodeEl     = $('room-code');
const shareUrlEl     = $('share-url');
const playerListEl   = $('player-list');
const btnStart       = $('btn-start');
const btnLobbyBack   = $('btn-lobby-back');
const lobbyStatus    = $('lobby-status');
const difficultyBlock = $('difficulty-block');
const diffTabs        = Array.from(document.querySelectorAll('.diff-tab'));

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────

let socket             = null;
let myPlayerIndex      = null;
let isHost             = false;
let currentCode        = '';
let mode               = 'create';    // 'create' | 'join'
let responseTimer      = null;
let selectedDifficulty = 'medium';
let selectedVisibility = 'private';   // 'private' | 'public'

// Auto-join from URL param: ?room=XXXX
(function () {
  const params   = new URLSearchParams(location.search);
  const autoRoom = params.get('room');
  if (autoRoom) {
    inpCode.value = autoRoom.toUpperCase().slice(0, 4);
    setMode('join');
  }
})();

// ── Difficulty tab wiring ──────────────────────────────────────
diffTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    selectedDifficulty = btn.dataset.diff;
    diffTabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ── Visibility toggle wiring ───────────────────────────────────
visButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    selectedVisibility = btn.dataset.vis;
    visButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

// ── Public games list ──────────────────────────────────────────
function renderPublicGames(list) {
  if (!list || list.length === 0) {
    publicGamesEmpty.classList.remove('hidden');
    // remove any previous items
    Array.from(publicGamesList.querySelectorAll('.public-game-item')).forEach(el => el.remove());
    return;
  }
  publicGamesEmpty.classList.add('hidden');
  Array.from(publicGamesList.querySelectorAll('.public-game-item')).forEach(el => el.remove());
  list.forEach(g => {
    const row = document.createElement('div');
    row.className = 'public-game-item';
    row.innerHTML =
      `<span class="public-game-code">${g.code}</span>` +
      `<span class="public-game-info">${g.playerCount} player${g.playerCount !== 1 ? 's' : ''}` +
      ` · ${g.inProgress ? '▶ In progress' : 'In lobby'} · ${g.botDiff}</span>` +
      `<button class="public-game-join">JOIN</button>`;
    row.querySelector('.public-game-join').addEventListener('click', () => {
      doJoinPublic(g.code, g.inProgress);
    });
    publicGamesList.appendChild(row);
  });
}

function doJoinPublic(code, inProgress) {
  clearError();
  const name = inpName.value.trim() || 'Anonymous';
  setLoading(btnJoin, true, 'Join →');

  responseTimer = setTimeout(() => {
    setLoading(btnJoin, false, 'Join →');
    showError('Server did not respond.');
  }, 8000);

  connectSocket(() => {
    if (inProgress) {
      socket.emit('join_running_game', { name, roomCode: code });
    } else {
      inpCode.value = code;
      socket.emit('join_lobby', { name, roomCode: code });
    }
  });
}

if (btnRefreshPublic) {
  btnRefreshPublic.addEventListener('click', () => {
    connectSocket(() => socket.emit('get_public_rooms'));
  });
}

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
    // Request public rooms list when join tab is opened
    connectSocket(() => socket.emit('get_public_rooms'));
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
    socket.emit('create_lobby', { name, isPublic: selectedVisibility === 'public' });
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
  // Show all joined players + one empty waiting slot (if room not full)
  const showCount = Math.min(players.length + 1, 15);
  for (let i = 0; i < showCount; i++) {
    const p    = players.find(p => p.index === i);
    const col  = LOBBY_COLORS[i % LOBBY_COLORS.length];
    const slot = document.createElement('div');
    slot.className = `player-slot ${p ? 'joined' : 'empty'}`;
    const youTag = (p && p.index === myPlayerIndex)
      ? ' <span class="you-tag">(you)</span>' : '';
    slot.innerHTML =
      `<span class="slot-num" style="color:${p ? col : ''}">P${i + 1}</span>` +
      `<span class="slot-name" style="color:${p ? col : ''}">${p ? p.name : 'Waiting…'}</span>` +
      youTag;
    playerListEl.appendChild(slot);
  }
}

function updateStartButton(players) {
  const canStart = players.length >= 1 && isHost;
  btnStart.disabled = !canStart;

  if (!isHost)  lobbyStatus.textContent = 'Waiting for host to start…';
  else          lobbyStatus.textContent = players.length >= 2 ? 'Ready — hit Start!' : 'Solo mode — bots will fill the arena!';
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
  if (!btnStart.disabled) socket.emit('start_game', { difficulty: selectedDifficulty });
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
    difficultyBlock.classList.remove('hidden');   // host can pick difficulty

    // Generate and display share link
    const shareUrl = new URL(location.href);
    shareUrl.search = `?room=${roomCode}`;
    if (shareUrlEl) {
      shareUrlEl.textContent = shareUrl.toString();
      shareUrlEl.onclick = () => {
        const copy = () => { shareUrlEl.textContent = 'Copied!'; setTimeout(() => { shareUrlEl.textContent = shareUrl.toString(); }, 1400); };
        navigator.clipboard ? navigator.clipboard.writeText(shareUrl.toString()).then(copy).catch(copy) : copy();
      };
    }

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
    codeBlock.classList.add('hidden');
    difficultyBlock.classList.add('hidden');      // guests don't pick difficulty

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

  socket.on('public_rooms', (list) => {
    renderPublicGames(list);
  });

  socket.on('lobby_update', ({ players }) => {
    renderPlayerList(players);
    updateStartButton(players);
  });

  socket.on('game_start', ({ gameState, yourIndex, asteroids, difficulty }) => {
    myPlayerIndex = yourIndex;
    showScreen('game');
    initGame(socket, gameState, yourIndex, asteroids, difficulty);
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
