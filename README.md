# Agent Village

포켓몬풍 2D 탑다운 RPG로 둘러보는 **AI 에이전트 마을**.
플레이어가 마을·숲·해변·설원·동굴을 탐험하며 건물에 들어가고, Claude로 동작하는 에이전트 NPC에게
실제 AI 작업을 의뢰하면 응답이 대화창에 스트리밍됩니다.

A Pokémon-style top-down 2D RPG village of AI agents. Explore zones, enter buildings,
and delegate real AI tasks to Claude-powered agent NPCs with streaming replies.

## 특징 / Features

- **순수 바닐라 JS + HTML5 Canvas** (프레임워크·외부 이미지 없음, 모든 스프라이트는 Canvas 2D로 그림)
- **Node.js + Express + WebSocket** 백엔드, 응답 스트리밍
- **로컬 Claude Code CLI(구독 인증) 기본** — API 키 없이 추가 비용 없이 동작 (`AI_MODE=cli`). API 키 모드(`AI_MODE=api`)도 선택 가능
- 다중 구역(마을/공방/숲/해변/설원/동굴), 게이트 이동, 포켓몬식 나선 화면 전환
- 빌트인 에이전트 + 맵 이벤트 + 캐릭터 NPC, 배회 이동, 미니맵
- **에이전트 공방**: 내 커스텀 에이전트 생성/편집(이름·역할·모델·색)
- **에이전트 팀 빌더**: 내가 만든 에이전트들로 팀 구성, 순차/병렬 실행 + 리드 종합
- 대화창: 타이핑 효과, "생각 중" 회전 문구, 답변 전체 보기 리더(F 키)

## 실행 / Run

```bash
npm install        # 최초 1회 / first time
node server.js     # http://localhost:47913
```

기본 AI 모드는 `cli`로, 로컬에 로그인된 Claude Code CLI를 서브프로세스로 사용합니다(추가 비용 없음).
설정은 `.env`에서 변경할 수 있습니다(`.env.example` 참고).

## 조작 / Controls

- **WASD / 방향키**: 이동(대각선 없음)
- **Enter**: 상호작용 / 대화 진행
- **ESC**: 뒤로 / 취소 / 닫기
- **T**: 타이핑 속도 변경
- **F**: (답변 완료 시) 전체 답변 펼쳐 보기
- 문·출구·게이트에 닿으면 자동 전환

## 기술 스택 / Stack

Node.js, Express, `ws` (WebSocket), Vanilla JavaScript, HTML5 Canvas 2D.
AI: 로컬 Claude Code CLI(기본) 또는 `@anthropic-ai/sdk`(선택).
