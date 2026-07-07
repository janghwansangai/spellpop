import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { DIFFICULTY_ORDER, DIFFICULTY_LABELS, DIFFICULTY_DESCRIPTIONS, DIFFICULTY_PRESETS } from '../lib/game';
import { saveSession } from '../lib/session';
import { playStart } from '../lib/sounds';
import type { Difficulty, RoomSettings } from '../types';

export default function Lobby() {
  const [nicknameInput, setNicknameInput] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<RoomSettings>({
    difficulty: 'basic',
    ...DIFFICULTY_PRESETS.basic,
    questionCount: 10
  });
  const navigate = useNavigate();

  const socket = useGameStore((s) => s.socket);
  const setNickname = useGameStore((s) => s.setNickname);
  const resetGame = useGameStore((s) => s.resetGame);

  useEffect(() => {
    if (!socket) return;

    const handleRoomCreated = ({ roomId, single }: { roomId: string; single: boolean }) => {
      const nickname = useGameStore.getState().nickname;
      saveSession({ roomId, nickname });
      navigate(single ? '/game' : `/room/${roomId}`);
    };

    const handleRoomJoined = ({ roomId }: { roomId: string }) => {
      const nickname = useGameStore.getState().nickname;
      saveSession({ roomId, nickname });
      navigate(`/room/${roomId}`);
    };

    const handleError = (msg: string) => setError(msg);

    socket.on('room_created', handleRoomCreated);
    socket.on('room_joined', handleRoomJoined);
    socket.on('error_message', handleError);

    return () => {
      socket.off('room_created', handleRoomCreated);
      socket.off('room_joined', handleRoomJoined);
      socket.off('error_message', handleError);
    };
  }, [socket, navigate]);

  // 난이도 선택 시 추천값(노출/풀이 시간, 오답 알파벳)을 자동 적용 — 이후 자유 조정 가능
  const selectDifficulty = (difficulty: Difficulty) => {
    setSettings((prev) => ({
      ...prev,
      difficulty,
      ...DIFFICULTY_PRESETS[difficulty]
    }));
  };

  const validateNickname = (): string | null => {
    const nickname = nicknameInput.trim();
    if (!nickname) {
      setError('닉네임을 입력해주세요!');
      return null;
    }
    return nickname;
  };

  const startWithMode = (single: boolean) => {
    const nickname = validateNickname();
    if (!nickname || !socket) return;
    setError('');
    resetGame();
    setNickname(nickname);
    playStart();
    socket.emit('create_room', { settings, nickname, single });
  };

  const handleJoinRoom = () => {
    const nickname = validateNickname();
    if (!nickname || !socket) return;
    if (roomCode.trim().length !== 6) {
      setError('올바른 6자리 방 코드를 입력해주세요!');
      return;
    }
    setError('');
    resetGame();
    setNickname(nickname);
    socket.emit('join_room', { roomId: roomCode.trim().toUpperCase(), nickname });
  };

  const showExtraLettersOption = settings.difficulty === 'advanced' || settings.difficulty === 'expert';

  return (
    <div className="glass max-w-2xl w-full p-6 md:p-10 rounded-3xl anim-pop">
      <h1 className="text-3xl md:text-4xl font-black text-blue-600 drop-shadow-md text-center mb-1">
        🍎 스펠팝 <span className="text-purple-500">SpellPop</span>
      </h1>
      <p className="text-center text-gray-400 font-bold text-sm mb-1">초등 영단어 스펠링 게임</p>
      <p className="text-center text-gray-500 font-bold mb-8">
        단어를 기억하고, 뒤섞인 알파벳으로 빠르게 완성해요!
      </p>

      <div className="space-y-6">
        {/* 닉네임 */}
        <div>
          <label className="block text-left text-gray-700 font-bold mb-2">닉네임</label>
          <input
            type="text"
            className="w-full px-4 py-3 rounded-xl border-2 border-blue-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none transition-all text-lg font-bold"
            placeholder="사용할 닉네임 (1~12자)"
            value={nicknameInput}
            onChange={(e) => setNicknameInput(e.target.value)}
            maxLength={12}
          />
        </div>

        {/* 게임 설정 (계획서 4-3: 싱글은 본인, 멀티는 방장이 설정) */}
        <div className="bg-white/60 rounded-2xl p-5 border-2 border-white space-y-5">
          <h2 className="font-black text-gray-700 text-lg flex items-center gap-2">
            ⚙️ 게임 설정
            <span className="text-xs font-bold text-gray-400">(혼자 하기 · 방 만들기에 적용)</span>
          </h2>

          <div>
            <div className="font-bold text-gray-600 mb-2 text-left">난이도</div>
            <div className="grid grid-cols-5 gap-2">
              {DIFFICULTY_ORDER.map((d) => (
                <button
                  key={d}
                  onClick={() => selectDifficulty(d)}
                  className={`py-2 rounded-xl font-bold text-sm md:text-base transition-all border-2 ${
                    settings.difficulty === d
                      ? 'bg-purple-500 text-white border-purple-500 scale-105 shadow-md'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300'
                  }`}
                >
                  {DIFFICULTY_LABELS[d]}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 font-bold mt-2 text-left">
              {DIFFICULTY_DESCRIPTIONS[settings.difficulty]}
            </p>
          </div>

          <label className="block">
            <div className="flex justify-between font-bold text-gray-600 mb-1">
              <span>단어 노출 시간</span>
              <span className="text-blue-600">{settings.wordShowTime}초</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={settings.wordShowTime}
              onChange={(e) => setSettings((p) => ({ ...p, wordShowTime: Number(e.target.value) }))}
              className="w-full accent-blue-500"
            />
          </label>

          <label className="block">
            <div className="flex justify-between font-bold text-gray-600 mb-1">
              <span>문제 풀이 제한 시간</span>
              <span className="text-blue-600">{settings.answerTime}초</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              value={settings.answerTime}
              onChange={(e) => setSettings((p) => ({ ...p, answerTime: Number(e.target.value) }))}
              className="w-full accent-blue-500"
            />
          </label>

          <label className="block">
            <div className="flex justify-between font-bold text-gray-600 mb-1">
              <span>문제 수</span>
              <span className="text-blue-600">{settings.questionCount}문제</span>
            </div>
            <input
              type="range"
              min={5}
              max={30}
              value={settings.questionCount}
              onChange={(e) => setSettings((p) => ({ ...p, questionCount: Number(e.target.value) }))}
              className="w-full accent-blue-500"
            />
          </label>

          {showExtraLettersOption && (
            <label className="flex items-center gap-3 bg-purple-50 border-2 border-purple-200 rounded-xl px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.extraLetters}
                onChange={(e) => setSettings((p) => ({ ...p, extraLetters: e.target.checked }))}
                className="w-5 h-5 accent-purple-500"
              />
              <span className="font-bold text-purple-700 text-sm text-left">
                오답 알파벳 1~2개 섞기 <span className="text-purple-400">(고급/최고급 도전 옵션)</span>
              </span>
            </label>
          )}
        </div>

        {error && (
          <div className="bg-red-100 text-red-600 p-3 rounded-xl font-bold anim-shake">⚠️ {error}</div>
        )}

        {/* 모드 선택 (계획서 4-1) */}
        <div className="grid grid-cols-1 gap-3">
          <button onClick={() => startWithMode(true)} className="btn-primary w-full !bg-green-500 hover:!bg-green-600 py-4">
            🎮 혼자 하기 (싱글플레이)
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="flex-shrink-0 mx-4 text-gray-400 font-bold text-sm">멀티플레이</span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <button onClick={() => startWithMode(false)} className="btn-primary w-full">
            🏠 방 만들기 (친구들 초대)
          </button>

          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 min-w-0 px-4 py-3 rounded-xl border-2 border-purple-200 focus:border-purple-500 uppercase outline-none font-black tracking-widest text-center"
              placeholder="방 코드 6자리"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={6}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
            />
            <button onClick={handleJoinRoom} className="btn-secondary whitespace-nowrap">
              참가하기
            </button>
          </div>
          <p className="text-xs text-gray-400 font-bold text-center">
            방에 참가하면 방장이 정한 게임 설정을 따라요.
          </p>
        </div>
      </div>
    </div>
  );
}
