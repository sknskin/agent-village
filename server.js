'use strict';

// Express + WebSocket 서버 — 정적 게임 서빙 및 AI 작업 중계
// Express + WebSocket server — serves the static game and relays AI tasks

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const {
  AI_MODE,
  CUSTOM_COLORS,
  SELECTABLE_MODELS,
  TEAM_EXECUTIONS,
  MAX_TEAM_MEMBERS,
  listAgents,
  listCustomAgents,
  addCustomAgent,
  updateCustomAgent,
  deleteCustomAgent,
  listTeams,
  addTeam,
  updateTeam,
  deleteTeam,
  runAgentTask
} = require('./agents');

// === 상수 / Constants ===
const PORT = Number(process.env.PORT) || 3000;
// 바인딩 호스트 — 로컬 단일사용자 게임이라 기본 루프백, LAN 노출은 HOST=0.0.0.0로 명시적 옵트인
// bind host — loopback by default for a local single-user game; opt into LAN via HOST=0.0.0.0
const HOST = process.env.HOST || '127.0.0.1';
// 인바운드 WS 프레임 최대 크기(과대 입력 방지) / max inbound WS frame size (guards oversized input)
const WS_MAX_PAYLOAD = 64 * 1024;
const PUBLIC_DIR = path.join(__dirname, 'public');

// === Express 앱 / Express app ===
const app = express();
app.use(express.static(PUBLIC_DIR));

// 에이전트 메타데이터 API / agent metadata API
app.get('/api/agents', (req, res) => {
  res.json({ mode: AI_MODE, agents: listAgents() });
});

const server = http.createServer(app);

// === WebSocket 서버 / WebSocket server ===
// Origin 검증으로 악성 웹페이지의 교차 출처 WS 하이재킹(CSWSH) 차단
// validate Origin to block cross-site WebSocket hijacking (CSWSH) from a malicious page
const wss = new WebSocketServer({
  server,
  maxPayload: WS_MAX_PAYLOAD,
  verifyClient: ({ origin, req }) => {
    // 비브라우저 클라이언트(테스트 등)는 Origin이 없음 → 허용
    // non-browser clients (tests, etc.) send no Origin → allow
    if (!origin) {
      return true;
    }
    try {
      const host = new URL(origin).hostname;
      // 루프백이거나, 게임을 서빙한 바로 그 호스트(동일 출처, LAN 포함)에서 온 연결만 허용
      // allow only loopback, or the same host that served the game (same-origin, incl. LAN)
      if (host === 'localhost' || host === '127.0.0.1') {
        return true;
      }
      return origin === 'http://' + req.headers.host || origin === 'https://' + req.headers.host;
    } catch (err) {
      // Origin 파싱 실패 시 거부 / reject when the Origin cannot be parsed
      return false;
    }
  }
});

// 안전하게 JSON 메시지를 전송한다 / safely send a JSON message
function sendJson(socket, payload) {
  if (socket.readyState !== socket.OPEN) {
    return;
  }
  try {
    socket.send(JSON.stringify(payload));
  } catch (err) {
    // 직렬화/전송 실패는 로깅만 / log serialization or send failure
    console.error('WebSocket 전송 실패 / send failed:', err.message);
  }
}

// 커스텀 에이전트 변경 처리(성공 시 최신 목록 회신, 실패 시 오류) / run a mutation and reply
function handleAgentMutation(socket, mutate) {
  try {
    mutate();
    sendJson(socket, { type: 'agent_list', agents: listCustomAgents(), colors: CUSTOM_COLORS, models: SELECTABLE_MODELS });
  } catch (err) {
    sendJson(socket, { type: 'error', message: err.message });
  }
}

// 최신 팀 목록을 전송한다 / send the current team list
function sendTeamList(socket) {
  sendJson(socket, {
    type: 'team_list', teams: listTeams(), colors: CUSTOM_COLORS,
    models: SELECTABLE_MODELS, executions: TEAM_EXECUTIONS, maxMembers: MAX_TEAM_MEMBERS
  });
}

// 팀 변경 처리(성공 시 최신 팀 목록 회신, 실패 시 오류) / run a team mutation and reply
function handleTeamMutation(socket, mutate) {
  try {
    mutate();
    sendTeamList(socket);
  } catch (err) {
    sendJson(socket, { type: 'error', message: err.message });
  }
}

