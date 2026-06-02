'use strict';

// 플레이어 이동, 입력, 카메라, 걷기 애니메이션 처리
// Player movement, input, camera, and walk animation

(function () {
  const TILE = window.CONFIG.TILE;

  // === 상수 / Constants ===
  const SPEED = 78; // 픽셀/초 / pixels per second
  const SPRITE = 16; // 스프라이트 크기 / sprite size
  const PLAYER_SCALE = 1.2; // 캐릭터 표시 확대 배율(충돌은 그대로) / visual scale (collision unchanged)
  const FRAME_INTERVAL = 0.12; // 걷기 프레임 전환 간격(초) / walk frame interval
  const WALK_FRAMES = 4;

  // 히트박스 (발 영역) / hitbox (feet area)
  const HITBOX = { offX: 3, offY: 9, w: 10, h: 6 };

  // === 플레이어 상태 / player state ===
  const state = {
    x: window.World.SPAWN.x,
    y: window.World.SPAWN.y,
    direction: 'down',
    moving: false,
    frame: 0,
    frameTimer: 0,
    keys: { up: false, down: false, left: false, right: false },
    // 가장 최근에 누른 방향 우선(대각선 금지) / latest pressed direction wins (no diagonal)
    keyOrder: []
  };

  // 스폰 위치로 초기화 / reset to spawn
  function reset() {
    state.x = window.World.SPAWN.x;
    state.y = window.World.SPAWN.y;
    state.direction = 'down';
    state.moving = false;
    state.frame = 0;
    state.frameTimer = 0;
    clearKeys();
  }

  // 모든 이동 키 해제 / release all movement keys
  function clearKeys() {
    state.keys.up = false;
    state.keys.down = false;
    state.keys.left = false;
    state.keys.right = false;
    state.keyOrder = [];
  }

  // 이동 키 입력(최근 누른 방향을 큐 끝에 보관) / set a movement key (track press order)
  function setMoveKey(dir, isDown) {
    if (!Object.prototype.hasOwnProperty.call(state.keys, dir)) {
      return;
    }
    if (isDown) {
      // 새로 눌린 경우에만 큐에 추가 / push only on a fresh press
      if (!state.keys[dir]) {
        state.keyOrder.push(dir);
      }
      state.keys[dir] = true;
    } else {
      state.keys[dir] = false;
      const idx = state.keyOrder.indexOf(dir);
      if (idx >= 0) {
        state.keyOrder.splice(idx, 1);
      }
    }
  }

  // 현재 충돌 판정 함수 (씬별로 주입 가능) / current collision predicate (injectable per scene)
  // 픽셀 좌표(px,py)가 막혀 있으면 true / returns true if the pixel is blocked
  let solidFn = (px, py) => window.World.isSolidPx(px, py);

  // 히트박스가 벽과 겹치는지 검사 / does the hitbox collide with a wall
  function collidesAt(x, y) {
    const left = x + HITBOX.offX;
    const top = y + HITBOX.offY;
    const right = left + HITBOX.w - 1;
    const bottom = top + HITBOX.h - 1;
    // 네 모서리 검사 / check four corners
    return (
      solidFn(left, top) ||
      solidFn(right, top) ||
      solidFn(left, bottom) ||
      solidFn(right, bottom)
    );
  }

  // 충돌 판정 함수 설정 (null이면 월드 기본값) / set collision predicate (null = world default)
  function setSolidFn(fn) {
    solidFn = fn || ((px, py) => window.World.isSolidPx(px, py));
  }

  // 한 축씩 이동 시도(충돌 시 취소) / try moving per axis (cancel on collision)
  function moveAxis(dx, dy) {
    if (dx !== 0) {
      const nx = state.x + dx;
      if (!collidesAt(nx, state.y)) {
        state.x = nx;
      }
    }
    if (dy !== 0) {
      const ny = state.y + dy;
      if (!collidesAt(state.x, ny)) {
        state.y = ny;
      }
    }
  }

  // 현재 눌린 키 중 가장 최근 방향 하나 반환(대각선 금지) / latest held direction (no diagonal)
  function activeDirection() {
    for (let i = state.keyOrder.length - 1; i >= 0; i--) {
      const dir = state.keyOrder[i];
      if (state.keys[dir]) {
        return dir;
      }
    }
    return null;
  }

  // 업데이트 / per-frame update
  function update(dt) {
    const dir = activeDirection();
    state.moving = dir !== null;

    if (state.moving) {
      state.direction = dir;

      // 단일 축 이동(대각선 없음) / single-axis movement (no diagonal)
      let dx = 0;
      let dy = 0;
      if (dir === 'left') {
        dx = -1;
      } else if (dir === 'right') {
        dx = 1;
      } else if (dir === 'up') {
        dy = -1;
      } else {
        dy = 1;
      }

      moveAxis(dx * SPEED * dt, dy * SPEED * dt);

      // 걷기 애니메이션 / walk animation
      state.frameTimer += dt;
      if (state.frameTimer >= FRAME_INTERVAL) {
        state.frameTimer -= FRAME_INTERVAL;
        state.frame = (state.frame + 1) % WALK_FRAMES;
      }
    } else {
      state.frame = 0;
      state.frameTimer = 0;
    }
  }

  // 카메라 위치 계산(월드 경계로 클램프) / compute clamped camera
  function getCamera() {
    const centerX = state.x + SPRITE / 2;
    const centerY = state.y + SPRITE / 2;
    const maxX = window.World.WORLD_W * TILE - window.CONFIG.LOGICAL_W;
    const maxY = window.World.WORLD_H * TILE - window.CONFIG.LOGICAL_H;
    const camX = clamp(centerX - window.CONFIG.LOGICAL_W / 2, 0, Math.max(0, maxX));
    const camY = clamp(centerY - window.CONFIG.LOGICAL_H / 2, 0, Math.max(0, maxY));
    return { x: Math.round(camX), y: Math.round(camY) };
  }

  function clamp(v, min, max) {
    return v < min ? min : (v > max ? max : v);
  }

  // 플레이어 정면 한 칸 앞 픽셀 좌표 / pixel just in front of the player
  // 플레이어가 "서 있는 칸"(발 기준) 정면 한 칸의 중심을 반환.
  // 발 기준이라 NPC에 딱 붙어 스프라이트가 겹쳐도 상호작용 칸이 정확히 잡힘.
  // Use the tile the player STANDS on (feet-based), so interaction stays correct
  // even when pressed right against an NPC (sprites overlapping).
  function getFrontPx() {
    const ptx = Math.floor((state.x + SPRITE / 2) / TILE); // 중심 x / center column
    const pty = Math.floor((state.y + SPRITE - 2) / TILE); // 발 y / feet row
    let dx = 0;
    let dy = 0;
    if (state.direction === 'up') {
      dy = -1;
    } else if (state.direction === 'down') {
      dy = 1;
    } else if (state.direction === 'left') {
      dx = -1;
    } else {
      dx = 1;
    }
    return { x: (ptx + dx) * TILE + TILE / 2, y: (pty + dy) * TILE + TILE / 2 };
  }

  // y정렬용 base y / base y for sorting
  function getBaseY() {
    return state.y + SPRITE;
  }

  // 그리기(발 위치를 기준으로 약간 확대) / draw, scaled slightly around the feet
  function draw(ctx, camera) {
    const sx = Math.round(state.x - camera.x);
    const sy = Math.round(state.y - camera.y);
    // 발 중앙을 고정점으로 확대 → 위치/충돌은 그대로 / anchor at feet so position stays aligned
    const feetX = sx + SPRITE / 2;
    const feetY = sy + SPRITE;
    ctx.save();
    ctx.translate(feetX, feetY);
    ctx.scale(PLAYER_SCALE, PLAYER_SCALE);
    ctx.translate(-feetX, -feetY);
    window.Sprites.drawPlayer(ctx, sx, sy, state.direction, state.moving ? state.frame : 0);
    ctx.restore();
  }

  window.Player = {
    state,
    reset,
    setMoveKey,
    clearKeys,
    setSolidFn,
    update,
    draw,
    getCamera,
    getFrontPx,
    getBaseY
  };
})();
