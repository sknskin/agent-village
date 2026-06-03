'use strict';

// HUD, 포켓몬식 대화창, 타이핑 애니메이션, 스트리밍 표시, 작업 입력 렌더링
// HUD, Pokemon-style dialogue box, typing animation, streaming display, task input

(function () {
  const W = window.CONFIG.LOGICAL_W;
  const H = window.CONFIG.LOGICAL_H;

  // === 상수 / Constants ===
  const BOX = { x: 8, y: H - 100, w: W - 16, h: 92 };
  const PAD = 9;
  const LINE_H = 13;
  // 한글이 또렷한 시스템 폰트 / Korean-friendly system fonts
  const FONT_FAMILY = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  const FONT = '11px ' + FONT_FAMILY;
  const SPEAKER_FONT = 'bold 11px ' + FONT_FAMILY;
  const TEXT_COLOR = '#FFFFFF';
  const BOX_BG = 'rgba(20,20,28,0.88)';
  const BORDER = '#FFFFFF';

  // 타이핑 속도(글자/초) — 빠름/보통/느림 / typing speeds (chars/sec)
  const SPEEDS = [80, 45, 25];
  const SPEED_LABELS = ['빠름', '보통', '느림'];
  // 속도 변경 후 현재 속도를 잠깐 보여주는 시간(초) / how long to flash the speed label after a change
  const SPEED_FLASH_DUR = 1.6;

  // 응답 대기(생각 중) 회전 문구 / rotating "thinking" phrases while awaiting a reply
  const THINKING_PHRASES = [
    '답변을 준비하고 있어요',
    '생각하는 중이에요',
    '곰곰이 고민하는 중',
    '잠깐만요, 정리하고 있어요',
    '머릿속을 굴리는 중'
  ];
  // 문구 전환 주기(초) / seconds before switching to the next phrase
  const THINKING_PERIOD = 1.4;
  // 점 애니메이션 최대 개수 / max animated trailing dots
  const THINKING_MAX_DOTS = 3;

  // 전체 답변 확장 리더 레이아웃 / expanded answer reader layout
  const READER = { margin: 10, pad: 12, lineH: 14, footerH: 18, titleH: 22 };

  // 대화창 모드 / dialogue modes
  const MODE = { HIDDEN: 'hidden', TEXT: 'text', WORKING: 'working', INPUT: 'input' };

  // === 상태 / state ===
  const ui = {
    mode: MODE.HIDDEN,
    context: '', // 'greeting' | 'result' (게임 로직 참고용 / for game logic)
    speaker: '', // 말하는 NPC 이름 / speaker name
    speakerColor: '#FFFFFF',
    buffer: '', // 표시할 전체 텍스트 / full text to display
    charProgress: 0, // 타이핑 진행(글자수) / typed char count
    streaming: false, // 스트리밍 중 / streaming in progress
    speedIndex: 1,
    blink: 0, // 커서/화살표 깜빡임 / cursor & arrow blink
    speedFlash: 0, // 속도 변경 후 라벨 표시 잔여 시간 / remaining time to flash the speed label
    workTime: 0, // 응답 대기 경과 시간(생각중 문구 회전용) / elapsed waiting time for thinking phrases
    handlers: { onSubmit: null, onCancel: null },
    hint: '', // HUD 하단 힌트 / bottom HUD hint
    portrait: null, // 화자 초상화 { sprite, agentId, color } / speaker portrait
    reader: { open: false, scroll: 0, maxScroll: 0 } // 전체 답변 확장 리더 / expanded answer reader
  };

  // === 숨김 입력 요소 (한글 IME 캡처용, 화면엔 안 보임) ===
  // Hidden input element to capture text incl. Korean IME (not visually shown)
  let inputEl = null;

  function ensureInputEl() {
    if (inputEl) {
      return;
    }
    // 화면 밖 숨김 입력 생성(공용 유틸) / create the off-screen hidden input via the shared util
    inputEl = window.UIUtil.createHiddenInput();

    // 엔터=제출, ESC=취소 / Enter = submit, Escape = cancel
    inputEl.addEventListener('keydown', (e) => {
      if (ui.mode !== MODE.INPUT) {
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = inputEl.value.trim();
        if (value && typeof ui.handlers.onSubmit === 'function') {
          ui.handlers.onSubmit(value);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (typeof ui.handlers.onCancel === 'function') {
          ui.handlers.onCancel();
        }
      }
      // 이동키가 게임으로 새지 않도록 / keep movement keys from leaking to the game
      e.stopPropagation();
    });
  }

  // === 공개 메서드 / public methods ===

  // 대화 핸들러 설정 / set submit/cancel handlers
  function setHandlers(onSubmit, onCancel) {
    ui.handlers.onSubmit = onSubmit;
    ui.handlers.onCancel = onCancel;
  }

  // 정적 메시지 표시(인사말/결과) / show a static message (greeting/result)
  function showMessage(speaker, color, text, context) {
    ui.mode = MODE.TEXT;
    ui.context = context || '';
    ui.speaker = speaker || '';
    ui.speakerColor = color || '#FFFFFF';
    ui.buffer = text || '';
    ui.charProgress = 0;
    ui.streaming = false;
  }

  // 작업 입력 시작 / begin task input
  function beginInput(speaker, color) {
    ensureInputEl();
    ui.mode = MODE.INPUT;
    ui.context = 'input';
    ui.speaker = speaker || '';
    ui.speakerColor = color || '#FFFFFF';
    inputEl.value = '';
    // 포커스(키보드 입력 수신) / focus to receive keystrokes
    setTimeout(() => inputEl.focus(), 0);
  }

  // 스트리밍 작업 시작 / start streaming work
  function startWorking(speaker, color) {
    ui.mode = MODE.WORKING;
    ui.context = 'working';
    ui.speaker = speaker || '';
    ui.speakerColor = color || '#FFFFFF';
    ui.buffer = '';
    ui.charProgress = 0;
    ui.streaming = true;
    ui.workTime = 0; // 생각중 문구를 처음부터 회전 / restart thinking-phrase rotation
    blurInput();
  }

  // 스트리밍 청크 추가 / append a streaming chunk
  function appendChunk(text) {
    ui.buffer += text;
  }

  // 스트리밍 종료 → 결과 텍스트로 전환 / finish streaming → result text
  function finishWorking() {
    ui.streaming = false;
    ui.mode = MODE.TEXT;
    ui.context = 'result';
  }

  // 현재 타이핑 중인지 / is the typewriter still revealing
  function isTyping() {
    return ui.charProgress < ui.buffer.length;
  }

  // 타이핑 즉시 완료 / reveal all text now
  function skipTyping() {
    ui.charProgress = ui.buffer.length;
  }

  // 타이핑 속도 순환 / cycle typing speed
  function cycleSpeed() {
    ui.speedIndex = (ui.speedIndex + 1) % SPEEDS.length;
    ui.speedFlash = SPEED_FLASH_DUR; // 변경한 속도를 잠깐 표시 / briefly flash the new speed
  }

  function getMode() {
    return ui.mode;
  }

  function getContext() {
    return ui.context;
  }

  function isOpen() {
    return ui.mode !== MODE.HIDDEN;
  }

  // 입력 포커스 해제 / blur the hidden input
  function blurInput() {
    if (inputEl) {
      inputEl.blur();
    }
  }

  // 대화창 닫기 / close the dialogue
  function close() {
    ui.mode = MODE.HIDDEN;
    ui.context = '';
    ui.buffer = '';
    ui.charProgress = 0;
    ui.streaming = false;
    ui.portrait = null;
    ui.reader.open = false; // 대화 종료 시 리더도 닫기 / closing the dialogue also closes the reader
    ui.reader.scroll = 0;
    blurInput();
  }

  // === 전체 답변 확장 리더 / expanded answer reader ===

  // 리더 열기(스트리밍이 끝나고 표시할 내용이 있을 때만) / open the reader (only when streaming is done and there is content)
  function openReader() {
    if (ui.streaming || !ui.buffer || !ui.buffer.trim()) {
      return;
    }
    ui.reader.open = true;
    ui.reader.scroll = 0;
  }

  // 리더 닫기 / close the reader
  function closeReader() {
    ui.reader.open = false;
  }

  // 리더 열림 여부 / is the reader open
  function isReaderOpen() {
    return ui.reader.open;
  }

  // 리더 스크롤(범위 클램프) / scroll the reader, clamped to range
  // maxScroll은 drawReader가 매 프레임 갱신한다(오버레이가 열리면 키 입력 전에 최소 한 번 렌더됨).
  // maxScroll is refreshed every frame by drawReader (the overlay renders at least once before any key input).
  function scrollReader(deltaLines) {
    const max = ui.reader.maxScroll || 0;
    const next = ui.reader.scroll + deltaLines;
    ui.reader.scroll = Math.max(0, Math.min(max, next));
  }

  // 화자 초상화 설정(null이면 없음) / set the speaker portrait (null clears)
  function setPortrait(portrait) {
    ui.portrait = portrait || null;
  }

  // HUD 힌트 설정 / set the bottom HUD hint
  function setHint(text) {
    ui.hint = text || '';
  }

  // 현재 생각중 문구(회전 + 점 애니메이션) / current thinking phrase (rotating + dots)
  function thinkingLine() {
    const phraseIndex = Math.floor(ui.workTime / THINKING_PERIOD) % THINKING_PHRASES.length;
    // 0~3개 점이 반복 / cycle 0..3 trailing dots
    const dotCount = Math.floor(ui.workTime * 2) % (THINKING_MAX_DOTS + 1);
    return THINKING_PHRASES[phraseIndex] + '.'.repeat(dotCount);
  }

  // === 업데이트 / update ===
  function update(dt) {
    // 깜빡임 누적값을 되감아 장시간 후 정밀도 손실 방지 / wrap blink to avoid long-run precision loss
    ui.blink = (ui.blink + dt) % window.UIUtil.BLINK_CYCLE;
    ui.workTime += dt;
    if (ui.speedFlash > 0) {
      ui.speedFlash -= dt; // 속도 라벨 잔여 시간 감소 / decay the speed-label timer
    }
    if (ui.mode === MODE.TEXT || ui.mode === MODE.WORKING) {
      if (ui.charProgress < ui.buffer.length) {
        ui.charProgress = Math.min(
          ui.buffer.length,
          ui.charProgress + SPEEDS[ui.speedIndex] * dt
        );
      }
    }
  }

  // === 텍스트 줄바꿈 / text wrapping ===

  // 폭에 맞춰 줄바꿈 — 공용 유틸 위임 / wrap by width — delegated to the shared util
  function wrapText(ctx, text, maxWidth) {
    return window.UIUtil.wrapText(ctx, text, maxWidth);
  }

  // === 렌더링 / rendering ===

  // 상단 HUD / top HUD hint bar
  function drawHud(ctx) {
    if (!ui.hint) {
      return;
    }
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    const tw = ctx.measureText(ui.hint).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(6, 6, tw + 10, 14);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(ui.hint, 11, 16);
  }

  // 대화창 / dialogue box
  function draw(ctx) {
    // 좌측 상단 HUD 힌트는 표시하지 않음(사용자 요청) / top-left HUD hint removed per request
    if (ui.mode === MODE.HIDDEN) {
      return;
    }

    // 박스 배경/테두리 / box background and border
    ctx.fillStyle = BOX_BG;
    ctx.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(BOX.x + 0.5, BOX.y + 0.5, BOX.w - 1, BOX.h - 1);

    // 속도 변경 직후 현재 타이핑 속도를 우상단에 잠깐 표시 / flash current typing speed at top-right
    if (ui.speedFlash > 0) {
      ctx.font = '9px ' + FONT_FAMILY;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#FFD54F';
      ctx.fillText('⌨ ' + SPEED_LABELS[ui.speedIndex], BOX.x + BOX.w - PAD, BOX.y + 12);
      ctx.textAlign = 'left';
    }

    // 화자 초상화(있으면 왼쪽에) → 텍스트 시작 위치를 오른쪽으로 / portrait on the left shifts text right
    const textLeft = BOX.x + PAD + (ui.portrait ? 36 : 0);
    if (ui.portrait) {
      drawPortrait(ctx, BOX.x + PAD, BOX.y + PAD, ui.portrait);
    }

    // 화자 이름표 / speaker name tag
    let textTop = BOX.y + PAD;
    if (ui.speaker) {
      ctx.font = SPEAKER_FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = ui.speakerColor;
      ctx.fillText(ui.speaker, textLeft, BOX.y + PAD + 2);
      textTop = BOX.y + PAD + LINE_H + 2;
    }

    ctx.font = FONT;
    ctx.fillStyle = TEXT_COLOR;
    ctx.textAlign = 'left';

    const innerW = BOX.x + BOX.w - PAD - textLeft;
    const innerBottom = BOX.y + BOX.h - PAD;
    const maxLines = Math.floor((innerBottom - textTop) / LINE_H);

    if (ui.mode === MODE.INPUT) {
      drawInput(ctx, textTop, innerW, textLeft);
      return;
    }

    // 응답 대기 중(아직 청크 없음): 생각중 문구 표시 / awaiting first chunk: show thinking phrase
    if (ui.mode === MODE.WORKING && ui.buffer.length === 0) {
      ctx.fillStyle = '#AED581';
      ctx.fillText(thinkingLine(), textLeft, textTop + 8);
      drawIndicator(ctx);
      return;
    }

    // 타이핑된 만큼만 표시 / show only the typed portion
    const revealed = ui.buffer.slice(0, Math.floor(ui.charProgress));
    const lines = wrapText(ctx, revealed, innerW);

    // 완료된 답변이면 하단 한 줄을 전체보기 안내로 예약 / reserve a footer row for the expand hint
    const isResult = (ui.context === 'result' && !ui.streaming);
    const visibleCount = Math.max(1, isResult ? maxLines - 1 : maxLines);

    // 최신 내용이 보이도록 아래쪽 윈도우 / window to the latest lines
    const start = Math.max(0, lines.length - visibleCount);
    const visible = lines.slice(start, start + visibleCount);
    for (let i = 0; i < visible.length; i++) {
      ctx.fillText(visible[i], textLeft, textTop + i * LINE_H + 8);
    }

    // 전체보기 안내(내용이 잘렸으면 더 강조) / expand hint (emphasized when content is clipped)
    if (isResult) {
      const clipped = lines.length > visibleCount;
      ctx.font = '9px ' + FONT_FAMILY;
      ctx.fillStyle = '#FFD54F';
      ctx.fillText(clipped ? '[F] 전체보기 ▾ 내용 더 있음' : '[F] 전체보기', textLeft, innerBottom + 2);
      ctx.font = FONT;
    }

    // 우하단 인디케이터 / bottom-right indicator
    drawIndicator(ctx);
  }

  // 화자 초상화(픽셀 캐릭터 확대) / draw the speaker portrait (scaled-up pixel character)
  function drawPortrait(ctx, x, y, portrait) {
    const S = window.Sprites;
    const size = 30;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = portrait.color || '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    const scale = 1.6;
    ctx.save();
    ctx.translate(x + (size - 16 * scale) / 2, y + size - 16 * scale - 1);
    ctx.scale(scale, scale);
    const sp = portrait.sprite;
    if (sp === 'cat') {
      S.drawCat(ctx, 0, 0, 0, portrait.color);
    } else if (sp === 'penguin') {
      S.drawPenguin(ctx, 0, 0, 0);
    } else if (sp === 'spirit_tree') {
      S.drawSpiritTree(ctx, 0, 0);
    } else if (sp === 'bottle') {
      S.drawBottle(ctx, 0, 0);
    } else if (sp === 'snowman') {
      S.drawSnowman(ctx, 0, 0);
    } else if (sp === 'crystal') {
      S.drawCrystal(ctx, 0, 0);
    } else if (sp === 'dog') {
      S.drawDog(ctx, 0, 0, 0, portrait.color);
    } else if (sp === 'rabbit') {
      S.drawRabbit(ctx, 0, 0, 0, portrait.color);
    } else if (sp === 'well') {
      S.drawWell(ctx, 0, 0);
    } else if (sp === 'mushroom') {
      S.drawMushroom(ctx, 0, 0);
    } else if (sp === 'player') {
      S.drawPlayer(ctx, 0, 0, 'down', 0);
    } else {
      // 기본: 휴머노이드 에이전트/NPC / default: humanoid agent or NPC
      S.drawNPC(ctx, portrait.agentId, 0, 0, 0, 'idle', portrait.color);
    }
    ctx.restore();
  }

  // 입력 모드 렌더링 / render input mode
  function drawInput(ctx, textTop, innerW, textLeft) {
    ctx.fillStyle = '#AED581';
    ctx.fillText('작업을 입력하고 Enter (취소: ESC)', textLeft, textTop + 8);

    const value = inputEl ? inputEl.value : '';
    const lines = wrapText(ctx, '▶ ' + value, innerW);
    ctx.fillStyle = TEXT_COLOR;
    const startY = textTop + LINE_H + 8;
    for (let i = 0; i < lines.length && i < 4; i++) {
      ctx.fillText(lines[i], textLeft, startY + i * LINE_H);
    }

    // 깜빡이는 커서 / blinking cursor
    if (window.UIUtil.cursorOn(ui.blink)) {
      const lastLine = lines.length ? lines[Math.min(lines.length, 4) - 1] : '▶ ';
      const cw = ctx.measureText(lastLine).width;
      const cy = startY + (Math.min(lines.length, 4) - 1) * LINE_H;
      ctx.fillRect(textLeft + cw + 1, cy - 7, 4, 9);
    }
  }

  // 진행/대기 인디케이터 / progress or waiting indicator
  function drawIndicator(ctx) {
    const ix = BOX.x + BOX.w - 16;
    const iy = BOX.y + BOX.h - 12;

    if (ui.mode === MODE.WORKING || ui.streaming) {
      // 작업 중 점 애니메이션 / working dots
      const active = Math.floor(ui.blink * 4) % 3;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = (i === active) ? '#FFEB3B' : '#777';
        ctx.fillRect(ix - 12 + i * 5, iy, 3, 3);
      }
      return;
    }

    // 타이핑 완료 시 ▼ 표시(깜빡임) / blinking ▼ when typing is done
    if (!isTyping() && window.UIUtil.cursorOn(ui.blink)) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('▼', ix, iy + 4);
    }
  }

  // 전체 답변 리더 오버레이 렌더 / render the expanded answer reader overlay
  function drawReader(ctx) {
    if (!ui.reader.open) {
      return;
    }
    const x = READER.margin;
    const y = READER.margin;
    const w = W - READER.margin * 2;
    const h = H - READER.margin * 2;

    // 어두운 배경 + 패널 / dim background + panel
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(20,20,28,0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // 제목(화자 + 전체 보기) / title (speaker + full view)
    ctx.textAlign = 'left';
    ctx.font = SPEAKER_FONT;
    ctx.fillStyle = ui.speakerColor || '#FFD54F';
    ctx.fillText((ui.speaker || '') + ' — 전체 보기', x + READER.pad, y + READER.pad + 8);

    // 본문(윈도잉 없이 전체를 스크롤) / body (full text, scrollable without latest-only windowing)
    ctx.font = FONT;
    ctx.fillStyle = TEXT_COLOR;
    const innerW = w - READER.pad * 2;
    const bodyTop = y + READER.pad + READER.titleH;
    const bodyBottom = y + h - READER.pad - READER.footerH;
    const maxLines = Math.max(1, Math.floor((bodyBottom - bodyTop) / READER.lineH));
    const lines = wrapText(ctx, ui.buffer, innerW);

    // 스크롤 범위 클램프 / clamp the scroll range
    const maxScroll = Math.max(0, lines.length - maxLines);
    ui.reader.maxScroll = maxScroll;
    if (ui.reader.scroll > maxScroll) {
      ui.reader.scroll = maxScroll;
    }
    if (ui.reader.scroll < 0) {
      ui.reader.scroll = 0;
    }

    const start = ui.reader.scroll;
    const visible = lines.slice(start, start + maxLines);
    for (let i = 0; i < visible.length; i++) {
      ctx.fillText(visible[i], x + READER.pad, bodyTop + i * READER.lineH + 8);
    }

    // 하단 안내 + 진행률 / footer help and scroll percentage
    const percent = maxScroll > 0 ? Math.round((start / maxScroll) * 100) : 100;
    ctx.fillStyle = '#9E9E9E';
    ctx.font = '9px ' + FONT_FAMILY;
    ctx.fillText('[↑↓ / PgUp·PgDn] 스크롤   [ESC / F] 닫기   (' + percent + '%)', x + READER.pad, y + h - READER.pad + 2);
  }

  window.UI = {
    MODE,
    setHandlers,
    showMessage,
    beginInput,
    startWorking,
    appendChunk,
    finishWorking,
    isTyping,
    skipTyping,
    cycleSpeed,
    getMode,
    getContext,
    isOpen,
    close,
    setPortrait,
    setHint,
    openReader,
    closeReader,
    isReaderOpen,
    scrollReader,
    drawReader,
    update,
    draw,
    getInputValue: () => (inputEl ? inputEl.value.trim() : '')
  };
})();
