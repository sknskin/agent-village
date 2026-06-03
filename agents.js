'use strict';

// 에이전트 정의 및 AI 호출 로직 (CLI 모드 기본)
// Agent definitions and AI invocation logic (CLI mode by default)

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// === 상수 / Constants ===

// AI 백엔드 모드: 'cli'(구독 인증, 추가비용 없음) | 'api'(API 키, 종량제)
// AI backend mode: 'cli' (subscription auth, no extra cost) | 'api' (API key, metered)
const VALID_AI_MODES = ['cli', 'api'];
const RAW_AI_MODE = (process.env.AI_MODE || 'cli').toLowerCase();
// 허용 목록에 없는 값은 안전하게 cli로 폴백 / unknown values fall back to cli
const AI_MODE = VALID_AI_MODES.includes(RAW_AI_MODE) ? RAW_AI_MODE : 'cli';
if (!VALID_AI_MODES.includes(RAW_AI_MODE)) {
  console.error('알 수 없는 AI_MODE "' + RAW_AI_MODE + '" → cli로 폴백 / unknown AI_MODE, falling back to cli');
}

// claude 실행 파일 경로 / claude binary path
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

// 단일 호출 최대 대기 시간(ms) / max wait per call
const CALL_TIMEOUT_MS = 120000;

// API 모드 응답 최대 토큰 수(매직넘버 분리) / max response tokens in API mode
const API_MAX_TOKENS = 2048;

// 작업 입력 최대 길이(과대 프롬프트 방지) / max task length to guard against oversized prompts
const MAX_TASK_LEN = 4000;

// 게임 작업 입력은 신뢰할 수 없으므로 모든 도구 차단 (순수 텍스트 응답만)
// Game task input is untrusted, so block all tools (plain-text responses only)
const DISALLOWED_TOOLS = [
  'Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep',
  'WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'TodoWrite'
];

// 오케스트레이터가 분해할 수 있는 최대 서브태스크 수 / max subtasks
const MAX_SUBTASKS = 4;

// 사용자가 선택 가능한 모델 별칭 / model aliases selectable by the user
const SELECTABLE_MODELS = ['opus', 'sonnet', 'haiku'];

// 기본 모델(검증 실패 시 폴백) / default model used as a fallback
const DEFAULT_MODEL = 'sonnet';

// 모델 별칭을 검증하고 허용 목록에 없으면 기본값으로 / validate a model alias
function sanitizeModel(model) {
  return SELECTABLE_MODELS.includes(model) ? model : DEFAULT_MODEL;
}

// 응답 길이 가이드 (대화창에 맞게 간결하게)
// Response length guide (concise for the dialogue box)
const LENGTH_GUIDE =
  '\n\n반드시 한국어로, 대화창에 어울리게 간결히 답하세요. ' +
  '코드가 필요하면 핵심만 짧게. 도구를 쓰지 말고 텍스트로만 답하세요.';

// === 에이전트 정의 / Agent definitions ===

