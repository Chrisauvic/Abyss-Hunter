const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const titleScreen = document.getElementById("titleScreen");
const levelScreen = document.getElementById("levelScreen");
const gameOverScreen = document.getElementById("gameOverScreen");
const levelTitle = document.getElementById("levelTitle");
const levelText = document.getElementById("levelText");
const startBtn = document.getElementById("startBtn");
const nextBtn = document.getElementById("nextBtn");
const retryBtn = document.getElementById("retryBtn");
const musicBtn = document.getElementById("musicBtn");

const TAU = Math.PI * 2;
const VIEW = { w: 414, h: 896 };
const PANEL_H = 176;
const WORLD = { w: 1280, h: 1760 };
const LEVELS = [
  { artifacts: 4, rocks: 12, mines: 4, beasts: 1, currents: 2, beastSpeed: 24 },
  { artifacts: 5, rocks: 16, mines: 6, beasts: 2, currents: 3, beastSpeed: 32 },
  { artifacts: 6, rocks: 20, mines: 8, beasts: 3, currents: 4, beastSpeed: 40 }
];
const SPRITE_SOURCES = {
  cockpit: "assets/abyss-cockpit.png",
  player: "assets/submarine.png",
  rock: "assets/rock.png",
  mine: "assets/mine.png",
  artifact: "assets/artifact.png",
  exit: "assets/exit-beacon.png",
  beast: "assets/abyss-beast.png"
};
const sprites = Object.fromEntries(
  Object.entries(SPRITE_SOURCES).map(([key, src]) => {
    const image = new Image();
    image.decoding = "async";
    image.src = src;
    return [key, image];
  })
);

let state = "title";
let levelIndex = 0;
let lastTime = performance.now();
let cameraShake = 0;
let message = "";
let messageTime = 0;
let audio;
let nextAction = "next";

const pointer = {
  active: false,
  id: null,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0
};

const game = {
  player: makePlayer(),
  artifacts: [],
  rocks: [],
  mines: [],
  beasts: [],
  currents: [],
  bubbles: [],
  explosions: [],
  exit: { x: WORLD.w - 160, y: WORLD.h - 160, r: 42, open: false },
  collected: 0,
  scanPulse: 0
};