wss.on('connection', (socket) => {
  // 연결별 현재 작업 취소 함수 / per-connection active task canceller
  let activeCancel = null;

  // 진행 중 작업을 정리한다 / clean up the running task
  function clearActive() {
    if (activeCancel) {
      activeCancel();
      activeCancel = null;
    }
  }

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      sendJson(socket, { type: 'error', message: '잘못된 메시지 형식 / invalid message' });
      return;
    }

    if (msg.type === 'start_task') {
      // 이전 작업이 있으면 취소 / cancel any prior task
      clearActive();

      activeCancel = runAgentTask({
        agentId: msg.agentId,
        task: msg.task,
        onChunk: (text) => sendJson(socket, { type: 'chunk', text }),
        onStatus: (agentId, status) => sendJson(socket, { type: 'agent_status', agentId, status }),
        onDone: (agentId, fullText) => {
          activeCancel = null;
          sendJson(socket, { type: 'done', agentId, fullText });
        },
        onError: (message) => {
          activeCancel = null;
          sendJson(socket, { type: 'error', message });
        }
      });
    } else if (msg.type === 'cancel_task') {
      clearActive();
      sendJson(socket, { type: 'cancelled' });
    } else if (msg.type === 'list_agents') {
      // 커스텀 에이전트 목록 + 색상 팔레트 + 모델 옵션 / custom agent list + colors + models
      sendJson(socket, { type: 'agent_list', agents: listCustomAgents(), colors: CUSTOM_COLORS, models: SELECTABLE_MODELS });
    } else if (msg.type === 'create_agent') {
      handleAgentMutation(socket, () => addCustomAgent({
        name: msg.name, role: msg.role, color: msg.color, model: msg.model
      }));
    } else if (msg.type === 'update_agent') {
      handleAgentMutation(socket, () => updateCustomAgent(msg.id, {
        name: msg.name, role: msg.role, color: msg.color, model: msg.model
      }));
    } else if (msg.type === 'delete_agent') {
      let deleted = false;
      handleAgentMutation(socket, () => {
        deleteCustomAgent(msg.id);
        deleted = true;
      });
      // 에이전트 삭제는 팀 구성에 영향을 줄 수 있어 팀 목록도 갱신(성공 시에만)
      // agent deletion can cascade to teams, so refresh the team list on success
      if (deleted) {
        sendTeamList(socket);
      }
    } else if (msg.type === 'list_teams') {
      // 팀 목록 + 색상/모델/실행 옵션 / team list + colors/models/execution options
      sendJson(socket, {
        type: 'team_list', teams: listTeams(), colors: CUSTOM_COLORS,
        models: SELECTABLE_MODELS, executions: TEAM_EXECUTIONS, maxMembers: MAX_TEAM_MEMBERS
      });
    } else if (msg.type === 'create_team') {
      handleTeamMutation(socket, () => addTeam({
        name: msg.name, color: msg.color, leadModel: msg.leadModel,
        execution: msg.execution, members: msg.members
      }));
    } else if (msg.type === 'update_team') {
      handleTeamMutation(socket, () => updateTeam(msg.id, {
        name: msg.name, color: msg.color, leadModel: msg.leadModel,
        execution: msg.execution, members: msg.members
      }));
    } else if (msg.type === 'delete_team') {
      handleTeamMutation(socket, () => {
        deleteTeam(msg.id);
        return null;
      });
    } else {
      sendJson(socket, { type: 'error', message: '알 수 없는 요청 / unknown request: ' + msg.type });
    }
  });

  socket.on('close', () => {
    // 연결 종료 시 진행 중 작업 취소 / cancel running task on disconnect
    clearActive();
  });

  socket.on('error', (err) => {
    console.error('WebSocket 오류 / socket error:', err.message);
    clearActive();
  });
});

// 포트 충돌 등 리슨 오류 처리 / handle listen errors such as port conflicts
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('포트 ' + PORT + ' 가 이미 사용 중입니다 / port ' + PORT + ' is in use.');
    console.error('.env의 PORT 값을 바꾸거나 사용 중인 프로세스를 종료하세요 / change PORT in .env or stop the running process.');
  } else {
    console.error('서버 오류 / server error:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('Server running on ' + HOST + ':' + PORT);
  console.log('AI 모드 / AI mode: ' + AI_MODE + (AI_MODE === 'cli' ? ' (구독 인증, 추가비용 없음)' : ' (API 키)'));
  console.log('게임 접속 / open: http://localhost:' + PORT);
});

// 종료 신호 시 깔끔하게 정리(WebSocket·HTTP 서버 닫기) / graceful shutdown on termination signals
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log('\n' + signal + ' 수신 — 서버를 종료합니다 / shutting down...');
  // 열린 WebSocket을 닫고(진행 중 작업은 socket close에서 취소됨) HTTP 서버를 닫는다
  // close open sockets (in-flight tasks are cancelled on socket close), then the HTTP server
  for (const client of wss.clients) {
    try {
      client.close();
    } catch (err) {
      // 개별 소켓 종료 실패는 무시 / ignore individual close failures
    }
  }
  wss.close(() => {
    server.close(() => process.exit(0));
  });
  // 정해진 시간 내 정상 종료가 안 되면 강제 종료 / force-exit if close hangs
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
