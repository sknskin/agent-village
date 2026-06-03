'use strict';

// UI 공용 유틸 — 대화창(ui.js)과 공방 에디터(editor.js)가 공유하는 순수 헬퍼
// Shared UI utilities — pure helpers shared by the dialogue box (ui.js) and the workshop editor (editor.js)
//
// 동작을 바꾸지 않고 중복만 제거한다(텍스트 줄바꿈·커서 깜빡임·IME 숨김 입력 생성).
// Removes duplication without changing behavior (text wrapping, cursor blink, hidden IME input creation).

(function () {
  // 깜빡임 누적값을 주기적으로 되감아 부동소수 정밀도 손실을 막는다(0.5s·0.25s 주기의 공배수).
  // Wrap the blink accumulator periodically to avoid float precision loss (common multiple of the 0.5s/0.25s blink periods).
  const BLINK_CYCLE = 12;

  // 커서/화살표 표시 여부(0.5초 주기 깜빡임) / cursor & arrow visibility (0.5s blink)
  function cursorOn(blink) {
    return Math.floor(blink * 2) % 2 === 0;
  }

  // 폭에 맞춰 줄바꿈(개행 보존 + 글자 단위 폴백)
  // wrap text to a width (preserving newlines + per-character fallback)
  // 개행이 없는 입력에서는 단일 줄 래핑과 결과가 동일하다 / for newline-free input this matches single-line wrapping
  function wrapText(ctx, text, maxWidth) {
    const lines = [];
    const paragraphs = String(text).split('\n');
    for (const para of paragraphs) {
      if (para === '') {
        lines.push('');
        continue;
      }
      let current = '';
      for (const ch of para) {
        const test = current + ch;
        if (ctx.measureText(test).width > maxWidth && current !== '') {
          lines.push(current);
          current = ch;
        } else {
          current = test;
        }
      }
      if (current !== '') {
        lines.push(current);
      }
    }
    return lines;
  }

  // 화면 밖 숨김 입력 요소 생성(한글 IME 캡처용) — 리스너는 호출자가 부착
  // create an off-screen hidden input for Korean IME capture — caller attaches its own listeners
  function createHiddenInput() {
    const el = document.createElement('input');
    el.type = 'text';
    el.setAttribute('autocomplete', 'off');
    el.style.position = 'absolute';
    el.style.left = '0';
    el.style.top = '0';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
    el.style.border = 'none';
    el.style.background = 'transparent';
    document.body.appendChild(el);
    return el;
  }

  window.UIUtil = {
    BLINK_CYCLE,
    cursorOn,
    wrapText,
    createHiddenInput
  };
})();
