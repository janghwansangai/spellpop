import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { DIFFICULTY_LABELS } from '../lib/game';
import { clearSession } from '../lib/session';

export default function WaitingRoom() {
  const socket = useGameStore((s) => s.socket);
  const roomState = useGameStore((s) => s.roomState);
  const nickname = useGameStore((s) => s.nickname);
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;
    const handleGameStarted = () => navigate('/game');
    socket.on('game_started', handleGameStarted);
    return () => {
      socket.off('game_started', handleGameStarted);
    };
  }, [socket, navigate]);

  // 대기실 정보가 없으면(직접 URL 진입 등) 로비로
  useEffect(() => {
    if (!socket || !roomState) {
      const t = setTimeout(() => {
        if (!useGameStore.getState().roomState) navigate('/');
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [socket, roomState, navigate]);

  if (!roomState) {
    return <div className="text-2xl font-bold text-gray-500 anim-fade">방 정보를 불러오는 중입니다...</div>;
  }

  const currentPlayer = roomState.players.find((p) => p.nickname === nickname);
  const isHost = currentPlayer?.isHost ?? false;

  const handleStartGame = () => {
    socket?.emit('start_game', { roomId: roomState.roomId });
  };

  const handleLeave = () => {
    clearSession();
    window.location.href = '/'; // 전체 새로고침으로 소켓을 끊어 서버에서 자동 퇴장 처리
  };

  return (
    <div className="glass max-w-4xl w-full p-6 md:p-8 rounded-3xl flex flex-col md:flex-row gap-8 anim-pop">
      {/* 왼쪽: 방 정보와 설정 */}
      <div className="flex-1 space-y-6 text-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-700">방 코드</h2>
          <div className="text-4xl md:text-5xl font-black text-blue-600 tracking-widest mt-2 bg-blue-100 py-4 rounded-2xl border-4 border-blue-200">
            {roomState.roomId}
          </div>
          <p className="text-gray-500 mt-2 text-sm font-bold">친구들에게 위 코드를 알려주세요!</p>
        </div>

        <div className="bg-white/50 rounded-2xl p-6 border-2 border-white">
          <h3 className="text-xl font-bold text-gray-700 mb-4">⚙️ 게임 설정</h3>
          <div className="space-y-3 text-left">
            <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl">
              <span className="font-bold text-gray-600">난이도</span>
              <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-lg font-bold">
                {DIFFICULTY_LABELS[roomState.settings.difficulty]}
              </span>
            </div>
            <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl">
              <span className="font-bold text-gray-600">단어 노출</span>
              <span className="font-bold text-gray-800">{roomState.settings.wordShowTime}초</span>
            </div>
            <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl">
              <span className="font-bold text-gray-600">풀이 시간</span>
              <span className="font-bold text-gray-800">{roomState.settings.answerTime}초</span>
            </div>
            <div className="flex justify-between items-center bg-white/60 p-3 rounded-xl">
              <span className="font-bold text-gray-600">문제 수</span>
              <span className="font-bold text-gray-800">{roomState.settings.questionCount}문제</span>
            </div>
            {roomState.settings.extraLetters && (
              <div className="flex justify-between items-center bg-purple-50 p-3 rounded-xl border border-purple-200">
                <span className="font-bold text-purple-600">오답 알파벳 섞기</span>
                <span className="font-bold text-purple-700">ON</span>
              </div>
            )}
          </div>
        </div>

        {isHost ? (
          <button
            onClick={handleStartGame}
            className="btn-primary w-full flex items-center justify-center gap-2 text-2xl py-4"
          >
            ▶️ 게임 시작!
          </button>
        ) : (
          <div className="bg-gray-200 text-gray-600 p-4 rounded-2xl font-bold animate-pulse">
            방장이 게임을 시작하기를 기다리는 중...
          </div>
        )}

        <button onClick={handleLeave} className="text-sm font-bold text-gray-400 hover:text-red-500 transition-colors">
          방 나가기
        </button>
      </div>

      {/* 오른쪽: 참가자 목록 (계획서 4-4: 실시간 인원 표시) */}
      <div className="flex-1 bg-white/50 rounded-3xl p-6 border-2 border-white flex flex-col md:h-[520px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-700">👥 참가자 목록</h3>
          <span className="bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-full">
            {roomState.players.length} / 30
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2 max-h-80 md:max-h-none">
          {roomState.players.map((player) => (
            <div
              key={player.id}
              className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all anim-rise ${
                player.nickname === nickname ? 'bg-blue-50 border-blue-200' : 'bg-white border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${player.connected ? 'bg-green-400' : 'bg-red-400'}`} />
                <span className="font-bold text-lg text-gray-800">
                  {player.nickname} {player.nickname === nickname && '(나)'}
                </span>
              </div>
              {player.isHost && (
                <span className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded-md font-bold">👑 방장</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
