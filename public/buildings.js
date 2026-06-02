'use strict';

// 건물 입장/퇴장 감지 및 씬 전환 헬퍼
// Building enter/exit detection and scene transition helpers

(function () {
  // 플레이어가 들어갈 수 있는 건물을 찾는다(서 있는 칸 또는 정면 칸의 문).
  // Find an enterable building (door on the tile the player stands on or faces).
  // 없으면 null / returns null if none
  function getEnterable() {
    const p = window.Player.state;
    const center = { x: p.x + 8, y: p.y + 8 };

    // 1) 현재 서 있는 칸의 문 / door on the current tile
    let building = window.World.doorAtPx(center.x, center.y);
    if (building) {
      return building;
    }

    // 2) 정면 칸의 문 / door on the tile in front
    const front = window.Player.getFrontPx();
    building = window.World.doorAtPx(front.x, front.y);
    return building;
  }

  window.Buildings = {
    getEnterable
  };
})();