const AGENTS = {
  coder: {
    id: 'coder',
    name: '코더',
    model: 'opus',
    color: '#81C784',
    personality: '실용적이고 간결한 개발자. 농담을 좋아함.',
    systemPrompt:
      '당신은 "코더"입니다. 마을의 코딩 오두막에 사는 실용적인 개발자 NPC입니다. ' +
      '플레이어가 의뢰한 코드 작업을 도와줍니다. 짧고 정확한 코드 스니펫과 한 줄 설명을 제공합니다.' +
      LENGTH_GUIDE,
    greetings: [
      '어이! 코딩 오두막에 온 걸 환영해. 뭘 만들어볼까?',
      '키보드는 따뜻하게 데워놨어. 작업 말해봐!',
      '버그? 기능? 뭐든 짜줄게. 말만 해.'
    ],
    workingPhrases: ['타닥타닥...', '컴파일 중...', '이거 좋은데?', '거의 다 됐어']
  },

  researcher: {
    id: 'researcher',
    name: '리서처',
    model: 'sonnet',
    color: '#64B5F6',
    personality: '호기심 많고 빠른 정보 조사가. 핵심을 잘 짚음.',
    systemPrompt:
      '당신은 "리서처"입니다. 리서치 카페에서 일하는 정보 조사 전문가 NPC입니다. ' +
      '플레이어의 질문에 핵심 정보를 빠르게 정리해 답합니다. 불확실하면 솔직히 모른다고 말합니다.' +
      LENGTH_GUIDE,
    greetings: [
      '리서치 카페에 어서 와. 뭐가 궁금해?',
      '커피 한 잔 하면서 알아봐줄게. 질문은?',
      '정보라면 나한테 맡겨. 뭘 찾을까?'
    ],
    workingPhrases: ['찾아보는 중...', '음, 흥미로운데...', '자료 확인 중...', '정리하는 중...']
  },

  writer: {
    id: 'writer',
    name: '작가',
    model: 'sonnet',
    color: '#FFB74D',
    personality: '감성적이고 표현력이 풍부한 글쟁이.',
    systemPrompt:
      '당신은 "작가"입니다. 작가의 집에서 글을 쓰는 NPC입니다. ' +
      '플레이어가 요청한 문서, 카피, 이야기를 매력적으로 작성합니다.' +
      LENGTH_GUIDE,
    greetings: [
      '작가의 집이야. 어떤 글이 필요해?',
      '펜을 들 준비가 됐어. 무엇을 써줄까?',
      '한 문장이든 한 편이든, 말만 해.'
    ],
    workingPhrases: ['영감이 떠올라...', '단어를 고르는 중...', '음, 이 표현이 좋겠어', '다듬는 중...']
  },

  editor: {
    id: 'editor',
    name: '편집자',
    model: 'sonnet',
    color: '#BA68C8',
    personality: '꼼꼼하고 비판적인 편집자. 군더더기를 싫어함.',
    systemPrompt:
      '당신은 "편집자"입니다. 작가의 집에서 글을 다듬는 NPC입니다. ' +
      '주어진 글을 더 명확하고 간결하게 교정/개선하고, 핵심 개선점을 짚어줍니다.' +
      LENGTH_GUIDE,
    greetings: [
      '편집자야. 다듬을 글을 보여줘.',
      '군더더기는 내가 잘라줄게.',
      '명확하게 만들어줄게. 원고 줘봐.'
    ],
    workingPhrases: ['교정 중...', '여기 줄이면 좋겠는데...', '문장 정리 중...', '거의 깔끔해졌어']
  },

  analyst: {
    id: 'analyst',
    name: '분석가',
    model: 'sonnet',
    color: '#4DD0E1',
    personality: '논리적이고 데이터 중심의 분석가.',
    systemPrompt:
      '당신은 "분석가"입니다. 분석 연구소에서 데이터를 다루는 NPC입니다. ' +
      '플레이어의 데이터/문제를 논리적으로 분석하고 인사이트를 정리해 답합니다.' +
      LENGTH_GUIDE,
    greetings: [
      '분석 연구소야. 어떤 데이터를 볼까?',
      '숫자와 패턴이라면 나한테 맡겨.',
      '분석할 거리를 줘봐. 파헤쳐줄게.'
    ],
    workingPhrases: ['계산 중...', '패턴이 보이는데...', '상관관계 확인 중...', '결론 도출 중...']
  },

  visualizer: {
    id: 'visualizer',
    name: '시각화 전문가',
    model: 'sonnet',
    color: '#F06292',
    personality: '직관적이고 시각적인 설명을 잘함.',
    systemPrompt:
      '당신은 "시각화 전문가"입니다. 분석 연구소에서 데이터를 보기 쉽게 표현하는 NPC입니다. ' +
      '분석 결과를 표, 아스키 차트, 비유 등으로 이해하기 쉽게 설명합니다.' +
      LENGTH_GUIDE,
    greetings: [
      '시각화 전문가야. 뭘 그림으로 만들까?',
      '복잡한 건 보기 쉽게 바꿔줄게.',
      '데이터를 한눈에 보이게 해줄게.'
    ],
    workingPhrases: ['그리는 중...', '색을 고르는 중...', '차트 만드는 중...', '한눈에 보이게 정리 중...']
  },

  orchestrator: {
    id: 'orchestrator',
    name: '오케스트레이터',
    model: 'opus',
    color: '#FFD54F',
    personality: '전체를 조율하는 침착한 리더.',
    systemPrompt:
      '당신은 "오케스트레이터"입니다. 마을 북쪽 성에서 팀을 이끄는 리더 NPC입니다. ' +
      '복잡한 작업을 받아 팀원(코더, 리서처, 작가, 편집자, 분석가)에게 나눠 맡기고 결과를 종합합니다.' +
      LENGTH_GUIDE,
    greetings: [
      '성에 온 걸 환영하네. 복잡한 일은 우리 팀이 처리하지.',
      '큰 작업일수록 좋아. 무엇을 맡기겠나?',
      '팀을 소집할 준비가 됐네. 의뢰를 말해보게.'
    ],
    workingPhrases: ['팀을 소집 중...', '작업을 나누는 중...', '진행 상황 확인 중...', '결과를 종합 중...']
  },

  // === 신규 맵 테마 이벤트 에이전트 / themed event agents for the new maps ===

  forest_spirit: {
    id: 'forest_spirit',
    name: '정령 나무',
    model: 'sonnet',
    color: '#66BB6A',
    personality: '숲에 깃든 신비로운 고목 정령.',
    systemPrompt:
      '당신은 깊은 숲에 깃든 오래된 "정령 나무"입니다. 빛나는 눈을 가진 고목입니다. ' +
      '여행자의 질문에 자연과 숲의 지혜에 빗댄 신비롭고 시적인 답을 짧게 줍니다. 너무 길지 않게.' +
      LENGTH_GUIDE,
    greetings: [
      '바람결에 너의 발소리가 들렸다, 여행자여... 무엇이 궁금하냐?',
      '나는 이 숲의 오래된 정령. 잎사귀 사이로 무엇이든 물어보거라.'
    ],
    workingPhrases: ['잎새가 속삭인다...', '뿌리가 답을 길어 올린다...', '바람이 전한다...', '나이테를 더듬는 중...']
  },

  message_bottle: {
    id: 'message_bottle',
    name: '유리병 편지',
    model: 'haiku',
    color: '#4FC3F7',
    personality: '표류자의 편지를 빚어내는 이야기꾼.',
    systemPrompt:
      '당신은 해변의 유리병 속에서 발견되는 편지를 생성하는 이야기꾼입니다. ' +
      '표류자나 먼 곳의 뱃사람이 남긴 짧고 감성적인 편지를, 매번 완전히 새롭고 다르게 써냅니다. 4~6문장.' +
      LENGTH_GUIDE,
    greetings: ['낡은 유리병 안에 편지가 들어 있다...'],
    workingPhrases: ['병뚜껑을 여는 중...', '젖은 종이를 펴는 중...', '잉크가 번진 글씨를 읽는 중...']
  },

  snow_friend: {
    id: 'snow_friend',
    name: '말하는 눈사람',
    model: 'haiku',
    color: '#B3E5FC',
    personality: '명랑하고 귀여운 눈사람.',
    systemPrompt:
      '당신은 설원에 사는 명랑한 "말하는 눈사람"입니다. ' +
      '겨울과 눈에 관한 밝고 귀여운 수다를 떨고, 가벼운 농담을 건넵니다. 친근한 반말로.' +
      LENGTH_GUIDE,
    greetings: [
      '안녕! 난 눈사람이야 ⛄ 같이 얘기할래?',
      '으하하, 반가워! 오늘은 눈이 참 보송보송하지?'
    ],
    workingPhrases: ['눈을 굴리는 중...', '콧노래 흥얼흥얼...', '당근 코를 매만지는 중...', '히죽...']
  },

  crystal_oracle: {
    id: 'crystal_oracle',
    name: '수정 오라클',
    model: 'sonnet',
    color: '#80DEEA',
    personality: '동굴 속 수수께끼의 예언자.',
    systemPrompt:
      '당신은 동굴 깊은 곳의 "수정 오라클"입니다. ' +
      '질문에 직접적으로 답하지 않고, 수수께끼 같고 시적인 은유의 예언으로 짧게 답합니다. 신비롭게.' +
      LENGTH_GUIDE,
    greetings: [
      '수정이 너의 그림자를 비추는구나... 무엇을 묻고 싶은가, 길 잃은 자여?',
      '깊은 곳의 빛이 깨어났다... 너의 물음을 들려다오.'
    ],
    workingPhrases: ['수정이 진동한다...', '빛이 형상을 그린다...', '메아리가 답을 길어온다...', '예언이 맺힌다...']
  },

  // === 캐릭터 NPC(마을·맵) / character NPCs ===

  village_elder: {
    id: 'village_elder', name: '촌장', model: 'haiku', color: '#BCAAA4',
    personality: '지혜롭고 인자한 마을 어르신.',
    systemPrompt: '당신은 마을의 지혜로운 "촌장"입니다. 마을과 에이전트들에 대해 따뜻하고 인자하게 이야기합니다.' + LENGTH_GUIDE,
    greetings: ['허허, 잘 왔네 젊은이. 마을은 둘러봤는가?', '오늘도 좋은 날이군. 무엇이 궁금한가?'],
    workingPhrases: ['수염을 쓰다듬으며...', '곰곰이 생각하며...', '허허...']
  },
  village_kid: {
    id: 'village_kid', name: '꼬마', model: 'haiku', color: '#FFD54F',
    personality: '밝고 천진난만한 장난꾸러기.',
    systemPrompt: '당신은 마을의 장난꾸러기 "꼬마"입니다. 밝고 천진난만하게, 짧게 떠듭니다. 반말로.' + LENGTH_GUIDE,
    greetings: ['형아 누나! 같이 놀자!', '헤헤, 뭐하고 있어?'],
    workingPhrases: ['깡총깡총...', '헤헤...', '음~']
  },
  village_merchant: {
    id: 'village_merchant', name: '상인', model: 'haiku', color: '#A1887F',
    personality: '너스레 좋은 떠돌이 상인.',
    systemPrompt: '당신은 마을 "상인"입니다. 너스레를 떨며 마을 소문과 잡담을 구수하게 들려줍니다.' + LENGTH_GUIDE,
    greetings: ['어이쿠 손님! 구경하고 가쇼!', '좋은 소식 하나 들려줄까?'],
    workingPhrases: ['주판을 튕기며...', '흠흠...', '어디 보자...']
  },
  stray_cat: {
    id: 'stray_cat', name: '길고양이', model: 'haiku', color: '#90A4AE',
    personality: '도도하고 변덕스러운 고양이.',
    systemPrompt: '당신은 마을 "길고양이"입니다. 도도하고 변덕스럽게, 가끔 "야옹" 하며 사람처럼 짧게 말합니다.' + LENGTH_GUIDE,
    greetings: ['야옹... 뭘 봐?', '냐... 간식 있어?'],
    workingPhrases: ['그르릉...', '꼬리를 살랑...', '야옹...']
  },
  forest_herbalist: {
    id: 'forest_herbalist', name: '약초꾼', model: 'haiku', color: '#81C784',
    personality: '숲을 잘 아는 약초 채집가.',
    systemPrompt: '당신은 숲의 "약초꾼"입니다. 약초와 식물 지식을 친근하게 알려줍니다.' + LENGTH_GUIDE,
    greetings: ['숲에 온 걸 환영해요. 약초 찾으러 왔수?', '이 근처 약초라면 내가 빠삭하지.'],
    workingPhrases: ['약초를 살피며...', '냄새를 맡으며...', '흠...']
  },
  beach_fisherman: {
    id: 'beach_fisherman', name: '어부', model: 'haiku', color: '#4FC3F7',
    personality: '바다 이야기 좋아하는 어부.',
    systemPrompt: '당신은 해변의 "어부"입니다. 바다 이야기와 잡은 물고기 자랑을 구수하게 합니다.' + LENGTH_GUIDE,
    greetings: ['어이! 오늘 파도가 좋구먼.', '바다 구경 왔는가? 허허.'],
    workingPhrases: ['그물을 손질하며...', '먼바다를 보며...', '허허...']
  },
  snow_penguin: {
    id: 'snow_penguin', name: '펭귄', model: 'haiku', color: '#B0BEC5',
    personality: '뒤뚱대는 귀여운 펭귄.',
    systemPrompt: '당신은 설원의 귀여운 "펭귄"입니다. 뒤뚱대며 밝고 짧게 수다 떱니다.' + LENGTH_GUIDE,
    greetings: ['뒤뚱뒤뚱~ 안녕!', '꽥! 추운데 잘 왔어!'],
    workingPhrases: ['뒤뚱뒤뚱...', '꽥꽥...', '미끄럼~']
  },
  cave_miner: {
    id: 'cave_miner', name: '광부', model: 'haiku', color: '#8D6E63',
    personality: '무뚝뚝하지만 정 있는 광부.',
    systemPrompt: '당신은 동굴의 "광부"입니다. 무뚝뚝하지만 정 있는 말투로 광물과 동굴 이야기를 합니다.' + LENGTH_GUIDE,
    greetings: ['음... 동굴은 위험하니 조심하게.', '여기까지 왔구먼. 무슨 일인가?'],
    workingPhrases: ['곡괭이를 들며...', '바위를 살피며...', '음...']
  },

  // === 추가 NPC/이벤트 / more NPCs & events ===
  bard: {
    id: 'bard', name: '음유시인', model: 'haiku', color: '#CE93D8',
    personality: '흥겨운 떠돌이 음유시인.',
    systemPrompt: '당신은 마을의 "음유시인"입니다. 흥겹게 노래와 시로 답하고, 마을 이야기를 노래처럼 들려줍니다.' + LENGTH_GUIDE,
    greetings: ['♪ 어서 오시오, 나그네여~', '한 곡 들려드릴까요? 무엇이 궁금하오?'],
    workingPhrases: ['리라를 튕기며...', '♪ 흠흠...', '운율을 고르며...']
  },
  woodcutter: {
    id: 'woodcutter', name: '나무꾼', model: 'haiku', color: '#A1887F',
    personality: '우직한 숲의 나무꾼.',
    systemPrompt: '당신은 숲의 "나무꾼"입니다. 우직하고 정직한 말투로 나무와 숲 일에 대해 이야기합니다.' + LENGTH_GUIDE,
    greetings: ['어이, 숲에는 무슨 일로?', '도끼질 좀 쉬던 참이오. 말해보슈.'],
    workingPhrases: ['도끼를 살피며...', '나뭇결을 보며...', '음...']
  },
  surfer: {
    id: 'surfer', name: '서퍼', model: 'haiku', color: '#4DD0E1',
    personality: '자유분방한 해변 서퍼.',
    systemPrompt: '당신은 해변의 "서퍼"입니다. 자유분방하고 신나게 파도와 서핑 이야기를 합니다. 반말로.' + LENGTH_GUIDE,
    greetings: ['요! 파도 끝내주지 않냐?', '안녕~ 서핑 배우러 왔어?'],
    workingPhrases: ['파도를 보며...', '왁스칠하며...', '우와~']
  },
  treasure_hunter: {
    id: 'treasure_hunter', name: '보물사냥꾼', model: 'haiku', color: '#FFB300',
    personality: '들뜬 보물 사냥꾼.',
    systemPrompt: '당신은 동굴의 "보물사냥꾼"입니다. 들뜬 말투로 보물과 모험 이야기를 합니다.' + LENGTH_GUIDE,
    greetings: ['쉿! 여기 보물이 있을지도 몰라!', '오, 동료인가? 모험을 찾아왔나?'],
    workingPhrases: ['지도를 펼치며...', '바닥을 더듬으며...', '두근두근...']
  },
  village_dog: {
    id: 'village_dog', name: '강아지', model: 'haiku', color: '#D7CCC8',
    personality: '명랑한 마을 강아지.',
    systemPrompt: '당신은 마을 "강아지"입니다. "멍멍"거리며 사람처럼 짧고 귀엽게 말합니다.' + LENGTH_GUIDE,
    greetings: ['멍멍! 반가워!', '왈! 같이 놀자!'],
    workingPhrases: ['킁킁...', '꼬리 살랑살랑...', '멍!']
  },
  snow_rabbit: {
    id: 'snow_rabbit', name: '눈토끼', model: 'haiku', color: '#ECEFF1',
    personality: '깡총대는 눈토끼.',
    systemPrompt: '당신은 설원의 "눈토끼"입니다. 깡총깡총 뛰며 밝고 짧게 말합니다.' + LENGTH_GUIDE,
    greetings: ['깡총! 안녕!', '폭신폭신 눈이 좋아~'],
    workingPhrases: ['깡총깡총...', '코를 씰룩...', '폴짝!']
  },
  wishing_well: {
    id: 'wishing_well', name: '소원의 우물', model: 'haiku', color: '#4FA8D8',
    personality: '소원을 들어주는 신비한 우물.',
    systemPrompt: '당신은 "소원의 우물"입니다. 동전을 던진 이에게 엉뚱하면서도 따뜻한, 매번 다른 소원 성취 메시지를 들려줍니다. 3~5문장.' + LENGTH_GUIDE,
    greetings: ['우물에 동전이 떨어진다...'],
    workingPhrases: ['물결이 번진다...', '깊은 곳에서 울림이...', '소원을 받아...']
  },
  fairy_mushroom: {
    id: 'fairy_mushroom', name: '요정 버섯', model: 'haiku', color: '#BA68C8',
    personality: '장난스러운 숲의 요정 버섯.',
    systemPrompt: '당신은 숲의 "요정 버섯"입니다. 장난스럽고 신비롭게 작은 수수께끼나 재치있는 답을 줍니다.' + LENGTH_GUIDE,
    greetings: ['히힛, 날 밟지 마! 무엇이 궁금해?', '반짝— 요정 버섯이야. 물어봐!'],
    workingPhrases: ['포자가 반짝...', '히힛...', '버섯갓을 흔들며...']
  }
};