function makePlayer() {
  return {
    x: 120,
    y: 120,
    vx: 0,
    vy: 0,
    r: 22,
    hp: 100,
    fuel: 100,
    invincible: 0,
    blink: 0
  };
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function worldToScreen(x, y) {
  const cam = camera();
  return { x: x - cam.x, y: y - cam.y };
}

function camera() {
  const jitter = cameraShake > 0 ? rand(-cameraShake, cameraShake) : 0;
  return {
    x: clamp(game.player.x - VIEW.w / 2, 0, WORLD.w - VIEW.w) + jitter,
    y: clamp(game.player.y - (VIEW.h - PANEL_H) / 2, 0, WORLD.h - VIEW.h + PANEL_H) + jitter
  };
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(canvas.width / VIEW.w, 0, 0, canvas.height / VIEW.h, 0, 0);
}

function show(el) {
  el.classList.remove("hidden");
}

function hide(el) {
  el.classList.add("hidden");
}

function initLevel(index) {
  levelIndex = index;
  const spec = LEVELS[levelIndex];
  Object.assign(game, {
    player: makePlayer(),
    artifacts: [],
    rocks: [],
    mines: [],
    beasts: [],
    currents: [],
    bubbles: [],
    explosions: [],
    exit: { x: WORLD.w - 154, y: WORLD.h - 170, r: 46, open: false },
    collected: 0,
    scanPulse: 0
  });

  for (let i = 0; i < 90; i += 1) {
    game.bubbles.push({ x: rand(0, WORLD.w), y: rand(0, WORLD.h), r: rand(1, 3.5), s: rand(8, 28), a: rand(0.16, 0.54) });
  }

  placeMany(game.artifacts, spec.artifacts, () => ({ x: rand(120, WORLD.w - 120), y: rand(180, WORLD.h - 220), r: 18, spin: rand(0, TAU), got: false }), 104);
  placeMany(game.rocks, spec.rocks, () => ({ x: rand(90, WORLD.w - 90), y: rand(160, WORLD.h - 220), r: rand(34, 62), sides: Math.floor(rand(5, 8)), rot: rand(0, TAU), hit: 0 }), 96);
  placeMany(game.mines, spec.mines, () => ({ x: rand(120, WORLD.w - 120), y: rand(190, WORLD.h - 220), r: 24, armed: true, pulse: rand(0, TAU) }), 108);
  placeMany(game.currents, spec.currents, () => {
    const angle = rand(0, TAU);
    return { x: rand(160, WORLD.w - 160), y: rand(240, WORLD.h - 260), r: rand(70, 98), angle, force: rand(48, 68), spin: rand(0, TAU) };
  }, 150);
  placeMany(game.beasts, spec.beasts, () => ({ x: rand(420, WORLD.w - 120), y: rand(420, WORLD.h - 220), r: 28, speed: spec.beastSpeed, phase: rand(0, TAU), bite: 0 }), 180);
}

function placeMany(list, count, maker, minGap) {
  let attempts = 0;
  while (list.length < count && attempts < count * 80) {
    attempts += 1;
    const item = maker();
    const clearStart = Math.hypot(item.x - 120, item.y - 120) > 180;
    const clearExit = Math.hypot(item.x - game.exit.x, item.y - game.exit.y) > 150;
    const far = [...game.artifacts, ...game.rocks, ...game.mines, ...game.currents, ...game.beasts, ...list]
      .every((other) => Math.hypot(item.x - other.x, item.y - other.y) > minGap);
    if (clearStart && clearExit && far) list.push(item);
  }
}

function startGame() {
  audioStart();
  audio.playClick();
  hide(titleScreen);
  hide(levelScreen);
  hide(gameOverScreen);
  nextAction = "next";
  initLevel(0);
  state = "play";
  message = "回收全部文物，解锁绿色出口信标";
  messageTime = 3.2;
}

function nextLevel() {
  audioStart();
  audio.playClick();
  hide(levelScreen);
  initLevel(levelIndex + 1);
  state = "play";
  message = `第 ${levelIndex + 1} 层海沟`;
  messageTime = 2;
}

function gameOver() {
  state = "gameover";
  audio.playFail();
  show(gameOverScreen);
}

function completeLevel() {
  state = "clear";
  audio.playWin();
  if (levelIndex >= LEVELS.length - 1) {
    levelTitle.textContent = "深渊猎宝完成";
    levelText.textContent = "三层海沟文物全部回收，返航航线已确认。";
    nextBtn.textContent = "重新开始";
    nextAction = "restart";
  } else {
    levelTitle.textContent = "文物已回收";
    levelText.textContent = "出口信标稳定，准备下潜到下一层。";
    nextBtn.textContent = "下一关";
    nextAction = "next";
  }
  show(levelScreen);
}

function update(dt) {
  cameraShake = Math.max(0, cameraShake - dt * 24);
  messageTime = Math.max(0, messageTime - dt);
  game.scanPulse += dt;
  updateBubbles(dt);
  updateExplosions(dt);
  if (state !== "play") return;

  const player = game.player;
  player.invincible = Math.max(0, player.invincible - dt);
  player.blink += dt * 18;
  player.fuel = Math.max(0, player.fuel - dt * 0.75);

  let ax = 0;
  let ay = 0;
  if (pointer.active) {
    ax = clamp((pointer.x - pointer.startX) / 64, -1, 1);
    ay = clamp((pointer.y - pointer.startY) / 64, -1, 1);
  }

  for (const current of game.currents) {
    const d = Math.hypot(player.x - current.x, player.y - current.y);
    if (d < current.r) {
      const strength = (1 - d / current.r) * current.force;
      player.vx += Math.cos(current.angle) * strength * dt;
      player.vy += Math.sin(current.angle) * strength * dt;
    }
    current.spin += dt * 1.6;
  }

  player.vx += ax * 340 * dt;
  player.vy += ay * 340 * dt;
  player.vx *= Math.pow(0.08, dt);
  player.vy *= Math.pow(0.08, dt);
  player.x = clamp(player.x + player.vx * dt, 34, WORLD.w - 34);
  player.y = clamp(player.y + player.vy * dt, 34, WORLD.h - 34);

  for (const artifact of game.artifacts) {
    artifact.spin += dt * 2.4;
    if (!artifact.got && dist(player, artifact) < player.r + artifact.r) {
      artifact.got = true;
      game.collected += 1;
      audio.playScore();
      message = `文物回收 ${game.collected}/${game.artifacts.length}`;
      messageTime = 1.5;
      if (game.collected === game.artifacts.length) {
        game.exit.open = true;
        message = "出口信标已开启";
        messageTime = 2.4;
      }
    }
  }

  for (const rock of game.rocks) {
    rock.hit = Math.max(0, rock.hit - dt * 2);
    if (dist(player, rock) < player.r + rock.r * 0.72) {
      damage(10);
      rock.hit = 1;
      const push = Math.atan2(player.y - rock.y, player.x - rock.x);
      player.vx += Math.cos(push) * 180;
      player.vy += Math.sin(push) * 180;
    }
  }

  for (const mine of game.mines) {
    mine.pulse += dt * 4;
    if (mine.armed && dist(player, mine) < player.r + mine.r) {
      mine.armed = false;
      game.explosions.push({ x: mine.x, y: mine.y, t: 0, max: 0.72 });
      damage(30, true);
      audio.playBoom();
    }
  }

  for (const beast of game.beasts) {
    beast.phase += dt * 5;
    beast.bite = Math.max(0, beast.bite - dt);
    const angle = Math.atan2(player.y - beast.y, player.x - beast.x);
    beast.x += Math.cos(angle) * beast.speed * dt;
    beast.y += Math.sin(angle) * beast.speed * dt;
    if (dist(player, beast) < player.r + beast.r) {
      beast.bite = 0.6;
      damage(20);
      player.vx -= Math.cos(angle) * 160;
      player.vy -= Math.sin(angle) * 160;
    }
  }

  if (game.exit.open && dist(player, game.exit) < player.r + game.exit.r) {
    completeLevel();
  }
  if (player.hp <= 0) gameOver();
}

function damage(amount, heavy = false) {
  const player = game.player;
  if (player.invincible > 0) return;
  player.hp = Math.max(0, player.hp - amount);
  player.invincible = 1.5;
  cameraShake = heavy ? 9 : 5;
  message = `船体受损 -${amount}`;
  messageTime = 1.1;
  audio.playHit();
}

function updateBubbles(dt) {
  for (const b of game.bubbles) {
    b.y -= b.s * dt;
    b.x += Math.sin((b.y + b.s) * 0.013) * dt * 6;
    if (b.y < -20) {
      b.y = WORLD.h + rand(10, 80);
      b.x = rand(0, WORLD.w);
    }
  }
}

function updateExplosions(dt) {
  for (const ex of game.explosions) ex.t += dt;
  game.explosions = game.explosions.filter((ex) => ex.t < ex.max);
}

function draw() {
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  drawSea();
  drawWorld();
  drawCockpit();
  drawHud();
  if (pointer.active && state === "play") drawJoystick();
}

function drawSea() {
  if (isImageReady(sprites.cockpit)) {
    drawImageCover(sprites.cockpit, 0, 0, VIEW.w, VIEW.h);
    ctx.fillStyle = "rgba(0, 8, 18, 0.34)";
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    gradient.addColorStop(0, "#061f38");
    gradient.addColorStop(0.58, "#04111f");
    gradient.addColorStop(1, "#01040a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }

  const light = ctx.createRadialGradient(VIEW.w / 2, VIEW.h * 0.36, 24, VIEW.w / 2, VIEW.h * 0.36, VIEW.w * 0.68);
  light.addColorStop(0, "rgba(98, 225, 255, 0.30)");
  light.addColorStop(0.42, "rgba(34, 125, 158, 0.16)");
  light.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h - PANEL_H);
}

function drawWorld() {
  const cam = camera();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, VIEW.w, VIEW.h - PANEL_H + 34);
  ctx.clip();

  drawGrid(cam);
  for (const b of game.bubbles) drawBubble(b, cam);
  for (const current of game.currents) drawCurrent(current, cam);
  for (const rock of game.rocks) drawRock(rock, cam);
  for (const mine of game.mines) drawMine(mine, cam);
  for (const artifact of game.artifacts) if (!artifact.got) drawArtifact(artifact, cam);
  drawExit(cam);
  for (const beast of game.beasts) drawBeast(beast, cam);
  for (const ex of game.explosions) drawExplosion(ex, cam);
  drawPlayer(cam);

  const vignette = ctx.createRadialGradient(VIEW.w / 2, VIEW.h * 0.35, 98, VIEW.w / 2, VIEW.h * 0.35, 360);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(0.76, "rgba(0,0,0,0.20)");
  vignette.addColorStop(1, "rgba(0,0,0,0.74)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h - PANEL_H + 34);
  ctx.restore();
}

function drawGrid(cam) {
  ctx.strokeStyle = "rgba(79, 180, 215, 0.05)";
  ctx.lineWidth = 1;
  for (let x = -cam.x % 96; x < VIEW.w; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, VIEW.h - PANEL_H);
    ctx.stroke();
  }
  for (let y = -cam.y % 96; y < VIEW.h - PANEL_H; y += 96) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW.w, y);
    ctx.stroke();
  }
}

