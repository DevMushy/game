"use strict";

const CONFIG = {
  columns: 15,
  rows: 15,
  tileSize: 30,
  playerSpeed: 7.0,
  enemySpeed: 4.05,
  extraConnections: 58,
  roomInteriorSize: 5,
  colors: {
    black: "#000000",
    white: "#ffffff",
  },
  playerSprite: {
    src: "assets/player_bite_spritesheet_clean_bw.png",
    frameWidth: 320,
    frameHeight: 240,
    frameCount: 12,
    frameDuration: 55,
  },
  megaSprite: {
    src: "assets/mega_denture_user_rotation.png",
    frameWidth: 360,
    frameHeight: 260,
    columns: 18,
    rows: 1,
    frameCount: 18,
    frameDuration: 86,
    duration: 5600,
  },
};

const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const scoreElement = document.querySelector("#score");
const pelletsElement = document.querySelector("#pellets");
const bestScoreElement = document.querySelector("#best-score");
const objectiveLabel = document.querySelector("#objective-label");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlay-title");
const overlayText = document.querySelector("#overlay-text");
const startButton = document.querySelector("#start-button");
const newMapButton = document.querySelector("#new-map-button");
//const testMegaButton = document.querySelector("#test-mega-button");
const audioToggle = document.querySelector("#audio-toggle");
const controlHint = document.querySelector("#control-hint");

const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
const inputState = {
  touchEnabled: coarsePointerQuery.matches || navigator.maxTouchPoints > 0,
  pointerId: null,
  lastX: 0,
  lastY: 0,
};

const directions = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const reverseDirection = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

const keyMap = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

const state = {
  map: [],
  pellets: new Set(),
  particles: [],
  score: 0,
  bestScore: readBestScore(),
  running: false,
  paused: false,
  won: false,
  lost: false,
  phase: "collect",
  centerRoom: null,
  centerGateOpen: false,
  itemCollected: false,
  exitDoor: null,
  lastTime: 0,
  playerImage: null,
  megaImage: null,
  player: {
    tileX: 1,
    tileY: 1,
    x: 1,
    y: 1,
    direction: "right",
    queuedDirection: "right",
    facing: 1,
    moving: false,
  },
  enemy: {
    tileX: 0,
    tileY: 0,
    x: 0,
    y: 0,
    direction: "left",
    facing: -1,
    moving: false,
  },
  mega: {
    active: false,
    preview: false,
    startedAt: 0,
    previousRunning: false,
    previousOverlay: null,
  },
  audio: {
    enabled: true,
    context: null,
  },
};

initializeUi();

function initializeUi() {
  document.title = "Denture Maze";
  updateAudioButton();
}

