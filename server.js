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
const wss = new WebSocketServer({ server });

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

// 팀 변경 처리(성공 시 최신 팀 목록 회신, 실패 시 오류) / run a team mutation and reply
function handleTeamMutation(socket, mutate) {
  try {
    mutate();
    sendJson(socket, {
      type: 'team_list', teams: listTeams(), colors: CUSTOM_COLORS,
      models: SELECTABLE_MODELS, executions: TEAM_EXECUTIONS, maxMembers: MAX_TEAM_MEMBERS
    });
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
      handleAgentMutation(socket, () => {
        deleteCustomAgent(msg.id);
        return null;
      });
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

server.listen(PORT, () => {
  console.log('Server running on :' + PORT);
  console.log('AI 모드 / AI mode: ' + AI_MODE + (AI_MODE === 'cli' ? ' (구독 인증, 추가비용 없음)' : ' (API 키)'));
  console.log('게임 접속 / open: http://localhost:' + PORT);
});
