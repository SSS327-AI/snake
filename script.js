const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('best-score');
const levelEl = document.getElementById('level');
const statusEl = document.getElementById('status');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayText = document.getElementById('overlay-text');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const restartBtn = document.getElementById('restart-btn');
const difficultySelect = document.getElementById('difficulty');
const skinSelect = document.getElementById('skin');
const mapThemeSelect = document.getElementById('map-theme');

const GRID_SIZE = 24;
const TILE_SIZE = canvas.width / GRID_SIZE;
const DIFFICULTY_CONFIG = {
  easy: { label: '简单', tick: 170 },
  normal: { label: '普通', tick: 120 },
  hard: { label: '困难', tick: 90 },
  expert: { label: '专家', tick: 68 },
};

const SKINS = {
  emerald: { head: '#7ef9b4', body: '#21c97b', food: '#ff6b6b', item: '#5eead4', shadow: '#0d472d' },
  neon: { head: '#5eead4', body: '#8b5cf6', food: '#f472b6', item: '#facc15', shadow: '#1b0d28' },
  sunset: { head: '#fbbf24', body: '#fb7185', food: '#f97316', item: '#fde68a', shadow: '#3b1d09' },
  arctic: { head: '#bae6fd', body: '#7dd3fc', food: '#fca5a5', item: '#d9f99d', shadow: '#082f49' },
  fluo: { head: '#bef264', body: '#4ade80', food: '#fb7185', item: '#facc15', shadow: '#0f172a' },
  royal: { head: '#c084fc', body: '#60a5fa', food: '#fca5a5', item: '#f9a8d4', shadow: '#190d38' },
};

const MAP_THEMES = {
  classic: { bg: '#071827', glow: '#7dd3fc', accent: '#9ae6b4' },
  ocean: { bg: '#041b2d', glow: '#5eead4', accent: '#67e8f9' },
  night: { bg: '#0b1020', glow: '#a78bfa', accent: '#f472b6' },
  sunset: { bg: '#2a1824', glow: '#fbbf24', accent: '#fb7185' },
  meadow: { bg: '#112312', glow: '#a3e635', accent: '#4ade80' },
};

const state = {
  snake: [],
  nextDirection: { x: 1, y: 0 },
  direction: { x: 1, y: 0 },
  food: null,
  bombs: [],
  powerUp: null,
  score: 0,
  level: 1,
  bestScore: 0,
  difficulty: 'normal',
  skin: 'emerald',
  mapTheme: 'classic',
  running: false,
  paused: false,
  starting: false,
  death: null,
  particles: [],
  lastFrame: 0,
  accumulated: 0,
  animationId: null,
  audioCtx: null,
};

function loadBestScore() {
  const saved = Number(localStorage.getItem('snake-best-score') || 0);
  state.bestScore = Number.isFinite(saved) ? saved : 0;
  bestScoreEl.textContent = String(state.bestScore);
}

function getDifficultyConfig() {
  return DIFFICULTY_CONFIG[state.difficulty] || DIFFICULTY_CONFIG.normal;
}

function getSkinConfig() {
  return SKINS[state.skin] || SKINS.emerald;
}

function getMapTheme() {
  return MAP_THEMES[state.mapTheme] || MAP_THEMES.classic;
}

function ensureAudio() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  if (!state.audioCtx) {
    state.audioCtx = new AudioCtor();
  }
}