// 오케스트레이터가 서브태스크를 위임할 수 있는 에이전트 / delegatable agents
const DELEGATABLE_AGENTS = ['coder', 'researcher', 'writer', 'editor', 'analyst', 'visualizer'];

// === 조회 헬퍼 / Lookup helpers ===

// 에이전트 반환 (빌트인 → 커스텀 순, 없으면 null) / return agent (built-in then custom) or null
function getAgent(id) {
  return AGENTS[id] || customAgents[id] || null;
}

// 클라이언트로 보낼 에이전트 메타데이터 목록(빌트인+커스텀) / public agent metadata
function listAgents() {
  const builtin = Object.values(AGENTS).map((a) => ({
    id: a.id,
    name: a.name,
    color: a.color,
    personality: a.personality,
    custom: false
  }));
  const custom = Object.values(customAgents).map((a) => ({
    id: a.id,
    name: a.name,
    color: a.color,
    personality: a.personality,
    custom: true
  }));
  return builtin.concat(custom);
}

// 배열에서 무작위 항목 선택 / pick a random item
function pickRandom(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return '';
  }
  return items[Math.floor(Math.random() * items.length)];
}

// 랜덤 인사말 / random greeting
function randomGreeting(agentId) {
  const agent = getAgent(agentId);
  return agent ? pickRandom(agent.greetings) : '안녕!';
}

