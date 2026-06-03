'use strict';

// agents.js 순수 함수 회귀 테스트 (Node 내장 러너, 무의존성)
// Regression tests for pure helpers in agents.js (built-in runner, no dependencies)
//   실행 / run:  npm test   (== node --test)
//
// 주의: agents.js를 require하면 custom-agents.json/teams.json을 "읽기"만 하며
// 디스크에 쓰지 않는다(여기서 테스트하는 함수는 모두 순수 함수).
// Note: requiring agents.js only reads the json files (no writes); the tested helpers are pure.

const test = require('node:test');
const assert = require('node:assert');

const { sanitizeModel, sanitizeExecution, parsePlan } = require('../agents');

test('sanitizeModel: 허용 별칭은 그대로 / valid aliases pass through', () => {
  assert.strictEqual(sanitizeModel('opus'), 'opus');
  assert.strictEqual(sanitizeModel('sonnet'), 'sonnet');
  assert.strictEqual(sanitizeModel('haiku'), 'haiku');
});

test('sanitizeModel: 미허용 값은 기본(sonnet)으로 폴백 / unknown falls back to default', () => {
  assert.strictEqual(sanitizeModel('gpt'), 'sonnet');
  assert.strictEqual(sanitizeModel(''), 'sonnet');
  assert.strictEqual(sanitizeModel(undefined), 'sonnet');
  assert.strictEqual(sanitizeModel(null), 'sonnet');
});

test('sanitizeExecution: 유효 모드 유지, 그 외 sequential 폴백 / valid kept, else sequential', () => {
  assert.strictEqual(sanitizeExecution('sequential'), 'sequential');
  assert.strictEqual(sanitizeExecution('parallel'), 'parallel');
  assert.strictEqual(sanitizeExecution('weird'), 'sequential');
  assert.strictEqual(sanitizeExecution(undefined), 'sequential');
});

test('parsePlan: 정상 JSON에서 유효 태스크 추출 / extracts valid tasks', () => {
  const text = '{"tasks":[{"agent":"coder","task":"A"},{"agent":"writer","task":"B"}]}';
  const tasks = parsePlan(text);
  assert.ok(Array.isArray(tasks));
  assert.strictEqual(tasks.length, 2);
  assert.strictEqual(tasks[0].agent, 'coder');
});

test('parsePlan: 코드펜스를 제거하고 파싱 / strips code fences', () => {
  const text = '```json\n{"tasks":[{"agent":"analyst","task":"X"}]}\n```';
  const tasks = parsePlan(text);
  assert.ok(tasks);
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].agent, 'analyst');
});

test('parsePlan: 위임 불가 에이전트/빈 태스크는 제외 / drops invalid agents & empty tasks', () => {
  const text = '{"tasks":[{"agent":"orchestrator","task":"loop"},{"agent":"coder","task":"  "},{"agent":"researcher","task":"ok"}]}';
  const tasks = parsePlan(text);
  // orchestrator(위임불가)·공백 task는 제외, researcher만 남음 / only researcher survives
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].agent, 'researcher');
});

test('parsePlan: 최대 4개로 제한 / caps at MAX_SUBTASKS (4)', () => {
  const many = Array.from({ length: 8 }, () => ({ agent: 'coder', task: 'x' }));
  const tasks = parsePlan(JSON.stringify({ tasks: many }));
  assert.strictEqual(tasks.length, 4);
});

test('parsePlan: 비JSON/유효태스크 없음은 null / null on non-JSON or no valid tasks', () => {
  assert.strictEqual(parsePlan('not json at all'), null);
  assert.strictEqual(parsePlan('{"tasks":[]}'), null);
  assert.strictEqual(parsePlan('{"tasks":[{"agent":"orchestrator","task":"x"}]}'), null);
  assert.strictEqual(parsePlan(''), null);
});

test('parsePlan: task 문자열에 중괄호가 있어도 정상 파싱 / handles braces inside the task string', () => {
  // lastIndexOf("}")가 객체 닫는 중괄호를 정확히 잡는지 / lastIndexOf("}") must land on the closing brace
  const text = '{"tasks":[{"agent":"coder","task":"fix {bug} in {module}"}]}';
  const tasks = parsePlan(text);
  assert.ok(Array.isArray(tasks));
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].task, 'fix {bug} in {module}');
});

test('parsePlan: 언어 표기 없는 plain 코드펜스도 제거 / strips plain (no-language) code fences', () => {
  const text = '```\n{"tasks":[{"agent":"writer","task":"draft"}]}\n```';
  const tasks = parsePlan(text);
  assert.ok(tasks);
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].agent, 'writer');
});

test('parsePlan: JSON 앞뒤 산문이 있어도 추출 / extracts JSON surrounded by prose', () => {
  const text = '네, 계획은 다음과 같습니다: {"tasks":[{"agent":"researcher","task":"조사"}]} 이상입니다.';
  const tasks = parsePlan(text);
  assert.ok(tasks);
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].agent, 'researcher');
});