function readBestScore() {
  try {
    return Number.parseInt(localStorage.getItem("dentureMazeBest") || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function saveBestScore(value) {
  try {
    localStorage.setItem("dentureMazeBest", String(value));
  } catch {
    // Il gioco continua normalmente anche quando lo storage non è disponibile.
  }
}

function updateBestScore() {
  if (state.score <= state.bestScore) return;
  state.bestScore = state.score;
  saveBestScore(state.bestScore);
}

function getObjectiveText() {
  if (state.won) return "Livello completato";
  if (state.lost) return "Lo spazzolino ti ha preso";
  if (state.mega.active || state.phase === "mega") return "Trasformazione in corso";
  if (state.phase === "item") return "Entra nella stanza e prendi il sigillo";
  if (state.phase === "escape") return "Raggiungi la porta aperta";
  return "TMordi tutto tranne lo spazzolino!";
}

function ensureAudioContext() {
  if (!state.audio.enabled) return null;
  if (!state.audio.context) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    state.audio.context = new AudioContextClass();
  }
  if (state.audio.context.state === "suspended") {
    state.audio.context.resume().catch(() => {});
  }
  return state.audio.context;
}

function playTone(frequency, duration = 0.08, volume = 0.035, delay = 0, type = "square") {
  const audioContext = ensureAudioContext();
  if (!audioContext) return;

  const start = audioContext.currentTime + delay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0002), start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playPelletSound() {
  playTone(760, 0.055, 0.022, 0, "square");
  playTone(1040, 0.045, 0.014, 0.035, "square");
}

function playUnlockSound() {
  [330, 440, 660, 880].forEach((frequency, index) => {
    playTone(frequency, 0.16, 0.035, index * 0.08, "square");
  });
}

function playTransformationSound() {
  [196, 247, 330, 494, 659].forEach((frequency, index) => {
    playTone(frequency, 0.38, 0.04, index * 0.11, index % 2 === 0 ? "sawtooth" : "square");
  });
}

function playCaughtSound() {
  playTone(180, 0.32, 0.055, 0, "sawtooth");
  playTone(110, 0.42, 0.05, 0.12, "square");
}

function updateAudioButton() {
  if (!audioToggle) return;
  audioToggle.textContent = `Audio: ${state.audio.enabled ? "ON" : "OFF"}`;
  audioToggle.setAttribute("aria-pressed", String(state.audio.enabled));
}

function setupCanvas() {
  const cssWidth = CONFIG.columns * CONFIG.tileSize;
  const cssHeight = CONFIG.rows * CONFIG.tileSize;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.floor(cssWidth * pixelRatio);
  canvas.height = Math.floor(cssHeight * pixelRatio);
  canvas.style.aspectRatio = `${cssWidth} / ${cssHeight}`;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.imageSmoothingEnabled = false;
}

function createFilledGrid(width, height, value) {
  return Array.from({ length: height }, () => Array(width).fill(value));
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function tileKey(x, y) {
  return `${x},${y}`;
}

function computeCenterRoom() {
  const size = CONFIG.roomInteriorSize;
  const left = Math.floor((CONFIG.columns - size) / 2);
  const top = Math.floor((CONFIG.rows - size) / 2);
  return {
    left,
    top,
    right: left + size - 1,
    bottom: top + size - 1,
    centerX: left + Math.floor(size / 2),
    centerY: top + Math.floor(size / 2),
    outerLeft: left - 1,
    outerTop: top - 1,
    outerRight: left + size,
    outerBottom: top + size,
    gateX: left + Math.floor(size / 2),
    gateY: top + size,
  };
}

function isInsideRoomInterior(x, y) {
  const room = state.centerRoom;
  return !!room && x >= room.left && x <= room.right && y >= room.top && y <= room.bottom;
}

function isInsideRoomOuter(x, y) {
  const room = state.centerRoom;
  return !!room && x >= room.outerLeft && x <= room.outerRight && y >= room.outerTop && y <= room.outerBottom;
}

function generateMaze() {
  state.centerRoom = computeCenterRoom();
  const map = createFilledGrid(CONFIG.columns, CONFIG.rows, 1);
  const stack = [{ x: 1, y: 1 }];
  map[1][1] = 0;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const candidates = shuffle([
      { x: current.x + 2, y: current.y, wallX: current.x + 1, wallY: current.y },
      { x: current.x - 2, y: current.y, wallX: current.x - 1, wallY: current.y },
      { x: current.x, y: current.y + 2, wallX: current.x, wallY: current.y + 1 },
      { x: current.x, y: current.y - 2, wallX: current.x, wallY: current.y - 1 },
    ]).filter(({ x, y, wallX, wallY }) => {
      return (
        x > 0 &&
        y > 0 &&
        x < CONFIG.columns - 1 &&
        y < CONFIG.rows - 1 &&
        map[y][x] === 1 &&
        !isInsideRoomOuter(x, y) &&
        !isInsideRoomOuter(wallX, wallY)
      );
    });

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }

    const next = candidates[0];
    map[next.wallY][next.wallX] = 0;
    map[next.y][next.x] = 0;
    stack.push({ x: next.x, y: next.y });
  }

  addExtraConnections(map);
  smoothMaze(map);
  carveSpawn(map);
  buildCenterRoom(map);
  return map;
}

function addExtraConnections(map) {
  const walls = [];

  for (let y = 1; y < CONFIG.rows - 1; y += 1) {
    for (let x = 1; x < CONFIG.columns - 1; x += 1) {
      if (map[y][x] !== 1 || isInsideRoomOuter(x, y)) continue;
      const horizontal = map[y][x - 1] === 0 && map[y][x + 1] === 0;
      const vertical = map[y - 1][x] === 0 && map[y + 1][x] === 0;
      if (horizontal || vertical) walls.push({ x, y });
    }
  }

  shuffle(walls)
    .slice(0, CONFIG.extraConnections)
    .forEach(({ x, y }) => {
      map[y][x] = 0;
    });
}

function smoothMaze(map) {
  for (let pass = 0; pass < 2; pass += 1) {
    const toOpen = [];

    for (let y = 1; y < CONFIG.rows - 1; y += 1) {
      for (let x = 1; x < CONFIG.columns - 1; x += 1) {
        if (map[y][x] !== 0 || isInsideRoomOuter(x, y)) continue;
        const available = getMapNeighborDirections(map, x, y, false);
        if (available.length > 1) continue;

        const walls = [];
        for (const d of Object.values(directions)) {
          const nx = x + d.x;
          const ny = y + d.y;
          if (map[ny]?.[nx] === 1 && !isInsideRoomOuter(nx, ny)) {
            walls.push({ x: nx, y: ny });
          }
        }

        if (walls.length > 0) {
          toOpen.push(walls[Math.floor(Math.random() * walls.length)]);
        }
      }
    }

    toOpen.forEach(({ x, y }) => {
      map[y][x] = 0;
    });
  }
}

function carveSpawn(map) {
  [
    [1, 1],
    [2, 1],
    [1, 2],
    [2, 2],
    [3, 1],
    [1, 3],
    [3, 2],
    [2, 3],
  ].forEach(([x, y]) => {
    map[y][x] = 0;
  });
}

function buildCenterRoom(map) {
  const room = state.centerRoom;

  for (let y = room.outerTop; y <= room.outerBottom; y += 1) {
    for (let x = room.outerLeft; x <= room.outerRight; x += 1) {
      const border =
        x === room.outerLeft ||
        x === room.outerRight ||
        y === room.outerTop ||
        y === room.outerBottom;
      map[y][x] = border ? 1 : 0;
    }
  }

  map[room.gateY][room.gateX] = 1;

  let y = room.gateY + 1;
  while (y < CONFIG.rows - 1) {
    const touchesExistingCorridor =
      map[y][room.gateX] === 0 ||
      map[y][room.gateX - 1] === 0 ||
      map[y][room.gateX + 1] === 0;

    map[y][room.gateX] = 0;
    if (touchesExistingCorridor) break;
    y += 1;
  }

  if (y >= CONFIG.rows - 1) {
    map[CONFIG.rows - 2][room.gateX] = 0;
    map[CONFIG.rows - 2][room.gateX - 1] = 0;
  }
}

function getMapNeighborDirections(map, x, y, includeRoom = true) {
  const available = [];

  for (const [name, d] of Object.entries(directions)) {
    const nx = x + d.x;
    const ny = y + d.y;
    if (ny < 0 || nx < 0 || ny >= CONFIG.rows || nx >= CONFIG.columns) continue;
    if (map[ny][nx] !== 0) continue;
    if (!includeRoom && isInsideRoomOuter(nx, ny)) continue;
    available.push(name);
  }

  return available;
}

function createExitDoor() {
  const candidates = [];

  for (let x = 1; x < CONFIG.columns - 1; x += 1) {
    if (state.map[1][x] === 0) candidates.push({ x, y: 0 });
    if (state.map[CONFIG.rows - 2][x] === 0) candidates.push({ x, y: CONFIG.rows - 1 });
  }

  for (let y = 1; y < CONFIG.rows - 1; y += 1) {
    if (state.map[y][1] === 0) candidates.push({ x: 0, y });
    if (state.map[y][CONFIG.columns - 2] === 0) candidates.push({ x: CONFIG.columns - 1, y });
  }

  const filtered = candidates.filter(({ x, y }) => !(x <= 2 && y <= 2));
  state.exitDoor = filtered[Math.floor(Math.random() * filtered.length)] || {
    x: CONFIG.columns - 1,
    y: CONFIG.rows - 2,
  };
  state.exitDoor.open = false;
}

function createPellets() {
  const pellets = new Set();

  for (let y = 0; y < CONFIG.rows; y += 1) {
    for (let x = 0; x < CONFIG.columns; x += 1) {
      if (state.map[y][x] !== 0) continue;
      if (isInsideRoomInterior(x, y)) continue;
      pellets.add(tileKey(x, y));
    }
  }

  pellets.delete(tileKey(1, 1));
  return pellets;
}

function findEnemySpawn() {
  let best = { x: CONFIG.columns - 2, y: CONFIG.rows - 2, score: -1 };

  for (let y = 1; y < CONFIG.rows - 1; y += 1) {
    for (let x = 1; x < CONFIG.columns - 1; x += 1) {
      if (state.map[y][x] !== 0 || isInsideRoomInterior(x, y)) continue;
      const score = Math.abs(x - 1) + Math.abs(y - 1);
      if (score > best.score) best = { x, y, score };
    }
  }

  return best;
}

function resetPlayer() {
  Object.assign(state.player, {
    tileX: 1,
    tileY: 1,
    x: 1,
    y: 1,
    direction: "right",
    queuedDirection: "right",
    facing: 1,
    moving: false,
  });
}

function resetEnemy() {
  const start = findEnemySpawn();
  Object.assign(state.enemy, {
    tileX: start.x,
    tileY: start.y,
    x: start.x,
    y: start.y,
    direction: "left",
    facing: -1,
    moving: false,
  });
  state.pellets.delete(tileKey(start.x, start.y));
}

function buildLevel() {
  state.map = generateMaze();
  createExitDoor();
  state.pellets = createPellets();
  state.particles = [];
  state.score = 0;
  state.running = false;
  state.paused = false;
  state.won = false;
  state.lost = false;
  state.phase = "collect";
  state.centerGateOpen = false;
  state.itemCollected = false;
  state.mega.active = false;
  resetPlayer();
  resetEnemy();
  updateHud();
  draw(performance.now());
}

function updateHud() {
  updateBestScore();
  scoreElement.textContent = String(state.score);
  pelletsElement.textContent = String(state.pellets.size);
  if (bestScoreElement) bestScoreElement.textContent = String(state.bestScore);
  if (objectiveLabel) objectiveLabel.textContent = getObjectiveText();
}

function isWalkable(x, y) {
  if (state.exitDoor?.open && x === state.exitDoor.x && y === state.exitDoor.y) {
    return true;
  }

  if (x < 0 || y < 0 || x >= CONFIG.columns || y >= CONFIG.rows) return false;

  const room = state.centerRoom;
  if (x === room.gateX && y === room.gateY) return state.centerGateOpen;
  if (isInsideRoomInterior(x, y)) return state.centerGateOpen;

  return state.map[y]?.[x] === 0;
}

function canMoveFrom(tileX, tileY, directionName) {
  const d = directions[directionName];
  return isWalkable(tileX + d.x, tileY + d.y);
}

function requestDirection(directionName) {
  if (!directions[directionName] || state.mega.active) return;
  state.player.queuedDirection = directionName;
  if (!state.running && !state.won && !state.lost) startGame();
}

function startGame() {
  if (state.mega.active) return;
  ensureAudioContext();
  state.running = true;
  state.paused = false;
  state.lastTime = performance.now();
  hideOverlay();
}

function togglePause() {
  if (state.won || state.lost || state.mega.active) return;

  state.paused = !state.paused;
  state.running = !state.paused;

  if (state.paused) {
    showOverlay("PAUSA", "Premi P o il pulsante per continuare.", "CONTINUA");
  } else {
    state.lastTime = performance.now();
    hideOverlay();
  }
}

function moveActor(actor, speed, deltaTime) {
  if (!actor.moving) return false;

  const d = directions[actor.direction];
  const targetX = actor.tileX + d.x;
  const targetY = actor.tileY + d.y;
  const step = speed * deltaTime;
  const remaining = Math.hypot(targetX - actor.x, targetY - actor.y);

  if (step >= remaining) {
    actor.x = targetX;
    actor.y = targetY;
    actor.tileX = targetX;
    actor.tileY = targetY;
    return true;
  }

  actor.x += d.x * step;
  actor.y += d.y * step;
  return false;
}

function updatePlayer(deltaTime) {
  const player = state.player;
  const centered =
    Math.abs(player.x - player.tileX) < 0.0001 &&
    Math.abs(player.y - player.tileY) < 0.0001;

  if (centered) {
    player.x = player.tileX;
    player.y = player.tileY;

    if (canMoveFrom(player.tileX, player.tileY, player.queuedDirection)) {
      player.direction = player.queuedDirection;
    }

    player.moving = canMoveFrom(player.tileX, player.tileY, player.direction);
  }

  if (player.direction === "left") player.facing = -1;
  if (player.direction === "right") player.facing = 1;

  if (moveActor(player, CONFIG.playerSpeed, deltaTime)) {
    onPlayerArrived(player.tileX, player.tileY);
  }
}

function onPlayerArrived(x, y) {
  collectPellet(x, y);
  collectCenterItem(x, y);
  tryFinishOnDoor(x, y);
}

function chooseEnemyDirection() {
  const enemy = state.enemy;
  let options = Object.keys(directions).filter((name) =>
    canMoveFrom(enemy.tileX, enemy.tileY, name),
  );

  if (options.length === 0) return enemy.direction;

  if (options.length > 1) {
    options = options.filter((name) => name !== reverseDirection[enemy.direction]);
    if (options.length === 0) {
      options = Object.keys(directions).filter((name) =>
        canMoveFrom(enemy.tileX, enemy.tileY, name),
      );
    }
  }

  options.sort((a, b) => {
    const da = directions[a];
    const db = directions[b];
    const scoreA =
      Math.abs(enemy.tileX + da.x - state.player.tileX) +
      Math.abs(enemy.tileY + da.y - state.player.tileY);
    const scoreB =
      Math.abs(enemy.tileX + db.x - state.player.tileX) +
      Math.abs(enemy.tileY + db.y - state.player.tileY);
    return scoreA - scoreB || Math.random() - 0.5;
  });

  return options[0];
}

function updateEnemy(deltaTime) {
  if (state.phase === "mega") return;

  const enemy = state.enemy;
  const centered =
    Math.abs(enemy.x - enemy.tileX) < 0.0001 &&
    Math.abs(enemy.y - enemy.tileY) < 0.0001;

  if (centered) {
    enemy.x = enemy.tileX;
    enemy.y = enemy.tileY;
    enemy.direction = chooseEnemyDirection();
    enemy.moving = canMoveFrom(enemy.tileX, enemy.tileY, enemy.direction);
  }

  if (enemy.direction === "left") enemy.facing = -1;
  if (enemy.direction === "right") enemy.facing = 1;

  moveActor(enemy, CONFIG.enemySpeed, deltaTime);
}

function collectPellet(x, y) {
  const key = tileKey(x, y);
  if (!state.pellets.delete(key)) return;

  state.score += 10;
  spawnPelletBurst(x, y);
  playPelletSound();
  updateHud();

  if (state.pellets.size === 0 && state.phase === "collect") {
    unlockCenterRoom();
  }
}

function unlockCenterRoom() {
  state.phase = "item";
  state.centerGateOpen = true;
  const room = state.centerRoom;
  state.map[room.gateY][room.gateX] = 0;
  state.running = false;
  playUnlockSound();
  updateHud();
  showOverlay(
    "STANZA APERTA",
    "Hai ripulito il labirinto. La stanza centrale è aperta: entra e prendi il sigillo.",
    "ENTRA",
  );
}

function collectCenterItem(x, y) {
  const room = state.centerRoom;
  if (
    state.phase !== "item" ||
    state.itemCollected ||
    x !== room.centerX ||
    y !== room.centerY
  ) {
    return;
  }

  state.itemCollected = true;
  state.score += 500;
  updateHud();
  startMegaAnimation(false);
}

function startMegaAnimation(preview) {
  if (state.mega.active) return;

  state.mega.active = true;
  state.mega.preview = preview;
  state.mega.startedAt = performance.now();
  state.mega.previousRunning = state.running;
  state.mega.previousOverlay = {
    visible: overlay.classList.contains("visible"),
    title: overlayTitle.textContent,
    text: overlayText.textContent,
    button: startButton.textContent,
  };

  state.running = false;
  if (!preview) state.phase = "mega";
  playTransformationSound();
  updateHud();
  hideOverlay();
}

function finishMegaAnimation() {
  const preview = state.mega.preview;
  const previous = state.mega.previousOverlay;
  state.mega.active = false;

  if (preview) {
    state.running = state.mega.previousRunning;
    updateHud();
    if (previous?.visible) {
      showOverlay(previous.title, previous.text, previous.button);
    } else {
      hideOverlay();
    }
    return;
  }

  state.phase = "escape";
  state.exitDoor.open = true;
  playUnlockSound();
  updateHud();
  showOverlay(
    "TEMPIO SBLOCCATO",
    "La porta del tempio si è sbloccata: corri, prima che arrivi lo spazzolino.",
    "SCAPPA",
  );
}

function tryFinishOnDoor(x, y) {
  if (!state.exitDoor?.open) return;
  if (x !== state.exitDoor.x || y !== state.exitDoor.y) return;

  state.running = false;
  state.won = true;
  updateHud();
  playUnlockSound();
  showOverlay("HAI VINTO", `Punteggio finale: ${state.score}`, "NUOVA PARTITA");
}

function checkEnemyCollision() {
  if (state.mega.active) return;

  const distance = Math.hypot(
    state.player.x - state.enemy.x,
    state.player.y - state.enemy.y,
  );

  if (distance < 0.45) {
    state.running = false;
    state.lost = true;
    playCaughtSound();
    updateHud();
    showOverlay(
      "PRESO DALLO SPAZZOLINO",
      "Lo spazzolino ti ha raggiunto. Premi per riprovare.",
      "RIPROVA",
    );
  }
}

function spawnPelletBurst(x, y) {
  const centerX = (x + 0.5) * CONFIG.tileSize;
  const centerY = (y + 0.5) * CONFIG.tileSize;

  for (let i = 0; i < 12; i += 1) {
    const angle = (Math.PI * 2 * i) / 12;
    const life = 0.34 + Math.random() * 0.18;
    const speed = 45 + Math.random() * 60;
    state.particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      ttl: life,
      size: 2 + Math.floor(Math.random() * 4),
    });
  }
}