function playTone(frequency, duration = 0.08, wave = 'sine', volume = 0.06) {
  if (!state.audioCtx) return;
  const now = state.audioCtx.currentTime;
  const osc = state.audioCtx.createOscillator();
  const gain = state.audioCtx.createGain();

  osc.type = wave;
  osc.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(state.audioCtx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function setOverlay(title, text, visible) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.toggle('visible', visible);
}

function stopLoop() {
  if (state.animationId) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  levelEl.textContent = String(state.level);

  if (state.death) {
    statusEl.textContent = '结束';
  } else if (state.starting) {
    statusEl.textContent = '开始';
  } else if (state.paused) {
    statusEl.textContent = '已暂停';
  } else if (state.running) {
    statusEl.textContent = '进行中';
  } else {
    statusEl.textContent = '准备中';
  }
}

function scheduleLoop() {
  stopLoop();
  if (!state.running) return;
  state.lastFrame = 0;
  state.accumulated = 0;
  state.animationId = requestAnimationFrame(frameLoop);
}

function frameLoop(ts) {
  if (!state.lastFrame) state.lastFrame = ts;
  const delta = ts - state.lastFrame;
  state.lastFrame = ts;
  state.accumulated += delta;

  if (state.accumulated >= getDifficultyConfig().tick) {
    state.accumulated = 0;
    handleStep();
  }

  if (state.running) {
    state.animationId = requestAnimationFrame(frameLoop);
  }
}

function generateRandomCell(avoid = []) {
  const used = new Set(avoid.map((cell) => `${cell.x},${cell.y}`));
  let cell = null;
  while (!cell) {
    const x = Math.floor(Math.random() * GRID_SIZE);
    const y = Math.floor(Math.random() * GRID_SIZE);
    const key = `${x},${y}`;
    if (!used.has(key)) {
      cell = { x, y };
    }
  }
  return cell;
}

function generateFood() {
  const occupied = [...state.snake, ...state.bombs, state.powerUp ? { x: state.powerUp.x, y: state.powerUp.y } : null].filter(Boolean);
  return generateRandomCell(occupied);
}

function generateBombs(level) {
  const bombs = [];
  const count = Math.min(5 + level, 12);
  const avoid = [...state.snake, state.food, ...bombs].filter(Boolean);
  for (let i = 0; i < count; i += 1) {
    const cell = generateRandomCell(avoid);
    bombs.push(cell);
    avoid.push(cell);
  }
  return bombs;
}

function spawnPowerUp() {
  const occupied = [...state.snake, ...state.bombs, state.food];
  state.powerUp = generateRandomCell(occupied);
}

function startCountdown() {
  state.starting = true;
  state.running = false;
  setOverlay('3', '准备开始', true);
  ensureAudio();
  playTone(660, 0.12, 'triangle', 0.09);

  setTimeout(() => {
    if (!state.starting) return;
    setOverlay('2', '准备开始', true);
    playTone(440, 0.12, 'triangle', 0.09);
  }, 420);

  setTimeout(() => {
    if (!state.starting) return;
    setOverlay('1', '准备开始', true);
    playTone(330, 0.12, 'triangle', 0.09);
  }, 840);

  setTimeout(() => {
    if (!state.starting) return;
    state.starting = false;
    state.running = true;
    setOverlay('', '', false);
    updateHud();
    scheduleLoop();
    playTone(880, 0.16, 'square', 0.09);
  }, 1260);
}

function startGame() {
  if (state.running || state.starting || state.paused) return;
  if (state.death) {
    resetGame();
  }
  startCountdown();
}

function pauseGame() {
  if (!state.running) return;
  state.running = false;
  state.paused = true;
  stopLoop();
  updateHud();
  setOverlay('暂停', '按继续按钮或空格键继续', true);
}

function resumeGame() {
  if (!state.paused) return;
  state.paused = false;
  state.running = true;
  setOverlay('', '', false);
  updateHud();
  scheduleLoop();
}

function triggerDeath(reason) {
  state.running = false;
  state.death = reason;
  state.particles = [];

  const head = state.snake[0];
  for (let i = 0; i < 26; i += 1) {
    state.particles.push({
      x: head.x * TILE_SIZE + TILE_SIZE / 2,
      y: head.y * TILE_SIZE + TILE_SIZE / 2,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      life: 26 + Math.random() * 18,
      color: reason === 'bomb' ? '#fb7185' : '#fbbf24',
    });
  }

  if (reason === 'bomb') {
    setOverlay('爆炸！', '被炸弹击中，游戏结束', true);
  } else if (reason === 'wall') {
    setOverlay('撞墙！', '你撞到边界了，游戏结束', true);
  } else {
    setOverlay('撞到自己！', '自撞，游戏结束', true);
  }

  state.bestScore = Math.max(state.bestScore, state.score);
  localStorage.setItem('snake-best-score', String(state.bestScore));
  bestScoreEl.textContent = String(state.bestScore);
  updateHud();
  ensureAudio();
  playTone(reason === 'bomb' ? 140 : 200, 0.32, reason === 'bomb' ? 'sawtooth' : 'square', 0.08);
}

function advanceLevelIfNeeded() {
  const nextThreshold = state.level * 5;
  if (state.score >= nextThreshold) {
    state.level += 1;
    state.bombs = generateBombs(state.level);
    state.food = generateFood();
    spawnPowerUp();
    setOverlay('第' + state.level + '关', '炸弹数量增加，速度更快！', true);
    setTimeout(() => {
      if (state.running) setOverlay('', '', false);
    }, 500);
    ensureAudio();
    playTone(760, 0.12, 'triangle', 0.08);
  }
}

function handleStep() {
  if (!state.running) return;
  state.direction = { ...state.nextDirection };
  const head = {
    x: state.snake[0].x + state.direction.x,
    y: state.snake[0].y + state.direction.y,
  };

  const hitsWall = head.x < 0 || head.y < 0 || head.x >= GRID_SIZE || head.y >= GRID_SIZE;
  const hitsSelf = state.snake.some((segment, index) => index < state.snake.length - 1 && segment.x === head.x && segment.y === head.y);
  const hitsBomb = state.bombs.some((bomb) => bomb.x === head.x && bomb.y === head.y);

  if (hitsWall) {
    triggerDeath('wall');
    draw();
    return;
  }

  if (hitsSelf) {
    triggerDeath('self');
    draw();
    return;
  }

  if (hitsBomb) {
    triggerDeath('bomb');
    draw();
    return;
  }

  state.snake.unshift(head);

  if (state.food && head.x === state.food.x && head.y === state.food.y) {
    state.score += 1;
    ensureAudio();
    playTone(920, 0.09, 'square', 0.08);
    state.food = generateFood();
  } else {
    state.snake.pop();
  }

  if (state.powerUp) {
    if (head.x === state.powerUp.x && head.y === state.powerUp.y) {
      const newLength = Math.max(3, state.snake.length - 1);
      while (state.snake.length > newLength) {
        state.snake.pop();
      }
      state.score += 2;
      ensureAudio();
      playTone(620, 0.12, 'triangle', 0.09);
      setOverlay('道具', '蛇身缩短了一格！', true);
      setTimeout(() => {
        if (state.running) setOverlay('', '', false);
      }, 400);
      state.powerUp = null;
    }
  }

  if (!state.powerUp && Math.random() < 0.022) {
    spawnPowerUp();
  }

  advanceLevelIfNeeded();
  updateHud();
  draw();
}

function resetGame() {
  state.snake = [
    { x: 11, y: 12 },
    { x: 10, y: 12 },
    { x: 9, y: 12 },
  ];
  state.direction = { x: 1, y: 0 };
  state.nextDirection = { x: 1, y: 0 };
  state.score = 0;
  state.level = 1;
  state.death = null;
  state.particles = [];
  state.bombs = generateBombs(1);
  state.food = generateFood();
  state.powerUp = null;
  state.running = false;
  state.paused = false;
  state.starting = false;
  stopLoop();
  updateHud();
  setOverlay('Snake', '按方向键或 W/A/S/D 开始游戏', true);
  draw();
}

function drawBackground() {
  const theme = getMapTheme();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < GRID_SIZE; i += 1) {
    const x = i * TILE_SIZE;
    const y = i * TILE_SIZE;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 97) % canvas.width) + 12;
    const y = ((i * 53) % canvas.height) + 20;
    ctx.beginPath();
    ctx.arc(x, y, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBombs() {
  for (const bomb of state.bombs) {
    const cx = bomb.x * TILE_SIZE + TILE_SIZE / 2;
    const cy = bomb.y * TILE_SIZE + TILE_SIZE / 2;
    const r = TILE_SIZE * 0.27;
    ctx.beginPath();
    ctx.fillStyle = '#fb7185';
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = '#fecdd3';
    ctx.lineWidth = 2;
    ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawFood() {
  const skin = getSkinConfig();
  const cx = state.food.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = state.food.y * TILE_SIZE + TILE_SIZE / 2;
  ctx.fillStyle = skin.food;
  ctx.beginPath();
  ctx.arc(cx, cy, TILE_SIZE * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function drawPowerUp() {
  if (!state.powerUp) return;
  const skin = getSkinConfig();
  const cx = state.powerUp.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = state.powerUp.y * TILE_SIZE + TILE_SIZE / 2;
  const r = TILE_SIZE * 0.22;
  ctx.fillStyle = skin.item;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();
}

function drawSnake() {
  const skin = getSkinConfig();
  state.snake.forEach((segment, index) => {
    const x = segment.x * TILE_SIZE + 2;
    const y = segment.y * TILE_SIZE + 2;
    ctx.fillStyle = index === 0 ? skin.head : skin.body;
    ctx.shadowBlur = index === 0 ? 16 : 10;
    ctx.shadowColor = skin.shadow;
    ctx.fillRect(x, y, TILE_SIZE - 4, TILE_SIZE - 4);
  });
  ctx.shadowBlur = 0;
}

function drawParticles() {
  if (!state.particles || state.particles.length === 0) return;
  for (const particle of state.particles) {
    ctx.beginPath();
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = Math.max(0, particle.life / 40);
    ctx.arc(particle.x, particle.y, 4, 0, Math.PI * 2);
    ctx.fill();
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life -= 1;
  }
  ctx.globalAlpha = 1;
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function draw() {
  drawBackground();
  drawBombs();
  drawFood();
  drawPowerUp();
  drawSnake();
  drawParticles();
}

function applyDirectionForKey(key) {
  const nextMap = {
    arrowup: { x: 0, y: -1 },
    w: { x: 0, y: -1 },
    arrowdown: { x: 0, y: 1 },
    s: { x: 0, y: 1 },
    arrowleft: { x: -1, y: 0 },
    a: { x: -1, y: 0 },
    arrowright: { x: 1, y: 0 },
    d: { x: 1, y: 0 },
  };

  const direction = nextMap[key];
  if (!direction) return;

  if (state.starting) return;
  if (state.death) return;

  const isOpposite = state.direction.x === -direction.x && state.direction.y === -direction.y;
  if (!isOpposite) {
    state.nextDirection = direction;
  }

  if (!state.running && !state.paused) {
    startGame();
  }
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();

  if ([ 'arrowup', 'w', 'arrowdown', 's', 'arrowleft', 'a', 'arrowright', 'd' ].includes(key)) {
    event.preventDefault();
    applyDirectionForKey(key);
    return;
  }

  if (key === ' ') {
    event.preventDefault();
    if (state.running) {
      pauseGame();
    } else if (state.paused) {
      resumeGame();
    } else if (!state.death) {
      startGame();
    }
  }
});

startBtn.addEventListener('click', () => {
  if (state.paused) {
    resumeGame();
  } else {
    startGame();
  }
});

pauseBtn.addEventListener('click', () => {
  if (state.running) {
    pauseGame();
  } else if (state.paused) {
    resumeGame();
  }
});

restartBtn.addEventListener('click', () => {
  ensureAudio();
  resetGame();
});

difficultySelect.addEventListener('change', () => {
  state.difficulty = difficultySelect.value;
  localStorage.setItem('snake-difficulty', state.difficulty);
  if (state.running || state.paused) {
    scheduleLoop();
  }
  updateHud();
});

skinSelect.addEventListener('change', () => {
  state.skin = skinSelect.value;
  localStorage.setItem('snake-skin', state.skin);
  draw();
});

mapThemeSelect.addEventListener('change', () => {
  state.mapTheme = mapThemeSelect.value;
  localStorage.setItem('snake-map-theme', state.mapTheme);
  draw();
});

document.querySelectorAll('[data-direction]').forEach((button) => {
  button.addEventListener('click', () => {
    const map = {
      up: { x: 0, y: -1 },
      down: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
      right: { x: 1, y: 0 },
    };
    const direction = map[button.dataset.direction];
    if (!direction) return;
    const isOpposite = state.direction.x === -direction.x && state.direction.y === -direction.y;
    if (!isOpposite) {
      state.nextDirection = direction;
    }
    if (!state.running && !state.paused && !state.death) {
      startGame();
    }
  });
});

const savedDifficulty = localStorage.getItem('snake-difficulty');
if (savedDifficulty && DIFFICULTY_CONFIG[savedDifficulty]) {
  difficultySelect.value = savedDifficulty;
  state.difficulty = savedDifficulty;
}

const savedSkin = localStorage.getItem('snake-skin');
if (savedSkin && SKINS[savedSkin]) {
  skinSelect.value = savedSkin;
  state.skin = savedSkin;
}

const savedMap = localStorage.getItem('snake-map-theme');
if (savedMap && MAP_THEMES[savedMap]) {
  mapThemeSelect.value = savedMap;
  state.mapTheme = savedMap;
}

loadBestScore();
resetGame();
draw();
