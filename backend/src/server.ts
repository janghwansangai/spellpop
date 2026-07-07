import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { RoomManager } from './RoomManager';
import { RoomSettings } from './types';

dotenv.config();

const app = express();
app.use(cors());

// 서버 동작 확인용 헬스 체크 (배포 플랫폼의 상태 점검 경로)
app.get('/healthz', (_req, res) => {
  res.send('ok');
});

// 프로덕션: 빌드된 프론트엔드를 같은 서버에서 서빙 (단일 서비스 배포)
// dev(tsx, backend/src)와 build(node, backend/dist) 모두 저장소 루트 기준 2단계 위라 동일하게 동작
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const frontendIndex = path.join(frontendDist, 'index.html');
if (fs.existsSync(frontendIndex)) {
  app.use(express.static(frontendDist));
  // SPA 라우트(/room/:id, /game, /ranking) 새로고침 대응 폴백
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/socket.io')) return next();
    res.sendFile(frontendIndex);
  });
} else {
  app.get('/', (_req, res) => {
    res.send('English Spelling Game server is running. (frontend build not found)');
  });
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*', // 배포 시 프론트 주소로 제한 권장
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
  socket.on('create_room', (payload: { settings: Partial<RoomSettings>; nickname: string; single?: boolean }) => {
    roomManager.createRoom(socket, payload?.settings ?? {}, payload?.nickname, payload?.single === true);
  });

  socket.on('join_room', (payload: { roomId: string; nickname: string }) => {
    roomManager.joinRoom(socket, payload?.roomId, payload?.nickname);
  });

  socket.on('rejoin_room', (payload: { roomId: string; nickname: string }) => {
    roomManager.rejoinRoom(socket, payload?.roomId, payload?.nickname);
  });

  socket.on('start_game', (payload: { roomId: string }) => {
    if (typeof payload?.roomId === 'string') roomManager.startGame(socket, payload.roomId);
  });

  socket.on('submit_answer', (payload: { roomId: string; answer: string }) => {
    if (typeof payload?.roomId === 'string') roomManager.submitAnswer(socket, payload.roomId, payload.answer);
  });

  socket.on('pass_question', (payload: { roomId: string }) => {
    if (typeof payload?.roomId === 'string') roomManager.passQuestion(socket, payload.roomId);
  });

  socket.on('request_round_sync', (payload: { roomId: string }) => {
    if (typeof payload?.roomId === 'string') roomManager.sendRoundSnapshot(socket, payload.roomId);
  });

  socket.on('disconnect', () => {
    roomManager.handleDisconnect(socket);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