function updateParticles(deltaTime) {
  state.particles = state.particles.filter((particle) => {
    particle.life -= deltaTime;
    particle.x += particle.vx * deltaTime;
    particle.y += particle.vy * deltaTime;
    particle.vx *= 0.95;
    particle.vy *= 0.95;
    return particle.life > 0;
  });
}

function update(deltaTime) {
  updatePlayer(deltaTime);
  updateEnemy(deltaTime);
  updateParticles(deltaTime);
  checkEnemyCollision();
}

function draw(time) {
  const width = CONFIG.columns * CONFIG.tileSize;
  const height = CONFIG.rows * CONFIG.tileSize;

  context.clearRect(0, 0, width, height);
  context.fillStyle = CONFIG.colors.black;
  context.fillRect(0, 0, width, height);

  drawGrid();
  drawRoomFloor();
  drawWalls();
  drawCenterGate();
  drawExitDoor(time);
  drawPellets(time);
  drawCenterItem(time);
  drawEnemyToothbrush(time);
  drawPlayer(time);
  drawParticles();

  if (state.mega.active) drawMegaAnimation(time);
}

function drawGrid() {
  context.save();
  context.strokeStyle = "rgba(255,255,255,0.03)";
  context.lineWidth = 1;

  for (let x = 0; x <= CONFIG.columns; x += 1) {
    const px = x * CONFIG.tileSize;
    context.beginPath();
    context.moveTo(px, 0);
    context.lineTo(px, CONFIG.rows * CONFIG.tileSize);
    context.stroke();
  }

  for (let y = 0; y <= CONFIG.rows; y += 1) {
    const py = y * CONFIG.tileSize;
    context.beginPath();
    context.moveTo(0, py);
    context.lineTo(CONFIG.columns * CONFIG.tileSize, py);
    context.stroke();
  }

  context.restore();
}