// 랜덤 작업 중 말풍선 / random working phrase
function randomWorkingPhrase(agentId) {
  const agent = getAgent(agentId);
  return agent ? pickRandom(agent.workingPhrases) : '...';
}

// === 커스텀 에이전트 레지스트리(영구 저장) / Custom agent registry (persisted) ===

// 저장 파일 경로 / persistence file path
const CUSTOM_FILE = path.join(__dirname, 'custom-agents.json');

// 데이터 파일 백업/격리 접미사 / suffixes for backup & quarantine of data files
const BACKUP_SUFFIX = '.bak';
const CORRUPT_SUFFIX = '.corrupt-';

// 손상된 데이터 파일을 삭제하지 않고 타임스탬프 사본으로 보존한다.
// quarantine a corrupted data file (rename, never delete) so the bad data is recoverable
function quarantineCorrupt(file) {
  try {
    const dest = file + CORRUPT_SUFFIX + Date.now();
    fs.renameSync(file, dest);
    console.error('손상 파일 보존 / preserved corrupted file as: ' + dest);
  } catch (err) {
    console.error('손상 파일 보존 실패 / failed to preserve corrupted file:', err.message);
  }
}

// JSON 파일을 안전하게 읽는다 — 손상 시 .bak 복구를 시도하고 원본은 격리한다.
// safely read a JSON file — on corruption, try the .bak then quarantine the bad original
// 반환: 파싱된 객체, 또는 파일 없음/복구 불가 시 null / returns parsed object, or null when missing/unrecoverable
function readJsonSafe(file) {
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('데이터 파일 손상 / corrupted data file: ' + file + ' — ' + err.message);
    const bak = file + BACKUP_SUFFIX;
    if (fs.existsSync(bak)) {
      try {
        const bakText = fs.readFileSync(bak, 'utf8');
        const data = JSON.parse(bakText);
        // 손상 원본을 격리하고 백업본으로 파일을 복구한다 / quarantine the bad file and restore from backup
        quarantineCorrupt(file);
        fs.writeFileSync(file, bakText, 'utf8');
        console.error('백업에서 복구됨 / restored from backup: ' + bak);
        return data;
      } catch (bakErr) {
        console.error('백업도 손상 / backup also corrupted: ' + bak + ' — ' + bakErr.message);
      }
    }
    // 복구 불가 — 손상 원본만 격리하고 빈 상태로 시작 / unrecoverable — quarantine the original and start empty
    quarantineCorrupt(file);
    return null;
  }
}

// JSON을 저장하되 직전 정상본을 .bak으로 보존한다(다음 손상 시 복구원).
// write JSON while keeping the previous good copy as .bak (the recovery source on a future corruption)
function writeJsonSafe(file, data) {
  const text = JSON.stringify(data, null, 2);
  // 기존 정상 파일을 덮어쓰기 전에 백업으로 보존 / preserve the existing good file as a backup before overwrite
  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, file + BACKUP_SUFFIX);
    } catch (err) {
      console.error('백업 생성 실패 / failed to create backup:', err.message);
    }
  }
  fs.writeFileSync(file, text, 'utf8');
}

// 입력 길이 제한 / input length caps
// 클라이언트 에디터(public/editor.js)의 MAX_NAME=20·MAX_ROLE=200과 동일하게 유지(정합성)
// keep in sync with the client editor's MAX_NAME=20 / MAX_ROLE=200 for consistency
const MAX_NAME_LEN = 20;
const MAX_ROLE_LEN = 200;

// 커스텀 에이전트 기본 작업 말풍선 / default working phrases for custom agents
const DEFAULT_WORKING_PHRASES = ['처리 중...', '작업 중...', '거의 다 됐어요', '정리 중...'];

// 커스텀 에이전트 선택 가능 색상 팔레트 / color palette offered for custom agents
const CUSTOM_COLORS = [
  '#9CCC65', '#4DB6AC', '#7986CB', '#F06292', '#FF8A65',
  '#A1887F', '#90A4AE', '#BA68C8', '#4FC3F7', '#DCE775'
];

// id -> 커스텀 에이전트 객체 / id -> custom agent object
const customAgents = {};

// 커스텀 시스템 프롬프트 구성 / build a custom system prompt
function buildCustomSystemPrompt(name, role) {
  return '당신은 "' + name + '"입니다. ' + role + LENGTH_GUIDE;
}

// 이름 기반 기본 인사말 / default greetings derived from the name
function defaultGreetings(name) {
  return [
    name + '이에요. 무엇을 도와드릴까요?',
    '안녕하세요, ' + name + '입니다. 작업을 말씀해주세요.'
  ];
}

// 다음 커스텀 id 생성 / generate the next custom id
function nextCustomId() {
  let n = 1;
  while (customAgents['custom_' + n]) {
    n++;
  }
  return 'custom_' + n;
}

// 최소 데이터로 커스텀 에이전트를 메모리에 등록(저장은 별도) / register from minimal data
function registerCustom(data) {
  const name = (data.name || '').trim().slice(0, MAX_NAME_LEN);
  const role = (data.role || '').trim().slice(0, MAX_ROLE_LEN);
  const id = data.id;
  customAgents[id] = {
    id,
    name,
    role, // 편집용 원본 역할 / raw role text for editing
    model: sanitizeModel(data.model),
    color: data.color || CUSTOM_COLORS[0],
    personality: '커스텀 에이전트',
    systemPrompt: buildCustomSystemPrompt(name, role),
    greetings: defaultGreetings(name),
    workingPhrases: DEFAULT_WORKING_PHRASES,
    custom: true
  };
  return customAgents[id];
}

// 파일에서 커스텀 에이전트 로드 / load custom agents from disk
function loadCustomAgents() {
  try {
    const raw = readJsonSafe(CUSTOM_FILE);
    const stored = (raw && raw.agents) || {};
    for (const data of Object.values(stored)) {
      if (data && data.id) {
        registerCustom(data);
      }
    }
  } catch (err) {
    console.error('커스텀 에이전트 로드 실패 / failed to load custom agents:', err.message);
  }
}

// 커스텀 에이전트를 파일에 저장 / persist custom agents to disk
function saveCustomAgents() {
  try {
    const out = { agents: {} };
    for (const [id, a] of Object.entries(customAgents)) {
      out.agents[id] = { id, name: a.name, role: a.role, model: a.model, color: a.color };
    }
    writeJsonSafe(CUSTOM_FILE, out);
  } catch (err) {
    console.error('커스텀 에이전트 저장 실패 / failed to save custom agents:', err.message);
  }
}

// 커스텀 에이전트 추가 / add a custom agent
function addCustomAgent(fields) {
  const name = (fields.name || '').trim();
  const role = (fields.role || '').trim();
  if (!name) {
    throw new Error('이름을 입력하세요 / name is required');
  }
  if (!role) {
    throw new Error('역할을 입력하세요 / role is required');
  }
  const id = nextCustomId();
  registerCustom({ id, name, role, model: fields.model, color: fields.color });
  saveCustomAgents();
  return customAgents[id];
}

// 커스텀 에이전트 수정 / update a custom agent
function updateCustomAgent(id, fields) {
  const cur = customAgents[id];
  if (!cur) {
    throw new Error('해당 커스텀 에이전트가 없습니다 / no such custom agent: ' + id);
  }
  const merged = {
    id,
    name: fields.name != null ? fields.name : cur.name,
    role: fields.role != null ? fields.role : cur.role,
    model: fields.model != null ? fields.model : cur.model,
    color: fields.color != null ? fields.color : cur.color
  };
  registerCustom(merged);
  saveCustomAgents();
  return customAgents[id];
}

