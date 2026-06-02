'use strict';

// 월드맵 데이터, 타일/충돌 처리, 다중 구역(마을/공방) 레이아웃 및 건물·게이트 정의
// World map data, tile/collision, multi-zone layout (village/workshop), buildings & gates

(function () {
  const TILE = window.CONFIG.TILE;

  // === 월드 크기 (모든 구역 공통, 카메라/미니맵 일관성용) / world size (shared by all zones) ===
  const WORLD_W = 40;
  const WORLD_H = 30;

  // 충돌 코드 / collision codes
  const PASS = 0; // 통과 가능 / walkable
  const WALL = 1; // 벽 / blocked
  const DOOR = 2; // 건물 입구 트리거 / building entrance trigger
  const GATE = 3; // 구역 이동 트리거 / zone-travel trigger

  // 타일/충돌 그리드 / tile and collision grids
  const ground = [];
  const collision = [];

  // 그리기용 오브젝트(나무/분수/울타리) — 제자리 갱신 / decorative objects (mutated in place)
  const objects = [];
  // 건물 목록 — export 참조 유지 위해 제자리 갱신 / buildings (mutated in place to keep the export ref)
  const buildings = [];
  // 구역 이동 게이트 / zone-travel gates
  const gates = [];

  // 현재 활성 구역 / currently active zone
  let activeZone = 'village';

  // 애니메이션 카운터(캐릭터 흔들림/게이트 발광) / animation counter (npc bob, gate glow)
  let animTick = 0;

  // 게임 시작 스폰(마을 광장) / initial spawn (village plaza)
  const SPAWN = { x: 20 * TILE, y: 22 * TILE };

  // === 그리드/조작 헬퍼 / grid helpers ===

  function inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < WORLD_W && ty < WORLD_H;
  }

  // 모든 셀을 잔디/통과로 채운다 / fill all cells with grass/walkable
  function fillBase() {
    for (let ty = 0; ty < WORLD_H; ty++) {
      ground[ty] = ground[ty] || [];
      collision[ty] = collision[ty] || [];
      for (let tx = 0; tx < WORLD_W; tx++) {
        ground[ty][tx] = 'grass';
        collision[ty][tx] = PASS;
      }
    }
  }

  // 구역 빌드 전 상태 초기화(참조 유지) / reset before building a zone (keep refs)
  function resetZone() {
    fillBase();
    objects.length = 0;
    buildings.length = 0;
    gates.length = 0;
  }

  function paintRect(tx, ty, w, h, tileType) {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        if (inBounds(x, y)) {
          ground[y][x] = tileType;
        }
      }
    }
  }

  function paintHPath(tx1, tx2, ty, thickness, tileType) {
    const t0 = tileType || 'path';
    const from = Math.min(tx1, tx2);
    const to = Math.max(tx1, tx2);
    for (let x = from; x <= to; x++) {
      for (let t = 0; t < thickness; t++) {
        if (inBounds(x, ty + t)) {
          ground[ty + t][x] = t0;
        }
      }
    }
  }

  function paintVPath(tx, ty1, ty2, thickness, tileType) {
    const t0 = tileType || 'path';
    const from = Math.min(ty1, ty2);
    const to = Math.max(ty1, ty2);
    for (let y = from; y <= to; y++) {
      for (let t = 0; t < thickness; t++) {
        if (inBounds(tx + t, y)) {
          ground[y][tx + t] = t0;
        }
      }
    }
  }

  // 전체 바닥을 특정 타일로 / fill the whole ground with one tile type
  function fillGround(tileType) {
    for (let ty = 0; ty < WORLD_H; ty++) {
      for (let tx = 0; tx < WORLD_W; tx++) {
        ground[ty][tx] = tileType;
      }
    }
  }

  function markRect(tx, ty, w, h, code) {
    for (let y = ty; y < ty + h; y++) {
      for (let x = tx; x < tx + w; x++) {
        if (inBounds(x, y)) {
          collision[y][x] = code;
        }
      }
    }
  }

  // 건물 하나 배치(문 트리거 생성) / place one building (creates the door trigger)
  function placeBuilding(b) {
    paintRect(b.tx, b.ty, b.w, b.h, 'sand');
    markRect(b.tx, b.ty, b.w, b.h, WALL);
    const doorTx = b.tx + Math.floor(b.w / 2);
    const doorTy = b.ty + b.h;
    if (inBounds(doorTx, doorTy)) {
      collision[doorTy][doorTx] = DOOR;
      ground[doorTy][doorTx] = 'path';
    }
    b.door = { tx: doorTx, ty: doorTy };
  }

  // 건물 문을 목표 지점(광장 중앙)과 L자 도로로 연결 / connect a door to a target via an L-shaped path
  // 문에서 가로로 목표 x까지 → 세로로 목표 y까지 (문 타일이 항상 도로에 닿음)
  function connectToPlaza(door, target) {
    paintHPath(door.tx, target.x, door.ty, 2); // 문 행에서 가로 이동 / horizontal at the door row
    paintVPath(target.x, door.ty, target.y, 2); // 목표 열에서 세로 이동 / vertical at the target column
  }

  // 게이트 배치 — arrival은 목적지 구역의 도착 픽셀 좌표 / place a gate (arrival = pixel spawn in target zone)
  function placeGate(tx, ty, toZone, arrival, label) {
    if (!inBounds(tx, ty)) {
      return;
    }
    ground[ty][tx] = 'path';
    collision[ty][tx] = GATE;
    // 게이트 칸의 나무 등 장애물 제거 / clear any object sitting on the gate tile
    for (let i = objects.length - 1; i >= 0; i--) {
      if (objects[i].tx === tx && objects[i].ty === ty) {
        objects.splice(i, 1);
      }
    }
    gates.push({ tx, ty, toZone, arrival, label: label || '' });
  }

  // 통과 가능한 잔디면 나무 심기 / plant a tree on walkable grass
  function maybeTree(tx, ty) {
    if (!inBounds(tx, ty)) {
      return;
    }
    if (collision[ty][tx] === PASS && ground[ty][tx] === 'grass') {
      objects.push({ type: 'tree', tx, ty });
      collision[ty][tx] = WALL;
    }
  }

  // 경계에 나무 숲 / tree border forest
  function plantBorderTrees(clusters) {
    for (let x = 0; x < WORLD_W; x += 1) {
      maybeTree(x, 0);
      maybeTree(x, WORLD_H - 1);
    }
    for (let y = 0; y < WORLD_H; y += 1) {
      maybeTree(0, y);
      maybeTree(WORLD_W - 1, y);
    }
    for (const [x, y] of (clusters || [])) {
      maybeTree(x, y);
      maybeTree(x + 1, y + 1);
    }
  }

  // === 마을 구성 / build the village ===
  function buildVillage() {
    resetZone();
    buildings.push(
      { type: 'coding_hut', name: '코딩 오두막', tx: 31, ty: 8, w: 4, h: 4, agentIds: ['coder'], interiorId: 'coding_hut' },
      { type: 'research_cafe', name: '리서치 카페', tx: 31, ty: 18, w: 4, h: 4, agentIds: ['researcher'], interiorId: 'research_cafe' },
      { type: 'writers_house', name: '작가의 집', tx: 4, ty: 8, w: 5, h: 5, agentIds: ['writer', 'editor'], interiorId: 'writers_house' },
      { type: 'analysis_lab', name: '분석 연구소', tx: 4, ty: 18, w: 5, h: 5, agentIds: ['analyst', 'visualizer'], interiorId: 'analysis_lab' },
      { type: 'orchestrator_castle', name: '오케스트레이터 성', tx: 16, ty: 2, w: 8, h: 6, agentIds: ['orchestrator'], interiorId: 'orchestrator_castle' }
    );

    // 중앙 광장 / central plaza
    const plazaX = 16;
    const plazaY = 13;
    const plazaW = 8;
    const plazaH = 6;
    paintRect(plazaX, plazaY, plazaW, plazaH, 'path');

    // 분수 (2×2) / fountain
    const fountainTx = plazaX + 3;
    const fountainTy = plazaY + 2;
    objects.push({ type: 'fountain', tx: fountainTx, ty: fountainTy });
    markRect(fountainTx, fountainTy, 2, 2, WALL);

    // 광장 중앙 / plaza center
    const plazaCenter = { x: plazaX + Math.floor(plazaW / 2), y: plazaY + Math.floor(plazaH / 2) };

    for (const b of buildings) {
      placeBuilding(b);
    }
    // 각 건물 문을 광장과 L자 도로로 연결(문-땅 불일치 방지) / connect every door to the plaza
    for (const b of buildings) {
      connectToPlaza(b.door, plazaCenter);
    }

    // 물웅덩이 / pond
    paintRect(33, 25, 4, 3, 'water');
    markRect(33, 25, 4, 3, WALL);

    // 꽃밭 / flower beds
    scatterFlowers([[14, 11], [25, 11], [13, 16], [26, 16], [18, 21], [21, 21], [12, 9], [27, 22], [15, 23], [24, 9]]);

    // 남쪽 공방으로 가는 길 / south path toward the workshop
    paintVPath(19, plazaY + plazaH, 28, 2);

    plantBorderTrees([[11, 14], [28, 14], [13, 25], [11, 5], [28, 5], [24, 25]]);
    addFences([[15, 19], [24, 19], [15, 12], [24, 12]]);

    // 장식 지형지물 / decorative props
    addProp('lamp', 15, 11); addProp('lamp', 24, 11);
    addProp('lamp', 15, 20); addProp('lamp', 24, 20);
    addProp('well', 27, 16);
    addProp('rock', 12, 6); addProp('rock', 28, 6); addProp('rock', 30, 25);
    addProp('bush', 14, 22); addProp('bush', 26, 23); addProp('bush', 11, 16);
    // 마을 게시판(상호작용) / interactive bulletin board
    addProp('bulletin', 25, 14, {
      title: '마을 게시판',
      text: 'AgentVillage에 오신 걸 환영해요!\n\n· WASD/방향키로 이동 (Enter: 상호작용)\n· 건물 문·구역 게이트에 닿으면 자동 입장\n· NPC 앞에서 Enter로 대화하고 작업을 의뢰하세요\n· 남쪽 게이트로 가면 「에이전트 공방」에서\n  나만의 AI 에이전트를 만들 수 있어요.'
    });
    // 게이트 표지판(상호작용) / gate signpost
    addProp('sign', 22, 26, { title: '표지판', text: '사방 게이트로 다른 구역에 갈 수 있어요:\n남↓ 공방 · 동→ 숲 · 서← 해변 · 북↑ 설원' });

    // 마을 캐릭터 NPC(일부는 배회) / village character NPCs (some wander)
    addEvent({ agentId: 'village_elder', name: '촌장', color: '#BCAAA4', mode: 'input', kind: 'npc', sprite: 'human', tx: 17, ty: 16 });
    addEvent({ agentId: 'village_kid', name: '꼬마', color: '#FFD54F', mode: 'input', kind: 'npc', sprite: 'human', tx: 21, ty: 16, wander: true });
    addEvent({ agentId: 'village_merchant', name: '상인', color: '#A1887F', mode: 'input', kind: 'npc', sprite: 'human', tx: 17, ty: 12, wander: true });
    addEvent({ agentId: 'stray_cat', name: '길고양이', color: '#90A4AE', mode: 'input', kind: 'npc', sprite: 'cat', tx: 24, ty: 16, wander: true });
    addEvent({ agentId: 'bard', name: '음유시인', color: '#CE93D8', mode: 'input', kind: 'npc', sprite: 'human', tx: 25, ty: 21, wander: true });
    addEvent({ agentId: 'village_dog', name: '강아지', color: '#D7CCC8', mode: 'input', kind: 'npc', sprite: 'dog', tx: 22, ty: 21, wander: true });
    // 이벤트: 소원의 우물(동전 던지면 소원 생성) / event: wishing well
    addEvent({ agentId: 'wishing_well', name: '소원의 우물', color: '#4FA8D8', mode: 'auto', sprite: 'well', prompt: '우물에 동전을 던진 이에게, 엉뚱하면서도 따뜻한 소원 성취 메시지를 한국어로 매번 다르게 3~5문장.', tx: 14, ty: 12 });

    // 사방 게이트로 가는 길 / paths to the four-direction gates
    paintHPath(plazaX + plazaW, 38, 14, 2); // 동쪽(숲) / east to forest
    paintHPath(1, plazaX, 14, 2); // 서쪽(해변) / west to beach
    // 북쪽(설원) 세로 길 — 건물(코딩 오두막 x31~)을 피해 x29~30 사용, 동쪽 길(row14)과 만남
    // north spur on x29~30 (avoids the coding hut at x31+), joining the east path at row 14
    paintVPath(29, 1, 14, 2);

    // 도착 지점은 각 구역의 남쪽 입구(20,24) / arrival = each zone's south entrance
    const zoneEntry = { x: 20 * TILE, y: 24 * TILE };

    // 남쪽 → 공방 / south → workshop
    placeGate(19, 28, 'workshop', zoneEntry, '공방 ↓');
    placeGate(20, 28, 'workshop', zoneEntry, '공방 ↓');
    // 동쪽 → 숲 / east → forest
    placeGate(38, 14, 'forest', zoneEntry, '숲 →');
    placeGate(38, 15, 'forest', zoneEntry, '숲 →');
    // 서쪽 → 해변 / west → beach
    placeGate(1, 14, 'beach', zoneEntry, '← 해변');
    placeGate(1, 15, 'beach', zoneEntry, '← 해변');
    // 북쪽 → 설원 / north → snowfield
    placeGate(29, 1, 'snowfield', zoneEntry, '설원 ↑');
    placeGate(30, 1, 'snowfield', zoneEntry, '설원 ↑');

    Object.assign(SPAWN, { x: 20 * TILE, y: 22 * TILE });
  }

  // === 에이전트 공방 구역 / build the workshop district ===
  function buildWorkshop() {
    resetZone();
    buildings.push({
      type: 'agent_workshop', name: '에이전트 공방', tx: 16, ty: 9, w: 8, h: 6,
      agentIds: [], interiorId: 'agent_workshop', interiorKind: 'workshop'
    });

    // 공방 앞 광장 / plaza in front of the workshop
    paintRect(15, 15, 10, 3, 'path');
    placeBuilding(buildings[0]); // 문 생성 / create door (20,15)

    const door = buildings[0].door;
    paintVPath(door.tx, door.ty, 28, 2); // 문 → 남쪽 게이트 길 / door to south gate

    scatterFlowers([[13, 12], [27, 12], [14, 20], [26, 20], [17, 22], [23, 22]]);
    plantBorderTrees([[11, 11], [28, 11], [12, 22], [27, 22], [10, 16], [29, 16]]);

    // 장식 지형지물 / decorative props
    addProp('lamp', 14, 16); addProp('lamp', 25, 16);
    addProp('bush', 13, 20); addProp('bush', 26, 20);
    addProp('rock', 12, 13); addProp('rock', 27, 13);
    // 공방 안내 표지판(상호작용) / workshop info sign
    addProp('sign', 25, 20, {
      title: '에이전트 공방',
      text: '마스터(✎)에게 Enter로 말을 걸면\n나만의 AI 에이전트를 추가·편집·삭제할 수 있어요.\n만든 에이전트는 이 구역에 NPC로 등장합니다.\n\n남쪽 ↓ 마을로 돌아가기'
    });

    // 남쪽 게이트 → 마을 / south gate back to the village
    const villageArrival = { x: 20 * TILE, y: 24 * TILE };
    placeGate(19, 28, 'village', villageArrival, '← 마을');
    placeGate(20, 28, 'village', villageArrival, '← 마을');
  }

  // === 숲 구역 / forest ===
  function buildForest() {
    resetZone();
    // 흙길: 남(마을)↔북(동굴) / dirt path south↔north
    paintVPath(20, 2, 28, 2, 'dirt');
    paintHPath(8, 20, 14, 2, 'dirt');
    paintHPath(20, 32, 16, 2, 'dirt');

    const trees = [[5, 5], [8, 7], [12, 5], [31, 6], [34, 8], [6, 21], [10, 24], [33, 22], [28, 25], [14, 9], [26, 9], [16, 23], [24, 23], [7, 12], [33, 13]];
    for (const [x, y] of trees) {
      maybeTree(x, y);
    }
    const pines = [[10, 9], [28, 8], [6, 17], [33, 17], [12, 25], [27, 25], [16, 6], [24, 6]];
    for (const [x, y] of pines) {
      addProp('pine', x, y);
    }
    const shrooms = [[14, 17], [24, 16], [9, 19], [30, 19], [17, 25], [23, 25]];
    for (const [x, y] of shrooms) {
      addProp('mushroom', x, y, { solid: false });
    }
    addProp('rock', 11, 12); addProp('rock', 29, 12); addProp('bush', 15, 19); addProp('bush', 25, 19);
    plantBorderTrees([]);

    addProp('sign', 22, 24, { title: '숲', text: '울창한 숲 구역.\n남쪽 ↓ 마을, 북쪽 ↑ 동굴로 이어집니다.\n빛나는 나무(✦)에게 말을 걸어보세요.' });
    // 이벤트: 정령 나무 / event: spirit tree
    addEvent({ agentId: 'forest_spirit', name: '정령 나무', color: '#66BB6A', mode: 'input', sprite: 'spirit_tree', tx: 17, ty: 8 });
    // NPC: 약초꾼(배회) + 나무꾼 / herbalist (wanders) + woodcutter
    addEvent({ agentId: 'forest_herbalist', name: '약초꾼', color: '#81C784', mode: 'input', kind: 'npc', sprite: 'human', tx: 12, ty: 16, wander: true });
    addEvent({ agentId: 'woodcutter', name: '나무꾼', color: '#A1887F', mode: 'input', kind: 'npc', sprite: 'human', tx: 28, ty: 12, wander: true });
    // 이벤트: 요정 버섯 / event: fairy mushroom
    addEvent({ agentId: 'fairy_mushroom', name: '요정 버섯', color: '#BA68C8', mode: 'input', sprite: 'mushroom', tx: 15, ty: 16 });

    placeGate(19, 28, 'village', { x: 35 * TILE, y: 14 * TILE }, '← 마을');
    placeGate(20, 28, 'village', { x: 35 * TILE, y: 14 * TILE }, '← 마을');
    placeGate(19, 1, 'cave', { x: 20 * TILE, y: 24 * TILE }, '동굴 ↑');
    placeGate(20, 1, 'cave', { x: 20 * TILE, y: 24 * TILE }, '동굴 ↑');
  }

  // === 해변 구역 / beach ===
  function buildBeach() {
    resetZone();
    fillGround('sand');
    // 동쪽 바다 / ocean on the east side
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 30; x < WORLD_W; x++) {
        ground[y][x] = (x >= 34) ? 'deep_water' : 'water';
        collision[y][x] = WALL;
      }
    }
    paintVPath(20, 4, 28, 2, 'path');
    paintHPath(8, 28, 16, 2, 'path');

    const palms = [[6, 6], [12, 8], [24, 7], [10, 20], [22, 22], [14, 24], [8, 12]];
    for (const [x, y] of palms) {
      addProp('palm', x, y);
    }
    const shells = [[16, 18], [24, 18], [12, 22], [26, 20], [18, 24]];
    for (const [x, y] of shells) {
      addProp('shell', x, y, { solid: false });
    }
    addProp('rock', 28, 10); addProp('rock', 28, 24);
    addProp('lighthouse', 26, 8);

    addProp('sign', 22, 24, { title: '해변', text: '파도가 치는 해변 구역.\n동쪽은 바다예요. 남쪽 ↓ 마을로.\n유리병(✦)을 열어보세요.' });
    // 이벤트: 유리병 편지(즉시 생성) / event: message in a bottle (auto)
    addEvent({
      agentId: 'message_bottle', name: '유리병 편지', color: '#4FC3F7', mode: 'auto', sprite: 'bottle',
      prompt: '유리병 속에서 발견된, 표류자가 남긴 짧은 편지를 한국어로 하나 써줘. 매번 완전히 다르게, 4~6문장.',
      tx: 14, ty: 20
    });
    // NPC: 어부(정지) + 서퍼(배회) / fisherman (still) + surfer (wanders)
    addEvent({ agentId: 'beach_fisherman', name: '어부', color: '#4FC3F7', mode: 'input', kind: 'npc', sprite: 'human', tx: 28, ty: 14, wander: true });
    addEvent({ agentId: 'surfer', name: '서퍼', color: '#4DD0E1', mode: 'input', kind: 'npc', sprite: 'human', tx: 10, ty: 8, wander: true });

    placeGate(19, 28, 'village', { x: 4 * TILE, y: 14 * TILE }, '← 마을');
    placeGate(20, 28, 'village', { x: 4 * TILE, y: 14 * TILE }, '← 마을');
  }

  // === 설원 구역 / snowfield ===
  function buildSnowfield() {
    resetZone();
    fillGround('snow');
    // 얼음 호수 / frozen pond
    for (let y = 18; y < 24; y++) {
      for (let x = 24; x < 32; x++) {
        ground[y][x] = 'ice';
      }
    }
    paintVPath(20, 4, 28, 2, 'path');
    paintHPath(8, 20, 14, 2, 'path');

    const pines = [[5, 5], [9, 7], [13, 5], [28, 6], [33, 8], [6, 22], [11, 25], [34, 22], [16, 9], [24, 9], [7, 14], [33, 14]];
    for (const [x, y] of pines) {
      addProp('pine', x, y);
    }
    addProp('snowman', 14, 18); addProp('snowman', 22, 25);
    addProp('rock', 12, 12); addProp('rock', 27, 12);

    addProp('sign', 22, 24, { title: '설원', text: '눈 덮인 설원 구역.\n가운데 얼음 호수가 있어요. 남쪽 ↓ 마을로.\n말하는 눈사람(✦)과 수다 떨어보세요.' });
    // 이벤트: 말하는 눈사람 / event: talking snowman
    addEvent({ agentId: 'snow_friend', name: '말하는 눈사람', color: '#B3E5FC', mode: 'input', sprite: 'snowman', tx: 24, ty: 16 });
    // NPC: 펭귄 + 눈토끼(둘 다 배회) / penguin + snow rabbit (both wander)
    addEvent({ agentId: 'snow_penguin', name: '펭귄', color: '#B0BEC5', mode: 'input', kind: 'npc', sprite: 'penguin', tx: 27, ty: 20, wander: true });
    addEvent({ agentId: 'snow_rabbit', name: '눈토끼', color: '#ECEFF1', mode: 'input', kind: 'npc', sprite: 'rabbit', tx: 16, ty: 20, wander: true });

    placeGate(19, 28, 'village', { x: 30 * TILE, y: 4 * TILE }, '← 마을');
    placeGate(20, 28, 'village', { x: 30 * TILE, y: 4 * TILE }, '← 마을');
  }

  // === 동굴 구역 / cave ===
  function buildCave() {
    resetZone();
    fillGround('cave_floor');
    // 가장자리 바위 벽(시각용, 경계는 월드 밖이 막음) / decorative rock ring
    for (let x = 2; x < WORLD_W - 2; x += 2) {
      addProp('rock', x, 1, { solid: false });
      addProp('rock', x, WORLD_H - 2, { solid: false });
    }
    for (let y = 2; y < WORLD_H - 2; y += 2) {
      addProp('rock', 1, y, { solid: false });
      addProp('rock', WORLD_W - 2, y, { solid: false });
    }
    const crystals = [[8, 8], [30, 9], [12, 22], [28, 23], [16, 6], [24, 25]];
    for (const [x, y] of crystals) {
      addProp('crystal', x, y);
    }
    const stals = [[10, 14], [28, 14], [14, 10], [26, 20], [18, 22]];
    for (const [x, y] of stals) {
      addProp('stalagmite', x, y);
    }
    addProp('rock', 13, 16); addProp('rock', 27, 16);

    addProp('sign', 22, 24, { title: '동굴', text: '어두운 수정 동굴.\n남쪽 ↓ 숲으로 돌아갑니다.\n빛나는 수정(✦)에게 물어보세요.' });
    // 이벤트: 수정 오라클 / event: crystal oracle
    addEvent({ agentId: 'crystal_oracle', name: '수정 오라클', color: '#80DEEA', mode: 'input', sprite: 'crystal', tx: 16, ty: 16 });
    // NPC: 광부(정지) + 보물사냥꾼(배회) / miner (still) + treasure hunter (wanders)
    addEvent({ agentId: 'cave_miner', name: '광부', color: '#8D6E63', mode: 'input', kind: 'npc', sprite: 'human', tx: 24, ty: 16, wander: true });
    addEvent({ agentId: 'treasure_hunter', name: '보물사냥꾼', color: '#FFB300', mode: 'input', kind: 'npc', sprite: 'human', tx: 12, ty: 20, wander: true });

    placeGate(19, 28, 'forest', { x: 20 * TILE, y: 4 * TILE }, '← 숲');
    placeGate(20, 28, 'forest', { x: 20 * TILE, y: 4 * TILE }, '← 숲');
  }

  // 꽃 흩뿌리기 / scatter flowers on grass
  function scatterFlowers(spots) {
    for (const [x, y] of spots) {
      if (inBounds(x, y) && ground[y][x] === 'grass') {
        ground[y][x] = 'flowers';
      }
    }
  }

  // 울타리 일부 / a few fences
  function addFences(spots) {
    for (const [x, y] of spots) {
      if (inBounds(x, y) && collision[y][x] === PASS) {
        objects.push({ type: 'fence', tx: x, ty: y });
        collision[y][x] = WALL;
      }
    }
  }

  // 장식/상호작용 지형지물 배치 / place a decorative or interactive prop
  // opts.solid === false 면 통과 가능(작은 장식: 버섯/조개 등) / non-solid for small décor
  function addProp(type, tx, ty, opts) {
    if (!inBounds(tx, ty) || collision[ty][tx] !== PASS) {
      return;
    }
    objects.push(Object.assign({ type, tx, ty }, opts || {}));
    if (!opts || opts.solid !== false) {
      collision[ty][tx] = WALL;
    }
  }

  // 에이전트 이벤트 오브젝트 배치(상호작용) / place an agent-powered event object
  // ev: { agentId, name, color, mode:'input'|'auto', sprite, prompt?, tx, ty, kind?, wander? }
  function addEvent(ev) {
    if (!inBounds(ev.tx, ev.ty) || collision[ev.ty][ev.tx] !== PASS) {
      return;
    }
    const o = Object.assign({ type: 'event' }, ev);
    // 배회 NPC용 이동 상태(픽셀 위치 보간) / movement state for wandering NPCs
    o.px = ev.tx * TILE;
    o.py = ev.ty * TILE;
    o.moving = false;
    o.moveProgress = 0;
    o.path = null;
    o.rest = Math.random() * 2.5; // 시작 시점 분산 / staggered start
    objects.push(o);
    collision[ev.ty][ev.tx] = WALL;
  }

  // === 배회 NPC 이동(먼 목적지까지 경로 이동) / wandering NPCs walk to far destinations ===
  const NPC_MOVE_TIME = 0.4; // 한 칸 이동 시간(초) / time to cross one tile

  // BFS 경로탐색: 통과 가능(PASS) 칸만, 시작칸은 통과 허용 / BFS over PASS tiles
  function bfsPath(sx, sy, dx, dy) {
    const cols = WORLD_W;
    const rows = WORLD_H;
    if (!inBounds(dx, dy) || collision[dy][dx] !== PASS) {
      return null;
    }
    const prev = new Int32Array(cols * rows).fill(-1);
    const seen = new Uint8Array(cols * rows);
    const start = sy * cols + sx;
    const goal = dy * cols + dx;
    const queue = [start];
    seen[start] = 1;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    let found = false;
    for (let head = 0; head < queue.length && !found; head++) {
      const cur = queue[head];
      const cx = cur % cols;
      const cy = (cur - cx) / cols;
      if (cur === goal) {
        found = true;
        break;
      }
      for (const d of dirs) {
        const nx = cx + d[0];
        const ny = cy + d[1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) {
          continue;
        }
        const ni = ny * cols + nx;
        if (seen[ni] || collision[ny][nx] !== PASS) {
          continue;
        }
        seen[ni] = 1;
        prev[ni] = cur;
        queue.push(ni);
      }
    }
    if (!found) {
      return null;
    }
    const path = [];
    let cur = goal;
    while (cur !== start) {
      const cx = cur % cols;
      const cy = (cur - cx) / cols;
      path.push([cx, cy]);
      cur = prev[cur];
      if (cur < 0) {
        return null;
      }
    }
    path.reverse();
    return path;
  }

  // 먼 랜덤 목적지로의 경로 선택 / pick a path to a far random destination
  function pickJourney(o) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const dtx = o.tx + (Math.floor(Math.random() * 27) - 13); // ±13 타일 / tiles
      const dty = o.ty + (Math.floor(Math.random() * 21) - 10); // ±10 타일
      if (!inBounds(dtx, dty) || collision[dty][dtx] !== PASS) {
        continue;
      }
      if (Math.abs(dtx - o.tx) + Math.abs(dty - o.ty) < 5) {
        continue; // 너무 가까운 목적지는 제외(먼 이동) / skip near destinations
      }
      const path = bfsPath(o.tx, o.ty, dtx, dty);
      if (path && path.length >= 4) {
        return path;
      }
    }
    return null;
  }

  // 배회 NPC 갱신(대화 중인 NPC는 정지) / update wandering NPCs (the one being talked to stays still)
  function updateNpcs(dt, frozenAgentId) {
    for (const o of objects) {
      if (o.type !== 'event' || !o.wander) {
        continue;
      }
      if (frozenAgentId && o.agentId === frozenAgentId) {
        continue;
      }
      if (o.moving) {
        o.moveProgress += dt / NPC_MOVE_TIME;
        if (o.moveProgress >= 1) {
          o.moving = false;
          o.px = o.tx * TILE;
          o.py = o.ty * TILE;
          if (!o.path || o.path.length === 0) {
            o.rest = 0.6 + Math.random() * 2; // 목적지 도착 → 잠시 쉼 / rest at destination
            o.path = null;
          }
        } else {
          o.px = o.fromPx + (o.tx * TILE - o.fromPx) * o.moveProgress;
          o.py = o.fromPy + (o.ty * TILE - o.fromPy) * o.moveProgress;
        }
        continue;
      }
      if (o.rest > 0) {
        o.rest -= dt;
        continue;
      }
      if (!o.path || o.path.length === 0) {
        o.path = pickJourney(o);
        if (!o.path) {
          o.rest = 0.5; // 경로 못 찾으면 잠시 후 재시도 / retry later
          continue;
        }
      }
      const next = o.path[0];
      if (!inBounds(next[0], next[1]) || collision[next[1]][next[0]] !== PASS) {
        o.path = null; // 길이 막힘 → 재탐색 / blocked, re-path
        o.rest = 0.3;
        continue;
      }
      o.path.shift();
      collision[o.ty][o.tx] = PASS; // 현재 칸 비움 / free current tile
      collision[next[1]][next[0]] = WALL; // 다음 칸 예약 / reserve next tile
      o.fromPx = o.px;
      o.fromPy = o.py;
      o.tx = next[0];
      o.ty = next[1];
      o.moving = true;
      o.moveProgress = 0;
    }
  }

  // 구역 로드 / load a zone by id
  function loadZone(id) {
    activeZone = id;
    switch (id) {
      case 'workshop': buildWorkshop(); break;
      case 'forest': buildForest(); break;
      case 'beach': buildBeach(); break;
      case 'snowfield': buildSnowfield(); break;
      case 'cave': buildCave(); break;
      default: buildVillage(); activeZone = 'village'; break;
    }
    return activeZone;
  }

  // === 조회 / queries ===

  function groundAt(tx, ty) {
    return inBounds(tx, ty) ? ground[ty][tx] : 'grass';
  }

  function collisionAt(tx, ty) {
    return inBounds(tx, ty) ? collision[ty][tx] : WALL;
  }

  function isSolidPx(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    return collisionAt(tx, ty) === WALL;
  }

  // 픽셀 좌표의 문 건물(없으면 null) / building whose door is at the pixel (or null)
  function doorAtPx(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (collisionAt(tx, ty) !== DOOR) {
      return null;
    }
    for (const b of buildings) {
      if (b.door && b.door.tx === tx && b.door.ty === ty) {
        return b;
      }
    }
    return null;
  }

  // 픽셀 좌표의 게이트(없으면 null) / gate at the pixel (or null)
  function gateAtPx(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (collisionAt(tx, ty) !== GATE) {
      return null;
    }
    for (const g of gates) {
      if (g.tx === tx && g.ty === ty) {
        return g;
      }
    }
    return null;
  }

  function getActiveZone() {
    return activeZone;
  }

  // === 렌더링 / rendering ===

  function drawGround(ctx, camera) {
    animTick++; // 프레임마다 증가(렌더 1회/프레임) / advances once per rendered frame
    const startTx = Math.max(0, Math.floor(camera.x / TILE));
    const startTy = Math.max(0, Math.floor(camera.y / TILE));
    const endTx = Math.min(WORLD_W, Math.ceil((camera.x + window.CONFIG.LOGICAL_W) / TILE));
    const endTy = Math.min(WORLD_H, Math.ceil((camera.y + window.CONFIG.LOGICAL_H) / TILE));
    for (let ty = startTy; ty < endTy; ty++) {
      for (let tx = startTx; tx < endTx; tx++) {
        window.Sprites.drawTile(ctx, ground[ty][tx], tx * TILE - camera.x, ty * TILE - camera.y);
      }
    }
  }

  // 평면 오브젝트(울타리) + 게이트 / flat objects (fences) and gates
  function drawFlatObjects(ctx, camera) {
    for (const o of objects) {
      const sx = o.tx * TILE - camera.x;
      const sy = o.ty * TILE - camera.y;
      if (o.type === 'fence') {
        window.Sprites.drawFence(ctx, sx, sy);
      } else if (o.type === 'rock') {
        window.Sprites.drawRock(ctx, sx, sy);
      } else if (o.type === 'bush') {
        window.Sprites.drawBush(ctx, sx, sy);
      } else if (o.type === 'mushroom') {
        window.Sprites.drawMushroom(ctx, sx, sy);
      } else if (o.type === 'shell') {
        window.Sprites.drawShell(ctx, sx, sy);
      }
    }
    for (const g of gates) {
      drawGate(ctx, g, camera);
    }
  }

  // 게이트(포털 아치) 그리기 / draw a gate (portal arch)
  function drawGate(ctx, g, camera) {
    const x = g.tx * TILE - camera.x;
    const y = g.ty * TILE - camera.y;
    // 빛나는 바닥 / glowing floor mat
    ctx.fillStyle = '#5E35B1';
    ctx.fillRect(x + 1, y + 2, TILE - 2, TILE - 4);
    ctx.fillStyle = '#B39DDB';
    ctx.fillRect(x + 3, y + 5, TILE - 6, TILE - 9);
    // 발광 펄스 / pulsing glow
    const pulse = 0.35 + 0.25 * Math.sin(animTick * 0.15);
    ctx.fillStyle = 'rgba(225,190,231,' + pulse.toFixed(2) + ')';
    ctx.fillRect(x + 5, y + 6, TILE - 10, TILE - 12);
    // 기둥 / posts
    ctx.fillStyle = '#4527A0';
    ctx.fillRect(x, y - 6, 2, TILE + 4);
    ctx.fillRect(x + TILE - 2, y - 6, 2, TILE + 4);
  }

  // 건물 + 게이트 이름표 / building & gate labels
  function drawBuildingLabels(ctx, camera) {
    ctx.font = 'bold 9px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    for (const b of buildings) {
      labelAt(ctx, b.name, (b.tx + b.w / 2) * TILE - camera.x, b.ty * TILE - camera.y - 8, '#FFFFFF');
    }
    // 같은 라벨의 게이트 타일들을 묶어 중심에 라벨 1개 / one label centered over each gate pair
    const byLabel = {};
    for (const g of gates) {
      if (g.label) {
        (byLabel[g.label] = byLabel[g.label] || []).push(g);
      }
    }
    for (const label in byLabel) {
      const grp = byLabel[label];
      const cx = grp.reduce((s, g) => s + g.tx, 0) / grp.length; // 평균 타일 / centroid tile x
      const topY = Math.min.apply(null, grp.map((g) => g.ty)); // 최상단 / topmost tile y
      labelAt(ctx, label, (cx + 0.5) * TILE - camera.x, topY * TILE - camera.y - 6, '#D1C4E9');
    }
    // 이벤트/NPC 라벨은 가까이 갈 때만 표시(시각 노이즈↓) / show event & NPC labels only when near
    const LABEL_RADIUS = 6; // 타일 / tiles
    const pcx = (window.Player.state.x + TILE / 2) / TILE;
    const pcy = (window.Player.state.y + TILE / 2) / TILE;
    for (const o of objects) {
      if (o.type !== 'event') {
        continue;
      }
      if (Math.abs(o.tx - pcx) > LABEL_RADIUS || Math.abs(o.ty - pcy) > LABEL_RADIUS) {
        continue;
      }
      const isNpc = (o.kind === 'npc');
      const txt = isNpc ? o.name : ('✦ ' + o.name);
      // 배회 NPC는 픽셀 위치를 따라 라벨 이동 / label follows the wandering pixel position
      const lx = (o.px != null ? o.px + TILE / 2 : (o.tx + 0.5) * TILE) - camera.x;
      const ly = (o.py != null ? o.py : o.ty * TILE) - camera.y - 6;
      labelAt(ctx, txt, lx, ly, isNpc ? '#FFFFFF' : '#FFE082');
    }
    ctx.textAlign = 'center';
  }

  // 라벨 한 개(반투명 배경) / one label with translucent background
  function labelAt(ctx, text, cx, baseY, color) {
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(Math.round(cx - tw / 2 - 3), Math.round(baseY - 8), Math.round(tw + 6), 11);
    ctx.fillStyle = color;
    ctx.fillText(text, Math.round(cx), Math.round(baseY));
  }

  // y정렬 대상(건물/나무/분수) / y-sortable entities
  function getYSortables(camera) {
    const list = [];
    for (const b of buildings) {
      list.push({
        baseY: (b.ty + b.h) * TILE,
        draw: (ctx) => window.Sprites.drawBuilding(ctx, b.type, b.tx * TILE - camera.x, b.ty * TILE - camera.y, b.w, b.h)
      });
    }
    for (const o of objects) {
      const sx = o.tx * TILE - camera.x;
      const sy = o.ty * TILE - camera.y;
      if (o.type === 'tree') {
        list.push({ baseY: (o.ty + 1) * TILE, draw: (ctx) => { window.Sprites.drawShadow(ctx, sx, sy); window.Sprites.drawTree(ctx, sx, sy); } });
      } else if (o.type === 'fountain') {
        list.push({ baseY: (o.ty + 2) * TILE, draw: (ctx) => window.Sprites.drawFountain(ctx, sx, sy) });
      } else if (o.type === 'lamp') {
        list.push({ baseY: (o.ty + 1) * TILE, draw: (ctx) => window.Sprites.drawLamp(ctx, sx, sy) });
      } else if (o.type === 'well') {
        list.push({ baseY: (o.ty + 1) * TILE, draw: (ctx) => window.Sprites.drawWell(ctx, sx, sy) });
      } else if (o.type === 'sign' || o.type === 'bulletin') {
        list.push({ baseY: (o.ty + 1) * TILE, draw: (ctx) => window.Sprites.drawSign(ctx, sx, sy) });
      } else if (o.type === 'palm') {
        list.push({ baseY: (o.ty + 1) * TILE, draw: (ctx) => { window.Sprites.drawShadow(ctx, sx, sy); window.Sprites.drawPalm(ctx, sx, sy); } });
      } else if (o.type === 'pine') {
        list.push({ baseY: (o.ty + 1) * TILE, draw: (ctx) => { window.Sprites.drawShadow(ctx, sx, sy); window.Sprites.drawPineTree(ctx, sx, sy); } });
      } else if (o.type === 'snowman') {
        list.push({ baseY: (o.ty + 1) * TILE, draw: (ctx) => window.Sprites.drawSnowman(ctx, sx, sy) });
      } else if (o.type === 'crystal') {
        list.push({ baseY: (o.ty + 1) * TILE, draw: (ctx) => window.Sprites.drawCrystal(ctx, sx, sy) });
      } else if (o.type === 'stalagmite') {
        list.push({ baseY: (o.ty + 1) * TILE, draw: (ctx) => window.Sprites.drawStalagmite(ctx, sx, sy) });
      } else if (o.type === 'lighthouse') {
        list.push({ baseY: (o.ty + 1) * TILE, draw: (ctx) => window.Sprites.drawLighthouse(ctx, sx, sy) });
      } else if (o.type === 'event') {
        // 배회 NPC는 픽셀 위치(px,py)로 그린다 / wandering NPCs use interpolated pixel position
        const ex = (o.px != null ? o.px : o.tx * TILE) - camera.x;
        const ey = (o.py != null ? o.py : o.ty * TILE) - camera.y;
        const baseY = (o.py != null ? o.py : o.ty * TILE) + TILE;
        list.push({ baseY, draw: (ctx) => drawEventSprite(ctx, o, ex, ey) });
      }
    }
    return list;
  }

  // 이벤트/NPC 오브젝트의 스프라이트(그림자 포함) / draw an event or NPC sprite (with shadow)
  function drawEventSprite(ctx, ev, sx, sy) {
    const S = window.Sprites;
    S.drawShadow(ctx, sx, sy);
    if (ev.sprite === 'spirit_tree') {
      S.drawSpiritTree(ctx, sx, sy);
    } else if (ev.sprite === 'bottle') {
      S.drawBottle(ctx, sx, sy);
    } else if (ev.sprite === 'snowman') {
      S.drawSnowman(ctx, sx, sy);
    } else if (ev.sprite === 'crystal') {
      S.drawCrystal(ctx, sx, sy);
    } else if (ev.sprite === 'human') {
      S.drawNPC(ctx, ev.agentId, sx, sy, animTick, 'idle', ev.color);
    } else if (ev.sprite === 'cat') {
      S.drawCat(ctx, sx, sy, animTick, ev.color);
    } else if (ev.sprite === 'penguin') {
      S.drawPenguin(ctx, sx, sy, animTick);
    } else if (ev.sprite === 'dog') {
      S.drawDog(ctx, sx, sy, animTick, ev.color);
    } else if (ev.sprite === 'rabbit') {
      S.drawRabbit(ctx, sx, sy, animTick, ev.color);
    } else if (ev.sprite === 'well') {
      S.drawWell(ctx, sx, sy);
    } else if (ev.sprite === 'mushroom') {
      S.drawMushroom(ctx, sx, sy);
    }
  }

  // 픽셀 좌표의 이벤트 오브젝트(없으면 null) / event object at the pixel (or null)
  function eventAt(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    for (const o of objects) {
      if (o.type === 'event' && o.tx === tx && o.ty === ty) {
        return o;
      }
    }
    return null;
  }

  // 픽셀 좌표의 게시판/표지판(없으면 null) / sign or bulletin at the pixel (or null)
  function signAt(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    for (const o of objects) {
      if ((o.type === 'sign' || o.type === 'bulletin') && o.tx === tx && o.ty === ty) {
        return o;
      }
    }
    return null;
  }

  // 초기 구역 빌드(마을) / build the initial zone (village)
  buildVillage();

  window.World = {
    TILE,
    WORLD_W,
    WORLD_H,
    SPAWN,
    buildings,
    loadZone,
    getActiveZone,
    groundAt,
    collisionAt,
    isSolidPx,
    doorAtPx,
    gateAtPx,
    signAt,
    eventAt,
    updateNpcs,
    drawGround,
    drawFlatObjects,
    drawBuildingLabels,
    getYSortables
  };
})();
