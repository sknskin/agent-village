'use strict';

// 에이전트 공방 에디터 — 커스텀 에이전트와 팀을 직접 구성(Canvas)
// Agent Workshop editor — build custom agents and teams (rendered on Canvas)
//
// 탭 2개: [에이전트] 단일 에이전트 CRUD(모델 선택 포함)
//         [팀] 멤버 수·역할·모델·리드·실행방식을 직접 구성하는 팀 빌더
// Two tabs: [Agents] single-agent CRUD (with model choice)
//           [Teams] team builder for member count, roles, models, lead, execution

(function () {
  const W = window.CONFIG.LOGICAL_W;
  const H = window.CONFIG.LOGICAL_H;

  // === 상수 / Constants ===
  const FONT_FAMILY = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  const PANEL = { x: 14, y: 12, w: W - 28, h: H - 24 };
  const PAD = 12;
  const LINE_H = 14;
  const MAX_NAME = 20; // 이름 최대 길이 / max name length
  const MAX_ROLE = 200; // 에이전트 역할 최대 길이 / max agent role length
  const MAX_MEMBER_ROLE = 120; // 팀 멤버 역할 최대 길이 / max team member role length

  // 기본 옵션(서버 응답 전 폴백) / default options before the server responds
  const DEFAULT_MODELS = ['opus', 'sonnet', 'haiku'];
  const DEFAULT_EXECUTIONS = ['sequential', 'parallel'];
  const DEFAULT_MAX_MEMBERS = 6;

  // 표시용 라벨 / display labels
  const MODEL_LABELS = { opus: 'Opus(고성능)', sonnet: 'Sonnet(균형)', haiku: 'Haiku(빠름)' };
  const EXEC_LABELS = { sequential: '순차(분해·위임)', parallel: '병렬(동시·종합)' };

  // === 상태 / state ===
  const ed = {
    open: false,
    tab: 'agents', // 'agents' | 'teams'
    mode: 'list', // 'list' | 'form'
    formType: 'agent', // 'agent' | 'team'
    agents: [],
    teams: [],
    colors: ['#9CCC65'],
    models: DEFAULT_MODELS.slice(),
    executions: DEFAULT_EXECUTIONS.slice(),
    maxMembers: DEFAULT_MAX_MEMBERS,
    selected: 0,
    error: '',
    blink: 0,
    form: null,
    handlers: {}
  };

  // === 옵션 접근 헬퍼 / option accessors ===
  function activeModels() {
    return ed.models.length ? ed.models : DEFAULT_MODELS;
  }
  function activeExecs() {
    return ed.executions.length ? ed.executions : DEFAULT_EXECUTIONS;
  }
  function modelLabel(model) {
    return MODEL_LABELS[model] || model;
  }
  function execLabel(mode) {
    return EXEC_LABELS[mode] || mode;
  }
  // 기본 모델 인덱스(sonnet 우선) / default model index (prefer sonnet)
  function defaultModelIdx() {
    const i = activeModels().indexOf('sonnet');
    return i >= 0 ? i : 0;
  }
  function modelIndexOf(model) {
    const i = activeModels().indexOf(model);
    return i >= 0 ? i : defaultModelIdx();
  }
  function colorIndexOf(color) {
    const i = ed.colors.indexOf(color);
    return i >= 0 ? i : 0;
  }
  function execIndexOf(mode) {
    const i = activeExecs().indexOf(mode);
    return i >= 0 ? i : 0;
  }
  function defaultMember() {
    return { role: '', modelIdx: defaultModelIdx() };
  }
  // 현재 탭의 목록 / list for the active tab
  function currentList() {
    return ed.tab === 'agents' ? ed.agents : ed.teams;
  }

  // === 숨김 입력(한글 IME) / hidden input for Korean IME ===
  let inputEl = null;

  function ensureInput() {
    if (inputEl) {
      return;
    }
    inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.setAttribute('autocomplete', 'off');
    inputEl.style.position = 'absolute';
    inputEl.style.left = '0';
    inputEl.style.top = '0';
    inputEl.style.width = '1px';
    inputEl.style.height = '1px';
    inputEl.style.opacity = '0';
    inputEl.style.pointerEvents = 'none';
    document.body.appendChild(inputEl);

    // 텍스트 입력 → 현재 텍스트 항목 값 갱신 / typing updates the active text field
    inputEl.addEventListener('input', () => {
      if (ed.mode !== 'form') {
        return;
      }
      const f = getFields()[ed.form.field];
      if (f && f.kind === 'text') {
        f.set(inputEl.value);
      }
    });

    // 폼 내비게이션/저장/취소 / form navigation, save, cancel
    inputEl.addEventListener('keydown', (e) => {
      if (ed.mode !== 'form') {
        return;
      }
      // 한글 IME 조합 중에는 keydown이 (229 팬텀 + 실제)로 두 번 발생할 수 있어
      // 내비게이션이 2칸씩 이동하는 버그가 생긴다. 조합 중 이벤트는 무시한다.
      // During Korean IME composition keydown can fire twice (229 phantom + real),
      // which moves the selection two fields at once. Ignore composing events.
      if (e.isComposing || e.keyCode === 229) {
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        submitForm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        toList();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveField(-1);
      } else if (e.key === 'ArrowDown' || e.key === 'Tab') {
        e.preventDefault();
        moveField(1);
      } else if (e.key === 'ArrowLeft') {
        adjustField(e, -1);
      } else if (e.key === 'ArrowRight') {
        adjustField(e, 1);
      } else if (e.key === ' ') {
        // 토글 필드에서만 멤버 선택/해제(텍스트 필드는 공백 입력 허용)
        // toggle membership only on toggle fields (text fields keep the space)
        const f = currentField();
        if (f && f.kind === 'toggle') {
          e.preventDefault();
          toggleMember(f.agentId);
        }
      }
      // 폼 키가 게임으로 새지 않도록 / keep form keys from leaking to the game
      e.stopPropagation();
    });
  }

  function focusInput() {
    ensureInput();
    setTimeout(() => inputEl.focus(), 0);
  }

  function blurInput() {
    if (inputEl) {
      inputEl.blur();
    }
  }

  // === 열기/닫기 / open & close ===
  function open(opts) {
    ensureInput();
    ed.open = true;
    ed.tab = 'agents';
    ed.mode = 'list';
    ed.agents = opts.agents || [];
    ed.teams = opts.teams || [];
    ed.colors = (opts.colors && opts.colors.length) ? opts.colors : ['#9CCC65'];
    ed.models = (opts.models && opts.models.length) ? opts.models : DEFAULT_MODELS.slice();
    ed.executions = (opts.executions && opts.executions.length) ? opts.executions : DEFAULT_EXECUTIONS.slice();
    ed.maxMembers = opts.maxMembers || DEFAULT_MAX_MEMBERS;
    ed.selected = 0;
    ed.error = '';
    ed.handlers = {
      onCreate: opts.onCreate || (() => {}),
      onUpdate: opts.onUpdate || (() => {}),
      onDelete: opts.onDelete || (() => {}),
      onTeamCreate: opts.onTeamCreate || (() => {}),
      onTeamUpdate: opts.onTeamUpdate || (() => {}),
      onTeamDelete: opts.onTeamDelete || (() => {}),
      onClose: opts.onClose || (() => {})
    };
    blurInput();
  }

  function close() {
    ed.open = false;
    blurInput();
    if (typeof ed.handlers.onClose === 'function') {
      ed.handlers.onClose();
    }
  }

  function isOpen() {
    return ed.open;
  }

  // 선택 인덱스를 목록 범위로 클램프 / clamp selection into list range
  function clampSelected() {
    const len = currentList().length;
    if (ed.selected >= len) {
      ed.selected = Math.max(0, len - 1);
    }
  }

  // 에이전트 목록/옵션 갱신 / apply a refreshed agent list and options
  function refresh(agents, colors, models) {
    ed.agents = agents || [];
    if (colors && colors.length) {
      ed.colors = colors;
    }
    if (models && models.length) {
      ed.models = models;
    }
    clampSelected();
  }

  // 팀 목록/옵션 갱신 / apply a refreshed team list and options
  function refreshTeams(teams, colors, models, executions, maxMembers) {
    ed.teams = teams || [];
    if (colors && colors.length) {
      ed.colors = colors;
    }
    if (models && models.length) {
      ed.models = models;
    }
    if (executions && executions.length) {
      ed.executions = executions;
    }
    if (maxMembers) {
      ed.maxMembers = maxMembers;
    }
    clampSelected();
  }

  // === 탭 전환 / tab switching ===
  function switchTab() {
    ed.tab = ed.tab === 'agents' ? 'teams' : 'agents';
    ed.selected = 0;
    ed.error = '';
  }

  // === 폼 필드 정의 / form field descriptors ===
  // 각 필드: { kind:'text'|'cycle', ... } — 키 입력/렌더가 공유하는 단일 정의
  // each field is a single descriptor shared by key handling and rendering
  function getFields() {
    if (ed.formType === 'agent') {
      return [
        { kind: 'text', label: '이름', get: () => ed.form.name, set: (v) => { ed.form.name = v.slice(0, MAX_NAME); } },
        { kind: 'text', label: '역할', get: () => ed.form.role, set: (v) => { ed.form.role = v.slice(0, MAX_ROLE); } },
        { kind: 'cycle', label: '모델', kindOf: 'model', getIdx: () => ed.form.modelIdx, setIdx: (i) => { ed.form.modelIdx = i; }, count: () => activeModels().length },
        { kind: 'cycle', label: '색', kindOf: 'color', getIdx: () => ed.form.colorIdx, setIdx: (i) => { ed.form.colorIdx = i; }, count: () => ed.colors.length }
      ];
    }
    // 팀 폼 / team form
    // 기본 설정 4개 + 커스텀 에이전트별 멤버 토글 / 4 base fields + one toggle per custom agent
    const fields = [
      { kind: 'text', label: '팀 이름', get: () => ed.form.name, set: (v) => { ed.form.name = v.slice(0, MAX_NAME); } },
      { kind: 'cycle', label: '색', kindOf: 'color', getIdx: () => ed.form.colorIdx, setIdx: (i) => { ed.form.colorIdx = i; }, count: () => ed.colors.length },
      { kind: 'cycle', label: '리드 모델', kindOf: 'model', getIdx: () => ed.form.leadModelIdx, setIdx: (i) => { ed.form.leadModelIdx = i; }, count: () => activeModels().length },
      { kind: 'cycle', label: '실행 방식', kindOf: 'exec', getIdx: () => ed.form.execIdx, setIdx: (i) => { ed.form.execIdx = i; }, count: () => activeExecs().length }
    ];
    for (let i = 0; i < ed.agents.length; i++) {
      const a = ed.agents[i];
      fields.push({ kind: 'toggle', label: a.name, agentId: a.id });
    }
    return fields;
  }

  // 첫 토글(멤버) 필드 인덱스 / index of the first member-toggle field
  const TEAM_TOGGLE_START = 4;

  // 현재 활성 필드 / the currently active field descriptor
  function currentField() {
    return getFields()[ed.form.field];
  }

  // 멤버 토글: 선택/해제(최대 인원 제한) / toggle a member on/off (capped at max)
  function toggleMember(agentId) {
    const ids = ed.form.memberIds;
    const i = ids.indexOf(agentId);
    if (i >= 0) {
      ids.splice(i, 1);
      ed.error = '';
    } else if (ids.length < ed.maxMembers) {
      ids.push(agentId);
      ed.error = '';
    } else {
      ed.error = '팀원은 최대 ' + ed.maxMembers + '명까지예요';
    }
  }

  // === 폼 전환 / form transitions ===
  function toList() {
    ed.mode = 'list';
    ed.error = '';
    blurInput();
  }

  // 추가/편집 폼 열기 / open the add/edit form
  function openForm(item) {
    ed.mode = 'form';
    ed.error = '';
    ed.formType = (ed.tab === 'agents') ? 'agent' : 'team';

    if (ed.formType === 'agent') {
      if (item) {
        ed.form = {
          id: item.id, name: item.name, role: item.role || '',
          modelIdx: modelIndexOf(item.model), colorIdx: colorIndexOf(item.color), field: 0
        };
      } else {
        ed.form = { id: null, name: '', role: '', modelIdx: defaultModelIdx(), colorIdx: 0, field: 0 };
      }
    } else if (item) {
      // 편집: 현재 존재하는 커스텀 에이전트 멤버만 유지 / edit: keep only members that still exist
      const valid = new Set(ed.agents.map((a) => a.id));
      const memberIds = (item.members || []).map((m) => m.agentId).filter((id) => valid.has(id));
      ed.form = {
        id: item.id, name: item.name, colorIdx: colorIndexOf(item.color),
        leadModelIdx: modelIndexOf(item.leadModel), execIdx: execIndexOf(item.execution),
        memberIds, field: 0
      };
    } else {
      ed.form = {
        id: null, name: '', colorIdx: 0,
        leadModelIdx: defaultModelIdx(), execIdx: 0,
        memberIds: [], field: 0
      };
    }
    syncInputToField();
    focusInput();
  }

  // 현재 필드가 텍스트면 입력창에 값 반영 / mirror a text field into the input box
  function syncInputToField() {
    const f = getFields()[ed.form.field];
    inputEl.value = (f && f.kind === 'text') ? f.get() : '';
  }

  // 항목 이동(텍스트 항목이면 입력값 동기화) / move between fields
  function moveField(delta) {
    persistInput();
    const len = getFields().length;
    ed.form.field = (ed.form.field + delta + len) % len;
    syncInputToField();
    const f = getFields()[ed.form.field];
    if (f && f.kind === 'text') {
      focusInput();
    }
  }

  // 현재 입력값을 폼에 반영 / persist the input box into the form
  function persistInput() {
    const f = getFields()[ed.form.field];
    if (f && f.kind === 'text') {
      f.set(inputEl.value);
    }
  }

  // 사이클 필드 값 변경 / cycle a cycle-field value
  function cycleField(delta) {
    const f = getFields()[ed.form.field];
    if (!f || f.kind !== 'cycle') {
      return;
    }
    const n = f.count();
    if (n <= 0) {
      return;
    }
    const next = (f.getIdx() + delta + n) % n;
    f.setIdx(next);
  }

  // ←/→ 입력 처리: 사이클 필드는 값 변경, 토글 필드는 멤버 선택/해제
  // handle ←/→: cycle fields change value, toggle fields flip membership
  function adjustField(e, delta) {
    const f = currentField();
    if (!f) {
      return;
    }
    if (f.kind === 'cycle') {
      e.preventDefault();
      cycleField(delta);
    } else if (f.kind === 'toggle') {
      e.preventDefault();
      toggleMember(f.agentId);
    }
  }

  // 폼 저장 / save the form
  function submitForm() {
    persistInput();
    if (ed.formType === 'agent') {
      submitAgentForm();
    } else {
      submitTeamForm();
    }
  }

  function submitAgentForm() {
    const name = ed.form.name.trim();
    const role = ed.form.role.trim();
    if (!name) {
      return failForm('이름을 입력하세요', 0);
    }
    if (!role) {
      return failForm('역할을 입력하세요', 1);
    }
    const fields = { name, role, model: activeModels()[ed.form.modelIdx], color: ed.colors[ed.form.colorIdx] };
    if (ed.form.id) {
      ed.handlers.onUpdate(ed.form.id, fields);
    } else {
      ed.handlers.onCreate(fields);
    }
    toList();
  }

  function submitTeamForm() {
    const name = ed.form.name.trim();
    if (!name) {
      return failForm('팀 이름을 입력하세요', 0);
    }
    // 선택된 커스텀 에이전트들을 멤버로 / selected custom agents become the members
    const members = ed.form.memberIds.map((id) => ({ agentId: id }));
    if (!members.length) {
      // 첫 멤버 토글 필드로 포커스 / focus the first member-toggle field
      return failForm('팀원으로 추가할 에이전트를 선택하세요 (Space / ←→)', TEAM_TOGGLE_START);
    }
    const fields = {
      name,
      color: ed.colors[ed.form.colorIdx],
      leadModel: activeModels()[ed.form.leadModelIdx],
      execution: activeExecs()[ed.form.execIdx],
      members
    };
    if (ed.form.id) {
      ed.handlers.onTeamUpdate(ed.form.id, fields);
    } else {
      ed.handlers.onTeamCreate(fields);
    }
    toList();
  }

  // 유효성 실패 시 에러 표시 + 해당 필드로 포커스 / show error and focus a field
  function failForm(message, fieldIndex) {
    ed.error = message;
    const len = getFields().length;
    ed.form.field = Math.min(fieldIndex, len - 1);
    syncInputToField();
    focusInput();
  }

  // === 리스트 모드 전역 키 처리 / list-mode global key handling ===
  function handleGlobalKey(e) {
    if (ed.mode !== 'list') {
      return;
    }
    switch (e.code) {
      case 'ArrowUp':
        e.preventDefault();
        ed.selected = Math.max(0, ed.selected - 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        ed.selected = Math.min(currentList().length - 1, ed.selected + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Tab':
        e.preventDefault();
        switchTab();
        break;
      case 'KeyA':
        openForm(null);
        break;
      case 'KeyE':
      case 'Enter':
      case 'NumpadEnter':
        if (currentList()[ed.selected]) {
          openForm(currentList()[ed.selected]);
        }
        break;
      case 'KeyX':
      case 'Delete':
      case 'Backspace': {
        const item = currentList()[ed.selected];
        if (item) {
          if (ed.tab === 'agents') {
            ed.handlers.onDelete(item.id);
          } else {
            ed.handlers.onTeamDelete(item.id);
          }
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        close();
        break;
      default:
        break;
    }
  }

  function update(dt) {
    ed.blink += dt;
  }

  // === 렌더링 / rendering ===

  // 폭에 맞춰 줄바꿈 / wrap text to a width
  function wrap(ctx, text, maxW) {
    const lines = [];
    let cur = '';
    for (const ch of text) {
      const test = cur + ch;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = ch;
      } else {
        cur = test;
      }
    }
    if (cur) {
      lines.push(cur);
    }
    return lines.length ? lines : [''];
  }

  function draw(ctx) {
    if (!ed.open) {
      return;
    }
    // 어두운 배경 + 패널 / dim background + panel
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(30,22,46,0.96)';
    ctx.fillRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h);
    ctx.strokeStyle = '#B39DDB';
    ctx.lineWidth = 1;
    ctx.strokeRect(PANEL.x + 0.5, PANEL.y + 0.5, PANEL.w - 1, PANEL.h - 1);

    // 제목 / title
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFD54F';
    ctx.font = 'bold 12px ' + FONT_FAMILY;
    ctx.fillText('에이전트 공방', PANEL.x + PAD, PANEL.y + 18);

    // 탭 바 / tab bar
    drawTabs(ctx);

    if (ed.mode === 'list') {
      drawList(ctx);
    } else if (ed.formType === 'agent') {
      drawAgentForm(ctx);
    } else {
      drawTeamForm(ctx);
    }

    // 에러 메시지 / error message
    if (ed.error) {
      ctx.fillStyle = '#EF9A9A';
      ctx.font = '10px ' + FONT_FAMILY;
      ctx.fillText('⚠ ' + ed.error, PANEL.x + PAD, PANEL.y + PANEL.h - 26);
    }
  }

  // 탭 바(에이전트/팀) / tab bar
  function drawTabs(ctx) {
    const y = PANEL.y + 32;
    const tabs = [
      { id: 'agents', label: '에이전트' },
      { id: 'teams', label: '팀' }
    ];
    let x = PANEL.x + PAD;
    ctx.font = 'bold 10px ' + FONT_FAMILY;
    for (const t of tabs) {
      const active = ed.tab === t.id;
      const w = ctx.measureText(t.label).width + 16;
      ctx.fillStyle = active ? '#5E35B1' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y - 11, w, 16);
      ctx.fillStyle = active ? '#FFFFFF' : '#BBB';
      ctx.fillText(t.label, x + 8, y);
      x += w + 6;
    }
    // 구분선 / divider
    ctx.strokeStyle = 'rgba(179,157,219,0.4)';
    ctx.beginPath();
    ctx.moveTo(PANEL.x + PAD, y + 8);
    ctx.lineTo(PANEL.x + PANEL.w - PAD, y + 8);
    ctx.stroke();
  }

  // === 목록 렌더 / list rendering ===
  function drawList(ctx) {
    if (ed.tab === 'agents') {
      drawAgentList(ctx);
    } else {
      drawTeamList(ctx);
    }
  }

  function drawAgentList(ctx) {
    const x = PANEL.x + PAD;
    let y = PANEL.y + 58;
    ctx.font = '11px ' + FONT_FAMILY;

    if (!ed.agents.length) {
      ctx.fillStyle = '#BBB';
      ctx.fillText('아직 커스텀 에이전트가 없어요. [A]로 추가하세요.', x, y);
    } else {
      for (let i = 0; i < ed.agents.length; i++) {
        const a = ed.agents[i];
        const sel = (i === ed.selected);
        if (sel) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(PANEL.x + 6, y - 11, PANEL.w - 12, LINE_H);
        }
        ctx.fillStyle = a.color || '#999';
        ctx.fillRect(x, y - 9, 9, 9);
        ctx.fillStyle = sel ? '#FFFFFF' : '#DDD';
        const role = (a.role || '').replace(/\n/g, ' ');
        const summary = role.length > 24 ? role.slice(0, 24) + '…' : role;
        const tag = '[' + (a.model || 'sonnet') + ']';
        ctx.fillText((sel ? '▶ ' : '   ') + a.name + ' ' + tag + '  ' + summary, x + 14, y);
        y += LINE_H + 2;
        if (y > PANEL.y + PANEL.h - 40) {
          break;
        }
      }
    }
    drawListHelp(ctx, '[↑↓] 선택  [←→] 탭  [A] 추가  [E] 편집  [X] 삭제  [ESC] 닫기');
  }

  function drawTeamList(ctx) {
    const x = PANEL.x + PAD;
    let y = PANEL.y + 58;
    ctx.font = '11px ' + FONT_FAMILY;

    if (!ed.teams.length) {
      ctx.fillStyle = '#BBB';
      ctx.fillText('아직 팀이 없어요. [A]로 팀을 만드세요.', x, y);
    } else {
      for (let i = 0; i < ed.teams.length; i++) {
        const t = ed.teams[i];
        const sel = (i === ed.selected);
        if (sel) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(PANEL.x + 6, y - 11, PANEL.w - 12, LINE_H);
        }
        ctx.fillStyle = t.color || '#999';
        ctx.fillRect(x, y - 9, 9, 9);
        ctx.fillStyle = sel ? '#FFFFFF' : '#DDD';
        const count = (t.members || []).length;
        const exec = t.execution === 'parallel' ? '병렬' : '순차';
        const info = '멤버 ' + count + '명 · ' + exec + ' · 리드 ' + (t.leadModel || 'sonnet');
        ctx.fillText((sel ? '▶ ' : '   ') + '👥 ' + t.name + '  —  ' + info, x + 14, y);
        y += LINE_H + 2;
        if (y > PANEL.y + PANEL.h - 40) {
          break;
        }
      }
    }
    drawListHelp(ctx, '[↑↓] 선택  [←→] 탭  [A] 팀 추가  [E] 편집  [X] 삭제  [ESC] 닫기');
  }

  function drawListHelp(ctx, text) {
    ctx.fillStyle = '#9E9E9E';
    ctx.font = '9px ' + FONT_FAMILY;
    ctx.fillText(text, PANEL.x + PAD, PANEL.y + PANEL.h - 10);
  }

  // === 에이전트 폼 렌더 / agent form rendering ===
  function drawAgentForm(ctx) {
    const x = PANEL.x + PAD;
    let y = PANEL.y + 62;
    ctx.font = 'bold 11px ' + FONT_FAMILY;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(ed.form.id ? '에이전트 편집' : '새 에이전트 추가', x, y);
    y += 20;

    ctx.font = '11px ' + FONT_FAMILY;
    const cursorOn = Math.floor(ed.blink * 2) % 2 === 0;

    // 이름 / name
    drawFieldLabel(ctx, x, y, '이름', ed.form.field === 0);
    drawTextValue(ctx, x + 56, y, ed.form.name, ed.form.field === 0 && cursorOn);
    y += LINE_H + 6;

    // 역할 / role (여러 줄 / multi-line)
    drawFieldLabel(ctx, x, y, '역할', ed.form.field === 1);
    const roleVal = ed.form.role + (ed.form.field === 1 && cursorOn ? '|' : '');
    const roleLines = wrap(ctx, roleVal || ' ', PANEL.w - PAD * 2 - 56);
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < roleLines.length && i < 3; i++) {
      ctx.fillText(roleLines[i], x + 56, y + i * LINE_H);
    }
    y += LINE_H * Math.min(3, roleLines.length) + 8;

    // 모델 / model
    drawFieldLabel(ctx, x, y, '모델', ed.form.field === 2);
    drawModelChips(ctx, x + 56, y, ed.form.modelIdx);
    y += LINE_H + 8;

    // 색 / color
    drawFieldLabel(ctx, x, y, '색', ed.form.field === 3);
    drawColorChips(ctx, x + 56, y, ed.form.colorIdx);
    y += LINE_H + 8;

    drawFormHelp(ctx, '[↑↓] 항목  [←→] 선택  [Enter] 저장  [ESC] 취소');
  }

  // === 팀 폼 렌더 / team form rendering ===
  function drawTeamForm(ctx) {
    const x = PANEL.x + PAD;
    let y = PANEL.y + 60;
    ctx.font = 'bold 11px ' + FONT_FAMILY;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(ed.form.id ? '팀 편집' : '새 팀 만들기', x, y);
    y += 18;

    ctx.font = '11px ' + FONT_FAMILY;
    const cursorOn = Math.floor(ed.blink * 2) % 2 === 0;
    const labelW = 64;

    // 0: 팀 이름 / team name
    drawFieldLabel(ctx, x, y, '팀 이름', ed.form.field === 0);
    drawTextValue(ctx, x + labelW, y, ed.form.name, ed.form.field === 0 && cursorOn);
    y += LINE_H + 4;

    // 1: 색 / color
    drawFieldLabel(ctx, x, y, '색', ed.form.field === 1);
    drawColorChips(ctx, x + labelW, y, ed.form.colorIdx);
    y += LINE_H + 4;

    // 2: 리드 모델 / lead model
    drawFieldLabel(ctx, x, y, '리드 모델', ed.form.field === 2);
    drawModelChips(ctx, x + labelW, y, ed.form.leadModelIdx);
    y += LINE_H + 4;

    // 3: 실행 방식 / execution
    drawFieldLabel(ctx, x, y, '실행 방식', ed.form.field === 3);
    drawExecChips(ctx, x + labelW, y, ed.form.execIdx);
    y += LINE_H + 4;

    // 팀원 선택 헤더(내가 만든 커스텀 에이전트 토글) / member picker header (toggle my custom agents)
    ctx.font = 'bold 10px ' + FONT_FAMILY;
    ctx.fillStyle = '#B39DDB';
    ctx.fillText('팀원 선택 — 내 에이전트 (' + ed.form.memberIds.length + '/' + ed.maxMembers + ')', x, y);
    y += LINE_H + 2;

    ctx.font = '10px ' + FONT_FAMILY;
    if (!ed.agents.length) {
      // 커스텀 에이전트가 없으면 안내 / hint when there are no custom agents to add
      ctx.fillStyle = '#BBB';
      ctx.fillText('먼저 [에이전트] 탭에서 에이전트를 만드세요.', x, y);
    } else {
      // 에이전트별 체크박스 행 / one checkbox row per custom agent
      for (let i = 0; i < ed.agents.length; i++) {
        const a = ed.agents[i];
        const field = TEAM_TOGGLE_START + i;
        const active = ed.form.field === field;
        const on = ed.form.memberIds.indexOf(a.id) >= 0;
        if (active) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(PANEL.x + 6, y - 10, PANEL.w - 12, LINE_H);
        }
        // 체크박스 / checkbox
        ctx.fillStyle = on ? '#9CCC65' : '#888';
        ctx.fillText(on ? '☑' : '☐', x, y);
        // 색 스와치 + 이름 + 모델 / swatch + name + model
        ctx.fillStyle = a.color || '#999';
        ctx.fillRect(x + 16, y - 8, 8, 8);
        ctx.fillStyle = active ? '#FFFFFF' : (on ? '#E8F5E9' : '#CCC');
        ctx.fillText(a.name + '  [' + (a.model || 'sonnet') + ']', x + 28, y);
        y += LINE_H;
        if (y > PANEL.y + PANEL.h - 30) {
          break;
        }
      }
    }

    drawFormHelp(ctx, '[↑↓] 항목  [←→/Space] 선택·변경  [Enter] 저장  [ESC] 취소');
  }

  // 텍스트 값(커서 포함) / a text value with an optional cursor
  function drawTextValue(ctx, x, y, value, cursorOn) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText((value || '') + (cursorOn ? '|' : '') || ' ', x, y);
  }

  // 모델 칩 묶음 / model chips
  function drawModelChips(ctx, x, y, activeIdx) {
    const models = activeModels();
    let cx = x;
    ctx.font = '9px ' + FONT_FAMILY;
    for (let i = 0; i < models.length; i++) {
      const label = modelLabel(models[i]);
      const w = ctx.measureText(label).width + 10;
      drawChip(ctx, cx, y - 9, w, label, i === activeIdx, true);
      cx += w + 5;
    }
    ctx.font = '11px ' + FONT_FAMILY;
  }

  // 실행 방식 칩 묶음 / execution chips
  function drawExecChips(ctx, x, y, activeIdx) {
    const execs = activeExecs();
    let cx = x;
    ctx.font = '9px ' + FONT_FAMILY;
    for (let i = 0; i < execs.length; i++) {
      const label = execLabel(execs[i]);
      const w = ctx.measureText(label).width + 10;
      drawChip(ctx, cx, y - 9, w, label, i === activeIdx, true);
      cx += w + 5;
    }
    ctx.font = '11px ' + FONT_FAMILY;
  }

  // 색상 스와치 묶음 / color swatches
  function drawColorChips(ctx, x, y, activeIdx) {
    for (let i = 0; i < ed.colors.length; i++) {
      const cxp = x + i * 14;
      ctx.fillStyle = ed.colors[i];
      ctx.fillRect(cxp, y - 9, 11, 11);
      if (i === activeIdx) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(cxp - 1.5, y - 10.5, 14, 14);
      }
    }
  }

  // 칩 한 개(라벨 + 활성 강조) / a single chip with active highlight
  function drawChip(ctx, x, y, w, text, active, preFont) {
    if (!preFont) {
      ctx.font = '9px ' + FONT_FAMILY;
    }
    ctx.fillStyle = active ? '#5E35B1' : 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, y, w, 13);
    if (active) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 12);
    }
    ctx.fillStyle = active ? '#FFFFFF' : '#CCC';
    ctx.fillText(text, x + 5, y + 10);
  }

  function drawFieldLabel(ctx, x, y, label, active) {
    ctx.fillStyle = active ? '#FFD54F' : '#AAA';
    ctx.fillText((active ? '▶ ' : '   ') + label, x, y);
  }

  function drawFormHelp(ctx, text) {
    ctx.fillStyle = '#9E9E9E';
    ctx.font = '9px ' + FONT_FAMILY;
    ctx.fillText(text, PANEL.x + PAD, PANEL.y + PANEL.h - 10);
  }

  window.Editor = {
    open,
    close,
    isOpen,
    refresh,
    refreshTeams,
    handleGlobalKey,
    update,
    draw
  };
})();
