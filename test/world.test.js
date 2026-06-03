'use strict';

// 월드 구역 회귀 테스트 — 모든 구역이 (1)렌더 시 예외 없음 (2)도착 지점에서 게이트·이벤트·표지판에 도달 가능
// World-zone regression tests — every zone (1) renders without throwing and
// (2) keeps gates, events and signs reachable from the arrival tile.
//
// 브라우저 없이 public/sprites.js·world.js를 stub 컨텍스트에서 평가한다(무의존성).
// Evaluates public/sprites.js & world.js in a stubbed context, no dependencies.
//   실행 / run:  npm test

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUB = path.join(__dirname, '..', 'public');
const WALL = 1; // world.js의 충돌 코드와 동일 / mirrors world.js collision code

// 그리기 호출을 모두 무시하는 캔버스 컨텍스트 stub / a no-op canvas context stub
function makeCtx() {
  const noop = () => {};
  const base = { measureText: () => ({ width: 10 }) };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : noop), set: () => true });
}

// sprites.js·world.js를 평가한 컨텍스트를 만든다 / build a context with the two scripts evaluated
function loadWorld() {
  const noop = () => {};
  const win = {
    devicePixelRatio: 1, innerWidth: 960, innerHeight: 640,
    addEventListener: noop, requestAnimationFrame: noop, performance: { now: () => 0 },
    // world.js의 drawBuildingLabels가 참조 / referenced by drawBuildingLabels
    Player: { state: { x: 0, y: 0 } }
  };
  const documentStub = {
    getElementById: () => ({ style: {}, getContext: () => makeCtx() }),
    createElement: () => ({ style: {}, setAttribute: noop, addEventListener: noop, focus: noop, blur: noop, value: '' }),
    body: { appendChild: noop }
  };
  const sandbox = {
    window: win, document: documentStub, Math, JSON, console,
    setTimeout: () => 0, clearTimeout: noop, Int32Array, Uint8Array
  };
  vm.createContext(sandbox);
  for (const f of ['sprites.js', 'world.js']) {
    vm.runInContext(fs.readFileSync(path.join(PUB, f), 'utf8'), sandbox, { filename: f });
  }
  return win.World;
}

// 도착 지점에서 보행 가능 칸 BFS / BFS over walkable tiles from the arrival
function reachableSet(World, sx, sy) {
  const seen = new Set([sx + ',' + sy]);
  const q = [[sx, sy]];
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      const k = nx + ',' + ny;
      if (seen.has(k) || World.collisionAt(nx, ny) === WALL) {
        continue;
      }
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}

// 이벤트/표지판 타일은 통과 불가(WALL)이므로 인접 보행칸 중 하나라도 도달이면 상호작용 가능
// event/sign tiles are solid, so "a reachable orthogonal neighbor" means interactable
function neighborReachable(reach, tx, ty) {
  return [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => reach.has((tx + dx) + ',' + (ty + dy)));
}

// 각 구역의 실제 도착 타일 / actual arrival tile for each zone
const ARRIVALS = {
  village: [20, 22],
  workshop: [20, 24],
  forest: [20, 24],
  beach: [20, 24],
  snowfield: [20, 24],
  cave: [20, 24]
};

const World = loadWorld();
const ctx = makeCtx();
const camera = { x: 0, y: 0 };

for (const zone of Object.keys(ARRIVALS)) {
  test('zone ' + zone + ': 렌더 예외 없음 / renders without throwing', () => {
    World.loadZone(zone);
    assert.doesNotThrow(() => {
      World.drawGround(ctx, camera);
      World.drawFlatObjects(ctx, camera);
      for (const d of World.getYSortables(camera)) {
        d.draw(ctx);
      }
      World.drawBuildingLabels(ctx, camera);
    });
  });

  test('zone ' + zone + ': 게이트·이벤트·표지판 도달 가능 / gates, events, signs reachable', () => {
    World.loadZone(zone);
    const [ax, ay] = ARRIVALS[zone];
    const reach = reachableSet(World, ax, ay);

    for (const g of World.gates) {
      assert.ok(reach.has(g.tx + ',' + g.ty), zone + ' 게이트 도달 불가 / unreachable gate at (' + g.tx + ',' + g.ty + ')');
    }
    for (const o of World.objects) {
      if (o.type === 'event' || o.type === 'sign' || o.type === 'bulletin') {
        assert.ok(
          neighborReachable(reach, o.tx, o.ty),
          zone + ' ' + o.type + ' "' + (o.name || '') + '" 상호작용 불가 / not interactable at (' + o.tx + ',' + o.ty + ')'
        );
      }
    }
  });
}

test('cave: 좁은 통로 구조(보행칸이 열린 벌판보다 훨씬 적음) / cave is a tight maze, not an open field', () => {
  World.loadZone('cave');
  const reach = reachableSet(World, 20, 24);
  // 동굴은 바위벽을 깎아낸 좁은 통로라 보행칸이 적다(열린 구역은 800칸+).
  // the cave is carved corridors, so walkable count stays small (open zones exceed 800).
  assert.ok(reach.size < 400, '동굴 보행칸이 예상보다 많음 / cave walkable area too large: ' + reach.size);
  assert.ok(reach.size > 80, '동굴 보행칸이 너무 적음(연결 끊김 의심) / cave walkable area too small: ' + reach.size);
});
