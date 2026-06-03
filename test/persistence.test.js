'use strict';

// agents.js 데이터 파일 손상 회복력(H1) 회귀 테스트 (Node 내장 러너, 무의존성)
// Regression tests for data-file corruption resilience (H1) in agents.js (built-in runner, no deps)
//   실행 / run:  npm test   (== node --test)
//
// 주의: os.tmpdir()의 임시 파일만 사용 — 실제 custom-agents.json/teams.json은 건드리지 않는다.
// Note: only temp files under os.tmpdir() are touched — the real data files are never modified.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readJsonSafe, writeJsonSafe } = require('../agents');

// 매 케이스마다 고유 임시 경로 생성 / a unique temp path per case
function tmpFile(label) {
  return path.join(os.tmpdir(), 'av-persist-' + label + '-' + process.pid + '-' + Date.now() + '.json');
}

// 테스트가 남긴 파일/백업/격리본 정리 / clean up files, backups and quarantined copies left by a test
function cleanup(file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  for (const name of fs.readdirSync(dir)) {
    if (name === base || name === base + '.bak' || name.startsWith(base + '.corrupt-')) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch (err) {
        // 정리 실패는 무시(테스트 본질 아님) / ignore cleanup failures (not the test's concern)
      }
    }
  }
}

test('readJsonSafe: 없는 파일은 null / missing file returns null', () => {
  const file = tmpFile('missing');
  cleanup(file);
  assert.strictEqual(readJsonSafe(file), null);
});

test('writeJsonSafe→readJsonSafe: 정상 왕복 / round-trips good data', () => {
  const file = tmpFile('roundtrip');
  cleanup(file);
  const data = { agents: { a1: { id: 'a1', name: '테스터' } } };
  writeJsonSafe(file, data);
  assert.deepStrictEqual(readJsonSafe(file), data);
  cleanup(file);
});

test('writeJsonSafe: 두 번째 저장 시 직전 정상본을 .bak으로 보존 / keeps previous good copy as .bak', () => {
  const file = tmpFile('backup');
  cleanup(file);
  writeJsonSafe(file, { v: 1 });
  writeJsonSafe(file, { v: 2 });
  assert.deepStrictEqual(readJsonSafe(file), { v: 2 });
  assert.ok(fs.existsSync(file + '.bak'), '.bak 백업이 존재해야 함 / backup should exist');
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')), { v: 1 });
  cleanup(file);
});

test('readJsonSafe: 손상 시 .bak에서 복구 + 손상본 격리 / restores from .bak and quarantines the bad file', () => {
  const file = tmpFile('recover');
  cleanup(file);
  writeJsonSafe(file, { v: 1 });          // 첫 저장 / first save
  writeJsonSafe(file, { v: 2 });          // .bak = {v:1} 생성 / makes .bak = {v:1}
  fs.writeFileSync(file, '{ broken json', 'utf8'); // 본 파일 손상 / corrupt the main file

  const restored = readJsonSafe(file);
  assert.deepStrictEqual(restored, { v: 1 }, '백업 내용으로 복구되어야 함 / should restore backup content');
  // 본 파일이 백업 내용으로 복원됨 / main file restored to backup content
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { v: 1 });
  // 손상 원본이 .corrupt-* 로 보존됨(삭제 아님) / corrupted original preserved as .corrupt-* (not deleted)
  const quarantined = fs.readdirSync(path.dirname(file))
    .filter((n) => n.startsWith(path.basename(file) + '.corrupt-'));
  assert.strictEqual(quarantined.length, 1, '손상본 1개가 격리되어야 함 / exactly one quarantined copy');
  cleanup(file);
});

test('readJsonSafe: 백업 없이 손상이면 null + 손상본 격리 / no backup → null and quarantine', () => {
  const file = tmpFile('unrecoverable');
  cleanup(file);
  fs.writeFileSync(file, 'totally not json', 'utf8'); // 백업 없는 손상 / corrupt with no backup

  assert.strictEqual(readJsonSafe(file), null);
  // 손상본은 격리되고 원래 경로엔 파일이 없어야 함 / original quarantined, no file at the path
  assert.ok(!fs.existsSync(file), '손상 원본은 격리(이동)되어 경로에서 사라져야 함 / original moved away');
  const quarantined = fs.readdirSync(path.dirname(file))
    .filter((n) => n.startsWith(path.basename(file) + '.corrupt-'));
  assert.strictEqual(quarantined.length, 1);
  cleanup(file);
});