function drawRoomFloor() {
  const room = state.centerRoom;
  const s = CONFIG.tileSize;
  const x = room.left * s;
  const y = room.top * s;
  const width = CONFIG.roomInteriorSize * s;

  context.save();
  context.fillStyle = CONFIG.colors.black;
  context.fillRect(x, y, width, width);
  context.strokeStyle = CONFIG.colors.white;
  context.lineWidth = 2;
  context.strokeRect(x + 4, y + 4, width - 8, width - 8);
  context.restore();
}

function drawWalls() {
  const s = CONFIG.tileSize;

  for (let y = 0; y < CONFIG.rows; y += 1) {
    for (let x = 0; x < CONFIG.columns; x += 1) {
      if (state.map[y][x] !== 1) continue;

      const px = x * s;
      const py = y * s;
      context.fillStyle = CONFIG.colors.white;
      context.fillRect(px + 2, py + 2, s - 4, s - 4);
      context.fillStyle = CONFIG.colors.black;
      context.fillRect(px + 8, py + 8, 3, 3);
      context.fillRect(px + s - 11, py + 8, 3, 3);
      context.fillRect(px + 8, py + s - 11, 3, 3);
      context.fillRect(px + s - 11, py + s - 11, 3, 3);
    }
  }
}

function drawCenterGate() {
  const room = state.centerRoom;
  const s = CONFIG.tileSize;
  const px = room.gateX * s;
  const py = room.gateY * s;

  if (!state.centerGateOpen) return;

  context.fillStyle = CONFIG.colors.black;
  context.fillRect(px + 2, py + 2, s - 4, s - 4);
  context.strokeStyle = CONFIG.colors.white;
  context.lineWidth = 2;
  context.strokeRect(px + 5, py + 5, s - 10, s - 10);
}

