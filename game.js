(() => {
  "use strict";

  const WIDTH = 1280;
  const HEIGHT = 720;
  const PLAYER_SIZE = 44;
  const BALL_RADIUS = 15;
  const SPECIAL_RADIUS = 17;
  const WALL_THICKNESS = 38;
  const COUNTDOWN = 5;
  const TURBO_DURATION = 10;
  const AI_REACTION_DELAY = 0.3;
  const TELEPORT_CHARGES_PER_PICKUP = 3;
  // The HUD occupies the top and bottom strips.  Keeping these limits in the
  // game coordinate system makes the visible boundary match the collision area.
  // The field spans the complete display width. Only the HUD strips above and
  // below reserve space outside the playable area.
  const ARENA_LEFT = 0;
  const ARENA_RIGHT = WIDTH;
  const ARENA_TOP = 112;
  const ARENA_BOTTOM = HEIGHT - 70;
  const WINNING_SCORES = [5, 10, 20, 50];
  const SPEEDS = { player: 460, cpu: 300 };
  const DIFFICULTIES = { Fácil: 0.78, Normal: 1, Difícil: 1.18 };
  const COLORS = {
    background: "#111526",
    white: "#f2f2ee",
    muted: "#a4a8b1",
    blue: "#20b8ff",
    blueLight: "#a8eaff",
    yellow: "#ffd32d",
    yellowLight: "#ffef97",
    green: "#38f58a",
    red: "#ff316f",
    purple: "#c869ff",
    teleport: "#49f4ff",
  };
  const TRACKS = [
    { name: "Música 1", src: "AUDIO013.wav" },
    { name: "Música 2", src: "AUDIO015.wav" },
  ];

  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#arena");
  const ctx = canvas.getContext("2d", { alpha: false });
  const overlay = $("#arena-overlay");
  const audio = new Audio();
  audio.loop = true;
  audio.volume = 0.35;

  const game = {
    screen: "setup",
    mode: "1",
    difficulty: "Normal",
    goalIndex: WINNING_SCORES.length - 1,
    trackIndex: 0,
    customTrack: null,
    walls: [],
    players: [],
    spawns: [],
    ball: null,
    damageBall: null,
    turboBall: null,
    teleportPickup: null,
    teleportBall: null,
    teleportAim: false,
    teleportTarget: null,
    teleportPlayerIndex: null,
    mouseTarget: null,
    lastHumanPlayer: 1,
    joysticks: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    nextDamage: 0,
    nextTurbo: 0,
    nextTeleport: 0,
    countdownStarted: 0,
    countdownShown: null,
    pausedAt: 0,
    winner: null,
    particles: [],
    floatingTexts: [],
    shockwaves: [],
    cameraShakeUntil: 0,
    cameraShakePower: 0,
    cameraShakeDuration: 0.24,
    hitStopUntil: 0,
    finalCinematic: null,
    finalStar: null,
    lastScores: [-1, -1],
    lastFrame: 0,
    audioStarted: false,
    loopActive: false,
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => Math.random() * (max - min) + min;
  const rectsOverlap = (a, b) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const playerRect = (player) => ({ x: player.x, y: player.y, w: PLAYER_SIZE, h: PLAYER_SIZE });
  const ballRect = (ball) => ({
    x: ball.x - ball.radius,
    y: ball.y - ball.radius,
    w: ball.radius * 2,
    h: ball.radius * 2,
  });
  const wallCollisionRect = (wall) => ({
    x: wall.x + 4,
    y: wall.y + 4,
    w: wall.w - 8,
    h: wall.h - 8,
  });

  function resizeCanvas() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    if (game.screen !== "setup") render(performance.now() / 1000);
  }

  function setupCanvas() {
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);
    window.addEventListener("resize", resizeCanvas);
    requestAnimationFrame(resizeCanvas);
  }

  function setMode(mode) {
    game.mode = mode;
    document.querySelectorAll(".segment").forEach((button) => {
      button.classList.toggle("is-selected", button.dataset.mode === mode);
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
  }

  function updateTrackLabel() {
    const track = game.customTrack || TRACKS[game.trackIndex];
    $("#track-name").textContent = `${track.name}${game.customTrack ? " · enviada" : " · padrão"}`;
  }

  function changeTrack() {
    if (game.customTrack) {
      audio.pause();
      audio.removeAttribute("src");
      URL.revokeObjectURL(game.customTrack.src);
      game.customTrack = null;
    }
    game.trackIndex = (game.trackIndex + 1) % TRACKS.length;
    updateTrackLabel();
    if (game.audioStarted) playMusic();
  }

  function uploadTrack(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (game.customTrack) URL.revokeObjectURL(game.customTrack.src);
    game.customTrack = { name: file.name.replace(/\.[^/.]+$/, "") || "Sua música", src: URL.createObjectURL(file) };
    updateTrackLabel();
    $(".keyboard-hint").textContent = `Faixa pronta: ${file.name}`;
    event.target.value = "";
    if (game.audioStarted) playMusic();
  }

  function playMusic() {
    const track = game.customTrack || TRACKS[game.trackIndex];
    audio.src = track.src;
    audio.play().then(() => {
      game.audioStarted = true;
      $(".keyboard-hint").textContent = "Tocando: " + track.name;
    }).catch(() => {
      $(".keyboard-hint").textContent = "O navegador bloqueou o áudio. A partida continua normalmente.";
    });
  }

  function updateGoal() {
    $("#goal-value").textContent = String(WINNING_SCORES[game.goalIndex]);
  }

  function startMatch() {
    game.difficulty = $("#difficulty").value;
    game.winner = null;
    game.particles = [];
    game.floatingTexts = [];
    game.damageBall = null;
    game.turboBall = null;
    game.teleportPickup = null;
    game.teleportBall = null;
    game.teleportAim = false;
    game.teleportTarget = null;
    game.teleportPlayerIndex = null;
    game.lastHumanPlayer = 1;
    game.shockwaves = [];
    game.cameraShakeUntil = 0;
    game.cameraShakePower = 0;
    game.cameraShakeDuration = 0.24;
    game.finalCinematic = null;
    game.finalStar = null;
    game.lastScores = [-1, -1];
    game.hitStopUntil = 0;
    game.keys.clear();
    game.joysticks = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
    game.players = [
      {
        name: game.mode === "1" ? "ROBÔ" : "AZUL",
        color: COLORS.blue,
        accent: COLORS.blueLight,
        x: 88,
        y: (ARENA_TOP + ARENA_BOTTOM) / 2 - PLAYER_SIZE / 2,
        isAI: game.mode === "1",
        score: 0,
        teleportCharges: 0,
        turboUntil: 0,
        aiTarget: null,
        aiNextReaction: 0,
        hiddenUntil: 0,
        wallHitUntil: 0,
        wallShakeUntil: 0,
        trail: [],
      },
      {
        name: game.mode === "1" ? "VOCÊ" : "AMARELO",
        color: COLORS.yellow,
        accent: COLORS.yellowLight,
        x: WIDTH - 88 - PLAYER_SIZE,
        y: (ARENA_TOP + ARENA_BOTTOM) / 2 - PLAYER_SIZE / 2,
        isAI: false,
        score: 0,
        teleportCharges: 0,
        turboUntil: 0,
        aiTarget: null,
        aiNextReaction: 0,
        hiddenUntil: 0,
        wallHitUntil: 0,
        wallShakeUntil: 0,
        trail: [],
      },
    ];
    game.spawns = [
      { x: 88, y: (ARENA_TOP + ARENA_BOTTOM) / 2 - PLAYER_SIZE / 2 },
      { x: WIDTH - 88 - PLAYER_SIZE, y: (ARENA_TOP + ARENA_BOTTOM) / 2 - PLAYER_SIZE / 2 },
    ];
    game.ball = { x: 0, y: 0, radius: BALL_RADIUS };
    game.walls = makeWalls();
    game.ball = findBallPosition(BALL_RADIUS);
    game.countdownStarted = performance.now() / 1000;
    game.countdownShown = null;
    game.nextDamage = game.countdownStarted + COUNTDOWN + 12;
    game.nextTurbo = game.countdownStarted + COUNTDOWN + 18;
    game.nextTeleport = game.countdownStarted + COUNTDOWN + 10;
    game.screen = "countdown";
    $("#setup-screen").classList.add("is-hidden");
    $("#game-screen").classList.remove("is-hidden");
    document.body.classList.add("is-playing");
    document.body.classList.toggle("is-solo", game.mode === "1");
    updateOrientationGate();
    resetJoystickKnobs();
    $("#game-mode-title").textContent = game.mode === "1" ? "Contra o Robô" : "2 jogadores";
    $("#blue-name").textContent = game.mode === "1" ? "ROBÔ" : "AZUL";
    $("#yellow-name").textContent = game.mode === "1" ? "VOCÊ" : "AMARELO";
    $("#score-goal").textContent = String(WINNING_SCORES[game.goalIndex]);
    $("#controls-help").innerHTML = game.mode === "1"
      ? "SETAS OU WASD <span>·</span> T + CLIQUE TELEPORTA <span>·</span> P PAUSA"
      : "AZUL: WASD <span>·</span> AMARELO: SETAS <span>·</span> T + CLIQUE TELEPORTA";
    $("#pause-button").textContent = "Ⅱ";
    $("#pause-button").setAttribute("aria-label", "Pausar jogo");
    overlay.innerHTML = "";
    playMusic();
    if (isTouchDevice()) void enterMobileFullscreen();
    resizeCanvas();
    updateScoreboard();
    if (!game.loopActive) {
      game.loopActive = true;
      requestAnimationFrame((time) => {
        game.lastFrame = time;
        requestAnimationFrame(loop);
      });
    }
  }

  function makeWalls() {
    const previous = game.walls.map((wall) => `${wall.x},${wall.y},${wall.w},${wall.h}`).join("|");
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const walls = [];
      const layout = Math.floor(Math.random() * 3);
      if (layout === 0) {
        const x = Math.round(random(WIDTH / 2 - 90, WIDTH / 2 + 66));
        const gapTop = Math.round(random((ARENA_TOP + ARENA_BOTTOM) / 2 - 105, (ARENA_TOP + ARENA_BOTTOM) / 2 - 50));
        const gapBottom = gapTop + Math.round(random(150, 205));
        walls.push(
          { x, y: ARENA_TOP, w: WALL_THICKNESS, h: gapTop - ARENA_TOP },
          { x, y: gapBottom, w: WALL_THICKNESS, h: ARENA_BOTTOM - gapBottom },
        );
      } else if (layout === 1) {
        const y = Math.round(random((ARENA_TOP + ARENA_BOTTOM) / 2 - 90, (ARENA_TOP + ARENA_BOTTOM) / 2 + 42));
        const gapLeft = Math.round(random(WIDTH / 2 - 170, WIDTH / 2 - 70));
        const gapRight = gapLeft + Math.round(random(180, 250));
        walls.push(
          { x: ARENA_LEFT + 230, y, w: gapLeft - (ARENA_LEFT + 230), h: WALL_THICKNESS },
          { x: gapRight, y, w: ARENA_RIGHT - 230 - gapRight, h: WALL_THICKNESS },
        );
      } else {
        for (let index = 0; index < 2; index += 1) {
          walls.push({
            x: Math.round(random(index === 0 ? 355 : 810, index === 0 ? 435 : 890)),
            y: Math.round(random(index === 0 ? ARENA_TOP + 58 : 260, index === 0 ? 390 : ARENA_BOTTOM - 200)),
            w: WALL_THICKNESS,
            h: Math.round(random(115, 190)),
          });
        }
      }
      const hasOverlap = walls.some((wall, index) =>
        walls.slice(index + 1).some((other) => rectsOverlap(wall, other)),
      );
      const blocksSpawn = walls.some((wall) =>
        game.players.some((player) => rectsOverlap(playerRect(player), wallCollisionRect(wall))),
      );
      const signature = walls.map((wall) => `${wall.x},${wall.y},${wall.w},${wall.h}`).join("|");
      if (!hasOverlap && !blocksSpawn && signature !== previous) return walls;
    }
    throw new Error("Não foi possível criar um layout de muros seguro.");
  }

  function findBallPosition(radius, occupied = []) {
    const safePlayers = game.players.map((player) => ({
      x: player.x - PLAYER_SIZE,
      y: player.y - PLAYER_SIZE,
      w: PLAYER_SIZE * 3,
      h: PLAYER_SIZE * 3,
    }));
    const isFree = (x, y) => {
      const ball = { x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 };
      return !game.walls.some((wall) => rectsOverlap(ball, wallCollisionRect(wall))) &&
        !safePlayers.some((safe) => rectsOverlap(ball, safe)) &&
        !occupied.some((other) => rectsOverlap(ball, ballRect(other)));
    };
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const x = random(ARENA_LEFT + radius, ARENA_RIGHT - radius);
      const y = random(ARENA_TOP + radius, ARENA_BOTTOM - radius);
      if (isFree(x, y)) return { x, y, radius };
    }
    for (let y = ARENA_TOP + radius; y < ARENA_BOTTOM - radius; y += 28) {
      for (let x = ARENA_LEFT + radius; x < ARENA_RIGHT - radius; x += 28) {
        if (isFree(x, y)) return { x, y, radius };
      }
    }
    throw new Error("Não há espaço livre para posicionar uma bola.");
  }

  function relocateBalls() {
    const occupied = [];
    game.ball = findBallPosition(BALL_RADIUS, occupied);
    occupied.push(game.ball);
    if (game.damageBall) {
      const { expires } = game.damageBall;
      game.damageBall = findBallPosition(SPECIAL_RADIUS, occupied);
      game.damageBall.expires = expires;
      occupied.push(game.damageBall);
    }
    if (game.turboBall) {
      const { expires } = game.turboBall;
      game.turboBall = findBallPosition(SPECIAL_RADIUS, occupied);
      game.turboBall.expires = expires;
      occupied.push(game.turboBall);
    }
    if (game.teleportPickup) {
      const { expires } = game.teleportPickup;
      game.teleportPickup = findBallPosition(SPECIAL_RADIUS, occupied);
      game.teleportPickup.expires = expires;
    }
  }

  function movePlayer(player, direction, distance) {
    const now = performance.now() / 1000;
    if (now < player.hiddenUntil || now < player.wallHitUntil) return;
    player.x = clamp(player.x + direction.x * distance, ARENA_LEFT, ARENA_RIGHT - PLAYER_SIZE);
    if (hitsWall(playerRect(player))) {
      hitWall(player, now);
      return;
    }
    player.y = clamp(player.y + direction.y * distance, ARENA_TOP, ARENA_BOTTOM - PLAYER_SIZE);
    if (hitsWall(playerRect(player))) hitWall(player, now);
  }

  function hitsWall(rect) {
    return game.walls.some((wall) => rectsOverlap(rect, wallCollisionRect(wall)));
  }

  function hitWall(player, now) {
    const spawn = game.spawns[game.players.indexOf(player)];
    player.x = spawn.x;
    player.y = spawn.y;
    player.trail.length = 0;
    player.wallHitUntil = now + 0.18;
    player.wallShakeUntil = now + 0.32;
    game.cameraShakePower = Math.max(game.cameraShakePower, 5);
    game.cameraShakeUntil = now + 0.2;
    game.cameraShakeDuration = 0.2;
  }

  function normalizedDirection(x, y) {
    const length = Math.hypot(x, y);
    return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
  }

  function getCpuTarget(player) {
    if (game.difficulty !== "Difícil") return game.ball;
    const centerX = player.x + PLAYER_SIZE / 2;
    const centerY = player.y + PLAYER_SIZE / 2;
    const specialBalls = [game.damageBall, game.turboBall].filter(Boolean);
    return specialBalls.reduce((closest, ball) => {
      if (!closest) return ball;
      const distance = Math.hypot(ball.x - centerX, ball.y - centerY);
      const closestDistance = Math.hypot(closest.x - centerX, closest.y - centerY);
      return distance < closestDistance ? ball : closest;
    }, null) || game.ball;
  }

  function getHumanDirection(index) {
    const keys = game.keys;
    let direction;
    if (game.mode === "1" && index === 1) {
      direction = {
        x: Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft")),
        y: Number(keys.has("s") || keys.has("arrowdown")) - Number(keys.has("w") || keys.has("arrowup")),
      };
    } else if (index === 0) {
      direction = { x: Number(keys.has("d")) - Number(keys.has("a")), y: Number(keys.has("s")) - Number(keys.has("w")) };
    } else {
      direction = {
        x: Number(keys.has("arrowright")) - Number(keys.has("arrowleft")),
        y: Number(keys.has("arrowdown")) - Number(keys.has("arrowup")),
      };
    }
    const joystick = game.joysticks[index];
    direction.x += joystick.x;
    direction.y += joystick.y;
    const normalized = normalizedDirection(direction.x, direction.y);
    if (normalized.x || normalized.y) game.lastHumanPlayer = index;
    return normalized;
  }

  function cpuDirection(player) {
    const center = { x: player.x + PLAYER_SIZE / 2, y: player.y + PLAYER_SIZE / 2 };
    const target = { ...(player.aiTarget || game.ball) };
    if ((center.x < WIDTH / 2 && target.x > WIDTH / 2) ||
        (target.x < WIDTH / 2 && center.x > WIDTH / 2)) target.y = HEIGHT / 2;
    let dx = target.x - center.x;
    let dy = target.y - center.y;
    let length = Math.hypot(dx, dy);
    if (length > 0) { dx /= length; dy /= length; }
    for (const wall of game.walls) {
      const expanded = wallCollisionRect(wall);
      const nearestX = clamp(center.x, expanded.x, expanded.x + expanded.w);
      const nearestY = clamp(center.y, expanded.y, expanded.y + expanded.h);
      const awayX = center.x - nearestX;
      const awayY = center.y - nearestY;
      const distance = Math.hypot(awayX, awayY);
      if (distance > 0 && distance < 95) {
        const force = ((95 - distance) / 95) * 1.25;
        dx += (awayX / distance) * force;
        dy += (awayY / distance) * force;
      }
    }
    if (center.x < 70) dx += 0.7;
    else if (center.x > WIDTH - 70) dx -= 0.7;
    if (center.y < 65) dy += 0.7;
    else if (center.y > HEIGHT - 65) dy -= 0.7;
    return normalizedDirection(dx, dy);
  }

  function update(dt, now) {
    updateFinalCinematic(now);
    for (let index = 0; index < game.players.length; index += 1) {
      const player = game.players[index];
      const playerHidden = now < player.hiddenUntil;
      player.trail.push({ x: player.x + PLAYER_SIZE / 2, y: player.y + PLAYER_SIZE / 2 });
      if (player.trail.length > 7) player.trail.shift();
      let direction;
      if (player.isAI) {
        if (now >= player.aiNextReaction) {
          player.aiTarget = { ...getCpuTarget(player) };
          player.aiNextReaction = now + AI_REACTION_DELAY;
        }
        direction = cpuDirection(player);
      } else {
        direction = getHumanDirection(index);
      }
      let speed = player.isAI
        ? SPEEDS.cpu * Math.min(DIFFICULTIES[game.difficulty], 1.08)
        : SPEEDS.player;
      if (now < player.turboUntil) speed *= 2;
      const finalApproachHold = game.finalCinematic?.phase === "approach" &&
        game.finalCinematic.playerIndex === index;
      if (!playerHidden && now >= player.wallHitUntil && !finalApproachHold) {
        movePlayer(player, direction, speed * dt);
      }
    }
    const playersVisible = game.players.every((player) => now >= player.hiddenUntil);
    if (playersVisible && rectsOverlap(playerRect(game.players[0]), playerRect(game.players[1]))) {
      for (const player of game.players) {
        burst(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2, player.color, 13);
        const spawn = game.spawns[game.players.indexOf(player)];
        player.x = spawn.x;
        player.y = spawn.y;
        player.trail.length = 0;
      }
    }
    updateFinalApproach(now);
    checkPickups(now);
    updateSpecialBalls(now);
    if (now >= game.hitStopUntil) {
      updateEffects(dt);
      updateCinematicEffects(dt, now);
    }
    if (game.teleportBall && now >= game.teleportBall.expires) game.teleportBall = null;
    if (game.hitStopUntil && now >= game.hitStopUntil) game.hitStopUntil = 0;
    updateScoreboard();
  }

  function checkPickups(now) {
    if (game.finalCinematic?.phase === "approach") return;
    for (const player of game.players) {
      if (now >= player.hiddenUntil && rectsOverlap(playerRect(player), ballRect(game.ball))) {
        collectBall(player, "green", now, { x: game.ball.x, y: game.ball.y });
        break;
      }
    }
    if (game.screen === "game-over") return;
    for (const [kind, ball] of [["damage", game.damageBall], ["turbo", game.turboBall]]) {
      if (!ball) continue;
      const player = game.players.find((candidate) =>
        now >= candidate.hiddenUntil && rectsOverlap(playerRect(candidate), ballRect(ball)),
      );
      if (player) {
        const collectedBall = { ...ball };
        collectBall(player, kind, now, collectedBall);
        if (kind === "damage") {
          game.damageBall = null;
          game.nextDamage = now + 12;
        } else {
          game.turboBall = null;
          game.nextTurbo = now + 18;
        }
      }
    }
    if (game.teleportPickup) {
      const player = game.players.find((candidate) =>
        !candidate.isAI && now >= candidate.hiddenUntil &&
        rectsOverlap(playerRect(candidate), ballRect(game.teleportPickup)),
      );
      if (player) {
        const { x, y } = game.teleportPickup;
        player.teleportCharges += TELEPORT_CHARGES_PER_PICKUP;
        game.teleportPickup = null;
        game.nextTeleport = now + 18;
        addCinematicImpact(x, y, COLORS.teleport, "teleport-charge");
        floatingText("TELEPORTE ×3", player.x + PLAYER_SIZE / 2, player.y, COLORS.teleport);
      }
    }
  }

  function collectBall(player, kind, now, impactPoint) {
    player.score += 1;
    const color = kind === "damage" ? COLORS.red : kind === "turbo" ? COLORS.purple : player.accent;
    burst(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2, color, kind === "green" ? 14 : 24);
    addCinematicImpact(impactPoint.x, impactPoint.y, color, kind);
    floatingText(kind === "damage" ? "ATAQUE! +1" : kind === "turbo" ? "TURBO! +1" : "+1 PONTO",
      player.x + PLAYER_SIZE / 2, player.y, color);
    if (kind === "damage") {
      const opponent = game.players[1 - game.players.indexOf(player)];
      opponent.score = Math.max(0, opponent.score - 1);
      floatingText("-1 PONTO", opponent.x + PLAYER_SIZE / 2, opponent.y, COLORS.red);
      burst(opponent.x + PLAYER_SIZE / 2, opponent.y + PLAYER_SIZE / 2, COLORS.red, 18);
      const spawn = game.spawns[game.players.indexOf(opponent)];
      opponent.x = spawn.x;
      opponent.y = spawn.y;
      opponent.trail.length = 0;
      opponent.hiddenUntil = now + 0.42;
    } else if (kind === "turbo") {
      player.turboUntil = now + TURBO_DURATION;
    } else {
      game.walls = makeWalls();
      relocateBalls();
    }
    if (player.score >= WINNING_SCORES[game.goalIndex]) {
      game.winner = player;
      game.screen = "game-over";
      game.finalStar = { ...impactPoint, startedAt: now, duration: 1.7 };
      game.finalCinematic ||= {
        phase: "impact",
        startedAt: now,
        x: impactPoint.x,
        y: impactPoint.y,
        playerIndex: game.players.indexOf(player),
      };
      game.finalCinematic.phase = "impact";
      game.finalCinematic.startedAt = now;
      game.finalCinematic.x = impactPoint.x;
      game.finalCinematic.y = impactPoint.y;
      game.cameraShakePower = Math.max(game.cameraShakePower, 24);
      game.cameraShakeUntil = now + 1.05;
      game.cameraShakeDuration = 1.05;
      overlay.innerHTML = "";
    }
  }

  function updateFinalApproach(now) {
    if (game.screen !== "playing") return;
    if (game.finalCinematic) {
      if (game.finalCinematic.phase !== "cooldown") return;
      const player = game.players[game.finalCinematic.playerIndex];
      if (!player || Math.hypot(
        player.x + PLAYER_SIZE / 2 - game.finalCinematic.x,
        player.y + PLAYER_SIZE / 2 - game.finalCinematic.y,
      ) <= PLAYER_SIZE + SPECIAL_RADIUS + 24) return;
      game.finalCinematic = null;
    }
    const targetScore = WINNING_SCORES[game.goalIndex] - 1;
    const balls = [game.ball, game.damageBall, game.turboBall].filter(Boolean);
    for (let index = 0; index < game.players.length; index += 1) {
      const player = game.players[index];
      if (player.score < targetScore || now < player.hiddenUntil) continue;
      const rect = playerRect(player);
      const ball = balls
        .map((candidate) => {
          const nearestX = clamp(candidate.x, rect.x, rect.x + rect.w);
          const nearestY = clamp(candidate.y, rect.y, rect.y + rect.h);
          return {
            candidate,
            distance: Math.hypot(candidate.x - nearestX, candidate.y - nearestY) - candidate.radius,
          };
        })
        .sort((a, b) => a.distance - b.distance)[0];
      if (ball && (ball.distance <= 10 || rectsOverlap(rect, ballRect(ball.candidate)))) {
        game.finalCinematic = {
          phase: "approach",
          startedAt: now,
          x: ball.candidate.x,
          y: ball.candidate.y,
          playerIndex: index,
        };
        return;
      }
    }
  }

  function updateFinalCinematic(now) {
    const cinematic = game.finalCinematic;
    if (!cinematic) return;
    if (cinematic.phase === "approach" && now - cinematic.startedAt >= 0.38) {
      cinematic.phase = "ready";
      cinematic.startedAt = now;
      cinematic.readyUntil = now + 1.35;
    } else if (cinematic.phase === "ready" && now >= cinematic.readyUntil) {
      cinematic.phase = "zoom-out";
      cinematic.startedAt = now;
      cinematic.showWinner = false;
    } else if (cinematic.phase === "impact" && now - cinematic.startedAt >= 0.86) {
      cinematic.phase = "zoom-out";
      cinematic.startedAt = now;
      cinematic.showWinner = true;
    } else if (cinematic.phase === "zoom-out" && now - cinematic.startedAt >= 0.74) {
      if (cinematic.showWinner) {
        cinematic.phase = "winner";
        showWinner();
      } else {
        cinematic.phase = "cooldown";
      }
    }
  }

  function updateSpecialBalls(now) {
    if (game.damageBall) {
      if (now >= game.damageBall.expires) {
        game.damageBall = null;
        game.nextDamage = now + 3;
      }
    } else if (now >= game.nextDamage) {
      game.damageBall = findBallPosition(SPECIAL_RADIUS, [game.ball, game.turboBall].filter(Boolean));
      game.damageBall.expires = now + 8;
    }
    if (game.turboBall) {
      if (now >= game.turboBall.expires) {
        game.turboBall = null;
        game.nextTurbo = now + 3;
      }
    } else if (now >= game.nextTurbo) {
      game.turboBall = findBallPosition(SPECIAL_RADIUS, [game.ball, game.damageBall].filter(Boolean));
      game.turboBall.expires = now + 8;
    }
    if (game.teleportPickup) {
      if (now >= game.teleportPickup.expires) {
        game.teleportPickup = null;
        game.nextTeleport = now + 4;
      }
    } else if (now >= game.nextTeleport) {
      game.teleportPickup = findBallPosition(
        SPECIAL_RADIUS,
        [game.ball, game.damageBall, game.turboBall].filter(Boolean),
      );
      game.teleportPickup.expires = now + 10;
    }
  }

  function getTeleportPlayerIndex() {
    return game.mode === "1" ? 1 : game.lastHumanPlayer;
  }

  function beginTeleportAim() {
    if (game.screen !== "playing") return;
    if (!game.teleportAim) {
      const playerIndex = getTeleportPlayerIndex();
      const player = game.players[playerIndex];
      if (!player || player.teleportCharges <= 0) {
        if (player) {
          floatingText("PEGUE A BOLA AZUL", player.x + PLAYER_SIZE / 2, player.y, COLORS.teleport);
        }
        return;
      }
      game.teleportPlayerIndex = playerIndex;
    } else {
      game.teleportPlayerIndex = null;
    }
    game.teleportAim = !game.teleportAim;
    game.teleportTarget = null;
    canvas.classList.toggle("teleport-aim", game.teleportAim);
    $("#touch-teleport").classList.toggle("is-armed", game.teleportAim);
    $("#controls-help").classList.toggle("teleport-hint", game.teleportAim);
    $("#controls-help").innerHTML = game.teleportAim
      ? "TELEPORTE ATIVO <span>·</span> CLIQUE NO DESTINO <span>·</span> T CANCELA"
      : game.mode === "1"
        ? "SETAS OU WASD <span>·</span> T + CLIQUE TELEPORTA <span>·</span> P PAUSA"
        : "AZUL: WASD <span>·</span> AMARELO: SETAS <span>·</span> T + CLIQUE TELEPORTA";
  }

  function pointerToArena(event) {
    const bounds = canvas.getBoundingClientRect();
    const scale = Math.max(bounds.width / WIDTH, bounds.height / HEIGHT);
    const offsetX = (bounds.width - WIDTH * scale) / 2;
    const offsetY = (bounds.height - HEIGHT * scale) / 2;
    return {
      x: clamp((event.clientX - bounds.left - offsetX) / scale, 0, WIDTH),
      y: clamp((event.clientY - bounds.top - offsetY) / scale, 0, HEIGHT),
    };
  }

  function teleportToPointer(point) {
    const now = performance.now() / 1000;
    const destination = { x: point.x - PLAYER_SIZE / 2, y: point.y - PLAYER_SIZE / 2, w: PLAYER_SIZE, h: PLAYER_SIZE };
    destination.x = clamp(destination.x, ARENA_LEFT + 12, ARENA_RIGHT - PLAYER_SIZE - 12);
    destination.y = clamp(destination.y, ARENA_TOP + 12, ARENA_BOTTOM - PLAYER_SIZE - 12);
    const landingPoint = { x: destination.x + PLAYER_SIZE / 2, y: destination.y + PLAYER_SIZE / 2 };
    const playerIndex = game.teleportPlayerIndex;
    if (playerIndex === null) return;
    const player = game.players[playerIndex];
    if (!player || player.isAI || player.teleportCharges <= 0) return;
    const blockedByWall = game.walls.some((wall) => rectsOverlap(destination, wallCollisionRect(wall)));
    const blockedByPlayer = game.players.some((other, index) =>
      index !== playerIndex && now >= other.hiddenUntil && rectsOverlap(destination, playerRect(other)),
    );
    if (blockedByWall || blockedByPlayer) {
      floatingText(blockedByWall ? "DESTINO BLOQUEADO" : "DESTINO OCUPADO", landingPoint.x, landingPoint.y - 22, COLORS.red);
      burst(landingPoint.x, landingPoint.y, COLORS.red, 18);
      game.teleportBall = { x: landingPoint.x, y: landingPoint.y, radius: 13, expires: now + 0.36 };
      game.cameraShakePower = 5;
      game.cameraShakeUntil = now + 0.12;
      game.cameraShakeDuration = 0.12;
      game.teleportAim = false;
      game.teleportTarget = null;
      game.teleportPlayerIndex = null;
      canvas.classList.remove("teleport-aim");
      $("#touch-teleport").classList.remove("is-armed");
      beginTeleportAimCleanup();
      return;
    }
    burst(player.x + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2, "#69e5df", 24);
    player.x = destination.x;
    player.y = destination.y;
    player.teleportCharges -= 1;
    player.hiddenUntil = 0;
    player.trail.length = 0;
    game.teleportBall = { x: landingPoint.x, y: landingPoint.y, radius: 13, expires: now + 0.72 };
    addCinematicImpact(landingPoint.x, landingPoint.y, "#69e5df", "teleport");
    floatingText("TELEPORTE!", landingPoint.x, landingPoint.y - 26, "#9ffff8");
    game.teleportAim = false;
    game.teleportTarget = null;
    game.teleportPlayerIndex = null;
    canvas.classList.remove("teleport-aim");
    $("#touch-teleport").classList.remove("is-armed");
    beginTeleportAimCleanup();
  }

  function beginTeleportAimCleanup() {
    $("#controls-help").classList.remove("teleport-hint");
    $("#controls-help").innerHTML = game.mode === "1"
      ? "SETAS OU WASD <span>·</span> T + CLIQUE TELEPORTA <span>·</span> P PAUSA"
      : "AZUL: WASD <span>·</span> AMARELO: SETAS <span>·</span> T + CLIQUE TELEPORTA";
  }

  function updateEffects(dt) {
    for (const particle of game.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
      particle.life -= dt;
    }
    game.particles = game.particles.filter((particle) => particle.life > 0);
    for (const text of game.floatingTexts) {
      text.y -= 45 * dt;
      text.life -= dt;
    }
    game.floatingTexts = game.floatingTexts.filter((text) => text.life > 0);
  }

  function addCinematicImpact(x, y, color, kind) {
    if (kind === "green") {
      game.shockwaves.push({ x, y, color, life: 0.72, maxLife: 0.72, maxRadius: 125 });
      game.shockwaves.push({ x, y, color: "#ffffff", life: 0.56, maxLife: 0.56, maxRadius: 76, delay: 0.08 });
      burst(x, y, color, 14);
      return;
    }
    if (kind === "teleport-charge") {
      game.shockwaves.push({ x, y, color, life: 0.48, maxLife: 0.48, maxRadius: 145 });
      game.shockwaves.push({ x, y, color: "#ffffff", life: 0.3, maxLife: 0.3, maxRadius: 88 });
      game.cameraShakePower = Math.max(game.cameraShakePower, 4);
      game.cameraShakeUntil = performance.now() / 1000 + 0.12;
      game.cameraShakeDuration = 0.12;
      burst(x, y, color, 22);
      return;
    }
    if (kind === "turbo") {
      game.shockwaves.push({ x, y, color, life: 0.7, maxLife: 0.7, maxRadius: 220, kind: "turbo" });
      game.shockwaves.push({ x, y, color: "#f4dcff", life: 0.5, maxLife: 0.5, maxRadius: 145, kind: "turbo", delay: 0.09 });
      game.cameraShakePower = Math.max(game.cameraShakePower, 7);
      game.cameraShakeUntil = performance.now() / 1000 + 0.18;
      game.cameraShakeDuration = 0.18;
      burst(x, y, color, 32);
      return;
    }
    game.shockwaves.push({ x, y, color, life: 0.62, maxLife: 0.62, maxRadius: 245 });
    game.shockwaves.push({ x, y, color: "#ffffff", life: 0.31, maxLife: 0.31, maxRadius: 138 });
    game.shockwaves.push({ x, y, color, life: 0.44, maxLife: 0.44, maxRadius: 175, delay: 0.11 });
    game.cameraShakePower = Math.max(game.cameraShakePower, kind === "damage" ? 13 : 9);
    game.cameraShakeUntil = performance.now() / 1000 + 0.24;
    game.cameraShakeDuration = 0.24;
    game.hitStopUntil = performance.now() / 1000 + 0.045;
    burst(x, y, color, 44);
  }

  function updateCinematicEffects(dt, now) {
    for (const wave of game.shockwaves) {
      if (wave.delay > 0) wave.delay -= dt;
      else wave.life -= dt;
    }
    game.shockwaves = game.shockwaves.filter((wave) => wave.life > 0);
    if (now >= game.cameraShakeUntil) game.cameraShakePower = 0;
  }

  function drawFinalStar(now) {
    const star = game.finalStar;
    if (!star) return;
    const progress = clamp((now - star.startedAt) / star.duration, 0, 1);
    if (progress >= 1) {
      game.finalStar = null;
      return;
    }
    const ignition = clamp(progress / 0.16, 0, 1);
    const fade = clamp((1 - progress) / 0.28, 0, 1);
    const alpha = Math.min(ignition, fade);
    const pulse = 0.82 + Math.sin(progress * Math.PI * 11) * 0.18;
    const length = (58 + Math.sin(progress * Math.PI) * 92) * ignition;
    ctx.save();
    ctx.translate(star.x, star.y);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * .24;
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 68;
    const bloom = ctx.createRadialGradient(0, 0, 0, 0, 0, length * 1.15);
    bloom.addColorStop(0, "rgba(255,255,255,.95)");
    bloom.addColorStop(.08, "rgba(213,231,255,.65)");
    bloom.addColorStop(.35, "rgba(160,201,255,.16)");
    bloom.addColorStop(1, "rgba(120,166,255,0)");
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(0, 0, length * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * pulse;
    ctx.rotate(progress * Math.PI * 2.4);
    for (let ray = 0; ray < 4; ray += 1) {
      ctx.save();
      ctx.rotate(ray * Math.PI / 2);
      const rayGradient = ctx.createLinearGradient(0, 0, 0, -length);
      rayGradient.addColorStop(0, "rgba(255,255,255,.96)");
      rayGradient.addColorStop(.22, "rgba(232,243,255,.9)");
      rayGradient.addColorStop(1, "rgba(191,221,255,0)");
      ctx.fillStyle = rayGradient;
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(-8, -length * 0.33);
      ctx.lineTo(0, -length);
      ctx.lineTo(8, -length * 0.33);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.shadowBlur = 38;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 9 + ignition * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function burst(x, y, color, count) {
    for (let index = 0; index < count; index += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(75, 270);
      const life = random(0.35, 0.8);
      game.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        color, life, maxLife: life, size: random(2, 5),
      });
    }
  }

  function floatingText(text, x, y, color) {
    game.floatingTexts.push({ text, x, y, color, life: 1 });
  }

  function updateScoreboard() {
    if (game.players.length !== 2) return;
    const goal = WINNING_SCORES[game.goalIndex];
    game.players.forEach((player, index) => {
      const score = player.score;
      const scoreElement = index === 0 ? $("#blue-score") : $("#yellow-score");
      const progressElement = index === 0 ? $("#blue-progress") : $("#yellow-progress");
      scoreElement.textContent = String(score).padStart(2, "0");
      progressElement.style.width = `${clamp(score / goal, 0, 1) * 100}%`;
      if (game.lastScores[index] !== -1 && game.lastScores[index] !== score) {
        scoreElement.classList.remove("score-pop");
        void scoreElement.offsetWidth;
        scoreElement.classList.add("score-pop");
      }
      game.lastScores[index] = score;
    });
    const player = game.players[getTeleportPlayerIndex()];
    const charges = player?.teleportCharges || 0;
    $("#teleport-count").textContent = String(charges);
    document.querySelector(".teleport-stock").style.setProperty(
      "--charge-level",
      String(Math.min(charges, 12) / 12),
    );
    $("#touch-teleport-count").textContent = String(charges);
    $("#touch-teleport").setAttribute("aria-label", `Ativar teleporte; ${charges} usos disponíveis`);
  }

  function roundRect(x, y, width, height, radius, fill, stroke = null, lineWidth = 1) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lineWidth; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function drawInfiniteBackdrop(now) {
    const width = canvas.width;
    const height = canvas.height;
    const drift = (now * 22) % 80;
    const glow = ctx.createRadialGradient(width * .5, height * .35, 0, width * .5, height * .45, Math.max(width, height) * .82);
    glow.addColorStop(0, "#142a49");
    glow.addColorStop(.52, "#080f1d");
    glow.addColorStop(1, "#03050b");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.strokeStyle = "rgba(73,244,255,.09)";
    ctx.lineWidth = Math.max(1, window.devicePixelRatio || 1);
    for (let x = -80 + drift; x < width + 80; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = -80 + drift; y < height + 80; y += 80) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    ctx.globalAlpha = .12;
    ctx.fillStyle = "#9ddfff";
    for (let index = 0; index < 45; index += 1) {
      const x = (index * 197 + now * 14) % (width + 40) - 20;
      const y = (index * 97 + now * 7) % (height + 30) - 15;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
    ctx.restore();
  }

  function drawArena() {
    const now = performance.now() / 1000;
    const outerGradient = ctx.createLinearGradient(-400, -400, WIDTH + 400, HEIGHT + 400);
    outerGradient.addColorStop(0, "#152c4c");
    outerGradient.addColorStop(.5, "#070d19");
    outerGradient.addColorStop(1, "#21112c");
    ctx.fillStyle = outerGradient;
    // Overscan keeps the visual world continuous while the camera shakes or zooms.
    ctx.fillRect(-1600, -1600, WIDTH + 3200, HEIGHT + 3200);
    const fieldX = ARENA_LEFT;
    const fieldY = ARENA_TOP;
    const fieldWidth = ARENA_RIGHT - ARENA_LEFT;
    const fieldHeight = ARENA_BOTTOM - ARENA_TOP;
    ctx.save();
    ctx.shadowColor = "rgba(73,244,255,.42)";
    ctx.shadowBlur = 24;
    roundRect(fieldX, fieldY, fieldWidth, fieldHeight, 0, "#101a2b", "rgba(73,244,255,.72)", 2);
    ctx.restore();
    const gradient = ctx.createLinearGradient(0, fieldY, 0, fieldY + fieldHeight);
    gradient.addColorStop(0, "#172944");
    gradient.addColorStop(1, "#0a1221");
    roundRect(fieldX + 2, fieldY + 2, fieldWidth - 4, fieldHeight - 4, 0, gradient);
    ctx.save();
    ctx.beginPath();
    ctx.rect(fieldX + 2, fieldY + 2, fieldWidth - 4, fieldHeight - 4);
    ctx.clip();
    ctx.strokeStyle = "rgba(215,228,255,.035)";
    ctx.lineWidth = 1;
    for (let x = fieldX + 18; x < fieldX + fieldWidth; x += 48) {
      ctx.beginPath(); ctx.moveTo(x, fieldY); ctx.lineTo(x, fieldY + fieldHeight); ctx.stroke();
    }
    for (let y = fieldY + 18; y < fieldY + fieldHeight; y += 48) {
      ctx.beginPath(); ctx.moveTo(fieldX, y); ctx.lineTo(fieldX + fieldWidth, y); ctx.stroke();
    }
    ctx.strokeStyle = "rgba(231,241,255,.1)";
    ctx.lineWidth = 1;
    ctx.setLineDash([10, 14]);
    ctx.beginPath(); ctx.moveTo(WIDTH / 2, fieldY + 18); ctx.lineTo(WIDTH / 2, fieldY + fieldHeight - 18); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    drawArenaBoundaries(fieldX, fieldY, fieldWidth, fieldHeight);
    drawSpawnMarkers();
    game.walls.forEach(drawWall);
    drawBall(game.ball, COLORS.green, null, now);
    if (game.damageBall) drawBall(game.damageBall, COLORS.red, "attack", now);
    if (game.turboBall) drawBall(game.turboBall, COLORS.purple, "turbo", now);
    if (game.teleportPickup) drawBall(game.teleportPickup, COLORS.teleport, "teleport", now);
    if (game.teleportBall) drawTeleportOrb(game.teleportBall);
    game.players.forEach((player) => drawPlayer(player, now));
    drawShockwaves();
    drawFinalStar(now);
    if (game.teleportAim) drawTeleportTarget();
    drawParticles();
    drawArenaStatus();
  }

  function drawArenaBoundaries(fieldX, fieldY, fieldWidth, fieldHeight) {
    ctx.save();
    ctx.strokeStyle = "rgba(143,250,255,.9)";
    ctx.shadowColor = "#49f4ff";
    ctx.shadowBlur = 13;
    ctx.lineWidth = 2;
    for (const y of [fieldY, fieldY + fieldHeight]) {
      ctx.setLineDash([26, 10]);
      ctx.lineDashOffset = performance.now() / 45;
      ctx.beginPath(); ctx.moveTo(fieldX + 11, y); ctx.lineTo(fieldX + fieldWidth - 11, y); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(157,223,255,.78)";
    ctx.font = "600 9px 'DM Mono', monospace";
    ctx.textAlign = "left";
    ctx.fillText("LIMITE SUPERIOR", fieldX + 14, fieldY - 9);
    ctx.textAlign = "right";
    ctx.fillText("LIMITE INFERIOR · FIM DA ARENA", fieldX + fieldWidth - 14, fieldY + fieldHeight + 19);
    ctx.restore();
  }

  function drawSpawnMarkers() {
    game.spawns.forEach((spawn, index) => {
      const centerX = spawn.x + PLAYER_SIZE / 2;
      const centerY = spawn.y + PLAYER_SIZE / 2;
      const color = index === 0 ? "rgba(84,139,255,.43)" : "rgba(245,207,101,.43)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX - 10, centerY); ctx.lineTo(centerX + 10, centerY);
      ctx.moveTo(centerX, centerY - 10); ctx.lineTo(centerX, centerY + 10);
      ctx.stroke();
    });
  }

  function drawWall(wall) {
    roundRect(wall.x - 4, wall.y, wall.w + 8, wall.h, 8, "rgba(0,0,0,.35)");
    roundRect(wall.x, wall.y, wall.w, wall.h, 7, "#8b164b", "#ff4b8a", 2);
    const sheen = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y);
    sheen.addColorStop(0, "rgba(255,255,255,.02)");
    sheen.addColorStop(0.5, "rgba(255,255,255,.11)");
    sheen.addColorStop(1, "rgba(255,255,255,.02)");
    roundRect(wall.x + 5, wall.y + 5, wall.w - 10, Math.max(5, wall.h - 10), 4, sheen);
  }

  function drawBall(ball, color, effect, now) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = effect ? 14 : 9;
    if (effect === "turbo") {
      ctx.strokeStyle = `${color}dd`;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.lineDashOffset = -now * 18;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius + 7, now * 1.8, now * 1.8 + Math.PI * 1.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius + 4, now * -1.5 + Math.PI, now * -1.5 + Math.PI * 2.25);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (effect === "teleport") {
      const pulse = (Math.sin(now * 4) + 1) / 2;
      ctx.globalAlpha = 0.45 + pulse * 0.4;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `${color}e8`;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius + 5 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(now * 0.8);
      ctx.strokeStyle = "#d9ffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-ball.radius - 3, -ball.radius - 3, (ball.radius + 3) * 2, (ball.radius + 3) * 2);
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.beginPath(); ctx.arc(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.35, Math.max(2, ball.radius / 4), 0, Math.PI * 2); ctx.fill();
    if (effect === "attack") {
      ctx.strokeStyle = `${color}bb`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius + 6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawTeleportOrb(ball) {
    const progress = 1 - clamp((ball.expires - performance.now() / 1000) / 0.72, 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.shadowColor = "#69e5df";
    ctx.shadowBlur = 24;
    ctx.strokeStyle = "#a0fffa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 12 + progress * 42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(105,229,223,.3)";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawShockwaves() {
    for (const wave of game.shockwaves) {
      if (wave.delay > 0) continue;
      const progress = 1 - wave.life / wave.maxLife;
      const alpha = clamp(wave.life / wave.maxLife, 0, 1);
      const easedProgress = progress * progress * (3 - 2 * progress);
      const radius = 10 + easedProgress * wave.maxRadius;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = wave.color;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = Math.max(1, 5 * (1 - progress));
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      if (wave.maxRadius > 200) {
        ctx.globalAlpha = alpha * 0.65;
        ctx.lineWidth = 1.5;
        for (let index = 0; index < 16; index += 1) {
          const angle = (Math.PI * 2 * index) / 16 + progress * 0.45;
          const inner = radius * 0.72;
          const outer = radius + 18 + (index % 3) * 8;
          ctx.beginPath();
          ctx.moveTo(wave.x + Math.cos(angle) * inner, wave.y + Math.sin(angle) * inner);
          ctx.lineTo(wave.x + Math.cos(angle) * outer, wave.y + Math.sin(angle) * outer);
          ctx.stroke();
        }
      }
      if (wave.kind === "turbo") {
        ctx.setLineDash([14, 12]);
        ctx.lineWidth = Math.max(1.5, 4 * (1 - progress));
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, radius * .65, progress * Math.PI * 3, progress * Math.PI * 3 + Math.PI * 1.55);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(wave.x, wave.y, radius * .86, Math.PI + progress * Math.PI * 3, Math.PI * 2.55 + progress * Math.PI * 3);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }

  function drawTeleportTarget() {
    const target = game.mouseTarget;
    if (!target) return;
    const candidate = {
      x: clamp(target.x - PLAYER_SIZE / 2, ARENA_LEFT + 12, ARENA_RIGHT - PLAYER_SIZE - 12),
      y: clamp(target.y - PLAYER_SIZE / 2, ARENA_TOP + 12, ARENA_BOTTOM - PLAYER_SIZE - 12),
      w: PLAYER_SIZE,
      h: PLAYER_SIZE,
    };
    const displayTarget = { x: candidate.x + PLAYER_SIZE / 2, y: candidate.y + PLAYER_SIZE / 2 };
    const blocked = game.walls.some((wall) => {
      return rectsOverlap(candidate, wallCollisionRect(wall));
    });
    const color = blocked ? COLORS.red : "#69e5df";
    const player = game.players[game.teleportPlayerIndex ?? game.lastHumanPlayer];
    const originX = player.x + PLAYER_SIZE / 2;
    const originY = player.y + PLAYER_SIZE / 2;
    ctx.save();
    ctx.setLineDash([7, 9]);
    ctx.strokeStyle = blocked ? "rgba(244,80,80,.55)" : "rgba(105,229,223,.52)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(displayTarget.x, displayTarget.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowColor = color;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(displayTarget.x, displayTarget.y, 18, 0, Math.PI * 2);
    ctx.moveTo(displayTarget.x - 28, displayTarget.y); ctx.lineTo(displayTarget.x - 9, displayTarget.y);
    ctx.moveTo(displayTarget.x + 9, displayTarget.y); ctx.lineTo(displayTarget.x + 28, displayTarget.y);
    ctx.moveTo(displayTarget.x, displayTarget.y - 28); ctx.lineTo(displayTarget.x, displayTarget.y - 9);
    ctx.moveTo(displayTarget.x, displayTarget.y + 9); ctx.lineTo(displayTarget.x, displayTarget.y + 28);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(player, now) {
    if (now < player.hiddenUntil) return;
    const turbo = now < player.turboUntil;
    const glowColor = turbo ? COLORS.purple : player.color;
    const shakeProgress = clamp((player.wallShakeUntil - now) / 0.32, 0, 1);
    const shakeOffset = shakeProgress * 3 * Math.sin(now * 95);
    const x = player.x + shakeOffset;
    const y = player.y + shakeProgress * 2 * Math.cos(now * 83);
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 15;
    roundRect(x, y + 5, PLAYER_SIZE, PLAYER_SIZE, 5, "rgba(0,0,0,.35)");
    roundRect(x, y, PLAYER_SIZE, PLAYER_SIZE, 5, player.color, player.accent, 2);
    ctx.restore();
    if (turbo) {
      ctx.fillStyle = COLORS.purple;
      ctx.font = "500 12px 'DM Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`TURBO ${(player.turboUntil - now).toFixed(1)}s`, player.x + PLAYER_SIZE / 2, player.y - 11);
    }
  }

  function drawParticles() {
    for (const particle of game.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, Math.max(1, particle.size * particle.life / particle.maxLife), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.textAlign = "center";
    ctx.font = "700 17px Manrope, sans-serif";
    for (const item of game.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = clamp(item.life, 0, 1);
      ctx.fillStyle = item.color;
      ctx.fillText(item.text, item.x, item.y);
      ctx.restore();
    }
  }

  function drawArenaStatus() {
    if (game.damageBall) {
      const remaining = Math.max(0, game.damageBall.expires - performance.now() / 1000);
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.red;
      ctx.font = "500 13px 'DM Mono', monospace";
      ctx.fillText(`◆ DANO  ${remaining.toFixed(0)}s  ·  +1 / -1 PONTO`, WIDTH / 2, 143);
    }
    if (game.turboBall) {
      const remaining = Math.max(0, game.turboBall.expires - performance.now() / 1000);
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.purple;
      ctx.font = "500 13px 'DM Mono', monospace";
      ctx.fillText(`◆ TURBO  ${remaining.toFixed(0)}s  ·  VELOCIDADE 2×`, WIDTH / 2, 164);
    }
    if (game.teleportPickup) {
      const remaining = Math.max(0, game.teleportPickup.expires - performance.now() / 1000);
      ctx.textAlign = "center";
      ctx.fillStyle = COLORS.teleport;
      ctx.font = "500 13px 'DM Mono', monospace";
      ctx.fillText(`◆ TELEPORTE  ${remaining.toFixed(0)}s  ·  +3 USOS`, WIDTH / 2, 185);
    }
  }

  function render(now) {
    if (!ctx || game.screen === "setup") return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawInfiniteBackdrop(now);
    let shakeX = 0;
    let shakeY = 0;
    if (now < game.cameraShakeUntil && game.cameraShakePower > 0) {
      const remaining = clamp((game.cameraShakeUntil - now) / game.cameraShakeDuration, 0, 1);
      shakeX = random(-1, 1) * game.cameraShakePower * remaining;
      shakeY = random(-1, 1) * game.cameraShakePower * remaining;
    }
    const scale = Math.max(canvas.width / WIDTH, canvas.height / HEIGHT);
    const offsetX = (canvas.width - WIDTH * scale) / 2;
    const offsetY = (canvas.height - HEIGHT * scale) / 2;
    let zoom = 1;
    let focusX = WIDTH / 2;
    let focusY = HEIGHT / 2;
    const cinematic = game.finalCinematic;
    if (cinematic && ["approach", "ready", "impact", "zoom-out"].includes(cinematic.phase)) {
      focusX = cinematic.x;
      focusY = cinematic.y;
      if (cinematic.phase === "approach") {
        const progress = clamp((now - cinematic.startedAt) / 0.38, 0, 1);
        zoom = 1 + 0.78 * progress * progress * (3 - 2 * progress);
      } else if (cinematic.phase === "zoom-out") {
        const progress = clamp((now - cinematic.startedAt) / 0.74, 0, 1);
        const eased = progress * progress * (3 - 2 * progress);
        zoom = 1.78 - 0.78 * eased;
        focusX += (WIDTH / 2 - focusX) * eased;
        focusY += (HEIGHT / 2 - focusY) * eased;
      } else {
        zoom = 1.78;
      }
    }
    const translateX = WIDTH / 2 - focusX * zoom;
    const translateY = HEIGHT / 2 - focusY * zoom;
    ctx.setTransform(
      scale * zoom,
      0,
      0,
      scale * zoom,
      offsetX + (translateX + shakeX) * scale,
      offsetY + (translateY + shakeY) * scale,
    );
    drawArena();
    drawCinematicGrade(now, cinematic);
  }

  function drawCinematicGrade(now, cinematic) {
    if (!cinematic || !["approach", "ready", "impact", "zoom-out"].includes(cinematic.phase)) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const width = canvas.width;
    const height = canvas.height;
    const strength = cinematic.phase === "impact" ? 1 : .54;
    ctx.save();
    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * .12, width / 2, height / 2, width * .7);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, `rgba(0,0,0,${.43 * strength})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    const barHeight = height * .075 * strength;
    ctx.fillStyle = "rgba(0,0,0,.76)";
    ctx.fillRect(0, 0, width, barHeight);
    ctx.fillRect(0, height - barHeight, width, barHeight);
    if (cinematic.phase === "impact") {
      const impactProgress = clamp((now - cinematic.startedAt) / .2, 0, 1);
      ctx.fillStyle = `rgba(224,240,255,${(1 - impactProgress) * .58})`;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  function showCountdown(now) {
    const remaining = Math.max(1, Math.ceil(COUNTDOWN - (now - game.countdownStarted)));
    if (game.countdownShown === remaining) return;
    game.countdownShown = remaining;
    overlay.innerHTML = `<div class="overlay-card"><div class="overlay-kicker">PREPARE-SE</div><div class="overlay-title">${remaining}</div><div class="overlay-copy">A arena está quase aberta</div></div>`;
  }

  function showWinner() {
    const name = game.winner.name;
    const color = game.winner.color === COLORS.blue ? "var(--blue)" : "var(--yellow)";
    const message = `${name} VENCEU!`;
    overlay.innerHTML = `<div class="overlay-card game-over-message"><div class="overlay-kicker">FIM DE JOGO</div><div class="overlay-title"><span class="winner-title is-glitching" id="winner-title" style="color:${color}" data-glitch="${message}">${message}</span></div><div class="overlay-copy">Clique na arena ou pressione Enter para jogar novamente</div></div>`;
    animateWinnerTitle($("#winner-title"), message);
  }

  function animateWinnerTitle(element, message) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.textContent = message;
      element.dataset.glitch = message;
      element.classList.remove("is-glitching");
      return;
    }
    const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*?";
    const startedAt = performance.now();
    const duration = 1400;
    const render = (now) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const settled = Math.floor(progress * (message.length + 2));
      const scrambled = [...message].map((character, index) => {
        if (character === " ") return " ";
        return index < settled ? character : glyphs[Math.floor(Math.random() * glyphs.length)];
      }).join("");
      element.textContent = scrambled;
      element.dataset.glitch = scrambled;
      if (progress < 1) requestAnimationFrame(render);
      else {
        element.textContent = message;
        element.dataset.glitch = message;
        element.classList.remove("is-glitching");
      }
    };
    requestAnimationFrame(render);
  }

  function handlePause() {
    const now = performance.now() / 1000;
    if (game.screen === "playing") {
      game.screen = "paused";
      game.pausedAt = now;
      overlay.innerHTML = '<div class="overlay-card paused-message"><div class="overlay-kicker">PARTIDA PAUSADA</div><div class="overlay-title">PAUSA</div><div class="overlay-copy">Pressione P ou clique em continuar</div></div>';
      $("#pause-button").textContent = "▶";
      $("#pause-button").setAttribute("aria-label", "Continuar jogo");
    } else if (game.screen === "paused") {
      const elapsed = now - game.pausedAt;
      game.countdownStarted += elapsed;
      game.nextDamage += elapsed;
      game.nextTurbo += elapsed;
      game.nextTeleport += elapsed;
      if (game.finalCinematic) {
        game.finalCinematic.startedAt += elapsed;
        if (game.finalCinematic.readyUntil) game.finalCinematic.readyUntil += elapsed;
      }
      if (game.finalStar) game.finalStar.startedAt += elapsed;
      if (game.cameraShakeUntil) game.cameraShakeUntil += elapsed;
      game.players.forEach((player) => {
        if (player.turboUntil) player.turboUntil += elapsed;
        if (player.aiNextReaction) player.aiNextReaction += elapsed;
        player.trail.length = 0;
      });
      if (game.damageBall) game.damageBall.expires += elapsed;
      if (game.turboBall) game.turboBall.expires += elapsed;
      if (game.teleportPickup) game.teleportPickup.expires += elapsed;
      game.screen = "playing";
      overlay.innerHTML = "";
      $("#pause-button").textContent = "Ⅱ";
      $("#pause-button").setAttribute("aria-label", "Pausar jogo");
    }
  }

  function backToSetup() {
    audio.pause();
    game.audioStarted = false;
    game.screen = "setup";
    game.loopActive = false;
    game.teleportAim = false;
    game.teleportTarget = null;
    canvas.classList.remove("teleport-aim");
    $("#touch-teleport").classList.remove("is-armed");
    document.body.classList.remove("is-playing", "is-solo");
    overlay.innerHTML = "";
    $("#game-screen").classList.add("is-hidden");
    $("#setup-screen").classList.remove("is-hidden");
    updateOrientationGate();
  }

  function loop(time) {
    if (game.screen === "setup") {
      game.loopActive = false;
      return;
    }
    const now = time / 1000;
    const dt = Math.min((time - game.lastFrame) / 1000, 0.04);
    game.lastFrame = time;
    if (game.screen === "countdown" && now - game.countdownStarted >= COUNTDOWN) {
      game.screen = "playing";
      overlay.innerHTML = "";
    } else if (game.screen === "countdown") {
      showCountdown(now);
    } else if (game.screen === "playing") {
      if (now >= game.hitStopUntil) update(dt, now);
      else updateCinematicEffects(0, now);
    } else if (game.screen === "game-over") {
      updateFinalCinematic(now);
      updateEffects(dt);
      updateCinematicEffects(dt, now);
    }
    render(now);
    requestAnimationFrame(loop);
  }

  game.keys = new Set();
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
    game.keys.add(key);
    if (key === "t" && !event.repeat) {
      beginTeleportAim();
      return;
    }
    if (key === "p" && game.screen !== "setup" && game.screen !== "countdown" && game.screen !== "game-over") handlePause();
    if (key === "escape" && game.teleportAim) {
      beginTeleportAim();
      return;
    }
    if (key === "escape" && game.screen !== "setup") backToSetup();
    if ((key === "enter" || key === " ") && game.screen === "game-over") startMatch();
    if (key === "f11") {
      event.preventDefault();
      toggleFullscreen();
    }
    if (key === "n" && game.screen === "setup") changeTrack();
  });
  window.addEventListener("keyup", (event) => game.keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => game.keys.clear());

  function toggleFullscreen() {
    const target = $("#arena-frame");
    if (document.fullscreenElement) document.exitFullscreen?.();
    else target.requestFullscreen?.();
  }

  document.querySelectorAll(".segment").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  $("#difficulty").addEventListener("change", (event) => { game.difficulty = event.target.value; });
  $("#goal-minus").addEventListener("click", () => {
    game.goalIndex = Math.max(0, game.goalIndex - 1);
    updateGoal();
  });
  $("#goal-plus").addEventListener("click", () => {
    game.goalIndex = Math.min(WINNING_SCORES.length - 1, game.goalIndex + 1);
    updateGoal();
  });
  $("#change-track").addEventListener("click", changeTrack);
  $("#music-upload").addEventListener("change", uploadTrack);
  $("#play-button").addEventListener("click", startMatch);
  $("#back-button").addEventListener("click", backToSetup);
  $("#pause-button").addEventListener("click", handlePause);
  $("#fullscreen-button").addEventListener("click", toggleFullscreen);
  $("#arena").addEventListener("pointermove", (event) => {
    const point = pointerToArena(event);
    game.mouseTarget = point;
    if (game.teleportAim) game.teleportTarget = point;
  });
  $("#arena").addEventListener("click", (event) => {
    if (game.teleportAim) {
      teleportToPointer(pointerToArena(event));
      return;
    }
    if (game.screen === "game-over") startMatch();
    else if (game.screen === "paused") handlePause();
  });
  $("#touch-teleport").addEventListener("click", beginTeleportAim);

  function isTouchDevice() {
    return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  }

  function updateOrientationGate() {
    const shouldRotate = isTouchDevice() && window.matchMedia("(orientation: portrait)").matches;
    $("#orientation-gate").hidden = !shouldRotate;
    document.body.classList.toggle("needs-landscape", shouldRotate);
  }

  async function enterMobileFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      try {
        await screen.orientation?.lock?.("landscape");
      } catch {
        $("#orientation-hint").textContent = "Gire o aparelho manualmente para a posição horizontal.";
      }
      updateOrientationGate();
    } catch {
      $("#orientation-hint").textContent = "Gire o aparelho manualmente; a arena usa tela cheia quando disponível.";
      updateOrientationGate();
    }
  }

  $("#orientation-button").addEventListener("click", enterMobileFullscreen);
  window.addEventListener("orientationchange", updateOrientationGate);
  window.addEventListener("resize", updateOrientationGate);

  function resetJoystickKnobs() {
    document.querySelectorAll(".joystick-knob").forEach((knob) => {
      knob.style.transform = "translate(-50%, -50%)";
    });
  }

  function updateJoystick(joystick, event) {
    const rect = joystick.getBoundingClientRect();
    const maxTravel = rect.width * 0.29;
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > maxTravel) {
      dx = (dx / magnitude) * maxTravel;
      dy = (dy / magnitude) * maxTravel;
    }
    const index = Number(joystick.dataset.player);
    game.joysticks[index] = { x: dx / maxTravel, y: dy / maxTravel };
    const knob = joystick.querySelector(".joystick-knob");
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  function releaseJoystick(joystick, event) {
    if (joystick.hasPointerCapture(event.pointerId)) joystick.releasePointerCapture(event.pointerId);
    game.joysticks[Number(joystick.dataset.player)] = { x: 0, y: 0 };
    joystick.querySelector(".joystick-knob").style.transform = "translate(-50%, -50%)";
  }

  document.querySelectorAll(".joystick").forEach((joystick) => {
    joystick.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      joystick.setPointerCapture(event.pointerId);
      updateJoystick(joystick, event);
    });
    joystick.addEventListener("pointermove", (event) => {
      if (joystick.hasPointerCapture(event.pointerId)) updateJoystick(joystick, event);
    });
    joystick.addEventListener("pointerup", (event) => releaseJoystick(joystick, event));
    joystick.addEventListener("pointercancel", (event) => releaseJoystick(joystick, event));
  });

  setMode(game.mode);
  updateGoal();
  updateTrackLabel();
  updateOrientationGate();
  setupCanvas();
})();
