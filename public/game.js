'use strict';

// 메인 게임 루프, 씬 관리, 입력 처리, WebSocket 클라이언트
// Main game loop, scene management, input handling, WebSocket client

(function () {
  const W = window.CONFIG.LOGICAL_W;
  const H = window.CONFIG.LOGICAL_H;
  const SCALE = window.CONFIG.SCALE;

  // === 상수 / Constants ===
  const SCENE = { TITLE: 'title', WORLD: 'world', INTERIOR: 'interior' };

  // 구역 표시 이름 / zone display names
  const ZONE_NAMES = {
    village: '🏡 마을', workshop: '🏰 에이전트 공방', forest: '🌲 숲',
    beach: '🏖️ 해변', snowfield: '❄️ 설원', cave: '🕳️ 동굴'
  };
  const BANNER_DURATION = 2.6; // 배너 표시 시간(초) / banner duration
  const MAX_DT = 0.05; // 델타 타임 상한(초) / clamp delta time
  const RECONNECT_MS = 2000;

  // 접근성: 큰 움직임을 줄이는 사용자 선호를 반영(흔들림/깜빡임 억제)
  // accessibility: honor the user's reduced-motion preference (suppress bob/blink)
  const REDUCED_MOTION = (typeof window.matchMedia === 'function') &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 이동 키 매핑 / movement key map
  const MOVE_KEYS = {
    KeyW: 'up', ArrowUp: 'up',
    KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left',
    KeyD: 'right', ArrowRight: 'right'
  };

  // === 상태 / state ===
  const game = {
    scene: SCENE.TITLE,
    banner: { text: '', timeLeft: 0 }, // 구역 진입 배너 / zone-entry banner
    talking: false,
    currentNpc: null,
    ws: null,
    wsReady: false,
    lastTime: 0,
    frame: 0, // 프레임 카운터(프롬프트 깜빡임) / frame counter for the prompt bob
    // 퇴장 직후 같은 문으로 자동 재입장 방지 / prevent auto re-entering the door we just exited
    lastExited: null,
    // 서버의 커스텀 에이전트/팀 캐시 / cached custom agents and teams from the server
    customAgents: [],
    teams: [],
    agentColors: [],
    agentModels: [],
    agentExecutions: [],
    maxTeamMembers: 6
  };

  // 타일 크기 / tile size
  const TILE = window.CONFIG.TILE;

  // 리더에서 PageUp/PageDown 한 번에 스크롤할 줄 수 / lines scrolled per PageUp/PageDown in the reader
  const READER_PAGE_LINES = 6;

  let ctx = null;

  // === 화면 전환 효과(포켓몬식 블록 나선 와이프) ===
  // Scene transition (Pokemon-style spiral block wipe)
  const TRANSITION = {
    CELL: 20, // 블록 크기(px) / block size
    COVER_DUR: 0.42, // 덮는 시간(초) / cover duration
    REVEAL_DUR: 0.42 // 걷어내는 시간(초) / reveal duration
  };
  const TCOLS = Math.ceil(W / TRANSITION.CELL);
  const TROWS = Math.ceil(H / TRANSITION.CELL);

  // 바깥→안 시계방향 나선형 셀 순서(방문 시뮬레이션으로 각 셀 정확히 1회)
  // outer→inner clockwise spiral via visited simulation (each cell exactly once)
  function buildSpiral(cols, rows) {
    const order = [];
    const visited = new Array(cols * rows).fill(false);
    // 진행 방향: 우 → 하 → 좌 → 상 / move order: right, down, left, up
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let x = 0;
    let y = 0;
    let d = 0;
    for (let i = 0; i < cols * rows; i++) {
      const idx = y * cols + x;
      order.push(idx);
      visited[idx] = true;
      // 다음 칸이 막히면(경계/방문됨) 시계방향으로 회전 / turn clockwise when blocked
      let nx = x + dirs[d][0];
      let ny = y + dirs[d][1];
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || visited[ny * cols + nx]) {
        d = (d + 1) % 4;
        nx = x + dirs[d][0];
        ny = y + dirs[d][1];
      }
      x = nx;
      y = ny;
    }
    return order;
  }
  const SPIRAL = buildSpiral(TCOLS, TROWS);

  // 전환 상태 / transition state
  const transition = {
    active: false,
    phase: 'cover', // 'cover'(덮기) | 'reveal'(걷어내기)
    elapsed: 0,
    onMid: null // 완전히 검게 덮인 순간 실행할 씬 교체 / scene swap at full black
  };

  // 전환 시작 — onMid는 화면이 다 덮였을 때 실행 / start a transition
  function startTransition(onMid) {
    if (transition.active) {
      return;
    }
    transition.active = true;
    transition.phase = 'cover';
    transition.elapsed = 0;
    transition.onMid = onMid;
    window.Player.clearKeys(); // 전환 중 이동 정지 / freeze movement
  }

  // 전환 진행 / advance the transition
  function updateTransition(dt) {
    transition.elapsed += dt;
    if (transition.phase === 'cover') {
      if (transition.elapsed >= TRANSITION.COVER_DUR) {
        // 화면이 다 덮인 순간 씬 교체 / swap scene at full black
        if (typeof transition.onMid === 'function') {
          transition.onMid();
        }
        transition.onMid = null;
        transition.phase = 'reveal';
        transition.elapsed = 0;
      }
    } else if (transition.elapsed >= TRANSITION.REVEAL_DUR) {
      transition.active = false;
    }
  }

  // 셀 하나를 검게 / fill one cell black
  function fillCell(index) {
    const col = index % TCOLS;
    const row = Math.floor(index / TCOLS);
    ctx.fillRect(col * TRANSITION.CELL, row * TRANSITION.CELL, TRANSITION.CELL, TRANSITION.CELL);
  }

  // 전환 오버레이 그리기 / draw the transition overlay
  function drawTransition() {
    const total = SPIRAL.length;
    ctx.fillStyle = '#000000';
    if (transition.phase === 'cover') {
      // 바깥부터 안쪽으로 휘감으며 덮기 / cover spiraling inward
      const count = Math.min(total, Math.floor(total * (transition.elapsed / TRANSITION.COVER_DUR)));
      for (let i = 0; i < count; i++) {
        fillCell(SPIRAL[i]);
      }
    } else {
      // 안쪽부터 풀리며 드러내기 / reveal unwinding from the inside
      const cleared = Math.min(total, Math.floor(total * (transition.elapsed / TRANSITION.REVEAL_DUR)));
      const remain = total - cleared;
      for (let i = 0; i < remain; i++) {
        fillCell(SPIRAL[i]);
      }
    }
  }

  // === 캔버스 설정 / canvas setup ===
  let canvasEl = null;

  function setupCanvas() {
    canvasEl = document.getElementById('game');
    ctx = canvasEl.getContext('2d');
    resizeCanvas();
    // 창 크기 변경 시 다시 맞춤 / refit on window resize
    window.addEventListener('resize', resizeCanvas);
  }

  // 창을 가득 채우도록 캔버스를 맞춘다(논리 비율 유지 + 고해상도 선명도)
  // Fit the canvas to fill the window (keep logical aspect, stay high-DPI crisp)
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const availW = window.innerWidth || W * SCALE;
    const availH = window.innerHeight || H * SCALE;
    // 창에 들어갈 수 있는 최대 표시 배율(비율 유지) / largest display scale that fits (aspect kept)
    const displayScale = Math.max(1, Math.min(availW / W, availH / H));

    // 화면 표시 크기(CSS px) / on-screen size
    canvasEl.style.width = Math.round(W * displayScale) + 'px';
    canvasEl.style.height = Math.round(H * displayScale) + 'px';

    // 내부 버퍼(실제 픽셀) / backing store in device pixels
    const renderScale = displayScale * dpr;
    canvasEl.width = Math.round(W * renderScale);
    canvasEl.height = Math.round(H * renderScale);

    // 캔버스 리사이즈는 컨텍스트 상태를 초기화 → 다시 설정 / canvas resize resets context state
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  }

  // === WebSocket ===
  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(proto + '://' + location.host);
    game.ws = ws;

    ws.addEventListener('open', () => {
      game.wsReady = true;
      // 커스텀 에이전트/팀 목록 요청 / request the custom agent and team lists
      sendWs({ type: 'list_agents' });
      sendWs({ type: 'list_teams' });
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (err) {
        // 잘못된 서버 메시지는 무시 / ignore malformed server message
        return;
      }
      handleServerMessage(msg);
    });

    ws.addEventListener('close', () => {
      game.wsReady = false;
      // 작업 응답 대기 중 연결이 끊기면 done/error가 영영 안 와 "생각 중"이 고착된다.
      // 사용자에게 알리고 결과 상태로 전환해 Enter/ESC로 닫을 수 있게 한다.
      // If the socket drops while awaiting a reply, no done/error arrives and the
      // "thinking" box would hang forever — surface it and let the user close it.
      if (game.talking && window.UI.getMode() === window.UI.MODE.WORKING) {
        window.UI.appendChunk('\n\n⚠ 서버 연결이 끊겼어요. 다시 연결을 시도하는 중이에요…');
        window.UI.finishWorking();
      }
      // 재연결 시도 / try to reconnect
      setTimeout(connectWs, RECONNECT_MS);
    });

    ws.addEventListener('error', () => {
      // close 이벤트에서 재연결 처리 / reconnect handled on close
      game.wsReady = false;
    });
  }

  // 서버 → 클라이언트 메시지 처리 / handle server messages
  function handleServerMessage(msg) {
    // 대화가 닫힌 뒤 늦게 도착한 작업 메시지는 무시(닫힌 창이 다시 뜨는 버그 방지)
    // Ignore task messages that arrive after the dialogue was closed/cancelled (prevents a stuck reopened box)
    const isTaskMsg = (msg.type === 'chunk' || msg.type === 'done' || msg.type === 'error' || msg.type === 'agent_status');
    if (isTaskMsg && !game.talking) {
      return;
    }
    switch (msg.type) {
      case 'chunk':
        window.UI.appendChunk(msg.text || '');
        break;
      case 'agent_status':
        window.Interior.setAgentStatus(msg.agentId, msg.status);
        break;
      case 'done':
        window.UI.finishWorking();
        window.UI.setHint('Enter/ESC: 닫기 · Space: 계속');
        break;
      case 'error':
        window.UI.appendChunk('\n\n⚠ 오류: ' + (msg.message || '알 수 없는 오류'));
        window.UI.finishWorking();
        break;
      case 'cancelled':
        endDialogue();
        break;
      case 'agent_list':
        // 커스텀 에이전트 캐시 갱신 + 에디터/공방 반영 / refresh cache, editor and workshop
        game.customAgents = msg.agents || [];
        if (msg.colors) {
          game.agentColors = msg.colors;
        }
        if (msg.models) {
          game.agentModels = msg.models;
        }
        if (window.Editor.isOpen()) {
          window.Editor.refresh(game.customAgents, game.agentColors, game.agentModels);
        }
        window.Interior.refreshWorkshop(game.customAgents, game.teams);
        break;
      case 'team_list':
        // 팀 캐시 갱신 + 에디터/공방 반영 / refresh team cache, editor and workshop
        game.teams = msg.teams || [];
        if (msg.colors) {
          game.agentColors = msg.colors;
        }
        if (msg.models) {
          game.agentModels = msg.models;
        }
        if (msg.executions) {
          game.agentExecutions = msg.executions;
        }
        if (msg.maxMembers) {
          game.maxTeamMembers = msg.maxMembers;
        }
        if (window.Editor.isOpen()) {
          window.Editor.refreshTeams(game.teams, game.agentColors, game.agentModels, game.agentExecutions, game.maxTeamMembers);
        }
        window.Interior.refreshWorkshop(game.customAgents, game.teams);
        break;
      default:
        break;
    }
  }

  // WebSocket으로 JSON 전송(연결됐을 때만) / send JSON over WebSocket when connected
  function sendWs(payload) {
    if (game.wsReady && game.ws) {
      game.ws.send(JSON.stringify(payload));
    }
  }

  // 작업 전송 / send a task
  function sendTask(agentId, task) {
    // 대화 상대가 없으면 작업을 보내지 않음(currentNpc.name 역참조 방어)
    // bail out if there is no active dialogue partner (guards the currentNpc.name dereference below)
    if (!game.currentNpc) {
      return;
    }
    if (!game.wsReady || !game.ws) {
      window.UI.startWorking(game.currentNpc.name, game.currentNpc.color);
      window.UI.appendChunk('서버에 연결되어 있지 않습니다. 잠시 후 다시 시도해주세요.');
      window.UI.finishWorking();
      return;
    }
    window.UI.startWorking(game.currentNpc.name, game.currentNpc.color);
    game.ws.send(JSON.stringify({ type: 'start_task', agentId, task }));
  }

  // 작업 취소 전송 / send a cancel
  function sendCancel() {
    if (game.wsReady && game.ws) {
      game.ws.send(JSON.stringify({ type: 'cancel_task' }));
    }
  }

  // === 대화 흐름 / dialogue flow ===

  // 인사말 하나 선택(커스텀은 이름 기반 폴백) / pick a greeting (custom agents fall back to a name-based line)
  function pickGreeting(npc) {
    const meta = window.AGENT_META[npc.id];
    if (meta && meta.greetings) {
      return meta.greetings[Math.floor(Math.random() * meta.greetings.length)];
    }
    return npc.name + '이에요. 무엇을 도와드릴까요?';
  }

  // NPC와 대화 시작 / start a conversation with an NPC
  function startDialogue(npc) {
    game.talking = true;
    game.currentNpc = npc;
    window.Player.clearKeys();
    // 화자 초상화(스프라이트 미지정 시 휴머노이드) / speaker portrait (humanoid by default)
    window.UI.setPortrait({ agentId: npc.id, sprite: npc.sprite || 'agent', color: npc.color });
    window.UI.showMessage(npc.name, npc.color, pickGreeting(npc), 'greeting');
  }

  // 작업 입력 단계로 / move to task input
  function startTaskInput() {
    window.UI.setHandlers(
      (value) => sendTask(game.currentNpc.id, value), // 제출 / submit
      () => endDialogue() // 취소 / cancel
    );
    window.UI.beginInput(game.currentNpc.name, game.currentNpc.color);
  }

  // 대화 종료 / end the dialogue
  function endDialogue() {
    game.talking = false;
    game.currentNpc = null;
    window.Interior.clearActiveAgent();
    window.UI.close();
  }

  // 텍스트 진행(E/Space) / advance text on E/Space
  function advanceText() {
    if (window.UI.isTyping()) {
      window.UI.skipTyping();
      return;
    }
    const context = window.UI.getContext();
    if (context === 'greeting') {
      startTaskInput();
    } else if (context === 'result') {
      endDialogue();
    }
  }

  // === 입력 처리 / input handling ===

  // 상호작용 키(E) / interact key (E)
  function handleInteract() {
    // 대화/정보 표시 중이면 텍스트 진행(씬 무관) / advance text when a dialogue or info is open
    if (game.talking) {
      if (window.UI.getMode() === window.UI.MODE.TEXT) {
        advanceText();
      }
      return;
    }

    if (game.scene === SCENE.WORLD) {
      // 게시판/표지판 우선 / signs and bulletins first
      const front = window.Player.getFrontPx();
      const sign = window.World.signAt(front.x, front.y);
      if (sign) {
        openInfo(sign.title, sign.text);
        return;
      }
      // 에이전트 이벤트(정령 나무/유리병/눈사람/오라클) / agent-powered events
      const ev = window.World.eventAt(front.x, front.y);
      if (ev) {
        startEvent(ev);
        return;
      }
      const building = window.Buildings.getEnterable();
      if (building) {
        enterBuilding(building);
      }
      return;
    }

    // 실내, 대화 중 아님: 마스터=에디터, 일반 NPC=대화, 출구=퇴장 / master→editor, npc→talk, exit→leave
    const npc = window.Interior.getInteractableNpc();
    if (npc) {
      if (npc.id === '__master__') {
        openEditor();
      } else {
        startDialogue(npc);
      }
    } else if (window.Interior.isAtExit()) {
      exitBuilding();
    }
  }

  // 게시판/표지판 안내 표시(대화창 재사용) / show a sign/bulletin message (reuses the dialogue box)
  function openInfo(title, text) {
    game.talking = true;
    game.currentNpc = null;
    window.Player.clearKeys();
    window.UI.setPortrait(null); // 게시판/표지판은 초상화 없음 / no portrait for signs
    window.UI.showMessage(title, '#FFE082', text, 'result');
  }

  // 에이전트 이벤트 시작 / start an agent-powered map event
  function startEvent(ev) {
    if (ev.mode === 'input') {
      // 대화형: NPC처럼 인사 → 입력 → AI 응답 / conversational: greet → input → AI reply
      startDialogue({ id: ev.agentId, name: ev.name, color: ev.color, sprite: ev.sprite });
    } else {
      // 자동형: 고정 프롬프트로 즉시 생성 / auto: run a preset prompt immediately
      game.talking = true;
      game.currentNpc = { id: ev.agentId, name: ev.name, color: ev.color };
      window.Player.clearKeys();
      window.UI.setPortrait({ agentId: ev.agentId, sprite: ev.sprite, color: ev.color });
      sendTask(ev.agentId, ev.prompt);
    }
  }

  // 에이전트 공방 에디터 열기 / open the agent workshop editor
  function openEditor() {
    window.Player.clearKeys();
    window.Editor.open({
      agents: game.customAgents,
      teams: game.teams,
      colors: game.agentColors,
      models: game.agentModels,
      executions: game.agentExecutions,
      maxMembers: game.maxTeamMembers,
      onCreate: (fields) => sendWs({ type: 'create_agent', name: fields.name, role: fields.role, color: fields.color, model: fields.model }),
      onUpdate: (id, fields) => sendWs({ type: 'update_agent', id, name: fields.name, role: fields.role, color: fields.color, model: fields.model }),
      onDelete: (id) => sendWs({ type: 'delete_agent', id }),
      onTeamCreate: (t) => sendWs({ type: 'create_team', name: t.name, color: t.color, leadModel: t.leadModel, execution: t.execution, members: t.members }),
      onTeamUpdate: (id, t) => sendWs({ type: 'update_team', id, name: t.name, color: t.color, leadModel: t.leadModel, execution: t.execution, members: t.members }),
      onTeamDelete: (id) => sendWs({ type: 'delete_team', id }),
      onClose: () => {}
    });
  }

  // 뒤로/취소 키(ESC) / back/cancel key (ESC)
  function handleBack() {
    // 전체 답변 리더가 열려 있으면 리더만 닫는다(대화는 유지) / close only the reader if open, keep the dialogue
    if (window.UI.isReaderOpen()) {
      window.UI.closeReader();
      return;
    }
    // 대화/정보 중이면 닫기(씬 무관) / close any open dialogue or info first
    if (game.talking) {
      if (window.UI.getMode() === window.UI.MODE.WORKING) {
        sendCancel();
      }
      endDialogue();
      return;
    }
    if (game.scene === SCENE.WORLD) {
      return;
    }
    // 대화 중이 아니면 건물 나가기 / leave the building
    exitBuilding();
  }

  // 건물 진입(전환 효과와 함께) / enter a building with a transition
  function enterBuilding(building) {
    if (transition.active) {
      return;
    }
    startTransition(() => {
      game.scene = SCENE.INTERIOR;
      window.Interior.enter(building, game.customAgents, game.teams);
    });
    // 공방이면 최신 커스텀/팀 목록을 다시 요청 / refresh custom & team lists when entering the workshop
    if (building.interiorKind === 'workshop') {
      sendWs({ type: 'list_agents' });
      sendWs({ type: 'list_teams' });
    }
  }

  // 건물 퇴장(전환 효과와 함께) / leave a building with a transition
  function exitBuilding() {
    if (transition.active) {
      return;
    }
    // 전환 직전의 현재 건물을 캡처 / capture the current building before swapping
    const building = window.Interior.getBuilding();
    startTransition(() => {
      window.Interior.leave();
      game.scene = SCENE.WORLD;
      // 문 남쪽 한 칸으로 내보내 자동 재입장 방지 / step out one tile south of the door
      if (building && building.door) {
        window.Player.state.x = building.door.tx * TILE;
        window.Player.state.y = (building.door.ty + 1) * TILE;
        window.Player.state.direction = 'down';
        game.lastExited = building;
      }
    });
  }

  // 게이트 타일에 올라서면 다른 구역으로 이동(나선 전환) / travel to another zone on a gate tile
  function checkAutoGate() {
    const p = window.Player.state;
    const gate = window.World.gateAtPx(p.x + TILE / 2, p.y + TILE / 2);
    if (!gate || transition.active) {
      return;
    }
    startTransition(() => {
      window.World.loadZone(gate.toZone);
      window.Player.state.x = gate.arrival.x;
      window.Player.state.y = gate.arrival.y;
      window.Player.state.direction = 'up';
      game.lastExited = null; // 구역이 바뀌면 건물 잠금 해제 / clear building lock on zone change
      showBanner(ZONE_NAMES[gate.toZone] || gate.toZone); // 구역 배너 / zone banner
    });
  }

  // 구역 진입 배너 표시 / show the zone-entry banner
  function showBanner(text) {
    game.banner.text = text || '';
    game.banner.timeLeft = BANNER_DURATION;
  }

  // 문 타일에 올라서면 상호작용 없이 자동 입장 / auto-enter when standing on a door tile
  function checkAutoEnter() {
    const p = window.Player.state;
    const building = window.World.doorAtPx(p.x + TILE / 2, p.y + TILE / 2);

    // 퇴장한 문에서 벗어나면 잠금 해제 / unlock once we move off the exited door
    if (game.lastExited && building !== game.lastExited) {
      game.lastExited = null;
    }
    if (building && building !== game.lastExited) {
      enterBuilding(building);
    }
  }

  // 키다운 / keydown
  function onKeyDown(e) {
    // 타이틀 화면: Enter/Space로 시작 / title screen: start on Enter/Space
    if (game.scene === SCENE.TITLE) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
        e.preventDefault();
        startGame();
      }
      return;
    }
    // 전환 중에는 모든 입력 잠금(스크롤만 방지) / lock input during transition
    if (transition.active) {
      if (e.code.startsWith('Arrow') || e.code === 'Space') {
        e.preventDefault();
      }
      return;
    }

    // 에디터가 열려 있으면 에디터가 키를 처리(폼 모드는 숨김 input이 직접 처리)
    // when the editor is open it consumes keys (form mode is handled by its own hidden input)
    if (window.Editor.isOpen()) {
      window.Editor.handleGlobalKey(e);
      return;
    }

    // 전체 답변 리더가 열려 있으면 리더가 키를 처리 / the reader consumes keys while open
    if (window.UI.isReaderOpen()) {
      handleReaderKey(e);
      return;
    }

    // 입력 모드는 숨김 input이 처리(전파 중단됨) / input mode handled by hidden input
    // 이동 키 / movement keys
    if (MOVE_KEYS[e.code]) {
      if (e.code.startsWith('Arrow')) {
        e.preventDefault();
      }
      // 대화 중에는 이동 금지 / no movement while talking
      if (!game.talking) {
        window.Player.setMoveKey(MOVE_KEYS[e.code], true);
      }
      return;
    }

    switch (e.code) {
      case 'Enter':
      case 'NumpadEnter':
        e.preventDefault();
        handleInteract();
        break;
      case 'Space':
        e.preventDefault();
        // 대화 텍스트 진행 / advance dialogue text
        if (game.talking && window.UI.getMode() === window.UI.MODE.TEXT) {
          advanceText();
        }
        break;
      case 'Escape':
        e.preventDefault();
        handleBack();
        break;
      case 'KeyT':
        // 타이핑 속도 순환 / cycle typing speed
        window.UI.cycleSpeed();
        break;
      case 'KeyF':
        // 완료된 답변을 전체 보기로 펼치기 / expand the finished answer into the reader
        if (game.talking &&
            window.UI.getMode() === window.UI.MODE.TEXT &&
            window.UI.getContext() === 'result') {
          window.UI.openReader();
        }
        break;
      default:
        break;
    }
  }

  // 전체 답변 리더 키 처리(스크롤/닫기) / reader key handling (scroll/close)
  function handleReaderKey(e) {
    switch (e.code) {
      case 'ArrowUp':
        e.preventDefault();
        window.UI.scrollReader(-1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        window.UI.scrollReader(1);
        break;
      case 'PageUp':
        e.preventDefault();
        window.UI.scrollReader(-READER_PAGE_LINES);
        break;
      case 'PageDown':
      case 'Space':
        e.preventDefault();
        window.UI.scrollReader(READER_PAGE_LINES);
        break;
      case 'Escape':
      case 'KeyF':
        e.preventDefault();
        window.UI.closeReader();
        break;
      default:
        break;
    }
  }

  // 키업 / keyup
  function onKeyUp(e) {
    if (MOVE_KEYS[e.code]) {
      window.Player.setMoveKey(MOVE_KEYS[e.code], false);
    }
  }

  // === HUD 힌트 갱신 / update HUD hint ===
  function updateHint() {
    if (game.talking) {
      const mode = window.UI.getMode();
      if (mode === window.UI.MODE.WORKING) {
        window.UI.setHint('ESC: 작업 취소');
      } else if (mode === window.UI.MODE.INPUT) {
        window.UI.setHint('Enter: 의뢰 · ESC: 취소');
      } else if (window.UI.getContext() === 'result') {
        // 완료된 답변: 전체 보기 안내 포함 / finished answer: include the expand hint
        window.UI.setHint('F: 전체보기 · Enter/Space: 계속 · ESC: 닫기');
      } else {
        window.UI.setHint('Enter/Space: 계속 · ESC: 닫기');
      }
      return;
    }

    if (game.scene === SCENE.WORLD) {
      const building = window.Buildings.getEnterable();
      window.UI.setHint(building ? (building.name + ' — 문으로 들어가기') : 'WASD/방향키: 이동');
    } else {
      const npc = window.Interior.getInteractableNpc();
      if (npc) {
        window.UI.setHint('Enter: ' + npc.name + '와 대화');
      } else {
        window.UI.setHint('WASD: 이동 · 아래 출구로 가면 나가기 · ESC: 나가기');
      }
    }
  }

  // === 업데이트 & 렌더 / update & render ===

  function update(dt) {
    game.frame++;
    // 타이틀 화면에서는 씬 업데이트 없음 / no scene update on the title screen
    if (game.scene === SCENE.TITLE) {
      return;
    }
    // 배너 타이머 / banner timer
    if (game.banner.timeLeft > 0) {
      game.banner.timeLeft -= dt;
    }
    // 전환 중에는 씬을 멈추고 전환만 진행 / freeze scene while transitioning
    if (transition.active) {
      updateTransition(dt);
      return;
    }

    if (game.scene === SCENE.WORLD) {
      window.Player.update(dt);
      // 배회 NPC 이동(대화 중인 NPC는 정지, 플레이어 칸은 회피) / wandering NPCs (talked-to NPC stays still, avoid the player's tile)
      const pp = window.Player.state;
      const playerTile = { tx: Math.floor((pp.x + TILE / 2) / TILE), ty: Math.floor((pp.y + TILE / 2) / TILE) };
      window.World.updateNpcs(dt, (game.talking && game.currentNpc) ? game.currentNpc.id : null, playerTile);
      // 문에 올라서면 자동 입장, 게이트에 올라서면 구역 이동 / auto-enter doors, travel gates
      checkAutoEnter();
      checkAutoGate();
    } else {
      // 실내: 대화 중이 아닐 때만 이동(키가 비어있어 정지 상태 유지) / interior movement
      window.Interior.update(dt);
      // 대화/에디터 중이 아니고 출구 매트에 닿으면 자동 퇴장 / auto-exit on the exit mat
      if (!game.talking && !window.Editor.isOpen() && window.Interior.isAtExit()) {
        exitBuilding();
      }
    }
    // 안전장치: 대화 상태인데 대화창이 닫혀 있으면 자동 복구(플레이어 영구 멈춤 방지)
    // Self-heal: if flagged as talking but no dialogue is open, clear it (prevents a permanent freeze)
    if (game.talking && !window.UI.isOpen() && !window.Editor.isOpen()) {
      game.talking = false;
      game.currentNpc = null;
    }
    window.Editor.update(dt);
    window.UI.update(dt);
    updateHint();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);

    if (game.scene === SCENE.TITLE) {
      drawTitleScreen();
      return;
    }

    if (game.scene === SCENE.WORLD) {
      renderWorld();
    } else {
      window.Interior.draw(ctx);
      drawInteriorPrompt();
    }

    // 구역 진입 배너 / zone-entry banner
    drawBanner();

    window.UI.draw(ctx);

    // 에디터 패널(있으면) / editor panel if open
    if (window.Editor.isOpen()) {
      window.Editor.draw(ctx);
    }

    // 전체 답변 리더(있으면, 대화창 위) / expanded answer reader on top of the dialogue
    if (window.UI.isReaderOpen()) {
      window.UI.drawReader(ctx);
    }

    // 전환 오버레이는 가장 위 / transition overlay sits on top of everything
    if (transition.active) {
      drawTransition();
    }
  }

  // 마을 렌더링(y정렬) / render the village with y-sorting
  function renderWorld() {
    const camera = window.Player.getCamera();
    window.World.drawGround(ctx, camera);
    window.World.drawFlatObjects(ctx, camera);

    const drawables = window.World.getYSortables(camera);
    drawables.push({
      baseY: window.Player.getBaseY(),
      draw: () => window.Player.draw(ctx, camera)
    });
    drawables.sort((a, b) => a.baseY - b.baseY);
    for (const d of drawables) {
      d.draw(ctx);
    }

    // 동굴은 플레이어 주변만 밝은 어둠 비네트(폐쇄·어두움 연출) / cave: torch-like darkness around the player
    if (window.World.getActiveZone() === 'cave') {
      drawCaveAmbiance(camera);
    }

    // 건물 이름표(가장 위에) / building name labels on top
    window.World.drawBuildingLabels(ctx, camera);

    // 상호작용 프롬프트 / interaction prompt
    drawWorldPrompt(camera);

    // 우하단 미니맵 / minimap at bottom-right
    drawMinimap();
  }

  // === 동굴 분위기(횃불형 어둠 비네트) / cave ambiance (torch-like darkness vignette) ===
  function drawCaveAmbiance(camera) {
    const p = window.Player.state;
    const cx = p.x - camera.x + TILE / 2;
    const cy = p.y - camera.y + TILE / 2;
    // 플레이어 주변은 밝고 가장자리로 갈수록 어둡게 / bright around the player, dark toward the edges
    const grad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 230);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(2,4,8,0.8)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // === 미니맵 / minimap ===
  const MINIMAP = { w: 96, h: 72, pad: 6 };

  // 마을 전체를 축소해 우하단에 표시 / draw a scaled-down village map at bottom-right
  function drawMinimap() {
    const mw = MINIMAP.w;
    const mh = MINIMAP.h;
    const mx = W - mw - MINIMAP.pad;
    const my = H - mh - MINIMAP.pad;

    // 배경/테두리 / background & border
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);

    // 월드→미니맵 축척 / world-to-minimap scale
    const worldW = window.World.WORLD_W * TILE;
    const worldH = window.World.WORLD_H * TILE;
    const scaleX = mw / worldW;
    const scaleY = mh / worldH;

    // 보행 가능 영역(지형) — 좁은 동굴 미로 등에서 길찾기에 도움 / walkable terrain layer (helps navigate the cave maze)
    const WALL = window.World.WALL;
    const cellW = Math.max(1, TILE * scaleX);
    const cellH = Math.max(1, TILE * scaleY);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let ty = 0; ty < window.World.WORLD_H; ty++) {
      for (let tx = 0; tx < window.World.WORLD_W; tx++) {
        if (window.World.collisionAt(tx, ty) !== WALL) {
          ctx.fillRect(mx + tx * TILE * scaleX, my + ty * TILE * scaleY, cellW, cellH);
        }
      }
    }

    // 건물(에이전트 색) / buildings colored by their agent
    for (const b of window.World.buildings) {
      const meta = window.AGENT_META[b.agentIds[0]];
      ctx.fillStyle = (meta && meta.color) || '#CCCCCC';
      ctx.fillRect(
        mx + b.tx * TILE * scaleX,
        my + b.ty * TILE * scaleY,
        Math.max(2, b.w * TILE * scaleX),
        Math.max(2, b.h * TILE * scaleY)
      );
    }

    // 구역 이동 게이트(보라색 점) / zone-travel gates (purple dots)
    ctx.fillStyle = '#B39DDB';
    for (const g of window.World.gates) {
      ctx.fillRect(mx + g.tx * TILE * scaleX - 1, my + g.ty * TILE * scaleY - 1, 2, 2);
    }

    // NPC/이벤트 점 — NPC는 흰색, ✦이벤트는 노란색 / NPC & event dots (npc=white, event=amber)
    for (const o of window.World.objects) {
      if (o.type !== 'event') {
        continue;
      }
      const ox = (o.px != null ? o.px : o.tx * TILE);
      const oy = (o.py != null ? o.py : o.ty * TILE);
      ctx.fillStyle = (o.kind === 'npc') ? '#FFFFFF' : '#FFD54F';
      ctx.fillRect(mx + ox * scaleX - 1, my + oy * scaleY - 1, 2, 2);
    }

    // 현재 카메라 시야 영역 / current camera viewport
    const cam = window.Player.getCamera();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(
      mx + cam.x * scaleX,
      my + cam.y * scaleY,
      window.CONFIG.LOGICAL_W * scaleX,
      window.CONFIG.LOGICAL_H * scaleY
    );

    // 플레이어 위치 점 / player position dot
    const p = window.Player.state;
    ctx.fillStyle = '#FFEB3B';
    ctx.fillRect(mx + (p.x + 8) * scaleX - 1, my + (p.y + 8) * scaleY - 1, 3, 3);

    // 현재 구역 이름(미니맵 위, 상시) — 배너는 사라지므로 위치 파악 보강
    // current zone name above the minimap (persistent) — the banner fades, this stays
    const zoneName = ZONE_NAMES[window.World.getActiveZone()] || '';
    if (zoneName) {
      ctx.font = 'bold 8px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const tw = ctx.measureText(zoneName).width;
      ctx.fillRect(mx + mw - tw - 4, my - 12, tw + 4, 11);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(zoneName, mx + mw - 2, my - 4);
      ctx.textAlign = 'left';
    }
  }

  // === 상호작용 프롬프트 / interaction prompt ===

  // 대상 위에 "Enter" 말풍선(살짝 위아래로) / a bobbing "Enter" pill above the target
  function drawPromptAt(cx, topY) {
    const bob = REDUCED_MOTION ? 0 : Math.round(Math.sin(game.frame * 0.15) * 2);
    const y = topY - 14 + bob;
    ctx.font = 'bold 8px "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    const label = 'Enter';
    const w = ctx.measureText(label).width + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(Math.round(cx - w / 2), Math.round(y - 9), Math.round(w), 12);
    ctx.fillStyle = '#FFE082';
    ctx.fillText(label, Math.round(cx), Math.round(y));
    ctx.textAlign = 'left';
  }

  // 마을: 정면의 상호작용 대상 위에 프롬프트 / world: prompt above the faced interactable
  function drawWorldPrompt(camera) {
    if (game.talking || transition.active) {
      return;
    }
    const front = window.Player.getFrontPx();
    let tx = null;
    let ty = null;
    if (window.World.signAt(front.x, front.y)) {
      tx = Math.floor(front.x / TILE);
      ty = Math.floor(front.y / TILE);
    } else {
      const ev = window.World.eventAt(front.x, front.y);
      const building = window.Buildings.getEnterable();
      // 게이트는 밟으면 자동 이동(Enter 무동작)이라 프롬프트를 띄우지 않음 — 발광 펄스로 안내
      // gates auto-transition on step (Enter does nothing), so no prompt here — the glow pulse signals them
      if (ev) {
        tx = ev.tx; ty = ev.ty;
      } else if (building) {
        tx = building.door.tx; ty = building.door.ty;
      }
    }
    if (tx === null) {
      return;
    }
    drawPromptAt((tx + 0.5) * TILE - camera.x, ty * TILE - camera.y);
  }

  // 실내: 정면 NPC 위에 프롬프트 / interior: prompt above the faced NPC
  function drawInteriorPrompt() {
    if (game.talking || window.Editor.isOpen() || transition.active) {
      return;
    }
    const npc = window.Interior.getInteractableNpc();
    if (npc) {
      drawPromptAt(npc.x + 8, npc.y);
    }
  }

  // === 타이틀 화면 / title screen ===

  // HTML 오버레이(제목/도움말) 표시 토글 — 타이틀 씬에선 캔버스가 직접 그리므로 숨김
  // toggle the HTML title/help overlays; hidden on the title scene (canvas draws its own)
  function setOverlaysVisible(visible) {
    const display = visible ? '' : 'none';
    const titleEl = document.getElementById('title');
    const helpEl = document.getElementById('help');
    if (titleEl) {
      titleEl.style.display = display;
    }
    if (helpEl) {
      helpEl.style.display = display;
    }
  }

  function startGame() {
    game.scene = SCENE.WORLD;
    setOverlaysVisible(true); // 게임 시작 → 오버레이 표시 / show overlays once playing
    showBanner(ZONE_NAMES.village); // 시작 시 마을 배너 / village banner on start
  }

  const TITLE_FONT = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

  function drawTitleScreen() {
    // 잔디 배경 + 어둡게 / grass backdrop + dim
    for (let y = 0; y < H; y += 16) {
      for (let x = 0; x < W; x += 16) {
        window.Sprites.drawTile(ctx, 'grass', x, y);
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, W, H);

    // 장식 캐릭터(걷기 애니메이션) / a walking deco character
    window.Sprites.drawShadow(ctx, W / 2 - 8, 150);
    window.Sprites.drawPlayer(ctx, W / 2 - 8, 150, 'down', Math.floor(game.frame / 12) % 4);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFD54F';
    ctx.font = 'bold 26px ' + TITLE_FONT;
    ctx.fillText('AGENT VILLAGE', W / 2, 72);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px ' + TITLE_FONT;
    ctx.fillText('AI 에이전트 마을', W / 2, 94);

    ctx.fillStyle = '#E0E0E0';
    ctx.font = '9px ' + TITLE_FONT;
    ctx.fillText('WASD/방향키: 이동  ·  Enter: 상호작용  ·  ESC: 뒤로  ·  T: 타이핑 속도', W / 2, 206);
    ctx.fillText('문·게이트·NPC·✦이벤트에 다가가 Enter 로 상호작용', W / 2, 220);

    // 시작 프롬프트(깜빡, reduced-motion이면 항상 표시) / blinking start prompt (steady when reduced-motion)
    if (REDUCED_MOTION || Math.floor(game.frame / 30) % 2 === 0) {
      ctx.fillStyle = '#FFEB3B';
      ctx.font = 'bold 13px ' + TITLE_FONT;
      ctx.fillText('▶  Enter 로 시작  ◀', W / 2, 256);
    }

    // 서버 연결 상태 / server connection status
    ctx.font = '8px ' + TITLE_FONT;
    ctx.fillStyle = game.wsReady ? '#81C784' : '#FFB74D';
    ctx.fillText(game.wsReady ? '● 서버 연결됨' : '○ 서버 연결 중…', W / 2, 286);

    ctx.textAlign = 'left';
  }

  // === 구역 진입 배너 / zone-entry banner ===
  function drawBanner() {
    if (game.banner.timeLeft <= 0) {
      return;
    }
    const t = game.banner.timeLeft;
    // 페이드 인/아웃 / fade in & out
    let alpha = 1;
    if (t > BANNER_DURATION - 0.4) {
      alpha = (BANNER_DURATION - t) / 0.4;
    } else if (t < 0.5) {
      alpha = t / 0.5;
    }
    alpha = Math.max(0, Math.min(1, alpha));

    const text = game.banner.text;
    ctx.font = 'bold 14px ' + TITLE_FONT;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width;
    const bw = tw + 28;
    const bh = 26;
    const bx = W / 2 - bw / 2;
    const by = 30;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(20,20,28,0.85)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#FFD54F';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, W / 2, by + 17);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // === 메인 루프 / main loop ===
  function loop(timestamp) {
    // dt를 0 이상으로 클램프 — 시계 역행/탭 복귀 등으로 음수가 되면 타이머가 거꾸로 가는 것을 방지
    // clamp dt to >= 0 — guards against negative dt (clock skew / tab resume) running timers backwards
    const dt = Math.max(0, Math.min(MAX_DT, (timestamp - game.lastTime) / 1000 || 0));
    game.lastTime = timestamp;
    // 한 프레임에서 예외가 나도 루프가 죽지 않도록(화면 멈춤 방지)
    // keep the loop alive even if a single frame throws (prevents a frozen screen)
    try {
      update(dt);
      render();
    } catch (err) {
      console.error('프레임 오류 / frame error:', err);
    }
    requestAnimationFrame(loop);
  }

  // === 시작 / start ===
  function start() {
    setupCanvas();
    setOverlaysVisible(false); // 타이틀 화면 동안 HTML 오버레이 숨김 / hide overlays during the title screen
    window.Player.reset();
    connectWs();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    // 포커스 이탈 시 이동 키 정지 / stop movement on blur
    window.addEventListener('blur', () => window.Player.clearKeys());
    game.lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  window.addEventListener('DOMContentLoaded', start);
})();