// 커스텀 에이전트 삭제 / delete a custom agent
function deleteCustomAgent(id) {
  if (!customAgents[id]) {
    throw new Error('해당 커스텀 에이전트가 없습니다 / no such custom agent: ' + id);
  }
  delete customAgents[id];
  saveCustomAgents();
  // 삭제된 에이전트를 멤버로 가진 팀에서 제거(빈 팀은 함께 삭제)
  // purge the deleted agent from every team (teams left empty are removed too)
  // removeAgentFromTeams는 팀 섹션의 함수 선언으로 호이스팅되어 호출 시점엔 항상 사용 가능
  // removeAgentFromTeams is a hoisted function declaration in the teams section, always available at call time
  removeAgentFromTeams(id);
  return true;
}

// 클라이언트 편집용 커스텀 에이전트 목록 / custom agent list for the client editor
function listCustomAgents() {
  return Object.values(customAgents).map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    color: a.color,
    model: a.model
  }));
}

// 시작 시 로드 / load on startup
loadCustomAgents();

// === 에이전트 팀 레지스트리(영구 저장) / Agent team registry (persisted) ===

// 팀 저장 파일 경로 / team persistence file path
const TEAMS_FILE = path.join(__dirname, 'teams.json');

// 팀 멤버 수 범위 / team member count bounds
const MIN_TEAM_MEMBERS = 1;
const MAX_TEAM_MEMBERS = 6;

// 팀 실행 방식 / team execution modes
const TEAM_EXECUTIONS = ['sequential', 'parallel'];

// 팀 기본 작업 말풍선 / default working phrases for teams
const DEFAULT_TEAM_PHRASES = ['팀을 소집 중...', '작업을 나누는 중...', '의견을 모으는 중...', '결과를 종합 중...'];

// id -> 팀 객체 / id -> team object
const teams = {};

// 실행 방식 검증 / validate an execution mode
function sanitizeExecution(mode) {
  return TEAM_EXECUTIONS.includes(mode) ? mode : TEAM_EXECUTIONS[0];
}

// 멤버 배열을 검증·정규화: 사용자가 만든 커스텀 에이전트 참조만 허용
// sanitize members: only references to user-created custom agents are kept
// 입력은 문자열 id 또는 { agentId } 형태를 허용 / accepts string ids or { agentId }
function sanitizeMembers(rawMembers) {
  const list = Array.isArray(rawMembers) ? rawMembers : [];
  const members = [];
  const seen = new Set();
  for (const m of list) {
    if (members.length >= MAX_TEAM_MEMBERS) {
      break;
    }
    const agentId = (typeof m === 'string') ? m : (m && m.agentId);
    // 존재하는 커스텀 에이전트이고 중복이 아닐 때만 추가 / keep existing, non-duplicate custom agents
    if (!agentId || seen.has(agentId) || !customAgents[agentId]) {
      continue;
    }
    seen.add(agentId);
    members.push({ agentId });
  }
  return members;
}

// 다음 팀 id 생성 / generate the next team id
function nextTeamId() {
  let n = 1;
  while (teams['team_' + n]) {
    n++;
  }
  return 'team_' + n;
}

// 팀 인사말(이름 기반) / team greetings derived from the name
function teamGreetings(name) {
  return [
    '"' + name + '" 팀입니다. 맡길 작업을 말씀해주세요.',
    name + ' 팀이 대기 중이에요. 무엇을 함께 처리할까요?'
  ];
}

// 최소 데이터로 팀을 메모리에 등록(저장은 별도) / register a team from minimal data
function registerTeam(data) {
  const name = (data.name || '').trim().slice(0, MAX_NAME_LEN);
  const id = data.id;
  const members = sanitizeMembers(data.members);
  teams[id] = {
    id,
    name,
    color: data.color || CUSTOM_COLORS[0],
    leadModel: sanitizeModel(data.leadModel),
    execution: sanitizeExecution(data.execution),
    members,
    // 대화/렌더용 메타(빌트인 에이전트와 동일 형태) / metadata for dialogue & rendering
    greetings: teamGreetings(name),
    workingPhrases: DEFAULT_TEAM_PHRASES,
    isTeam: true
  };
  return teams[id];
}

// 파일에서 팀 로드 / load teams from disk
function loadTeams() {
  try {
    const raw = readJsonSafe(TEAMS_FILE);
    const stored = (raw && raw.teams) || {};
    for (const data of Object.values(stored)) {
      if (data && data.id) {
        registerTeam(data);
      }
    }
  } catch (err) {
    console.error('팀 로드 실패 / failed to load teams:', err.message);
  }
}

// 팀을 파일에 저장 / persist teams to disk
function saveTeams() {
  try {
    const out = { teams: {} };
    for (const [id, t] of Object.entries(teams)) {
      out.teams[id] = {
        id, name: t.name, color: t.color,
        leadModel: t.leadModel, execution: t.execution, members: t.members
      };
    }
    writeJsonSafe(TEAMS_FILE, out);
  } catch (err) {
    console.error('팀 저장 실패 / failed to save teams:', err.message);
  }
}

// 팀 추가 / add a team
function addTeam(fields) {
  const name = (fields.name || '').trim();
  if (!name) {
    throw new Error('팀 이름을 입력하세요 / team name is required');
  }
  const members = sanitizeMembers(fields.members);
  if (members.length < MIN_TEAM_MEMBERS) {
    throw new Error('역할이 있는 멤버를 한 명 이상 추가하세요 / add at least one member with a role');
  }
  const id = nextTeamId();
  registerTeam({
    id, name, color: fields.color,
    leadModel: fields.leadModel, execution: fields.execution, members
  });
  saveTeams();
  return teams[id];
}

// 팀 수정 / update a team
function updateTeam(id, fields) {
  const cur = teams[id];
  if (!cur) {
    throw new Error('해당 팀이 없습니다 / no such team: ' + id);
  }
  const merged = {
    id,
    name: fields.name != null ? fields.name : cur.name,
    color: fields.color != null ? fields.color : cur.color,
    leadModel: fields.leadModel != null ? fields.leadModel : cur.leadModel,
    execution: fields.execution != null ? fields.execution : cur.execution,
    members: fields.members != null ? fields.members : cur.members
  };
  const members = sanitizeMembers(merged.members);
  if (members.length < MIN_TEAM_MEMBERS) {
    throw new Error('역할이 있는 멤버를 한 명 이상 유지하세요 / keep at least one member with a role');
  }
  merged.members = members;
  registerTeam(merged);
  saveTeams();
  return teams[id];
}

// 팀 삭제 / delete a team
function deleteTeam(id) {
  if (!teams[id]) {
    throw new Error('해당 팀이 없습니다 / no such team: ' + id);
  }
  delete teams[id];
  saveTeams();
  return true;
}

// 삭제된 커스텀 에이전트를 모든 팀에서 제거한다. 멤버가 0명이 된 팀은 함께 삭제.
// Remove a deleted custom agent from every team; teams left with no members are deleted too.
function removeAgentFromTeams(agentId) {
  let changed = false;
  for (const [teamId, team] of Object.entries(teams)) {
    const kept = team.members.filter((m) => m.agentId !== agentId);
    if (kept.length === team.members.length) {
      continue; // 이 팀에는 해당 멤버가 없음 / this team has no such member
    }
    changed = true;
    if (kept.length < MIN_TEAM_MEMBERS) {
      // 멤버가 모두 사라진 팀은 삭제 / drop teams that would be left empty
      delete teams[teamId];
    } else {
      team.members = kept;
    }
  }
  if (changed) {
    saveTeams();
  }
}