function drawBubble(b, cam) {
  const x = b.x - cam.x;
  const y = b.y - cam.y;
  if (x < -10 || x > VIEW.w + 10 || y < -10 || y > VIEW.h - PANEL_H + 20) return;
  ctx.fillStyle = `rgba(178, 240, 255, ${b.a})`;
  ctx.beginPath();
  ctx.arc(x, y, b.r, 0, TAU);
  ctx.fill();
}

function isImageReady(image) {
  return image && image.complete && image.naturalWidth > 0;
}

function drawSprite(image, x, y, size, rotation = 0, alpha = 1) {
  return drawSpriteRect(image, x, y, size, size, rotation, alpha);
}

function drawSpriteRect(image, x, y, width, height, rotation = 0, alpha = 1) {
  if (!isImageReady(image)) return false;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha *= alpha;
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
  return true;
}

function drawImageCover(image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceW = width / scale;
  const sourceH = height / scale;
  const sourceX = (image.naturalWidth - sourceW) / 2;
  const sourceY = (image.naturalHeight - sourceH) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, x, y, width, height);
}

function drawRock(rock, cam) {
  const x = rock.x - cam.x;
  const y = rock.y - cam.y;
  if (x < -90 || x > VIEW.w + 90 || y < -90 || y > VIEW.h - PANEL_H + 90) return;
  ctx.save();
  ctx.shadowColor = "rgba(86, 199, 226, 0.16)";
  ctx.shadowBlur = 10;
  const drawn = drawSpriteRect(sprites.rock, x, y, rock.r * 2.18, rock.r * 1.84, rock.rot);
  if (drawn && rock.hit > 0) {
    ctx.fillStyle = `rgba(255, 92, 110, ${rock.hit * 0.22})`;
    ctx.beginPath();
    ctx.arc(x, y, rock.r * 0.86, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  if (drawn) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rock.rot);
  ctx.beginPath();
  for (let i = 0; i < rock.sides; i += 1) {
    const a = (i / rock.sides) * TAU;
    const r = rock.r * (0.78 + Math.sin(i * 2.4) * 0.12);
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = rock.hit > 0 ? "#77545d" : "#263644";
  ctx.strokeStyle = "rgba(166, 218, 232, 0.24)";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawMine(mine, cam) {
  if (!mine.armed) return;
  const x = mine.x - cam.x;
  const y = mine.y - cam.y;
  if (x < -60 || x > VIEW.w + 60 || y < -60 || y > VIEW.h - PANEL_H + 60) return;
  const glow = 0.5 + Math.sin(mine.pulse) * 0.5;
  ctx.save();
  ctx.shadowColor = "rgba(255, 79, 95, 0.64)";
  ctx.shadowBlur = 16 + glow * 10;
  const drawn = drawSprite(sprites.mine, x, y, mine.r * 2.52, mine.pulse * 0.06);
  ctx.restore();
  if (drawn) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = "rgba(255, 79, 95, 0.64)";
  ctx.shadowBlur = 16 + glow * 10;
  ctx.fillStyle = "#2c1d26";
  ctx.strokeStyle = "#ff6674";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, mine.r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 164, 170, 0.8)";
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
    ctx.lineTo(Math.cos(a) * 32, Math.sin(a) * 32);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCurrent(current, cam) {
  const x = current.x - cam.x;
  const y = current.y - cam.y;
  if (x < -130 || x > VIEW.w + 130 || y < -130 || y > VIEW.h - PANEL_H + 130) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(current.angle);
  ctx.strokeStyle = "rgba(95, 225, 255, 0.22)";
  ctx.lineWidth = 2;
  for (let i = -2; i <= 2; i += 1) {
    ctx.beginPath();
    ctx.arc(i * 12, 0, current.r * (0.34 + Math.abs(i) * 0.08), current.spin, current.spin + Math.PI * 1.3);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(95, 225, 255, 0.06)";
  ctx.beginPath();
  ctx.ellipse(0, 0, current.r, current.r * 0.56, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawArtifact(artifact, cam) {
  const x = artifact.x - cam.x;
  const y = artifact.y - cam.y;
  if (x < -50 || x > VIEW.w + 50 || y < -50 || y > VIEW.h - PANEL_H + 50) return;
  ctx.save();
  ctx.shadowColor = "rgba(246, 200, 95, 0.9)";
  ctx.shadowBlur = 18;
  const drawn = drawSpriteRect(sprites.artifact, x, y, artifact.r * 2.45, artifact.r * 2.85, artifact.spin);
  ctx.restore();
  if (drawn) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(artifact.spin);
  ctx.shadowColor = "rgba(246, 200, 95, 0.9)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#f6c85f";
  ctx.strokeStyle = "#fff1b8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -19);
  ctx.lineTo(17, -3);
  ctx.lineTo(10, 19);
  ctx.lineTo(-10, 19);
  ctx.lineTo(-17, -3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawExit(cam) {
  const x = game.exit.x - cam.x;
  const y = game.exit.y - cam.y;
  const pulse = 0.5 + Math.sin(game.scanPulse * 4) * 0.5;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = game.exit.open ? `rgba(97, 240, 162, ${0.42 + pulse * 0.36})` : "rgba(130, 154, 165, 0.32)";
  ctx.fillStyle = game.exit.open ? "rgba(97, 240, 162, 0.12)" : "rgba(130, 154, 165, 0.08)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, game.exit.r + pulse * 8, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = game.exit.open ? "rgba(97, 240, 162, 0.8)" : "rgba(130, 154, 165, 0.28)";
  ctx.shadowBlur = game.exit.open ? 18 + pulse * 12 : 4;
  const drawn = drawSprite(sprites.exit, 0, 0, game.exit.r * 1.72, game.scanPulse * 0.18, game.exit.open ? 1 : 0.56);
  if (drawn) {
    ctx.restore();
    return;
  }
  ctx.fillStyle = game.exit.open ? "#61f0a2" : "#718996";
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawBeast(beast, cam) {
  const x = beast.x - cam.x;
  const y = beast.y - cam.y;
  if (x < -80 || x > VIEW.w + 80 || y < -80 || y > VIEW.h - PANEL_H + 80) return;
  const angle = Math.atan2(game.player.y - beast.y, game.player.x - beast.x);
  ctx.save();
  ctx.shadowColor = beast.bite > 0 ? "rgba(255, 79, 95, 0.44)" : "rgba(81, 200, 255, 0.28)";
  ctx.shadowBlur = beast.bite > 0 ? 18 : 12;
  const drawn = drawSpriteRect(sprites.beast, x, y + Math.sin(beast.phase) * 1.6, beast.r * 3.45, beast.r * 1.55, angle, beast.bite > 0 ? 0.92 : 1);
  ctx.restore();
  if (drawn) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = "rgba(81, 200, 255, 0.28)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = beast.bite > 0 ? "#7a2535" : "#133b55";
  ctx.strokeStyle = "#6bc9e6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, beast.r * 1.25, beast.r * 0.56, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-beast.r * 1.18, 0);
  ctx.lineTo(-beast.r * 1.85, -16);
  ctx.lineTo(-beast.r * 1.72, 15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d9fbff";
  ctx.beginPath();
  ctx.arc(beast.r * 0.52, -7 + Math.sin(beast.phase) * 2, 3, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawExplosion(ex, cam) {
  const x = ex.x - cam.x;
  const y = ex.y - cam.y;
  const p = ex.t / ex.max;
  ctx.save();
  ctx.globalAlpha = 1 - p;
  ctx.strokeStyle = "#ffdc8a";
  ctx.fillStyle = "rgba(255, 91, 64, 0.24)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, y, 20 + p * 86, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(cam) {
  const p = game.player;
  const x = p.x - cam.x;
  const y = p.y - cam.y;
  if (p.invincible > 0 && Math.floor(p.blink) % 2 === 0) return;
  const angle = Math.atan2(p.vy, p.vx || 1);
  ctx.save();
  ctx.shadowColor = "rgba(92, 220, 255, 0.7)";
  ctx.shadowBlur = 18;
  const drawn = drawSpriteRect(sprites.player, x, y, p.r * 3.0, p.r * 1.95, angle);
  ctx.restore();
  if (drawn) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = "rgba(92, 220, 255, 0.7)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#d7f7ff";
  ctx.strokeStyle = "#0c6c8d";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, 23, 13, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#51d8ff";
  ctx.beginPath();
  ctx.arc(8, -1, 5, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawCockpit() {
  ctx.save();
  ctx.fillStyle = "rgba(1, 5, 11, 0.72)";
  ctx.beginPath();
  ctx.moveTo(0, VIEW.h - PANEL_H - 34);
  ctx.quadraticCurveTo(VIEW.w / 2, VIEW.h - PANEL_H + 18, VIEW.w, VIEW.h - PANEL_H - 34);
  ctx.lineTo(VIEW.w, VIEW.h);
  ctx.lineTo(0, VIEW.h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(128, 218, 255, 0.24)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(VIEW.w / 2, VIEW.h * 0.36, VIEW.w * 0.58, VIEW.h * 0.36, 0, 0, TAU);
  ctx.stroke();

  const dashY = VIEW.h - PANEL_H + 20;
  const dash = ctx.createLinearGradient(0, dashY, 0, VIEW.h);
  dash.addColorStop(0, "rgba(9, 25, 42, 0.92)");
  dash.addColorStop(1, "rgba(1, 4, 10, 0.98)");
  ctx.fillStyle = dash;
  ctx.fillRect(0, dashY, VIEW.w, PANEL_H);
  ctx.strokeStyle = "rgba(128, 218, 255, 0.22)";
  ctx.beginPath();
  ctx.moveTo(0, dashY);
  ctx.lineTo(VIEW.w, dashY);
  ctx.stroke();
  ctx.restore();
}

function drawHud() {
  const p = game.player;
  const y = VIEW.h - PANEL_H + 42;
  drawGauge(24, y, 126, "HP", p.hp / 100, "#ff4f5f");
  drawGauge(264, y, 126, "O2", p.fuel / 100, "#30d6ff");

  ctx.fillStyle = "#e8f7ff";
  ctx.font = "700 24px Segoe UI, Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${game.collected}/${game.artifacts.length}`, VIEW.w / 2, y + 25);
  ctx.fillStyle = "#9fc3d0";
  ctx.font = "12px Segoe UI, Microsoft YaHei, sans-serif";
  ctx.fillText("文物", VIEW.w / 2, y + 50);

  ctx.fillStyle = "#e8f7ff";
  ctx.font = "700 18px Segoe UI, Microsoft YaHei, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`LEVEL ${levelIndex + 1}`, VIEW.w / 2, VIEW.h - 38);

  if (messageTime > 0) {
    ctx.fillStyle = "rgba(2, 12, 24, 0.72)";
    roundRect(38, 82, VIEW.w - 76, 48, 8);
    ctx.fill();
    ctx.fillStyle = "#e8f7ff";
    ctx.font = "700 15px Segoe UI, Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(message, VIEW.w / 2, 113);
  }
}

function drawGauge(x, y, w, label, pct, color) {
  ctx.fillStyle = "rgba(232, 247, 255, 0.08)";
  roundRect(x, y, w, 18, 8);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(x, y, Math.max(10, w * pct), 18, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(232, 247, 255, 0.22)";
  ctx.stroke();
  ctx.fillStyle = "#9fc3d0";
  ctx.font = "700 12px Segoe UI, Microsoft YaHei, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(label, x, y - 8);
}

function drawJoystick() {
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.strokeStyle = "rgba(232, 247, 255, 0.42)";
  ctx.fillStyle = "rgba(48, 214, 255, 0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pointer.startX, pointer.startY, 54, 0, TAU);
  ctx.fill();
  ctx.stroke();
  const dx = clamp(pointer.x - pointer.startX, -54, 54);
  const dy = clamp(pointer.y - pointer.startY, -54, 54);
  ctx.fillStyle = "rgba(232, 247, 255, 0.76)";
  ctx.beginPath();
  ctx.arc(pointer.startX + dx, pointer.startY + dy, 18, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function audioStart() {
  if (!audio) audio = createAudio();
  audio.resume();
}

function createAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const ac = new AudioContext();
  const master = ac.createGain();
  const musicGain = ac.createGain();
  master.gain.value = 0.58;
  musicGain.gain.value = 0.18;
  musicGain.connect(master);
  master.connect(ac.destination);
  let musicOn = true;
  let timer = null;
  let step = 0;
  const scale = [110, 146.83, 164.81, 196, 220, 261.63, 293.66, 329.63];

  function tone(freq, dur, type, gain, dest = master, when = ac.currentTime) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(when);
    osc.stop(when + dur + 0.03);
  }

  function noise(dur, gain, when = ac.currentTime) {
    const buffer = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    const g = ac.createGain();
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.buffer = buffer;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(when);
  }

  function tickMusic() {
    if (!musicOn || ac.state !== "running") return;
    const now = ac.currentTime;
    const root = scale[step % scale.length];
    tone(root, 1.8, "sine", 0.035, musicGain, now);
    tone(root * 1.5, 1.2, "triangle", 0.018, musicGain, now + 0.08);
    if (step % 4 === 0) noise(1.4, 0.012, now);
    step += 1;
  }

  timer = window.setInterval(tickMusic, 900);
  tickMusic();

  return {
    resume() {
      ac.resume();
    },
    toggleMusic() {
      musicOn = !musicOn;
      musicGain.gain.setTargetAtTime(musicOn ? 0.18 : 0.0001, ac.currentTime, 0.08);
      musicBtn.setAttribute("aria-pressed", String(musicOn));
      musicBtn.textContent = musicOn ? "♪" : "×";
      if (musicOn) tickMusic();
    },
    playClick() { tone(420, 0.08, "triangle", 0.08); },
    playScore() { tone(660, 0.1, "sine", 0.08); tone(990, 0.16, "sine", 0.06, master, ac.currentTime + 0.08); },
    playHit() { tone(130, 0.18, "sawtooth", 0.07); },
    playBoom() { noise(0.45, 0.16); tone(74, 0.36, "sawtooth", 0.08); },
    playWin() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, "triangle", 0.08, master, ac.currentTime + i * 0.12)); },
    playFail() { [196, 146.83, 98].forEach((f, i) => tone(f, 0.28, "sawtooth", 0.07, master, ac.currentTime + i * 0.18)); },
    stop() { window.clearInterval(timer); }
  };
}

function pointerPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * VIEW.w,
    y: ((evt.clientY - rect.top) / rect.height) * VIEW.h
  };
}

canvas.addEventListener("pointerdown", (evt) => {
  if (state !== "play") return;
  const pos = pointerPos(evt);
  pointer.active = true;
  pointer.id = evt.pointerId;
  pointer.startX = pos.x;
  pointer.startY = pos.y;
  pointer.x = pos.x;
  pointer.y = pos.y;
  canvas.setPointerCapture(evt.pointerId);
});

canvas.addEventListener("pointermove", (evt) => {
  if (!pointer.active || pointer.id !== evt.pointerId) return;
  const pos = pointerPos(evt);
  pointer.x = pos.x;
  pointer.y = pos.y;
});

function endPointer(evt) {
  if (pointer.id !== evt.pointerId) return;
  pointer.active = false;
  pointer.id = null;
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

window.addEventListener("keydown", (evt) => {
  if (state !== "play") return;
  const p = game.player;
  if (evt.key === "ArrowLeft" || evt.key.toLowerCase() === "a") p.vx -= 86;
  if (evt.key === "ArrowRight" || evt.key.toLowerCase() === "d") p.vx += 86;
  if (evt.key === "ArrowUp" || evt.key.toLowerCase() === "w") p.vy -= 86;
  if (evt.key === "ArrowDown" || evt.key.toLowerCase() === "s") p.vy += 86;
});

startBtn.addEventListener("click", startGame);
retryBtn.addEventListener("click", startGame);
nextBtn.addEventListener("click", () => {
  if (nextAction === "restart") startGame();
  else nextLevel();
});
musicBtn.addEventListener("click", () => {
  audioStart();
  audio.playClick();
  audio.toggleMusic();
});
window.addEventListener("resize", resize);

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

resize();
initLevel(0);
requestAnimationFrame(loop);