function drawExitDoor(time) {
  const door = state.exitDoor;
  if (!door) return;

  const s = CONFIG.tileSize;
  const px = door.x * s;
  const py = door.y * s;
  const flash = door.open && Math.floor(time / 130) % 2 === 0;

  context.save();
  context.fillStyle = flash ? CONFIG.colors.black : CONFIG.colors.white;
  context.fillRect(px + 4, py + 4, s - 8, s - 8);
  context.fillStyle = flash ? CONFIG.colors.white : CONFIG.colors.black;

  if (door.x === 0 || door.x === CONFIG.columns - 1) {
    context.fillRect(px + Math.floor(s / 2) - 2, py + 6, 4, s - 12);
  } else {
    context.fillRect(px + 6, py + Math.floor(s / 2) - 2, s - 12, 4);
  }

  context.restore();
}

function drawPellets(time) {
  const s = CONFIG.tileSize;

  for (const key of state.pellets) {
    const [x, y] = key.split(",").map(Number);
    const pulse = Math.floor((time + (x + y) * 18) / 170) % 2;
    const size = pulse ? 6 : 8;
    const px = x * s + Math.floor(s / 2) - Math.floor(size / 2);
    const py = y * s + Math.floor(s / 2) - Math.floor(size / 2);
    context.fillStyle = CONFIG.colors.white;
    context.fillRect(px, py, size, size);
  }
}

