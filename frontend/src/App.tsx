import { useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useGameStore } from './store/gameStore';
import { SERVER_URL } from './lib/game';
import { loadSession, clearSession } from './lib/session';
import type { PublicRoomState } from './types';
import Lobby from './pages/Lobby';
import WaitingRoom from './pages/WaitingRoom';
import GameScreen from './pages/GameScreen';
import Ranking from './pages/Ranking';

// 소켓 연결과 전역 이벤트(상태 갱신, 재입장)를 담당. Router 안에 있어야 navigate 사용 가능.
function SocketBridge() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    const socket = io(SERVER_URL);
    useGameStore.getState().setSocket(socket);

    socket.on('room_state_update', (state: PublicRoomState) => {
      useGameStore.getState().setRoomState(state);
    });

    // 새로고침/순간 끊김 후 자동 재입장 (계획서 9번)
    socket.on('connect', () => {
      const session = loadSession();
      if (session && !useGameStore.getState().roomState) {
        socket.emit('rejoin_room', session);
      }
    });

    socket.on('rejoin_success', ({ room, nickname }: { room: PublicRoomState; nickname: string }) => {
      const store = useGameStore.getState();
      store.setNickname(nickname);
      store.setRoomState(room);
      if (room.status === 'waiting') {
        navigateRef.current(`/room/${room.roomId}`);
      } else {
        // playing이면 게임 화면이 round_snapshot으로 현재 라운드를 복원하고,
        // finished면 스냅샷의 랭킹으로 결과 화면으로 이동한다.
        navigateRef.current('/game');
      }
    });

    socket.on('rejoin_failed', () => {
      clearSession();
    });

    return () => {
      useGameStore.getState().setSocket(null);
      socket.close();
    };
  }, []);

  return null;
}

function App() {
  return (
    <Router>
      <SocketBridge />
      <div className="min-h-screen flex items-center justify-center p-4">
        <Routes>
          <Route path="/" element={<Lobby />} />
          <Route path="/room/:roomId" element={<WaitingRoom />} />
          <Route path="/game" element={<GameScreen />} />
          <Route path="/ranking" element={<Ranking />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
