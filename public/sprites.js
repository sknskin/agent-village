'use strict';

// 모든 스프라이트를 Canvas 2D API로 직접 그린다 (외부 이미지 없음).
// All sprites are drawn directly with the Canvas 2D API (no external images).

// === 공용 설정 / Shared config (첫 로드 스크립트에서 정의) ===
window.CONFIG = {
  TILE: 16, // 논리 타일 크기 / logical tile size
  LOGICAL_W: 480, // 논리 해상도 가로 / logical width
  LOGICAL_H: 320, // 논리 해상도 세로 / logical height
  SCALE: 2 // CSS 스케일 배수 / CSS scale factor
};

// 클라이언트용 에이전트 메타데이터(이름/색상/인사말) / client-side agent metadata
window.AGENT_META = {
  coder: {
    name: '코더', color: '#81C784',
    greetings: ['어이! 코딩 오두막에 온 걸 환영해. 뭘 만들어볼까?', '키보드는 따뜻하게 데워놨어. 작업 말해봐!']
  },
  researcher: {
    name: '리서처', color: '#64B5F6',
    greetings: ['리서치 카페에 어서 와. 뭐가 궁금해?', '커피 한 잔 하면서 알아봐줄게. 질문은?']
  },
  writer: {
    name: '작가', color: '#FFB74D',
    greetings: ['작가의 집이야. 어떤 글이 필요해?', '펜을 들 준비가 됐어. 무엇을 써줄까?']
  },
  editor: {
    name: '편집자', color: '#BA68C8',
    greetings: ['편집자야. 다듬을 글을 보여줘.', '군더더기는 내가 잘라줄게.']
  },
  analyst: {
    name: '분석가', color: '#4DD0E1',
    greetings: ['분석 연구소야. 어떤 데이터를 볼까?', '숫자와 패턴이라면 나한테 맡겨.']
  },
  visualizer: {
    name: '시각화 전문가', color: '#F06292',
    greetings: ['시각화 전문가야. 뭘 그림으로 만들까?', '복잡한 건 보기 쉽게 바꿔줄게.']
  },
  orchestrator: {
    name: '오케스트레이터', color: '#FFD54F',
    greetings: ['성에 온 걸 환영하네. 복잡한 일은 우리 팀이 처리하지.', '큰 작업일수록 좋아. 무엇을 맡기겠나?']
  },
  // 신규 맵 이벤트 에이전트 / new-map event agents
  forest_spirit: {
    name: '정령 나무', color: '#66BB6A',
    greetings: ['바람결에 너의 발소리가 들렸다, 여행자여... 무엇이 궁금하냐?', '나는 이 숲의 오래된 정령. 무엇이든 물어보거라.']
  },
  message_bottle: { name: '유리병 편지', color: '#4FC3F7' },
  snow_friend: {
    name: '말하는 눈사람', color: '#B3E5FC',
    greetings: ['안녕! 난 눈사람이야 ⛄ 같이 얘기할래?', '으하하, 반가워! 오늘은 눈이 참 보송보송하지?']
  },
  crystal_oracle: {
    name: '수정 오라클', color: '#80DEEA',
    greetings: ['수정이 너의 그림자를 비추는구나... 무엇을 묻고 싶은가?', '깊은 곳의 빛이 깨어났다... 너의 물음을 들려다오.']
  },
  // 캐릭터 NPC / character NPCs
  village_elder: { name: '촌장', color: '#BCAAA4', greetings: ['허허, 잘 왔네 젊은이. 마을은 둘러봤는가?', '오늘도 좋은 날이군. 무엇이 궁금한가?'] },
  village_kid: { name: '꼬마', color: '#FFD54F', greetings: ['형아 누나! 같이 놀자!', '헤헤, 뭐하고 있어?'] },
  village_merchant: { name: '상인', color: '#A1887F', greetings: ['어이쿠 손님! 구경하고 가쇼!', '좋은 소식 하나 들려줄까?'] },
  stray_cat: { name: '길고양이', color: '#90A4AE', greetings: ['야옹... 뭘 봐?', '냐... 간식 있어?'] },
  forest_herbalist: { name: '약초꾼', color: '#81C784', greetings: ['숲에 온 걸 환영해요. 약초 찾으러 왔수?', '이 근처 약초라면 내가 빠삭하지.'] },
  beach_fisherman: { name: '어부', color: '#4FC3F7', greetings: ['어이! 오늘 파도가 좋구먼.', '바다 구경 왔는가? 허허.'] },
  snow_penguin: { name: '펭귄', color: '#B0BEC5', greetings: ['뒤뚱뒤뚱~ 안녕!', '꽥! 추운데 잘 왔어!'] },
  cave_miner: { name: '광부', color: '#8D6E63', greetings: ['음... 동굴은 위험하니 조심하게.', '여기까지 왔구먼. 무슨 일인가?'] },
  // 추가 NPC/이벤트 / more NPCs & events
  bard: { name: '음유시인', color: '#CE93D8', greetings: ['♪ 어서 오시오, 나그네여~', '한 곡 들려드릴까요?'] },
  woodcutter: { name: '나무꾼', color: '#A1887F', greetings: ['어이, 숲에는 무슨 일로?', '말해보슈.'] },
  surfer: { name: '서퍼', color: '#4DD0E1', greetings: ['요! 파도 끝내주지 않냐?', '안녕~ 서핑 배우러 왔어?'] },
  treasure_hunter: { name: '보물사냥꾼', color: '#FFB300', greetings: ['쉿! 보물이 있을지도 몰라!', '모험을 찾아왔나?'] },
  village_dog: { name: '강아지', color: '#D7CCC8', greetings: ['멍멍! 반가워!', '왈! 같이 놀자!'] },
  snow_rabbit: { name: '눈토끼', color: '#ECEFF1', greetings: ['깡총! 안녕!', '폭신폭신 눈이 좋아~'] },
  fairy_mushroom: { name: '요정 버섯', color: '#BA68C8', greetings: ['히힛, 날 밟지 마! 무엇이 궁금해?', '반짝— 요정 버섯이야. 물어봐!'] }
};