function drawCenterItem(time) {
  if (state.itemCollected) return;

  const room = state.centerRoom;
  const s = CONFIG.tileSize;
  const cx = (room.centerX + 0.5) * s;
  const cy = (room.centerY + 0.5) * s;
  const pulse = 1 + Math.sin(time * 0.008) * 0.13;
  const size = Math.floor(s * 0.82 * pulse);
  const orbit = Math.floor(time / 95) % 8;

  context.save();
  context.translate(cx, cy);
  context.strokeStyle = CONFIG.colors.white;
  context.lineWidth = 3;
  context.strokeRect(-size / 2, -size / 2, size, size);
  context.fillStyle = CONFIG.colors.white;
  context.fillRect(-5, -5, 10, 10);

  for (let i = 0; i < 8; i += 1) {
    const angle = ((i + orbit) / 8) * Math.PI * 2;
    const ox = Math.round(Math.cos(angle) * s * 0.65);
    const oy = Math.round(Math.sin(angle) * s * 0.65);
    context.fillRect(ox - 2, oy - 2, 4, 4);
  }

  context.restore();
}

function drawEnemyToothbrush(time) {
  const enemy = state.enemy;
  const x = (enemy.x + 0.5) * CONFIG.tileSize;
  const y = (enemy.y + 0.5) * CONFIG.tileSize + Math.sin(time * 0.01) * 1.5;
  const width = CONFIG.tileSize * 1.45;
  const height = CONFIG.tileSize * 0.62;
  const bristleAnim = Math.floor(time / 115) % 2;

  context.save();
  context.translate(x, y);
  if (enemy.facing < 0) context.scale(-1, 1);
  context.fillStyle = CONFIG.colors.white;
  context.fillRect(-width * 0.5, -height * 0.18, width * 0.55, height * 0.36);
  context.fillRect(width * 0.04, -height * 0.26, width * 0.16, height * 0.52);
  context.fillRect(width * 0.18, -height * 0.33, width * 0.25, height * 0.66);

  for (let i = 0; i < 4; i += 1) {
    const bx = width * 0.2 + i * 5;
    const extra = i % 2 === bristleAnim ? 3 : 0;
    context.fillRect(bx, -height * 0.47 - extra, 3, 7 + extra);
    context.fillRect(bx, height * 0.47, 3, -7 - extra);
  }

  context.restore();
}

function drawPlayer(time) {
  const player = state.player;
  const centerX = (player.x + 0.5) * CONFIG.tileSize;
  const centerY =
    (player.y + 0.5) * CONFIG.tileSize +
    (player.moving ? Math.sin(time * 0.018) * 1.5 : 0);

  if (state.playerImage?.complete && state.playerImage.naturalWidth > 0) {
    const sprite = CONFIG.playerSprite;
    const frame = player.moving
      ? Math.floor(time / sprite.frameDuration) % sprite.frameCount
      : 0;
    const sourceX = frame * sprite.frameWidth;
    const drawWidth = CONFIG.tileSize * 1.7;
    const drawHeight = drawWidth * (sprite.frameHeight / sprite.frameWidth);

    context.save();
    context.translate(centerX, centerY);
    if (player.facing < 0) context.scale(-1, 1);
    context.drawImage(
      state.playerImage,
      sourceX,
      0,
      sprite.frameWidth,
      sprite.frameHeight,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight,
    );
    context.restore();
    return;
  }

  context.fillStyle = CONFIG.colors.white;
  context.fillRect(centerX - 18, centerY - 12, 36, 24);
}