// 클라이언트 편집용 팀 목록(멤버는 커스텀 에이전트 참조 + 표시용 이름)
// team list for the client editor (members are custom-agent refs + a display name)
function listTeams() {
  return Object.values(teams).map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    leadModel: t.leadModel,
    execution: t.execution,
    members: t.members.map((m) => {
      const sub = getAgent(m.agentId);
      return { agentId: m.agentId, name: sub ? sub.name : m.agentId };
    })
  }));
}

// 팀 조회 / look up a team
function getTeam(id) {
  return teams[id] || null;
}

// 시작 시 로드 / load on startup
loadTeams();

// === Claude CLI 호출 / Claude CLI invocation ===

// claude CLI를 자식 프로세스로 실행해 스트리밍 텍스트를 받는다.
// Spawn the claude CLI and stream back text.
// 반환: { promise, cancel } — promise는 전체 텍스트로 resolve
function spawnClaude({ model, systemPrompt, task, onChunk }) {
  const state = { cancelled: false, child: null };

  const promise = new Promise((resolve, reject) => {
    // 프롬프트는 위치 인자 대신 stdin으로 전달한다.
    // 이유: --disallowed-tools가 가변 인자라 뒤따르는 위치 인자를 삼켜버림.
    // Pass the prompt via stdin (not a positional arg) because --disallowed-tools
    // is variadic and would otherwise swallow the trailing prompt argument.
    const args = [
      '-p',
      '--input-format', 'text',
      '--output-format', 'stream-json',
      '--verbose',
      '--setting-sources', 'project',
      '--model', model,
      '--system-prompt', systemPrompt,
      '--disallowed-tools', ...DISALLOWED_TOOLS
    ];

    let child;
    try {
      child = spawn(CLAUDE_BIN, args, { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      reject(new Error('claude CLI 실행 실패 / failed to launch claude: ' + err.message));
      return;
    }
    state.child = child;

    // 프롬프트를 stdin으로 쓰고 닫는다 / write the prompt to stdin and close it
    try {
      child.stdin.write(task);
      child.stdin.end();
    } catch (err) {
      // stdin 쓰기 실패 시 자식 프로세스를 정리해 좀비 프로세스를 방지
      // kill the child on stdin-write failure to avoid leaving a zombie process
      try {
        child.kill('SIGTERM');
      } catch (killErr) {
        // 종료 실패는 무시(이미 죽었을 수 있음) / ignore kill failure (it may already be dead)
      }
      reject(new Error('프롬프트 전송 실패 / failed to write prompt: ' + err.message));
      return;
    }

    let stdoutBuffer = '';
    let stderrText = '';
    let fullText = '';
    let sawText = false;
    let resultError = null;

    // 타임아웃 가드 / timeout guard
    const timer = setTimeout(() => {
      state.cancelled = true;
      child.kill('SIGTERM');
      reject(new Error('응답 시간 초과 / response timed out'));
    }, CALL_TIMEOUT_MS);

    // 한 줄(JSON) 단위로 파싱 / parse line-delimited JSON
    function handleLine(line) {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      let obj;
      try {
        obj = JSON.parse(trimmed);
      } catch (err) {
        // 비 JSON 라인은 무시 / ignore non-JSON lines
        return;
      }

      if (obj.type === 'assistant' && obj.message && Array.isArray(obj.message.content)) {
        for (const block of obj.message.content) {
          if (block && block.type === 'text' && typeof block.text === 'string') {
            sawText = true;
            fullText += block.text;
            if (typeof onChunk === 'function') {
              onChunk(block.text);
            }
          }
        }
      } else if (obj.type === 'result') {
        if (obj.is_error) {
          resultError = obj.result || '에이전트 처리 중 오류 / agent error';
        } else if (!sawText && typeof obj.result === 'string') {
          // assistant 텍스트가 없었으면 result를 사용 / fall back to result text
          fullText = obj.result;
          if (typeof onChunk === 'function') {
            onChunk(obj.result);
          }
        }
      }
    }

    child.stdout.on('data', (data) => {
      stdoutBuffer += data.toString();
      let newlineIndex;
      while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
        const line = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        handleLine(line);
      }
    });

    child.stderr.on('data', (data) => {
      stderrText += data.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error('claude CLI 오류 / claude error: ' + err.message));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      // 버퍼에 남은 마지막 라인 처리 / flush trailing line
      if (stdoutBuffer.trim()) {
        handleLine(stdoutBuffer);
      }
      if (state.cancelled) {
        reject(new Error('작업 취소됨 / cancelled'));
        return;
      }
      if (resultError) {
        reject(new Error(resultError));
        return;
      }
      if (code !== 0 && !fullText) {
        reject(new Error('claude 종료 코드 ' + code + (stderrText ? ': ' + stderrText.trim() : '')));
        return;
      }
      resolve(fullText);
    });
  });

  function cancel() {
    state.cancelled = true;
    if (state.child) {
      state.child.kill('SIGTERM');
    }
  }

  return { promise, cancel };
}

// === API 모드 (선택) / API mode (optional) ===