(function () {
  const TILE = window.CONFIG.TILE;

  // 채워진 사각형 픽셀 / a filled pixel rect
  function px(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  }

  // === 타일 색상 팔레트 / Tile color palettes ===
  const TILE_COLORS = {
    grass: ['#7CB342', '#8BC34A'],
    path: ['#C9B18B', '#BBA079'],
    water: ['#4FA8D8', '#3D96C6'],
    flowers: '#8BC34A',
    sand: ['#E8D6A0', '#DEC992'],
    dirt: ['#A98467', '#977669'], // 흙길(숲) / dirt path (forest)
    snow: ['#ECEFF1', '#CFD8DC'], // 눈(설원) / snow
    ice: ['#B3E5FC', '#81D4FA'], // 얼음(설원) / ice
    deep_water: ['#1565C0', '#0D47A1'], // 깊은 물(해변) / deep water
    cave_floor: ['#455A64', '#37474F'], // 동굴 바닥 / cave floor
    cave_wall: ['#2B383F', '#1C262B'] // 동굴 바위벽(통과 불가, 어두움) / cave rock wall (solid, dark)
  };

  // 물결 무늬(시간에 따라 두 위상 교차로 찰랑임) / animated ripples (two phases alternate over time)
  function drawRipples(ctx, sx, sy, t, c1, c2) {
    const ph = Math.floor((t || 0) / 30) % 2; // 약 0.5초 주기 / ~0.5s period
    if (ph === 0) {
      px(ctx, sx + 2, sy + 5, 5, 1, c1);
      px(ctx, sx + 9, sy + 11, 4, 1, c1);
      px(ctx, sx + 6, sy + 8, 3, 1, c2);
      px(ctx, sx + 1, sy + 13, 3, 1, c1);
    } else {
      px(ctx, sx + 4, sy + 6, 5, 1, c1);
      px(ctx, sx + 7, sy + 12, 4, 1, c1);
      px(ctx, sx + 3, sy + 9, 3, 1, c2);
      px(ctx, sx + 10, sy + 4, 3, 1, c1);
    }
  }

  // 타일 그리기 / draw a single ground tile
  // t: 애니메이션 틱(물/얼음 찰랑임용, 없으면 정지) / animation tick for water/ice shimmer (omitted = static)
  function drawTile(ctx, type, sx, sy, t) {
    switch (type) {
      case 'grass': {
        px(ctx, sx, sy, TILE, TILE, TILE_COLORS.grass[0]);
        // 풀 점 무늬 / grass speckles
        px(ctx, sx + 3, sy + 4, 2, 2, TILE_COLORS.grass[1]);
        px(ctx, sx + 9, sy + 10, 2, 2, TILE_COLORS.grass[1]);
        // 풀 결(세로 잎) / grass blades
        px(ctx, sx + 12, sy + 5, 1, 3, '#689F38');
        px(ctx, sx + 5, sy + 12, 1, 3, '#689F38');
        px(ctx, sx + 1, sy + 8, 1, 2, '#9CCC65');
        break;
      }
      case 'path': {
        px(ctx, sx, sy, TILE, TILE, TILE_COLORS.path[0]);
        // 가장자리 음영(도로 느낌) / edge shading for a road look
        px(ctx, sx, sy + TILE - 2, TILE, 2, '#A89376');
        px(ctx, sx, sy, TILE, 1, '#D8C7A6');
        // 자갈 / scattered pebbles
        px(ctx, sx + 3, sy + 6, 2, 2, TILE_COLORS.path[1]);
        px(ctx, sx + 10, sy + 3, 2, 2, TILE_COLORS.path[1]);
        px(ctx, sx + 7, sy + 11, 1, 1, '#A89376');
        px(ctx, sx + 12, sy + 9, 1, 1, '#D8C7A6');
        break;
      }
      case 'water': {
        px(ctx, sx, sy, TILE, TILE, TILE_COLORS.water[0]);
        // 잔물결(애니메이션) / animated ripples
        drawRipples(ctx, sx, sy, t, TILE_COLORS.water[1], '#81D4FA');
        break;
      }
      case 'flowers': {
        drawTile(ctx, 'grass', sx, sy);
        px(ctx, sx + 3, sy + 3, 2, 2, '#E91E63');
        px(ctx, sx + 10, sy + 5, 2, 2, '#FFEB3B');
        px(ctx, sx + 6, sy + 10, 2, 2, '#FF5722');
        px(ctx, sx + 11, sy + 11, 2, 2, '#9C27B0');
        break;
      }
      case 'sand': {
        px(ctx, sx, sy, TILE, TILE, TILE_COLORS.sand[0]);
        px(ctx, sx + 4, sy + 7, 2, 1, TILE_COLORS.sand[1]);
        px(ctx, sx + 10, sy + 11, 1, 1, TILE_COLORS.sand[1]);
        break;
      }
      case 'dirt': {
        px(ctx, sx, sy, TILE, TILE, TILE_COLORS.dirt[0]);
        px(ctx, sx + 3, sy + 5, 3, 2, TILE_COLORS.dirt[1]);
        px(ctx, sx + 9, sy + 10, 3, 2, TILE_COLORS.dirt[1]);
        px(ctx, sx + 11, sy + 3, 1, 1, '#7B5E48');
        break;
      }
      case 'snow': {
        px(ctx, sx, sy, TILE, TILE, TILE_COLORS.snow[0]);
        px(ctx, sx + 3, sy + 4, 2, 2, '#FFFFFF');
        px(ctx, sx + 10, sy + 9, 2, 2, '#FFFFFF');
        px(ctx, sx + 6, sy + 12, 1, 1, TILE_COLORS.snow[1]);
        break;
      }
      case 'ice': {
        px(ctx, sx, sy, TILE, TILE, TILE_COLORS.ice[0]);
        // 갈라진 결 / cracks & sheen
        px(ctx, sx + 2, sy + 3, 6, 1, '#E1F5FE');
        px(ctx, sx + 8, sy + 9, 5, 1, TILE_COLORS.ice[1]);
        px(ctx, sx + 4, sy + 11, 3, 1, '#E1F5FE');
        // 미끄러지는 반짝임 / a glint that slides across
        const gx = Math.floor((t || 0) / 10) % (TILE - 2);
        px(ctx, sx + 1 + gx, sy + 2, 1, 1, '#FFFFFF');
        break;
      }
      case 'deep_water': {
        px(ctx, sx, sy, TILE, TILE, TILE_COLORS.deep_water[0]);
        // 깊은 물 잔물결(애니메이션) / animated deep-water ripples
        drawRipples(ctx, sx, sy, t, TILE_COLORS.deep_water[1], '#1976D2');
        break;
      }
      case 'cave_floor': {
        px(ctx, sx, sy, TILE, TILE, TILE_COLORS.cave_floor[0]);
        px(ctx, sx + 4, sy + 6, 3, 2, TILE_COLORS.cave_floor[1]);
        px(ctx, sx + 10, sy + 11, 2, 2, '#263238');
        px(ctx, sx + 2, sy + 12, 1, 1, '#546E7A');
        break;
      }
      case 'cave_wall': {
        // 거친 바위벽 — 어두운 바탕 + 균열/돌결 / rough rock wall: dark base + cracks & facets
        px(ctx, sx, sy, TILE, TILE, TILE_COLORS.cave_wall[0]);
        px(ctx, sx, sy, TILE, 2, '#3A4A52'); // 상단 하이라이트 / top facet highlight
        px(ctx, sx + 2, sy + 4, 4, 3, TILE_COLORS.cave_wall[1]); // 음영 덩어리 / shadow chunk
        px(ctx, sx + 9, sy + 8, 4, 4, TILE_COLORS.cave_wall[1]);
        px(ctx, sx + 6, sy + 2, 1, 6, '#10171B'); // 균열 / crack
        px(ctx, sx + 11, sy + 3, 1, 1, '#546E7A'); // 광물 반짝 / mineral fleck
        break;
      }
      default: {
        // 미지정 타일은 잔디로 / unknown tiles fall back to grass
        drawTile(ctx, 'grass', sx, sy);
        break;
      }
    }
  }

  // === 오브젝트 / Decorative objects ===

  // 나무 (충돌 있음) / a tree (collidable)
  function drawTree(ctx, sx, sy) {
    // 줄기 / trunk
    px(ctx, sx + 6, sy + 14, 4, 6, '#6D4C41');
    px(ctx, sx + 6, sy + 14, 1, 6, '#8D6E63'); // 줄기 하이라이트 / trunk highlight
    // 잎 덩어리 / foliage
    px(ctx, sx + 2, sy + 2, 12, 12, '#2E7D32');
    px(ctx, sx + 4, sy, 8, 6, '#388E3C');
    px(ctx, sx + 4, sy + 4, 3, 3, '#43A047');
    px(ctx, sx + 6, sy + 2, 2, 2, '#66BB6A'); // 잎 하이라이트 / leaf highlight
    px(ctx, sx + 9, sy + 8, 3, 3, '#1B5E20');
  }

  // 울타리 / fence segment
  function drawFence(ctx, sx, sy) {
    px(ctx, sx, sy + 6, TILE, 3, '#8D6E63');
    px(ctx, sx + 2, sy + 4, 3, 9, '#A1887F');
    px(ctx, sx + 11, sy + 4, 3, 9, '#A1887F');
  }

  // 분수 (2×2 타일) / fountain (occupies 2x2 tiles)
  function drawFountain(ctx, sx, sy) {
    const w = TILE * 2;
    // 돌 테두리 / stone basin
    px(ctx, sx, sy + 8, w, w - 8, '#90A4AE');
    px(ctx, sx + 3, sy + 11, w - 6, w - 16, '#4FA8D8');
    // 중앙 기둥과 물줄기 / center column and spout
    px(ctx, sx + w / 2 - 2, sy + 2, 4, 12, '#B0BEC5');
    px(ctx, sx + w / 2 - 1, sy, 2, 4, '#81D4FA');
    px(ctx, sx + 6, sy + 14, 3, 1, '#E1F5FE');
    px(ctx, sx + w - 9, sy + 16, 3, 1, '#E1F5FE');
  }

  // === 건물 / Buildings ===

  // 건물 타입별 지붕/벽 색 / roof and wall colors per building type
  const BUILDING_STYLE = {
    coding_hut: { roof: '#66BB6A', roofDark: '#43A047', wall: '#FFF3E0' },
    research_cafe: { roof: '#42A5F5', roofDark: '#1E88E5', wall: '#E3F2FD' },
    writers_house: { roof: '#FFA726', roofDark: '#FB8C00', wall: '#FFF8E1' },
    analysis_lab: { roof: '#26C6DA', roofDark: '#00ACC1', wall: '#E0F7FA' },
    orchestrator_castle: { roof: '#FFCA28', roofDark: '#FFB300', wall: '#ECEFF1' },
    agent_workshop: { roof: '#7E57C2', roofDark: '#5E35B1', wall: '#EDE7F6' }
  };

  // 창문(틀 + 유리 + 십자 살) / a window with frame, glass and crossbars
  function drawWindow(ctx, x, y) {
    px(ctx, x - 1, y - 1, 8, 8, '#5D4037'); // 틀 / frame
    px(ctx, x, y, 6, 6, '#90CAF9'); // 유리 / glass
    px(ctx, x, y, 6, 1, '#E3F2FD'); // 상단 하이라이트 / top highlight
    px(ctx, x + 2, y, 1, 6, '#5D4037'); // 세로 살 / vertical mullion
    px(ctx, x, y + 2, 6, 1, '#5D4037'); // 가로 살 / horizontal mullion
  }

  // 건물 그리기 (타일 단위 크기) / draw a building sized in tiles
  // anchorX/anchorY = 좌상단 스크린 좌표 / top-left screen coords
  function drawBuilding(ctx, type, sx, sy, wTiles, hTiles) {
    const style = BUILDING_STYLE[type] || BUILDING_STYLE.coding_hut;
    const w = wTiles * TILE;
    const h = hTiles * TILE;
    const roofH = Math.floor(h * 0.45);

    // 벽 / wall body
    px(ctx, sx, sy + roofH, w, h - roofH, style.wall);
    px(ctx, sx, sy + roofH, w, 2, style.roofDark); // 처마 그림자 / eave shadow
    // 벽 하단 베이스보드 음영 / baseboard shadow at the wall base
    px(ctx, sx, sy + h - 3, w, 3, 'rgba(0,0,0,0.12)');
    // 좌측 모서리 음영 / left corner shading
    px(ctx, sx, sy + roofH, 1, h - roofH, 'rgba(0,0,0,0.10)');

    // 창문(틀+십자살) / framed windows
    const winY = sy + roofH + 6;
    drawWindow(ctx, sx + 5, winY);
    drawWindow(ctx, sx + w - 11, winY);

    // 문 — 입장 트리거 타일(placeBuilding의 doorTx = tx + floor(wTiles/2))의 "중심"에 가로 정렬.
    // 짝수폭 건물에서 기존엔 건물 기하학적 중심(타일 경계)에 그려져 트리거 타일과 8px 어긋났음.
    // Align the door horizontally to the CENTER of the entrance trigger tile
    // (placeBuilding uses doorTx = tx + floor(wTiles/2)); fixes the half-tile offset on even-width buildings.
    const doorW = 8;
    const doorH = 12;
    const doorTileIndex = Math.floor(wTiles / 2); // 건물 좌단 기준 트리거 타일 인덱스 / trigger tile index from building left
    const doorCenterX = sx + doorTileIndex * TILE + TILE / 2; // 트리거 타일 중심 x / trigger tile center x
    const doorX = doorCenterX - doorW / 2;
    const doorY = sy + h - doorH;
    // 문틀 / door frame
    px(ctx, doorX - 1, doorY - 1, doorW + 2, doorH + 1, '#4E342E');
    // 문 본체(정렬 식별 기준: 색 '#6D4C41', 너비 8 유지) / door body (keep color & width for alignment)
    px(ctx, doorX, doorY, doorW, doorH, '#6D4C41');
    px(ctx, doorX + 1, doorY + 1, doorW - 2, doorH - 1, '#5D4037');
    px(ctx, doorX + doorW - 3, doorY + doorH / 2, 1, 2, '#FFD54F'); // 손잡이 / knob
    // 문 앞 발판 / doormat
    px(ctx, doorX - 2, doorY + doorH - 1, doorW + 4, 2, '#8D6E63');

    // 지붕(슁글 줄무늬) / roof with shingle stripes
    px(ctx, sx - 2, sy + roofH - 3, w + 4, 4, style.roofDark); // 처마 / eave
    for (let r = 0; r < roofH; r++) {
      const inset = Math.floor((roofH - r) * (w / 2) / roofH * 0.25);
      const shingle = (r % 3 === 0) ? style.roofDark : style.roof; // 3줄마다 어두운 슁글 / darker shingle line every 3rd row
      px(ctx, sx + inset, sy + r, w - inset * 2, 1, r < 2 ? style.roofDark : shingle);
    }
    // 용마루 하이라이트 / ridge highlight
    px(ctx, sx + Math.floor(w / 2) - 6, sy + 1, 12, 1, 'rgba(255,255,255,0.45)');

    // 굴뚝(성 제외) / chimney (non-castle)
    if (type !== 'orchestrator_castle') {
      const chimX = sx + w - 13;
      px(ctx, chimX, sy - 3, 4, roofH + 3, '#8D6E63');
      px(ctx, chimX - 1, sy - 4, 6, 2, '#6D4C41');
    }

    // 성은 깃발 추가 / castle gets a flag
    if (type === 'orchestrator_castle') {
      px(ctx, sx + w / 2 - 1, sy - 8, 2, 9, '#8D6E63');
      px(ctx, sx + w / 2 + 1, sy - 8, 6, 4, '#E53935');
    }
  }

  // === 캐릭터 / Characters ===

  // 방향별 인덱스 / direction indices
  // 'down' | 'up' | 'left' | 'right'

  // 플레이어 그리기 / draw the player character
  // frame: 걷기 애니메이션 프레임(0~3) / walk animation frame
  function drawPlayer(ctx, sx, sy, direction, frame) {
    const bodyColor = '#E53935';
    const skin = '#FFCC80';
    const hair = '#5D4037';
    const pants = '#1565C0';
    const pantsDark = '#0D47A1'; // 뒷다리용 어두운 톤 / darker tone for the back leg

    // 걷기 스윙 값(프레임별) / walk swing per frame
    const swing = (frame === 1) ? 2 : (frame === 3 ? -2 : 0);

    // 다리 — 방향에 따라 움직임이 달라짐 / legs animate per facing direction
    if (direction === 'left' || direction === 'right') {
      // 좌우 이동: 앞다리/뒷다리가 진행 방향으로 앞뒤 교차 / side walk: front & back legs stride
      const dir = (direction === 'right') ? 1 : -1;
      // 뒷다리(어둡게, 진행 반대쪽) / back leg (darker, trailing)
      px(ctx, sx + 6 - dir * swing, sy + 12, 3, 4, pantsDark);
      // 앞다리(진행 방향으로) / front leg (leading)
      px(ctx, sx + 7 + dir * swing, sy + 12, 3, 4, pants);
    } else {
      // 상/하 이동: 두 다리가 번갈아 내딛음 / up-down walk: legs alternate stride
      px(ctx, sx + 4, sy + 12, 3, 4 + swing, pants);
      px(ctx, sx + 9, sy + 12, 3, 4 - swing, pants);
    }
    // 몸 / body
    px(ctx, sx + 3, sy + 7, 10, 6, bodyColor);
    // 머리 / head
    px(ctx, sx + 4, sy + 1, 8, 7, skin);
    // 머리카락 / hair
    px(ctx, sx + 3, sy, 10, 3, hair);
    px(ctx, sx + 3, sy + 1, 2, 3, hair);
    px(ctx, sx + 11, sy + 1, 2, 3, hair);

    // 방향별 눈 / eyes by direction
    if (direction === 'down') {
      px(ctx, sx + 6, sy + 4, 1, 2, '#000');
      px(ctx, sx + 9, sy + 4, 1, 2, '#000');
    } else if (direction === 'up') {
      px(ctx, sx + 5, sy, 6, 3, hair); // 뒤통수 / back of head
    } else if (direction === 'left') {
      px(ctx, sx + 5, sy + 4, 1, 2, '#000');
    } else if (direction === 'right') {
      px(ctx, sx + 10, sy + 4, 1, 2, '#000');
    }
  }

  // === NPC 에이전트 / NPC agents ===

  // 에이전트별 색상/특징 / per-agent palette and traits
  const NPC_STYLE = {
    coder: { body: '#81C784', hair: '#2E7D32', accent: '#1B5E20' },
    researcher: { body: '#64B5F6', hair: '#1565C0', accent: '#0D47A1' },
    writer: { body: '#FFB74D', hair: '#E65100', accent: '#BF360C' },
    editor: { body: '#BA68C8', hair: '#6A1B9A', accent: '#4A148C' },
    analyst: { body: '#4DD0E1', hair: '#00838F', accent: '#006064' },
    visualizer: { body: '#F06292', hair: '#AD1457', accent: '#880E4F' },
    orchestrator: { body: '#FFD54F', hair: '#F57F17', accent: '#E65100' }
  };

  // 이동 중 다리 좌우 스트라이드 값(세로 흔들림 아님) / horizontal leg stride while moving (not a vertical bob)
  // frame이 진행될 때 ±1px로만 번갈아 → 자연스러운 걸음, 과한 들썩임 없음
  // alternates ±1px as the frame advances → natural gait without bouncing
  function legStride(frame, moving) {
    return moving ? ((Math.floor(frame / 8) % 2 === 0) ? 1 : -1) : 0;
  }

  // NPC 그리기 / draw an NPC agent
  // status: 'idle' | 'working' | 'done', color: 커스텀/마스터용 색상 / color for custom/master NPCs
  // moving: 이동 중이면 다리 스트라이드 애니메이션(기본 false=정지) / animate legs when moving
  function drawNPC(ctx, agentId, sx, sy, frame, status, color, moving) {
    // 빌트인은 고유 팔레트, 그 외엔 전달된 색으로 팔레트 구성
    // built-ins use their palette; otherwise derive one from the given color
    const style = NPC_STYLE[agentId] || { body: color || '#90A4AE', hair: '#37474F', accent: '#263238' };
    const skin = '#FFE0B2';

    // 위아래 흔들림 없음(요청) / no vertical bob (per request)
    const y = sy;

    // 다리 — 이동 중에는 좌우로 번갈아 내딛음(세로 흔들림 없음) / legs stride horizontally when moving
    const sw = legStride(frame, moving);
    px(ctx, sx + 4 - sw, y + 12, 3, 4, style.accent);
    px(ctx, sx + 9 + sw, y + 12, 3, 4, style.accent);
    // 로브/몸 / robe body
    px(ctx, sx + 2, y + 6, 12, 8, style.body);
    px(ctx, sx + 2, y + 13, 12, 1, style.accent);
    // 머리 / head
    px(ctx, sx + 4, y + 1, 8, 7, skin);
    // 머리카락 / hair
    px(ctx, sx + 3, y, 10, 3, style.hair);
    // 눈 / eyes
    px(ctx, sx + 6, y + 4, 1, 2, '#000');
    px(ctx, sx + 9, y + 4, 1, 2, '#000');

    // 완료 시 머리 위 별 / star above head when done
    if (status === 'done') {
      drawStar(ctx, sx + 7, y - 4, '#FFEB3B');
    }
  }

  // 작은 별 / a small star
  function drawStar(ctx, cx, cy, color) {
    px(ctx, cx, cy - 2, 1, 5, color);
    px(ctx, cx - 2, cy, 5, 1, color);
    px(ctx, cx - 1, cy - 1, 3, 3, color);
  }

  // === 말풍선 / Speech bubble ===

  // 작업 중 스피너 말풍선 / a small "working" spinner bubble
  function drawWorkingBubble(ctx, sx, sy, frame) {
    const w = 18;
    const h = 12;
    px(ctx, sx, sy, w, h, '#FFFFFF');
    px(ctx, sx + 2, sy + h, 3, 3, '#FFFFFF'); // 꼬리 / tail
    // 점 3개 애니메이션 / animated 3 dots
    const active = Math.floor(frame / 8) % 3;
    for (let i = 0; i < 3; i++) {
      px(ctx, sx + 3 + i * 5, sy + 5, 2, 2, i === active ? '#333' : '#BBB');
    }
  }

  // 작은 파티클 별(완료 연출) / sparkle particle (completion effect)
  function drawSparkle(ctx, sx, sy, color) {
    drawStar(ctx, sx, sy, color);
  }

  // === 야외 지형지물 / outdoor props ===

  // 바위 / rock
  function drawRock(ctx, sx, sy) {
    px(ctx, sx + 3, sy + 7, 10, 7, '#9E9E9E');
    px(ctx, sx + 4, sy + 5, 7, 3, '#BDBDBD');
    px(ctx, sx + 5, sy + 9, 3, 2, '#757575');
  }

  // 덤불 / bush
  function drawBush(ctx, sx, sy) {
    px(ctx, sx + 2, sy + 6, 12, 8, '#388E3C');
    px(ctx, sx + 4, sy + 4, 8, 4, '#43A047');
    px(ctx, sx + 5, sy + 7, 2, 2, '#66BB6A');
    px(ctx, sx + 9, sy + 9, 2, 2, '#2E7D32');
  }

  // 가로등 / street lamp
  function drawLamp(ctx, sx, sy) {
    px(ctx, sx + 7, sy + 5, 2, 11, '#5D4037'); // 기둥 / post
    px(ctx, sx + 5, sy + 1, 6, 5, '#FFE082'); // 등 / light
    px(ctx, sx + 6, sy, 4, 2, '#FFF59D');
  }

  // 우물 / well
  function drawWell(ctx, sx, sy) {
    px(ctx, sx + 2, sy + 8, 12, 7, '#90A4AE'); // 돌 / stone
    px(ctx, sx + 4, sy + 10, 8, 4, '#37474F'); // 물구멍 / water hole
    px(ctx, sx + 3, sy + 2, 2, 7, '#6D4C41'); // 기둥 / posts
    px(ctx, sx + 11, sy + 2, 2, 7, '#6D4C41');
    px(ctx, sx + 1, sy, 14, 3, '#8D6E63'); // 지붕 / roof
  }

  // 표지판/게시판 / sign or bulletin board
  function drawSign(ctx, sx, sy) {
    px(ctx, sx + 7, sy + 10, 2, 6, '#6D4C41'); // 기둥 / post
    px(ctx, sx + 2, sy + 1, 12, 9, '#A1887F'); // 판 / board
    px(ctx, sx + 3, sy + 2, 10, 7, '#D7CCC8');
    px(ctx, sx + 4, sy + 3, 8, 1, '#8D6E63'); // 글자 줄 / text lines
    px(ctx, sx + 4, sy + 5, 6, 1, '#8D6E63');
    px(ctx, sx + 4, sy + 7, 7, 1, '#8D6E63');
  }

  // === 실내 가구 / indoor furniture ===

  // 러그(충돌 없음) / rug (decorative)
  function drawRug(ctx, x, y, w, h) {
    px(ctx, x, y, w, h, '#6D4C41');
    px(ctx, x + 3, y + 3, w - 6, h - 6, '#8D6E63');
    px(ctx, x + 6, y + 6, w - 12, h - 12, '#A1887F');
  }

  // 소파 / sofa (≈28px wide)
  function drawSofa(ctx, sx, sy) {
    px(ctx, sx, sy + 4, 28, 10, '#5C6BC0'); // 좌면 / base
    px(ctx, sx, sy, 28, 6, '#7986CB'); // 등받이 / back
    px(ctx, sx, sy + 4, 4, 10, '#3F51B5'); // 팔걸이 / arms
    px(ctx, sx + 24, sy + 4, 4, 10, '#3F51B5');
    px(ctx, sx + 5, sy + 6, 8, 5, '#9FA8DA'); // 쿠션 / cushions
    px(ctx, sx + 15, sy + 6, 8, 5, '#9FA8DA');
  }

  // 의자 / chair
  function drawChair(ctx, sx, sy) {
    px(ctx, sx + 3, sy + 6, 10, 8, '#8D6E63'); // 좌면 / seat
    px(ctx, sx + 3, sy, 10, 6, '#A1887F'); // 등받이 / back
    px(ctx, sx + 3, sy + 13, 2, 3, '#5D4037'); // 다리 / legs
    px(ctx, sx + 11, sy + 13, 2, 3, '#5D4037');
  }

  // 테이블 / table (≈20px wide)
  function drawTable(ctx, sx, sy) {
    px(ctx, sx + 1, sy + 5, 18, 5, '#8D6E63'); // 상판 / top
    px(ctx, sx + 1, sy + 5, 18, 2, '#A1887F');
    px(ctx, sx + 3, sy + 10, 2, 6, '#5D4037'); // 다리 / legs
    px(ctx, sx + 15, sy + 10, 2, 6, '#5D4037');
  }

  // 책장 / bookshelf (tall)
  function drawBookshelf(ctx, sx, sy) {
    px(ctx, sx, sy, 16, 24, '#5D4037');
    const cols = ['#E57373', '#64B5F6', '#81C784', '#FFB74D', '#BA68C8'];
    for (let r = 0; r < 3; r++) {
      const by = sy + 2 + r * 8;
      for (let i = 0; i < 6; i++) {
        px(ctx, sx + 2 + i * 2, by, 1, 6, cols[(i + r) % cols.length]);
      }
    }
  }

  // 화분 / potted plant
  function drawPlant(ctx, sx, sy) {
    px(ctx, sx + 5, sy + 11, 6, 5, '#8D6E63'); // 화분 / pot
    px(ctx, sx + 4, sy + 3, 8, 8, '#43A047'); // 잎 / leaves
    px(ctx, sx + 6, sy, 4, 5, '#66BB6A');
    px(ctx, sx + 7, sy + 5, 2, 6, '#2E7D32');
  }

  // === 테마 맵 지형지물 / themed-map props ===

  // 버섯(숲) / mushroom (forest)
  function drawMushroom(ctx, sx, sy) {
    px(ctx, sx + 6, sy + 10, 3, 5, '#EFEBE9'); // 줄기 / stem
    px(ctx, sx + 3, sy + 6, 9, 5, '#E53935'); // 갓 / cap
    px(ctx, sx + 5, sy + 7, 2, 2, '#FFFFFF'); // 점 / spots
    px(ctx, sx + 9, sy + 8, 1, 1, '#FFFFFF');
  }

  // 야자수(해변) / palm tree (beach)
  function drawPalm(ctx, sx, sy) {
    px(ctx, sx + 7, sy + 8, 2, 10, '#8D6E63'); // 줄기 / trunk
    px(ctx, sx + 6, sy + 12, 3, 2, '#6D4C41');
    px(ctx, sx + 2, sy + 4, 5, 2, '#43A047'); // 잎 / fronds
    px(ctx, sx + 9, sy + 4, 5, 2, '#43A047');
    px(ctx, sx + 4, sy + 2, 8, 2, '#388E3C');
    px(ctx, sx + 6, sy + 5, 4, 2, '#66BB6A');
    px(ctx, sx + 6, sy + 7, 2, 2, '#5D4037'); // 코코넛 / coconut
  }

  // 눈사람(설원) / snowman (snowfield)
  function drawSnowman(ctx, sx, sy) {
    px(ctx, sx + 4, sy + 9, 8, 7, '#FFFFFF'); // 몸통 / body
    px(ctx, sx + 5, sy + 2, 6, 6, '#FFFFFF'); // 머리 / head
    px(ctx, sx + 6, sy + 4, 1, 1, '#000000'); // 눈 / eyes
    px(ctx, sx + 9, sy + 4, 1, 1, '#000000');
    px(ctx, sx + 7, sy + 5, 2, 1, '#FF7043'); // 코 / carrot nose
    px(ctx, sx + 5, sy + 1, 6, 1, '#37474F'); // 모자 / hat brim
    px(ctx, sx + 6, sy - 1, 4, 2, '#37474F');
    px(ctx, sx + 7, sy + 10, 1, 1, '#000000'); // 단추 / buttons
    px(ctx, sx + 7, sy + 13, 1, 1, '#000000');
  }

  // 침엽수(설원/숲) / pine tree (snowfield/forest)
  function drawPineTree(ctx, sx, sy) {
    px(ctx, sx + 7, sy + 15, 2, 5, '#6D4C41'); // 줄기 / trunk
    px(ctx, sx + 3, sy + 11, 10, 4, '#2E7D32'); // 잎 / layered foliage
    px(ctx, sx + 4, sy + 7, 8, 4, '#388E3C');
    px(ctx, sx + 5, sy + 3, 6, 4, '#43A047');
    px(ctx, sx + 6, sy + 1, 4, 2, '#2E7D32');
    px(ctx, sx + 5, sy + 11, 6, 1, '#E8F5E9'); // 서리/눈 / frost caps
    px(ctx, sx + 6, sy + 7, 4, 1, '#E8F5E9');
  }

  // 크리스탈(동굴) / crystal (cave)
  function drawCrystal(ctx, sx, sy) {
    px(ctx, sx + 6, sy + 4, 4, 12, '#4DD0E1');
    px(ctx, sx + 7, sy + 2, 2, 14, '#80DEEA');
    px(ctx, sx + 6, sy + 4, 1, 12, '#26C6DA');
    px(ctx, sx + 3, sy + 9, 3, 7, '#4DD0E1');
    px(ctx, sx + 10, sy + 8, 3, 8, '#26C6DA');
  }

  // 석순(동굴) / stalagmite (cave)
  function drawStalagmite(ctx, sx, sy) {
    px(ctx, sx + 6, sy + 6, 4, 10, '#607D8B');
    px(ctx, sx + 7, sy + 3, 2, 13, '#78909C');
    px(ctx, sx + 6, sy + 6, 1, 10, '#455A64');
  }

  // 조개(해변, 평면) / shell (beach, flat)
  function drawShell(ctx, sx, sy) {
    px(ctx, sx + 5, sy + 8, 6, 5, '#FFCCBC');
    px(ctx, sx + 6, sy + 7, 4, 2, '#FFAB91');
    px(ctx, sx + 7, sy + 9, 1, 3, '#FF8A65');
    px(ctx, sx + 5, sy + 9, 1, 3, '#FF8A65');
    px(ctx, sx + 9, sy + 9, 1, 3, '#FF8A65');
  }

  // 나무 그루터기(숲, 충돌) / tree stump (forest, collidable)
  function drawStump(ctx, sx, sy) {
    px(ctx, sx + 4, sy + 10, 8, 5, '#6D4C41'); // 밑동 / base
    px(ctx, sx + 4, sy + 8, 8, 3, '#8D6E63'); // 윗면 / top surface
    px(ctx, sx + 6, sy + 9, 4, 1, '#A1887F'); // 나이테 / growth rings
    px(ctx, sx + 7, sy + 9, 1, 1, '#5D4037');
    px(ctx, sx + 3, sy + 13, 2, 2, '#5D4037'); // 뿌리 / roots
    px(ctx, sx + 11, sy + 13, 2, 2, '#5D4037');
  }

  // 유목(해변, 평면) / driftwood (beach, flat)
  function drawDriftwood(ctx, sx, sy) {
    px(ctx, sx + 1, sy + 9, 14, 3, '#A1887F'); // 통나무 / log
    px(ctx, sx + 1, sy + 9, 14, 1, '#C8B89E'); // 바랜 윗면 / bleached top
    px(ctx, sx + 4, sy + 10, 1, 1, '#8D6E63'); // 옹이 / knots
    px(ctx, sx + 10, sy + 10, 1, 1, '#8D6E63');
    px(ctx, sx + 14, sy + 8, 2, 2, '#B0A089'); // 부러진 가지 / broken branch
  }

  // 고드름/얼음 기둥(설원, 충돌) / icicle spikes (snowfield, collidable)
  function drawIcicle(ctx, sx, sy) {
    px(ctx, sx + 4, sy + 6, 3, 9, '#B3E5FC'); // 큰 기둥 / large spike
    px(ctx, sx + 5, sy + 6, 1, 11, '#E1F5FE'); // 하이라이트 / highlight
    px(ctx, sx + 9, sy + 8, 2, 6, '#81D4FA'); // 작은 기둥 / small spike
    px(ctx, sx + 4, sy + 5, 7, 2, '#E1F5FE'); // 윗쪽 눈/얼음 / icy cap
    px(ctx, sx + 5, sy + 14, 1, 1, '#FFFFFF'); // 끝 반짝 / tip sparkle
  }

  // 불가사리(해변, 평면) / starfish (beach, flat)
  function drawStarfish(ctx, sx, sy) {
    const c = '#FF8A65';
    px(ctx, sx + 7, sy + 7, 2, 7, c); // 세로 팔 / vertical arms
    px(ctx, sx + 4, sy + 10, 8, 2, c); // 가로 팔 / horizontal arms
    px(ctx, sx + 6, sy + 8, 4, 4, '#FF7043'); // 중심 / center
    px(ctx, sx + 7, sy + 9, 1, 1, '#FFCCBC'); // 점 / dot
    px(ctx, sx + 5, sy + 13, 1, 1, c); // 아래 팔 끝 / lower arm tips
    px(ctx, sx + 10, sy + 13, 1, 1, c);
  }

  // 등대(해변, 위로 솟음) / lighthouse (beach, draws upward)
  function drawLighthouse(ctx, sx, sy) {
    px(ctx, sx + 4, sy - 6, 8, 22, '#FAFAFA'); // 몸체 / tower
    px(ctx, sx + 4, sy - 2, 8, 3, '#E53935'); // 빨간 띠 / red bands
    px(ctx, sx + 4, sy + 6, 8, 3, '#E53935');
    px(ctx, sx + 3, sy - 10, 10, 4, '#455A64'); // 등실 / lantern room
    px(ctx, sx + 5, sy - 9, 6, 2, '#FFF59D'); // 빛 / light
    px(ctx, sx + 5, sy - 13, 6, 3, '#B71C1C'); // 지붕 / roof
  }

  // 정령 나무(숲 이벤트) / spirit tree (forest event)
  function drawSpiritTree(ctx, sx, sy) {
    px(ctx, sx + 6, sy + 15, 4, 5, '#5D4037'); // 줄기 / trunk
    px(ctx, sx + 1, sy + 3, 14, 13, '#2E7D32'); // 큰 잎 / large foliage
    px(ctx, sx + 3, sy + 1, 10, 5, '#388E3C');
    px(ctx, sx + 4, sy + 5, 3, 3, '#43A047');
    px(ctx, sx + 10, sy + 11, 2, 2, '#1B5E20');
    // 빛나는 눈 / glowing eyes
    px(ctx, sx + 5, sy + 9, 2, 2, '#FFEB3B');
    px(ctx, sx + 9, sy + 9, 2, 2, '#FFEB3B');
    px(ctx, sx + 5, sy + 9, 1, 1, '#FFF59D');
    px(ctx, sx + 9, sy + 9, 1, 1, '#FFF59D');
  }

  // 유리병 편지(해변 이벤트) / message bottle (beach event)
  function drawBottle(ctx, sx, sy) {
    px(ctx, sx + 6, sy + 5, 4, 3, '#6D4C41'); // 코르크 / cork
    px(ctx, sx + 5, sy + 8, 6, 8, '#A5D6A7'); // 유리 / glass body
    px(ctx, sx + 6, sy + 8, 2, 7, '#C8E6C9'); // 하이라이트 / highlight
    px(ctx, sx + 7, sy + 10, 3, 5, '#FFF9C4'); // 편지 / letter inside
  }

  // 길고양이 / stray cat
  function drawCat(ctx, sx, sy, frame, color, moving) {
    const c = color || '#90A4AE';
    const y = sy; // 위아래 흔들림 없음 / no vertical bob
    const sw = legStride(frame, moving); // 이동 중 다리 스트라이드 / leg stride while moving
    px(ctx, sx + 3, y + 9, 9, 5, c); // 몸 / body
    px(ctx, sx + 8, y + 6, 5, 5, c); // 머리 / head
    px(ctx, sx + 8, y + 4, 2, 2, c); // 귀 / ears
    px(ctx, sx + 11, y + 4, 2, 2, c);
    px(ctx, sx + 2, y + 7, 2, 5, c); // 꼬리 / tail
    px(ctx, sx + 9, y + 8, 1, 1, '#000000'); // 눈 / eyes
    px(ctx, sx + 11, y + 8, 1, 1, '#000000');
    px(ctx, sx + 4 - sw, y + 14, 2, 2, '#78909C'); // 다리 / legs
    px(ctx, sx + 9 + sw, y + 14, 2, 2, '#78909C');
  }

  // 펭귄 / penguin
  function drawPenguin(ctx, sx, sy, frame, moving) {
    const y = sy; // 위아래 흔들림 없음 / no vertical bob
    const sw = legStride(frame, moving); // 이동 중 발 스트라이드 / foot stride while moving
    px(ctx, sx + 4, y + 4, 8, 12, '#37474F'); // 몸 / body
    px(ctx, sx + 6, y + 7, 4, 8, '#ECEFF1'); // 배 / belly
    px(ctx, sx + 7, y + 6, 2, 2, '#FB8C00'); // 부리 / beak
    px(ctx, sx + 6, y + 5, 1, 1, '#000000'); // 눈 / eyes
    px(ctx, sx + 9, y + 5, 1, 1, '#000000');
    px(ctx, sx + 5 - sw, y + 16, 2, 1, '#FB8C00'); // 발 / feet
    px(ctx, sx + 9 + sw, y + 16, 2, 1, '#FB8C00');
  }

  // 강아지 / dog
  function drawDog(ctx, sx, sy, frame, color, moving) {
    const c = color || '#D7CCC8';
    const y = sy; // 위아래 흔들림 없음 / no vertical bob
    const sw = legStride(frame, moving); // 이동 중 다리 스트라이드 / leg stride while moving
    px(ctx, sx + 3, y + 9, 9, 4, c); // 몸 / body
    px(ctx, sx + 9, y + 6, 5, 5, c); // 머리 / head
    px(ctx, sx + 9, y + 4, 2, 3, c); // 귀 / ears
    px(ctx, sx + 13, y + 5, 2, 3, c);
    px(ctx, sx + 2, y + 8, 2, 2, c); // 꼬리 / tail
    px(ctx, sx + 11, y + 8, 1, 1, '#000000'); // 눈 / eyes
    px(ctx, sx + 13, y + 8, 1, 1, '#000000');
    px(ctx, sx + 12, y + 10, 2, 1, '#3E2723'); // 코 / nose
    px(ctx, sx + 4 - sw, y + 13, 2, 3, '#8D6E63'); // 다리 / legs
    px(ctx, sx + 9 + sw, y + 13, 2, 3, '#8D6E63');
  }

  // 눈토끼 / snow rabbit
  function drawRabbit(ctx, sx, sy, frame, color, moving) {
    const c = color || '#ECEFF1';
    const y = sy; // 위아래 흔들림 없음 / no vertical bob
    const sw = legStride(frame, moving); // 이동 중 발 스트라이드 / foot stride while moving
    px(ctx, sx + 5, y + 9, 6, 6, c); // 몸 / body
    px(ctx, sx + 6, y + 5, 5, 5, c); // 머리 / head
    px(ctx, sx + 6, y + 1, 2, 5, c); // 귀 / ears
    px(ctx, sx + 9, y + 1, 2, 5, c);
    px(ctx, sx + 7, y + 7, 1, 1, '#E57373'); // 눈(분홍) / pink eyes
    px(ctx, sx + 9, y + 7, 1, 1, '#E57373');
    px(ctx, sx + 11, y + 11, 2, 2, c); // 꼬리 / tail
    px(ctx, sx + 5 - sw, y + 15, 2, 1, '#BDBDBD'); // 발 / feet
    px(ctx, sx + 9 + sw, y + 15, 2, 1, '#BDBDBD');
  }

  // 바닥 그림자(깊이감) / ground shadow for depth
  function drawShadow(ctx, sx, sy, radius, baseOffY) {
    const cx = sx + 8;
    const cy = sy + (baseOffY != null ? baseOffY : 16);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius || 7, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 외부 노출 / expose
  window.Sprites = {
    px,
    drawTile,
    drawTree,
    drawFence,
    drawFountain,
    drawBuilding,
    drawPlayer,
    drawNPC,
    drawWorkingBubble,
    drawSparkle,
    drawRock,
    drawBush,
    drawLamp,
    drawWell,
    drawSign,
    drawRug,
    drawSofa,
    drawChair,
    drawTable,
    drawBookshelf,
    drawPlant,
    drawMushroom,
    drawPalm,
    drawSnowman,
    drawPineTree,
    drawCrystal,
    drawStalagmite,
    drawShell,
    drawStump,
    drawDriftwood,
    drawIcicle,
    drawStarfish,
    drawLighthouse,
    drawSpiritTree,
    drawBottle,
    drawCat,
    drawPenguin,
    drawDog,
    drawRabbit,
    drawShadow,
    NPC_STYLE
  };
})();