function drawParticles() {
  for (const particle of state.particles) {
    context.globalAlpha = Math.max(particle.life / particle.ttl, 0);
    context.fillStyle = CONFIG.colors.white;
    context.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  context.globalAlpha = 1;
}

function drawMegaAnimation(time) {
  const mega = CONFIG.megaSprite;
  const elapsed = time - state.mega.startedAt;
  const progress = Math.min(elapsed / mega.duration, 1);
  const width = CONFIG.columns * CONFIG.tileSize;
  const height = CONFIG.rows * CONFIG.tileSize;
  const centerX = width / 2;
  const centerY = height / 2 - 8;

  context.save();
  context.fillStyle = CONFIG.colors.black;
  context.fillRect(0, 0, width, height);

  const flash =
    progress < 0.07 ||
    (progress > 0.46 && progress < 0.53) ||
    progress > 0.93;
  const inverted = flash && Math.floor(time / 72) % 2 === 0;

  if (inverted) {
    context.fillStyle = CONFIG.colors.white;
    context.fillRect(0, 0, width, height);
    context.fillStyle = CONFIG.colors.black;
  } else {
    context.fillStyle = CONFIG.colors.white;
  }

  // Pixel sparsi e anelli irregolari: volutamente non perfetti, come un vecchio arcade.
  const rayCount = 30;
  for (let i = 0; i < rayCount; i += 1) {
    const angle = (i / rayCount) * Math.PI * 2 + time * 0.0011;
    const inner = 165 + Math.sin(time * 0.004 + i * 1.7) * 17;
    const outer = 430 + Math.cos(time * 0.003 + i) * 30;
    const x1 = centerX + Math.cos(angle) * inner;
    const y1 = centerY + Math.sin(angle) * inner * 0.74;
    const x2 = centerX + Math.cos(angle) * outer;
    const y2 = centerY + Math.sin(angle) * outer * 0.72;
    context.fillRect(Math.round(x1), Math.round(y1), 4, 4);
    if (i % 2 === 0) context.fillRect(Math.round(x2), Math.round(y2), 7, 7);
  }

  for (let ring = 0; ring < 3; ring += 1) {
    const radius = 145 + ring * 54 + Math.sin(time * 0.005 + ring) * 10;
    const segments = 42;
    for (let i = 0; i < segments; i += 1) {
      if ((i + ring + Math.floor(time / 80)) % 4 === 0) continue;
      const angle = (i / segments) * Math.PI * 2;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius * 0.58;
      context.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    }
  }

  if (state.megaImage?.complete && state.megaImage.naturalWidth > 0) {
    const frame = Math.floor(elapsed / mega.frameDuration) % mega.frameCount;
    const column = frame % mega.columns;
    const row = Math.floor(frame / mega.columns);
    const sourceX = column * mega.frameWidth;
    const sourceY = row * mega.frameHeight;

    // I primi dieci frame girano da sinistra a destra, gli altri tornano indietro.
    // La variazione di scala accentua la prospettiva già presente nell'asset originale.
    const viewIndex = frame <= 9 ? frame : mega.frameCount - frame;
    const frontness = 1 - Math.min(Math.abs(viewIndex - 4.5) / 4.5, 1);
    const sideDirection = (viewIndex - 4.5) / 4.5;
    const entrance = Math.min(progress / 0.16, 1);
    const exit = progress > 0.86 ? Math.max((1 - progress) / 0.14, 0) : 1;
    const breathing = 1 + Math.sin(time * 0.015) * 0.022;
    const scale = entrance * exit * breathing;
    const drawWidth = (600 + frontness * 175) * scale;
    const drawHeight = drawWidth * (mega.frameHeight / mega.frameWidth);
    const xOffset = sideDirection * 34;
    const yOffset = (1 - frontness) * 10;
    const shake = progress > 0.38 && progress < 0.74 ? Math.sin(time * 0.085) * 4 : 0;

    // Il contenuto reale della spritesheet non occupa tutto il frame,
    // soprattutto in verticale. Per questo allineiamo il centro visivo
    // della dentiera, non il semplice riquadro del frame.
    const contentCenterX = 179.5;
    const contentCenterY = 79.7;
    const scaledContentCenterX = (contentCenterX / mega.frameWidth) * drawWidth;
    const scaledContentCenterY = (contentCenterY / mega.frameHeight) * drawHeight;
    const spriteX = centerX - scaledContentCenterX + xOffset + shake;
    const spriteY = centerY - scaledContentCenterY + yOffset;

    // Ombra ellittica a pixel: rende la dentiera meno "incollata" allo sfondo.
    context.save();
    context.globalAlpha = inverted ? 1 : 0.85;
    const shadowWidth = 360 + frontness * 100;
    const shadowY = centerY + 118;
    for (let i = 0; i < 34; i += 1) {
      const angle = (i / 34) * Math.PI * 2;
      const sx = centerX + Math.cos(angle) * shadowWidth * 0.5;
      const sy = shadowY + Math.sin(angle) * 18;
      context.fillRect(Math.round(sx), Math.round(sy), 5, 3);
    }
    context.restore();

    context.drawImage(
      state.megaImage,
      sourceX,
      sourceY,
      mega.frameWidth,
      mega.frameHeight,
      spriteX,
      spriteY,
      drawWidth,
      drawHeight,
    );
  }

  context.fillStyle = inverted ? CONFIG.colors.black : CONFIG.colors.white;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 32px 'Courier New', monospace";
  context.fillText("SIGILLO DEL SERPENTE", centerX, height - 112);
  context.font = "bold 18px 'Courier New', monospace";
  context.fillText("◀  ROTAZIONE ORBITALE  ▶", centerX, height - 78);
  context.font = "bold 12px 'Courier New', monospace";
  context.fillText("SPAZIO PER SALTARE", centerX, height - 54);

  const barWidth = Math.min(480, width - 80);
  const barX = centerX - barWidth / 2;
  const barY = height - 38;
  context.strokeStyle = context.fillStyle;
  context.lineWidth = 3;
  context.strokeRect(barX, barY, barWidth, 12);
  context.fillRect(barX + 4, barY + 4, (barWidth - 8) * progress, 4);

  context.restore();
}

function gameLoop(time) {
  const deltaTime = Math.min((time - state.lastTime) / 1000, 0.05);
  state.lastTime = time;

  if (state.mega.active) {
    if (time - state.mega.startedAt >= CONFIG.megaSprite.duration) {
      finishMegaAnimation();
    }
  } else if (state.running && !state.paused) {
    update(deltaTime);
  }

  draw(time);
  requestAnimationFrame(gameLoop);
}

function showOverlay(title, text, buttonLabel) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startButton.textContent = buttonLabel;
  overlay.classList.add("visible");
}