// API 키 모드 호출 — @anthropic-ai/sdk가 설치돼 있어야 함
// API key mode — requires @anthropic-ai/sdk to be installed
function spawnViaApi({ model, systemPrompt, task, onChunk }) {
  // stream을 추적해 취소/타임아웃 시 중단 / track the stream so cancel & timeout can abort it
  const state = { cancelled: false, timedOut: false, stream: null };

  const promise = (async () => {
    let Anthropic;
    try {
      Anthropic = require('@anthropic-ai/sdk');
    } catch (err) {
      throw new Error('API 모드는 @anthropic-ai/sdk 설치가 필요합니다 / install @anthropic-ai/sdk for API mode');
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY가 설정되지 않았습니다 / ANTHROPIC_API_KEY is not set');
    }

    // 별칭을 API 모델 ID로 매핑 / map aliases to API model IDs
    // 미매핑 별칭은 임의 ID를 그대로 보내지 않고 기본 모델로 매핑 / unknown aliases map to the default model, never a raw passthrough
    const apiModelMap = { opus: 'claude-opus-4-8', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5' };
    const apiModel = apiModelMap[model] || apiModelMap[DEFAULT_MODEL];

    const client = new Anthropic();
    let fullText = '';
    const stream = await client.messages.stream({
      model: apiModel,
      max_tokens: API_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: task }]
    });
    state.stream = stream;

    // 타임아웃 가드(CLI 모드와 동일) — 멈춘 스트림이 영구 대기하지 않도록 중단
    // timeout guard, matching CLI mode — abort a hung stream instead of waiting forever
    const timer = setTimeout(() => {
      state.timedOut = true;
      try {
        stream.abort();
      } catch (err) {
        // abort 실패는 무시(아래에서 타임아웃으로 처리) / ignore abort failure; handled below as timeout
      }
    }, CALL_TIMEOUT_MS);

    stream.on('text', (delta) => {
      if (state.cancelled) {
        return;
      }
      fullText += delta;
      if (typeof onChunk === 'function') {
        onChunk(delta);
      }
    });

    try {
      await stream.finalMessage();
    } catch (err) {
      // 취소/타임아웃에 의한 중단은 명확한 메시지로, 그 외는 원오류 전파
      // abort due to cancel/timeout → clear message; otherwise rethrow the original error
      if (state.timedOut) {
        throw new Error('응답 시간 초과 / response timed out');
      }
      if (state.cancelled) {
        throw new Error('작업 취소됨 / cancelled');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (state.cancelled) {
      throw new Error('작업 취소됨 / cancelled');
    }
    return fullText;
  })();

  function cancel() {
    state.cancelled = true;
    if (state.stream) {
      try {
        state.stream.abort();
      } catch (err) {
        // 이미 종료된 스트림 abort는 무시 / ignore abort on an already-finished stream
      }
    }
  }

  return { promise, cancel };
}

// 모드에 따라 적절한 호출 함수 선택 / pick caller by mode
function callClaude(opts) {
  if (AI_MODE === 'api') {
    return spawnViaApi(opts);
  }
  return spawnClaude(opts);
}

// === 작업 실행 / Task execution ===

// 단일/멀티 에이전트 작업을 실행한다.
// Run a single- or multi-agent task.
// 반환: cancel 함수 / returns a cancel function
function runAgentTask({ agentId, task, onChunk, onStatus, onDone, onError }) {
  // 팀 id가 우선 / a team id takes precedence over an agent id
  const team = getTeam(agentId);
  const agent = team ? null : getAgent(agentId);
  if (!team && !agent) {
    onError('알 수 없는 에이전트입니다 / unknown agent: ' + agentId);
    return () => {};
  }

  // 신뢰할 수 없는 입력이라 길이를 상한으로 자른다(과대 프롬프트 방지)
  // untrusted input — clamp the length to guard against oversized prompts
  const cleanTask = (task || '').trim().slice(0, MAX_TASK_LEN);
  if (!cleanTask) {
    onError('작업 내용이 비어 있습니다 / empty task');
    return () => {};
  }

  // 팀이면 팀 실행 흐름으로 / a team uses the team execution flow
  if (team) {
    return runTeamTask({ team, task: cleanTask, onChunk, onStatus, onDone, onError });
  }

  // 오케스트레이터는 멀티에이전트 흐름으로 / orchestrator uses the multi-agent flow
  if (agent.id === 'orchestrator') {
    return runOrchestration({ task: cleanTask, onChunk, onStatus, onDone, onError });
  }

  onStatus(agent.id, 'working');
  const handle = callClaude({
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    task: cleanTask,
    onChunk
  });

  handle.promise
    .then((text) => {
      onStatus(agent.id, 'done');
      onDone(agent.id, text);
    })
    .catch((err) => {
      onStatus(agent.id, 'idle');
      onError(err.message);
    });

  return handle.cancel;
}

// === 오케스트레이터 멀티에이전트 / Orchestrator multi-agent ===

// 분해용 시스템 프롬프트 / decomposition system prompt
function buildPlannerPrompt() {
  return (
    '당신은 작업 분해 플래너입니다. 사용자의 복잡한 작업을 ' +
    DELEGATABLE_AGENTS.join(', ') + ' 중 적합한 에이전트들에게 나눠 맡깁니다. ' +
    '오직 JSON만 출력하세요. 형식: ' +
    '{"tasks":[{"agent":"coder","task":"..."}]} . ' +
    '최대 ' + MAX_SUBTASKS + '개. 설명이나 코드펜스 없이 JSON만.'
  );
}

// 모델 응답에서 JSON 객체를 추출한다(코드펜스 제거).
// Extract a JSON object from a model response (strip code fences).
function parsePlan(text) {
  let cleaned = (text || '').trim();
  // ```json ... ``` 코드펜스 제거 / strip code fences
  cleaned = cleaned.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    return null;
  }
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    if (!obj || !Array.isArray(obj.tasks)) {
      return null;
    }
    // 유효한 에이전트만, 최대 개수 제한 / keep valid agents, cap count
    const tasks = obj.tasks
      .filter((t) => t && DELEGATABLE_AGENTS.includes(t.agent) && typeof t.task === 'string' && t.task.trim())
      .slice(0, MAX_SUBTASKS);
    return tasks.length ? tasks : null;
  } catch (err) {
    return null;
  }
}

// 오케스트레이션 실행 / run orchestration
function runOrchestration({ task, onChunk, onStatus, onDone, onError }) {
  const orchestrator = AGENTS.orchestrator;
  const state = { cancelled: false, activeCancel: null };

  // 현재 진행 중인 호출을 취소 / cancel the active call
  function cancel() {
    state.cancelled = true;
    if (state.activeCancel) {
      state.activeCancel();
    }
  }

  (async () => {
    try {
      onStatus(orchestrator.id, 'working');
      onChunk('🏰 오케스트레이터가 작업을 분석하고 있어요...\n\n');

      // 1) 작업 분해 / decompose the task
      const planner = callClaude({
        model: orchestrator.model,
        systemPrompt: buildPlannerPrompt(),
        task: task
        // onChunk 없음: JSON은 사용자에게 보이지 않게 / no onChunk: hide raw JSON
      });
      state.activeCancel = planner.cancel;
      const planText = await planner.promise;
      if (state.cancelled) {
        return;
      }

      const tasks = parsePlan(planText);

      // 분해 실패 시 오케스트레이터 단독 처리로 폴백
      // Fallback: orchestrator answers alone if decomposition fails
      if (!tasks) {
        onChunk('팀을 나누기 애매한 작업이라 제가 직접 처리할게요.\n\n');
        const solo = callClaude({
          model: orchestrator.model,
          systemPrompt: orchestrator.systemPrompt,
          task: task,
          onChunk
        });
        state.activeCancel = solo.cancel;
        const soloText = await solo.promise;
        if (state.cancelled) {
          return;
        }
        onStatus(orchestrator.id, 'done');
        onDone(orchestrator.id, soloText);
        return;
      }

      // 2) 서브에이전트 순차 호출 / run subagents sequentially
      onChunk('작업을 ' + tasks.length + '단계로 나눴어요:\n');
      tasks.forEach((t, i) => {
        const sub = getAgent(t.agent);
        onChunk('  ' + (i + 1) + '. ' + (sub ? sub.name : t.agent) + ' — ' + t.task + '\n');
      });
      onChunk('\n');

      let accumulatedContext = '';
      const results = [];
      let failed = 0; // 실패한 단계 수(정직한 완료 보고용) / number of failed steps (for honest completion reporting)

      for (let i = 0; i < tasks.length; i++) {
        if (state.cancelled) {
          return;
        }
        const step = tasks[i];
        const sub = getAgent(step.agent);
        if (!sub) {
          continue;
        }

        onStatus(sub.id, 'working');
        onChunk('\n▶ [' + (i + 1) + '/' + tasks.length + '] ' + sub.name + ' 작업 중...\n');

        // 이전 결과를 다음 에이전트 컨텍스트에 포함 / pass prior results forward
        const contextPrefix = accumulatedContext
          ? '이전 단계 결과:\n' + accumulatedContext + '\n\n이번 작업:\n'
          : '';
        const subHandle = callClaude({
          model: sub.model,
          systemPrompt: sub.systemPrompt,
          task: contextPrefix + step.task,
          onChunk
        });
        state.activeCancel = subHandle.cancel;

        let subText;
        try {
          subText = await subHandle.promise;
        } catch (err) {
          if (state.cancelled) {
            return;
          }
          onStatus(sub.id, 'idle');
          onChunk('\n⚠ ' + sub.name + ' 단계에서 오류: ' + err.message + '\n');
          failed++;
          continue;
        }

        onStatus(sub.id, 'done');
        results.push('[' + sub.name + ']\n' + subText);
        accumulatedContext += '[' + sub.name + ']: ' + subText + '\n\n';
        onChunk('\n');
      }

      if (state.cancelled) {
        return;
      }

      // 모든 단계가 실패하면 거짓 "완료" 대신 오류로 보고 / report an error instead of a false "done" when every step failed
      if (!results.length) {
        onStatus(orchestrator.id, 'idle');
        onError('모든 단계가 실패했습니다 / every step failed');
        return;
      }

      onStatus(orchestrator.id, 'done');
      // 일부 단계가 실패했으면 완료 메시지에 명시 / note partial failures in the completion message
      onChunk(failed > 0
        ? '\n✅ ' + results.length + '개 단계 완료 (' + failed + '개 실패)'
        : '\n✅ 모든 단계 완료!');
      onDone(orchestrator.id, results.join('\n\n'));
    } catch (err) {
      if (state.cancelled) {
        return;
      }
      onStatus(orchestrator.id, 'idle');
      onError(err.message);
    }
  })();

  return cancel;
}

