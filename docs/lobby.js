'use strict';

// ─────────────────────────────────────────────────────────────
// DOM REFS
// ─────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

// Screens
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

// Menu
const inpName      = $('inp-name');
const btnCreate    = $('btn-create');
const btnShowJoin  = $('btn-show-join');
const createPanel  = $('create-panel');
const joinPanel    = $('join-panel');
const btnDoCreate  = $('btn-do-create');
const inpCode      = $('inp-code');
const btnJoin      = $('btn-join');
const menuError    = $('menu-error');

// Lobby
const lobbyHeading = $('lobby-heading');
const codeBlock    = $('code-block');
const roomCodeEl   = $('room-code');
const playerListEl = $('player-list');
const btnStart     = $('btn-start');
const btnLobbyBack = $('btn-lobby-back');
const lobbyStatus  = $('lobby-status');

// Game over
const goWinner     = $('go-winner');
const goScores     = $('go-scores');
const btnRematch   = $('btn-rematch');
const btnGoBack    = $('btn-go-back');
const rematchWait  = $('rematch-wait');

// ─────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────

let socket          = null;
let myPlayerIndex   = null;
let isHost          = false;
let currentCode     = '';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function showError(msg) {
  menuError.textContent = msg;
  menuError.classList.remove('hidden');
}
function clearError() {
  menuError.classList.add('hidden');
  menuError.textContent = '';
}

function connectSocket() {
  if (socket) return;
  // window.BACKEND_URL is set in config.js
  // Empty string / falsy = same-origin (local dev with `npm start`)
  socket = window.BACKEND_URL ? io(window.BACKEND_URL) : io();
  setupSocketHandlers();
}

function renderPlayerList(players) {
  playerListEl.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const p    = players.find(p => p.index === i);
    const slot = document.createElement('div');
    slot.className = `player-slot ${p ? (i === 0 ? 'p1' : 'p2') : 'empty'}`;
    slot.innerHTML =
      `<span class="slot-num">P${i + 1}</span>` +
      `<span class="slot-name">${p ? p.name : 'Waiting…'}</span>` +
      (p && p.index === myPlayerIndex ? ' <span style="font-size:.65rem;color:#606080">(you)</span>' : '');
    playerListEl.appendChild(slot);
  }
}

function updateStartButton(players) {
  const ready = players.length >= 2;
  btnStart.disabled = !ready || !isHost;
  lobbyStatus.textContent = ready
    ? (isHost ? 'Both players ready — you can start!' : 'Waiting for host to start…')
    : 'Waiting for opponent to join…';
}

// ─────────────────────────────────────────────────────────────
// MODE TOGGLE (create / join tabs)
// ─────────────────────────────────────────────────────────────

let mode = 'create';

function setMode(m) {
  mode = m;
  clearError();
  btnCreate.classList.toggle('active', m === 'create');
  btnShowJoin.classList.toggle('active', m === 'join');
  createPanel.classList.toggle('hidden', m !== 'create');
  joinPanel.classList.toggle('hidden', m !== 'join');
  if (m === 'join') inpCode.focus();
}

btnCreate.addEventListener('click', () => setMode('create'));
btnShowJoin.addEventListener('click', () => setMode('join'));

// ─────────────────────────────────────────────────────────────
// MENU EVENT LISTENERS
// ─────────────────────────────────────────────────────────────

btnDoCreate.addEventListener('click', doCreate);
btnJoin.addEventListener('click', doJoin);

// Enter key behaviour depends on active mode
inpName.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (mode === 'join') inpCode.focus();
  else doCreate();
});

inpCode.addEventListener('keydown', e => {
  if (e.key === 'Enter') doJoin();
  // Auto-uppercase
  setTimeout(() => { inpCode.value = inpCode.value.toUpperCase(); }, 0);
});

function doCreate() {
  clearError();
  const name = inpName.value.trim() || 'Anonymous';
  connectSocket();
  socket.emit('create_lobby', { name });
}

function doJoin() {
  clearError();
  const name = inpName.value.trim() || 'Anonymous';
  const code = inpCode.value.trim().toUpperCase();
  if (!code) { showError('Enter a room code first.'); return; }
  connectSocket();
  socket.emit('join_lobby', { name, roomCode: code });
}

// ─────────────────────────────────────────────────────────────
// LOBBY EVENT LISTENERS
// ─────────────────────────────────────────────────────────────

// Click room code to copy
roomCodeEl.addEventListener('click', () => {
  const prev = roomCodeEl.textContent;
  const copyText = currentCode;

  const finish = () => {
    roomCodeEl.textContent = 'COPIED!';
    setTimeout(() => { roomCodeEl.textContent = prev; }, 1400);
  };

  if (navigator.clipboard) {
    navigator.clipboard.writeText(copyText).then(finish).catch(finish);
  } else {
    const t = document.createElement('textarea');
    t.value = copyText;
    t.style.position = 'fixed';
    t.style.opacity  = '0';
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    document.body.removeChild(t);
    finish();
  }
});

btnStart.addEventListener('click', () => {
  if (!btnStart.disabled) socket.emit('start_game');
});

btnLobbyBack.addEventListener('click', () => {
  if (socket) { socket.emit('leave_room'); socket.disconnect(); socket = null; }
  showScreen('menu');
});

// ─────────────────────────────────────────────────────────────
// GAME OVER EVENT LISTENERS
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
    myPlayerIndex = playerIndex;
    currentCode   = roomCode;
    isHost        = false;

    lobbyHeading.textContent = `Room ${roomCode}`;
    codeBlock.classList.add('hidden');   // guest doesn't need to share

    renderPlayerList(players);
    updateStartButton(players);
    showScreen('lobby');
  });

  socket.on('lobby_error', ({ message }) => {
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
    // Stop the client render loop
    if (typeof stopGame === 'function') stopGame();

    // Winner headline
    const cls = winner === 0 ? 'p1-wins' : 'p2-wins';
    goWinner.textContent  = `${winnerName} wins!`;
    goWinner.className    = `winner-name ${cls}`;

    // Final scores
    goScores.innerHTML =
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
    $('disc-overlay').classList.remove('hidden');
    $('disc-overlay').classList.add('visible');
    $('btn-disc-back').addEventListener('click', () => {
      if (socket) { socket.disconnect(); socket = null; }
      location.reload();
    }, { once: true });
  });

  socket.on('disconnect', () => {
    // Server closed / network lost
    if (typeof stopGame === 'function') stopGame();
    alert('Connection lost. Please refresh and try again.');
    location.reload();
  });
}