function hideOverlay() {
  overlay.classList.remove("visible");
}

function loadImage(src, onLoad) {
  const image = new Image();
  image.src = src;
  image.addEventListener("load", () => onLoad(image));
  image.addEventListener("error", () => {
    console.warn("Impossibile caricare l'asset:", src);
  });
}

function updateInputMode() {
  inputState.touchEnabled = coarsePointerQuery.matches || navigator.maxTouchPoints > 0;
  document.body.classList.toggle("touch-input", inputState.touchEnabled);

  if (controlHint) {
    controlHint.textContent = inputState.touchEnabled
      ? "Scorri sul labirinto per muoverti"
      : "Frecce / WASD · P mette in pausa";
  }
}

function directionFromSwipe(deltaX, deltaY) {
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    return deltaX > 0 ? "right" : "left";
  }
  return deltaY > 0 ? "down" : "up";
}

function beginTouchControl(event) {
  if (!inputState.touchEnabled || event.pointerType === "mouse") return;
  event.preventDefault();
  inputState.pointerId = event.pointerId;
  inputState.lastX = event.clientX;
  inputState.lastY = event.clientY;
  canvas.setPointerCapture?.(event.pointerId);
}

function moveTouchControl(event) {
  if (!inputState.touchEnabled || event.pointerId !== inputState.pointerId) return;
  event.preventDefault();

  const deltaX = event.clientX - inputState.lastX;
  const deltaY = event.clientY - inputState.lastY;
  const swipeThreshold = 18;

  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < swipeThreshold) return;

  requestDirection(directionFromSwipe(deltaX, deltaY));
  inputState.lastX = event.clientX;
  inputState.lastY = event.clientY;
}

function endTouchControl(event) {
  if (event.pointerId !== inputState.pointerId) return;
  inputState.pointerId = null;
  canvas.releasePointerCapture?.(event.pointerId);
}

window.addEventListener("keydown", (event) => {
  const directionName = keyMap[event.code];

  if (directionName && !inputState.touchEnabled) {
    event.preventDefault();
    requestDirection(directionName);
    return;
  }

  if (event.code === "Space" && state.mega.active) {
    event.preventDefault();
    finishMegaAnimation();
    return;
  }

  if (event.code === "KeyP") {
    event.preventDefault();
    togglePause();
  }
});

startButton.addEventListener("click", () => {
  if (state.won || state.lost) buildLevel();
  startGame();
});

newMapButton.addEventListener("click", () => {
  state.running = false;
  buildLevel();
  showOverlay(
    "NUOVA MAPPA",
    "Raccogli tutti i pallini, Mordi Tutto!.",
    "GIOCA",
  );
});

/*testMegaButton.addEventListener("click", () => {
  ensureAudioContext();
  startMegaAnimation(true);
});*/

audioToggle.addEventListener("click", () => {
  state.audio.enabled = !state.audio.enabled;
  updateAudioButton();

  if (state.audio.enabled) {
    ensureAudioContext();
    playTone(660, 0.08, 0.035, 0, "square");
    playTone(880, 0.08, 0.03, 0.07, "square");
  } else if (state.audio.context?.state === "running") {
    state.audio.context.suspend().catch(() => {});
  }
});

canvas.addEventListener("pointerdown", beginTouchControl, { passive: false });
canvas.addEventListener("pointermove", moveTouchControl, { passive: false });
canvas.addEventListener("pointerup", endTouchControl);
canvas.addEventListener("pointercancel", endTouchControl);

coarsePointerQuery.addEventListener?.("change", updateInputMode);
window.addEventListener("resize", () => {
  setupCanvas();
  updateInputMode();
});

setupCanvas();
updateInputMode();
loadImage(CONFIG.playerSprite.src, (image) => {
  state.playerImage = image;
});
loadImage(CONFIG.megaSprite.src, (image) => {
  state.megaImage = image;
});
buildLevel();
showOverlay(
  "PRONTO?",
  inputState.touchEnabled
    ? "Scorri sul labirinto per muoverti. TMordi Tutto!."
    : "Usa WASD o le frecce. Raccogli tutte le palline, TMordi Tutto!",
  "GIOCA",
);
requestAnimationFrame((time) => {
  state.lastTime = time;
  requestAnimationFrame(gameLoop);
});