// === 팀 실행(사용자 구성 멀티에이전트) / Team execution (user-configured multi-agent) ===

// 리드(종합) 시스템 프롬프트 / the lead (synthesis) system prompt
function buildLeadPrompt(teamName) {
  return (
    '당신은 "' + teamName + '" 팀의 리더입니다. ' +
    '팀원들이 각자 작성한 결과를 받아, 중복을 정리하고 하나의 일관된 최종 답으로 종합합니다.' +
    LENGTH_GUIDE
  );
}

// 팀 작업 실행 / run a team task
// 멤버는 사용자가 만든 커스텀 에이전트들이며, 각자의 시스템프롬프트·모델로 동작한다.
// Members are the user's custom agents; each runs with its own system prompt and model.
// 순차: 멤버에게 순서대로 위임(앞 결과를 다음에 전달) 후 리드가 종합
// 병렬: 모든 멤버가 동시에 수행 후 리드가 종합
function runTeamTask({ team, task, onChunk, onStatus, onDone, onError }) {
  const state = { cancelled: false, activeCancels: [] };

  // 진행 중인 모든 호출을 취소 / cancel every in-flight call
  function cancel() {
    state.cancelled = true;
    for (const c of state.activeCancels) {
      try {
        c();
      } catch (err) {
        // 개별 취소 실패는 무시 / ignore individual cancel failures
      }
    }
    state.activeCancels = [];
  }

  // 호출을 추적하며 실행 / run a call while tracking it for cancellation
  function tracked(opts) {
    const handle = callClaude(opts);
    state.activeCancels.push(handle.cancel);
    return handle.promise;
  }

  // 한 멤버(커스텀 에이전트)를 실행해 결과 텍스트를 반환 / run one member agent, returning its output
  async function runMember(sub, extraContext) {
    const contextPrefix = extraContext
      ? '이전 단계 결과:\n' + extraContext + '\n\n이번 작업:\n'
      : '';
    return tracked({
      model: sub.model,
      systemPrompt: sub.systemPrompt,
      task: contextPrefix + task,
      onChunk
    });
  }

  (async () => {
    try {
      // 멤버 id를 실제 커스텀 에이전트로 해석(삭제된 멤버는 제외) / resolve member ids to agents
      const roster = (team.members || [])
        .map((m) => getAgent(m.agentId))
        .filter(Boolean);
      if (!roster.length) {
        onError('팀에 유효한 에이전트가 없습니다 (삭제되었을 수 있어요) / the team has no valid agents');
        return;
      }

      onStatus(team.id, 'working');
      const modeLabel = team.execution === 'parallel' ? '병렬' : '순차';
      onChunk('👥 "' + team.name + '" 팀이 작업을 시작합니다 (' + modeLabel + ' · 멤버 ' + roster.length + '명)\n');
      roster.forEach((sub, i) => {
        onChunk('  ' + (i + 1) + '. ' + sub.name + ' [' + sub.model + ']\n');
      });
      onChunk('\n');

      const memberResults = [];

      if (team.execution === 'parallel') {
        // 병렬: 동시에 수행(스트림 혼선을 막기 위해 라이브 출력 없이 수집)
        // parallel: run concurrently, collecting outputs without live streaming
        onChunk('▶ 모든 팀원이 동시에 작업 중...\n');
        roster.forEach((sub) => onStatus(sub.id, 'working'));
        const settled = await Promise.allSettled(
          roster.map((sub) => tracked({ model: sub.model, systemPrompt: sub.systemPrompt, task: task }))
        );
        if (state.cancelled) {
          return;
        }
        settled.forEach((res, i) => {
          const sub = roster[i];
          const label = '[' + (i + 1) + '. ' + sub.name + ']';
          if (res.status === 'fulfilled') {
            onStatus(sub.id, 'done');
            memberResults.push(label + '\n' + res.value);
            onChunk('\n' + label + '\n' + res.value + '\n');
          } else {
            onStatus(sub.id, 'idle');
            onChunk('\n⚠ ' + label + ' 오류: ' + res.reason.message + '\n');
          }
        });
      } else {
        // 순차: 앞 단계 결과를 다음 멤버에게 전달 / sequential: pass prior result forward
        let accumulated = '';
        for (let i = 0; i < roster.length; i++) {
          if (state.cancelled) {
            return;
          }
          const sub = roster[i];
          onStatus(sub.id, 'working');
          onChunk('\n▶ [' + (i + 1) + '/' + roster.length + '] ' + sub.name + ' 작업 중...\n');
          let text;
          try {
            text = await runMember(sub, accumulated);
          } catch (err) {
            if (state.cancelled) {
              return;
            }
            onStatus(sub.id, 'idle');
            onChunk('\n⚠ ' + sub.name + ' 단계에서 오류: ' + err.message + '\n');
            continue;
          }
          onStatus(sub.id, 'done');
          const label = '[' + (i + 1) + '. ' + sub.name + ']';
          memberResults.push(label + '\n' + text);
          accumulated += label + ': ' + text + '\n\n';
          onChunk('\n');
        }
      }

      if (state.cancelled) {
        return;
      }

      // 종합할 결과가 없으면 종료 / stop if no member produced output
      if (!memberResults.length) {
        onStatus(team.id, 'idle');
        onError('팀원들이 결과를 내지 못했습니다 / no member produced a result');
        return;
      }

      // 리드가 결과를 종합 / the lead synthesizes the results
      onChunk('\n🧩 리드가 결과를 종합하는 중...\n\n');
      const synthTask =
        '아래는 팀원들이 각자 작성한 결과입니다. 이를 하나의 최종 답으로 종합해 주세요.\n\n' +
        memberResults.join('\n\n') +
        '\n\n원래 작업: ' + task;
      let finalText;
      try {
        finalText = await tracked({
          model: team.leadModel,
          systemPrompt: buildLeadPrompt(team.name),
          task: synthTask,
          onChunk
        });
      } catch (err) {
        if (state.cancelled) {
          return;
        }
        // 종합 실패 시 멤버 결과를 그대로 사용 / fall back to raw member results
        finalText = memberResults.join('\n\n');
      }

      if (state.cancelled) {
        return;
      }

      onStatus(team.id, 'done');
      // 일부 팀원이 실패했으면 완료 메시지에 성공/전체 명수를 명시 / note success ratio when some members failed
      const failedCount = roster.length - memberResults.length;
      onChunk(failedCount > 0
        ? '\n\n✅ 팀 작업 완료 (' + memberResults.length + '/' + roster.length + '명 성공)'
        : '\n\n✅ 팀 작업 완료!');
      onDone(team.id, finalText);
    } catch (err) {
      if (state.cancelled) {
        return;
      }
      onStatus(team.id, 'idle');
      onError(err.message);
    }
  })();

  return cancel;
}

module.exports = {
  AI_MODE,
  AGENTS,
  CUSTOM_COLORS,
  SELECTABLE_MODELS,
  TEAM_EXECUTIONS,
  MAX_TEAM_MEMBERS,
  getAgent,
  listAgents,
  listCustomAgents,
  addCustomAgent,
  updateCustomAgent,
  deleteCustomAgent,
  listTeams,
  getTeam,
  addTeam,
  updateTeam,
  deleteTeam,
  randomGreeting,
  randomWorkingPhrase,
  runAgentTask,
  // 순수 함수(테스트용 export) / pure helpers exported for tests
  sanitizeModel,
  sanitizeExecution,
  parsePlan,
  readJsonSafe,
  writeJsonSafe
};
