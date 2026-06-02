'use strict';

// 실내 씬: 방 렌더링, NPC 에이전트 배치, 대화 대상 감지, 퇴장 처리
// Interior scene: room rendering, NPC placement, talk-target detection, exit handling

(function () {
  const W = window.CONFIG.LOGICAL_W;
  const H = window.CONFIG.LOGICAL_H;

  // === 상수 / Constants ===
  const WALL_T = 16; // 벽 두께 / wall thickness
  const TOP_WALL = 28; // 상단 벽(헤더 포함) / top wall incl. header
  const NPC_SIZE = 16;
  const EXIT_HALF = 22; // 출구 매트 반너비 / exit mat half-width
  const TALK_RANGE = 24; // 대화 가능 거리(px) / talk proximity
  // 한글이 또렷한 시스템 폰트 / Korean-friendly system fonts
  const FONT_FAMILY = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  const PROMPT_FONT = 'bold 9px ' + FONT_FAMILY;
  const HEADER_FONT = 'bold 11px ' + FONT_FAMILY;

  // 실내 바닥 경계 / interior floor bounds
  const INNER = {
    left: WALL_T,
    right: W - WALL_T,
    top: TOP_WALL,
    bottom: H - WALL_T
  };

  // 출구 매트 영역(하단 중앙) / exit mat (bottom center)
  const EXIT = {
    cx: W / 2,
    y: H - WALL_T,
    half: EXIT_HALF
  };

  // 실내 가구(장식, 충돌 없음) — 중앙 통로는 비워 NPC/출구 접근 보장
  // Interior furniture (decorative, no collision) — center corridor kept clear
  const FURNITURE = [
    { kind: 'rug', x: W / 2 - 46, y: INNER.top + 96, w: 92, h: 60 },
    { kind: 'bookshelf', x: 24, y: INNER.top + 4, baseY: INNER.top + 28 },
    { kind: 'bookshelf', x: W - 40, y: INNER.top + 4, baseY: INNER.top + 28 },
    { kind: 'sofa', x: 22, y: INNER.bottom - 72, baseY: INNER.bottom - 58 },
    { kind: 'sofa', x: W - 50, y: INNER.bottom - 72, baseY: INNER.bottom - 58 },
    { kind: 'table', x: 68, y: INNER.top + 120, baseY: INNER.top + 136 },
    { kind: 'chair', x: 70, y: INNER.top + 104, baseY: INNER.top + 120 },
    { kind: 'plant', x: 22, y: INNER.bottom - 34, baseY: INNER.bottom - 18 },
    { kind: 'plant', x: W - 38, y: INNER.bottom - 34, baseY: INNER.bottom - 18 }
  ];

  // 가구 한 점 그리기 / draw one furniture item
  function drawFurnitureItem(ctx, f) {
    const S = window.Sprites;
    if (f.kind === 'bookshelf') {
      S.drawBookshelf(ctx, f.x, f.y);
    } else if (f.kind === 'sofa') {
      S.drawSofa(ctx, f.x, f.y);
    } else if (f.kind === 'table') {
      S.drawTable(ctx, f.x, f.y);
    } else if (f.kind === 'chair') {
      S.drawChair(ctx, f.x, f.y);
    } else if (f.kind === 'plant') {
      S.drawPlant(ctx, f.x, f.y);
    }
  }

  // === 상태 / state ===
  const scene = {
    building: null,
    npcs: [], // { id, name, color, x, y }
    statuses: {}, // agentId -> 'idle'|'working'|'done'
    activeAgent: null, // 강조할 에이전트 / highlighted agent
    frame: 0,
    savedPos: { x: 0, y: 0 } // 마을 복귀 좌표 / village return position
  };

  // === 진입/퇴장 / enter & leave ===

  // 공방 마스터 NPC 정의 / the workshop master NPC
  const MASTER = { id: '__master__', name: '마스터', color: '#FFD54F' };

  // 건물 실내로 진입 / enter a building interior
  // customAgents: 공방일 때 표시할 커스텀 에이전트 목록 / custom agents to show in the workshop
  // teams: 공방일 때 표시할 팀 목록 / teams to show in the workshop
  function enter(building, customAgents, teams) {
    scene.building = building;
    scene.statuses = {};
    scene.activeAgent = null;
    scene.frame = 0;

    // NPC 배치: 공방이면 마스터+팀+커스텀, 아니면 기본 / lay out NPCs
    if (building.interiorKind === 'workshop') {
      scene.npcs = layoutWorkshop(customAgents || [], teams || []);
    } else {
      scene.npcs = layoutNpcs(building.agentIds);
    }
    for (const npc of scene.npcs) {
      scene.statuses[npc.id] = 'idle';
    }

    // 마을 좌표 저장 후 실내 입구로 이동 / save village pos, move to entrance
    scene.savedPos = { x: window.Player.state.x, y: window.Player.state.y };
    window.Player.state.x = W / 2 - NPC_SIZE / 2;
    window.Player.state.y = INNER.bottom - 26;
    window.Player.state.direction = 'up';
    window.Player.clearKeys();

    // 실내 충돌 규칙 주입 / inject interior collision rule
    window.Player.setSolidFn(interiorSolid);
  }

  // 실내에서 마을로 복귀 / leave back to the village
  function leave() {
    window.Player.state.x = scene.savedPos.x;
    window.Player.state.y = scene.savedPos.y;
    window.Player.state.direction = 'down';
    window.Player.clearKeys();
    window.Player.setSolidFn(null);
    scene.building = null;
  }

  // 에이전트 수에 따른 위치 배치 / position NPCs by count
  function layoutNpcs(agentIds) {
    const npcs = [];
    const y = INNER.top + 34;
    const count = agentIds.length;
    for (let i = 0; i < count; i++) {
      const id = agentIds[i];
      const meta = (window.AGENT_META && window.AGENT_META[id]) || { name: id, color: '#fff' };
      // 균등 분포 / even horizontal spread
      const x = Math.round(W * (i + 1) / (count + 1) - NPC_SIZE / 2);
      npcs.push({ id, name: meta.name, color: meta.color, x, y });
    }
    return npcs;
  }

  // 한 줄(필요 시 여러 줄)로 균등 배치 / spread items into rows, evenly per row
  function layoutRows(items, startY, perRow, makeNpc) {
    const npcs = [];
    for (let i = 0; i < items.length; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const countInRow = Math.min(perRow, items.length - row * perRow);
      const x = Math.round(W * (col + 1) / (countInRow + 1) - NPC_SIZE / 2);
      const y = startY + row * 42;
      npcs.push(makeNpc(items[i], x, y));
    }
    return npcs;
  }

  // 공방 NPC 배치: 마스터(상단) + 팀(중단) + 커스텀 에이전트(하단)
  // workshop layout: master (top) + teams (middle) + custom agents (bottom)
  function layoutWorkshop(customAgents, teams) {
    const npcs = [];
    npcs.push({
      id: MASTER.id, name: MASTER.name, color: MASTER.color,
      x: Math.round(W / 2 - NPC_SIZE / 2), y: INNER.top + 22, isMaster: true
    });

    const perRow = 4;
    // 팀 배치 / place teams
    const teamRows = layoutRows(teams, INNER.top + 64, perRow, (t, x, y) => (
      { id: t.id, name: t.name, color: t.color, x, y, isTeam: true }
    ));
    for (const n of teamRows) {
      npcs.push(n);
    }

    // 팀이 차지한 행 수만큼 에이전트 시작 위치를 내림 / push agents down below the team rows
    const teamRowCount = teams.length ? Math.ceil(teams.length / perRow) : 0;
    const agentStartY = INNER.top + (teams.length ? 64 + teamRowCount * 42 : 78);
    const agentRows = layoutRows(customAgents, agentStartY, perRow, (a, x, y) => (
      { id: a.id, name: a.name, color: a.color, x, y, custom: true }
    ));
    for (const n of agentRows) {
      npcs.push(n);
    }
    return npcs;
  }

  // 공방에 있을 때 팀/커스텀 에이전트 목록 갱신 / refresh workshop NPCs while inside
  function refreshWorkshop(customAgents, teams) {
    if (!scene.building || scene.building.interiorKind !== 'workshop') {
      return;
    }
    const prev = scene.statuses;
    scene.npcs = layoutWorkshop(customAgents || [], teams || []);
    scene.statuses = {};
    for (const npc of scene.npcs) {
      scene.statuses[npc.id] = prev[npc.id] || 'idle';
    }
  }

  // === 충돌 / collision ===

  // 실내 충돌 판정 (벽 밖이거나 NPC와 겹치면 막힘) / interior solid test
  function interiorSolid(px, py) {
    // 방 경계 / room bounds
    if (px < INNER.left || px >= INNER.right || py < INNER.top) {
      return true;
    }
    // 하단: 출구 매트를 제외하면 벽 / bottom wall except the exit mat
    if (py >= INNER.bottom) {
      const inExit = Math.abs(px - EXIT.cx) <= EXIT.half;
      if (!inExit || py >= INNER.bottom + WALL_T) {
        return true;
      }
    }
    // NPC 몸체 충돌 / NPC body collision
    for (const npc of scene.npcs) {
      if (px >= npc.x && px < npc.x + NPC_SIZE && py >= npc.y + 6 && py < npc.y + NPC_SIZE) {
        return true;
      }
    }
    return false;
  }

  // === 상호작용 / interaction ===

  // 대화 가능한 NPC 반환(가장 가까운) / nearest talkable NPC (or null)
  function getInteractableNpc() {
    const front = window.Player.getFrontPx();
    let best = null;
    let bestDist = Infinity;
    for (const npc of scene.npcs) {
      const cx = npc.x + NPC_SIZE / 2;
      const cy = npc.y + NPC_SIZE / 2;
      const dist = Math.hypot(front.x - cx, front.y - cy);
      if (dist < TALK_RANGE && dist < bestDist) {
        bestDist = dist;
        best = npc;
      }
    }
    return best;
  }

  // 플레이어가 출구 매트 위인지 / is the player on the exit mat
  function isAtExit() {
    const cx = window.Player.state.x + NPC_SIZE / 2;
    const cy = window.Player.state.y + NPC_SIZE;
    return Math.abs(cx - EXIT.cx) <= EXIT.half && cy >= INNER.bottom - 4;
  }

  // === 상태 갱신 / status updates ===

  function setAgentStatus(agentId, status) {
    if (Object.prototype.hasOwnProperty.call(scene.statuses, agentId)) {
      scene.statuses[agentId] = status;
    }
    scene.activeAgent = (status === 'working') ? agentId : scene.activeAgent;
    if (status === 'idle' && scene.activeAgent === agentId) {
      scene.activeAgent = null;
    }
  }

  function clearActiveAgent() {
    scene.activeAgent = null;
  }

  function getBuilding() {
    return scene.building;
  }

  // === 업데이트 / update ===
  function update(dt) {
    window.Player.update(dt);
    scene.frame += 1;
  }

  // === 렌더링 / rendering ===

  function draw(ctx) {
    const S = window.Sprites;

    // 바닥(나무 마루) / wooden floor
    ctx.fillStyle = '#8D6E63';
    ctx.fillRect(0, 0, W, H);
    for (let y = INNER.top; y < INNER.bottom; y += 16) {
      for (let x = INNER.left; x < INNER.right; x += 16) {
        ctx.fillStyle = ((x + y) % 32 === 0) ? '#A1887F' : '#977669';
        ctx.fillRect(x, y, 16, 16);
      }
    }

    // 벽 / walls
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(0, 0, W, INNER.top); // 상단 / top
    ctx.fillRect(0, 0, INNER.left, H); // 좌 / left
    ctx.fillRect(INNER.right, 0, WALL_T, H); // 우 / right
    ctx.fillRect(0, INNER.bottom, W, WALL_T); // 하단 / bottom

    // 출구 매트 / exit mat
    ctx.fillStyle = '#3E2723';
    ctx.fillRect(EXIT.cx - EXIT.half, INNER.bottom, EXIT.half * 2, WALL_T);
    ctx.fillStyle = '#FFCC80';
    ctx.fillRect(EXIT.cx - EXIT.half + 2, INNER.bottom + 4, EXIT.half * 2 - 4, 6);

    // 헤더(건물 이름) / header with building name
    ctx.fillStyle = '#FFFFFF';
    ctx.font = HEADER_FONT;
    ctx.textAlign = 'center';
    ctx.fillText(scene.building ? scene.building.name : '', W / 2, 18);
    ctx.textAlign = 'left';

    // 바닥 러그(가장 아래) / floor rugs first (under everything)
    for (const f of FURNITURE) {
      if (f.kind === 'rug') {
        window.Sprites.drawRug(ctx, f.x, f.y, f.w, f.h);
      }
    }

    // 플레이어 + NPC + 가구 y정렬 / y-sort player, NPCs and furniture
    const camera = { x: 0, y: 0 };
    const drawables = [];

    for (const npc of scene.npcs) {
      drawables.push({
        baseY: npc.y + NPC_SIZE,
        draw: () => drawNpc(ctx, npc)
      });
    }
    for (const f of FURNITURE) {
      if (f.kind !== 'rug') {
        drawables.push({ baseY: f.baseY, draw: () => drawFurnitureItem(ctx, f) });
      }
    }
    drawables.push({
      baseY: window.Player.getBaseY(),
      draw: () => window.Player.draw(ctx, camera)
    });
    drawables.sort((a, b) => a.baseY - b.baseY);
    for (const d of drawables) {
      d.draw();
    }

    // NPC 이름표와 작업 말풍선 / NPC labels and working bubbles
    for (const npc of scene.npcs) {
      drawNpcLabel(ctx, npc);
    }
  }

  // NPC 한 명 그리기(강조 포함) / draw one NPC (with highlight)
  function drawNpc(ctx, npc) {
    const status = scene.statuses[npc.id] || 'idle';

    // 활성 강조 링 / active highlight ring
    if (scene.activeAgent === npc.id) {
      ctx.fillStyle = 'rgba(255,235,59,0.35)';
      ctx.beginPath();
      ctx.arc(npc.x + NPC_SIZE / 2, npc.y + NPC_SIZE + 2, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    window.Sprites.drawNPC(ctx, npc.id, npc.x, npc.y, scene.frame, status, npc.color);
  }

  // NPC 이름표/말풍선 / NPC name label and bubble
  function drawNpcLabel(ctx, npc) {
    const status = scene.statuses[npc.id] || 'idle';

    ctx.font = PROMPT_FONT;
    ctx.textAlign = 'center';
    ctx.fillStyle = npc.color;
    // 마스터는 편집 아이콘, 팀은 팀 아이콘 표시 / edit icon for master, team icon for teams
    let label = npc.name;
    if (npc.isMaster) {
      label = '✎ ' + npc.name;
    } else if (npc.isTeam) {
      label = '👥 ' + npc.name;
    }
    ctx.fillText(label, npc.x + NPC_SIZE / 2, npc.y - 6);
    ctx.textAlign = 'left';

    if (status === 'working') {
      window.Sprites.drawWorkingBubble(ctx, npc.x + NPC_SIZE, npc.y - 14, scene.frame);
    }
  }

  window.Interior = {
    enter,
    leave,
    update,
    draw,
    refreshWorkshop,
    getInteractableNpc,
    isAtExit,
    setAgentStatus,
    clearActiveAgent,
    getBuilding
  };
})();
