import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { clearSession } from '../lib/session';
import { playClick, playErase, playCorrect, playWrong, playStart } from '../lib/sounds';
import type {
  Letter,
  RoundPhase,
  RoundStartPayload,
  AnswerPhasePayload,
  SubmissionAckPayload,
  RoundEndPayload,
  GameOverPayload,
  RoundSnapshot
} from '../types';

interface RoundInfo {
  questionIndex: number;
  totalQuestions: number;
  word?: string;
  meaning: string;
  wordLength: number;
  letters: Letter[];
}

// 제출 현황만 따로 구독해 전체 게임 화면이 매 제출마다 리렌더링되지 않게 분리 (계획서 9번)
function SubmissionStatus({ visible }: { visible: boolean }) {
  const socket = useGameStore((s) => s.socket);
  const [counts, setCounts] = useState<{ submitted: number; total: number } | null>(null);

  useEffect(() => {
    if (!socket) return;
    const handler = (data: { submitted: number; total: number }) => setCounts(data);
    socket.on('submission_update', handler);
    return () => {
      socket.off('submission_update', handler);
    };
  }, [socket]);

  if (!visible || !counts) return null;
  return (
    <span className="bg-white/70 px-3 py-1 rounded-full font-bold text-gray-600 text-sm md:text-base">
      📝 제출 {counts.submitted} / {counts.total}명
    </span>
  );
}

export default function GameScreen() {
  const navigate = useNavigate();
  const socket = useGameStore((s) => s.socket);
  const nickname = useGameStore((s) => s.nickname);
  const isSingle = useGameStore((s) => s.roomState?.isSingle ?? true);
  const myScore = useGameStore(
    (s) => s.roomState?.players.find((p) => p.nickname === s.nickname)?.score ?? 0
  );

  const [phase, setPhase] = useState<RoundPhase>('get_ready');
  const [round, setRound] = useState<RoundInfo | null>(null);
  const [endsAt, setEndsAt] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [picked, setPicked] = useState<Letter[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [ack, setAck] = useState<SubmissionAckPayload | null>(null);
  const [result, setResult] = useState<RoundEndPayload | null>(null);

  useEffect(() => {
    const roomState = useGameStore.getState().roomState;
    if (!socket || !roomState) {
      navigate('/');
      return;
    }
    const roomId = roomState.roomId;

    const resetRoundLocalState = () => {
      setPicked([]);
      setSubmitted(false);
      setAck(null);
      setResult(null);
    };

    const handleRoundStart = (data: RoundStartPayload) => {
      resetRoundLocalState();
      setPhase('showing_word');
      setRound({
        questionIndex: data.questionIndex,
        totalQuestions: data.totalQuestions,
        word: data.word,
        meaning: data.meaning,
        wordLength: data.word.length,
        letters: []
      });
      setEndsAt(data.endsAt);
      playStart();
    };

    const handleAnswerPhase = (data: AnswerPhasePayload) => {
      setPhase('answering');
      setRound({
        questionIndex: data.questionIndex,
        totalQuestions: data.totalQuestions,
        meaning: data.meaning,
        wordLength: data.wordLength,
        letters: data.letters
      });
      setEndsAt(data.endsAt);
    };

    const handleAck = (data: SubmissionAckPayload) => {
      setAck(data);
      setSubmitted(true);
      if (data.correct) playCorrect();
      else if (!data.passed) playWrong();
    };

    const handleRoundEnd = (data: RoundEndPayload) => {
      setPhase('round_result');
      setResult(data);
    };

    const handleGameOver = (data: GameOverPayload) => {
      useGameStore.getState().setFinalResult(data);
      clearSession();
      navigate('/ranking');
    };

    // 화면 진입/새로고침 시 서버의 현재 라운드 상태로 즉시 동기화 —
    // 이벤트를 놓쳐도(예: 게임 화면 전환 중 도착한 round_start) 진행이 복원된다.
    const handleSnapshot = (snap: RoundSnapshot) => {
      if (snap.status === 'finished') {
        useGameStore.getState().setFinalResult({
          ranking: snap.ranking ?? [],
          totalQuestions: snap.totalQuestions
        });
        clearSession();
        navigate('/ranking');
        return;
      }
      if (snap.status === 'waiting') {
        navigate(`/room/${roomId}`);
        return;
      }
      setEndsAt(snap.endsAt);
      if (snap.phase === 'get_ready') {
        setPhase('get_ready');
      } else if (snap.phase === 'showing_word' && snap.word) {
        resetRoundLocalState();
        setPhase('showing_word');
        setRound({
          questionIndex: snap.questionIndex,
          totalQuestions: snap.totalQuestions,
          word: snap.word,
          meaning: snap.meaning ?? '',
          wordLength: snap.wordLength ?? snap.word.length,
          letters: []
        });
      } else if (snap.phase === 'answering') {
        setPhase('answering');
        setRound({
          questionIndex: snap.questionIndex,
          totalQuestions: snap.totalQuestions,
          meaning: snap.meaning ?? '',
          wordLength: snap.wordLength ?? 0,
          letters: snap.letters ?? []
        });
        if (snap.mySubmission) {
          setSubmitted(true);
          setAck({
            correct: snap.mySubmission.correct,
            scoreEarned: snap.mySubmission.scoreEarned,
            passed: snap.mySubmission.passed,
            answer: snap.mySubmission.answer
          });
        }
      } else if (snap.phase === 'round_result') {
        setPhase('round_result');
        setResult({
          questionIndex: snap.questionIndex,
          totalQuestions: snap.totalQuestions,
          correctWord: snap.correctWord ?? '',
          meaning: snap.meaning ?? '',
          mySubmission: snap.mySubmission ?? null,
          scoreboard: snap.scoreboard ?? []
        });
      }
    };

    socket.on('round_start', handleRoundStart);
    socket.on('answer_phase', handleAnswerPhase);
    socket.on('submission_ack', handleAck);
    socket.on('round_end', handleRoundEnd);
    socket.on('game_over', handleGameOver);
    socket.on('round_snapshot', handleSnapshot);

    socket.emit('request_round_sync', { roomId });

    return () => {
      socket.off('round_start', handleRoundStart);
      socket.off('answer_phase', handleAnswerPhase);
      socket.off('submission_ack', handleAck);
      socket.off('round_end', handleRoundEnd);
      socket.off('game_over', handleGameOver);
      socket.off('round_snapshot', handleSnapshot);
    };
  }, [socket, navigate]);

  // 서버가 준 절대 시각(endsAt) 기준으로 남은 시간 계산 — 클라이언트 타이머 오차/지연에 안전
  useEffect(() => {
    if (!endsAt) return;
    const update = () => setTimeLeft(Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 150);
    return () => clearInterval(timer);
  }, [endsAt]);

  // 글자 수를 다 채우면 자동 채점 (계획서 2-5)
  useEffect(() => {
    if (phase !== 'answering' || submitted || !round || round.wordLength === 0) return;
    if (picked.length === round.wordLength) {
      const answer = picked.map((l) => l.char).join('');
      setSubmitted(true);
      const roomId = useGameStore.getState().roomState?.roomId;
      if (roomId) socket?.emit('submit_answer', { roomId, answer });
    }
  }, [picked, phase, submitted, round, socket]);

  const roomState = useGameStore((s) => s.roomState);
  if (!roomState) return null;

  const handleLetterClick = (letter: Letter) => {
    if (submitted || phase !== 'answering' || !round) return;
    if (picked.some((p) => p.id === letter.id)) return;
    playClick();
    // 함수형 업데이트: 빠른 연속 터치로 클릭이 한 프레임에 몰려도 글자가 유실되지 않게
    setPicked((prev) => {
      if (prev.some((p) => p.id === letter.id) || prev.length >= round.wordLength) return prev;
      return [...prev, letter];
    });
  };

  const handleErase = () => {
    if (submitted || picked.length === 0) return;
    playErase();
    setPicked((prev) => prev.slice(0, -1));
  };

  const handleClearAll = () => {
    if (submitted || picked.length === 0) return;
    playErase();
    setPicked([]);
  };

  const handlePass = () => {
    if (submitted || phase !== 'answering') return;
    socket?.emit('pass_question', { roomId: roomState.roomId });
  };

  const questionLabel = round
    ? `${round.questionIndex + 1} / ${round.totalQuestions}`
    : `- / ${roomState.totalQuestions}`;

  const renderGetReady = () => (
    <div className="flex flex-col items-center justify-center space-y-6 anim-pop">
      <div className="text-6xl">🚀</div>
      <h2 className="text-3xl md:text-4xl font-black text-blue-600">게임이 곧 시작돼요!</h2>
      <p className="text-xl font-bold text-gray-500">단어가 나오면 집중해서 외워주세요.</p>
      {timeLeft > 0 && <div className="text-5xl font-black text-purple-500">{timeLeft}</div>}
    </div>
  );

  const renderShowingWord = () =>
    round && (
      <div className="flex flex-col items-center justify-center space-y-6 anim-pop">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-600">👀 단어를 기억하세요!</h2>
        <div className="text-5xl md:text-7xl font-black text-blue-600 tracking-widest bg-white/80 px-8 md:px-12 py-6 md:py-8 rounded-3xl shadow-xl">
          {round.word}
        </div>
        <div className="text-xl md:text-2xl font-bold text-gray-500">뜻: {round.meaning}</div>
        <div className="text-4xl font-black text-red-500 animate-pulse">{timeLeft}초</div>
      </div>
    );

  const renderAnswering = () =>
    round && (
      <div className="flex flex-col items-center space-y-5 md:space-y-6 w-full anim-fade">
        <div className="text-2xl md:text-3xl font-black text-purple-600 bg-white/80 px-8 py-4 rounded-2xl shadow-md text-center">
          {round.meaning}
        </div>

        {/* 조합 중인 글자 (글자 수만큼 빈 칸 표시) */}
        <div className="flex gap-2 flex-wrap justify-center bg-white/50 p-4 rounded-2xl w-full max-w-2xl min-h-20 items-center">
          {Array.from({ length: round.wordLength }, (_, i) => (
            <div
              key={i}
              className={`w-11 h-11 md:w-14 md:h-14 flex items-center justify-center text-2xl md:text-3xl font-black rounded-xl border-b-4 ${
                picked[i]
                  ? 'bg-blue-500 text-white border-blue-700 shadow-lg anim-pop'
                  : 'bg-white/70 text-gray-300 border-gray-200'
              }`}
            >
              {picked[i]?.char ?? ''}
            </div>
          ))}
        </div>

        {!submitted ? (
          <>
            {/* 알파벳 버튼 — 서버에서 전원 동일하게 섞어 내려줌 */}
            <div className="flex flex-wrap gap-3 md:gap-4 justify-center max-w-2xl">
              {round.letters.map((letter) => {
                const isUsed = picked.some((p) => p.id === letter.id);
                return (
                  <button
                    key={letter.id}
                    onClick={() => handleLetterClick(letter)}
                    disabled={isUsed}
                    className={`w-14 h-14 md:w-20 md:h-20 text-3xl md:text-4xl font-black rounded-2xl shadow-xl transition-all ${
                      isUsed
                        ? 'bg-gray-200 text-gray-400 scale-90 opacity-40'
                        : 'bg-white text-blue-600 hover:scale-105 active:scale-95 border-b-4 border-blue-200'
                    }`}
                  >
                    {letter.char}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 w-full max-w-md">
              <button
                onClick={handleErase}
                disabled={picked.length === 0}
                className="btn-secondary flex-1 !bg-gray-500 hover:!bg-gray-600 disabled:opacity-40 !text-base md:!text-lg"
              >
                ⬅️ 한 글자
              </button>
              <button
                onClick={handleClearAll}
                disabled={picked.length === 0}
                className="btn-secondary flex-1 !bg-gray-500 hover:!bg-gray-600 disabled:opacity-40 !text-base md:!text-lg"
              >
                🗑️ 전체 지우기
              </button>
              <button onClick={handlePass} className="btn-danger flex-1 !text-base md:!text-lg">
                ⏭️ 패스
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 anim-pop">
            {ack ? (
              ack.correct ? (
                <div className="text-3xl font-black text-green-500">🎉 정답! +{ack.scoreEarned}점</div>
              ) : ack.passed ? (
                <div className="text-3xl font-black text-gray-500">⏭️ 패스했어요</div>
              ) : (
                <div className="text-3xl font-black text-red-500">😢 아쉬워요!</div>
              )
            ) : (
              <div className="text-2xl font-bold text-gray-500">제출 완료!</div>
            )}
            {!isSingle && (
              <div className="text-lg font-bold text-gray-500 animate-pulse">
                다른 친구들을 기다리는 중...
              </div>
            )}
          </div>
        )}
      </div>
    );

  const renderRoundResult = () => {
    if (!result) return null;
    const mine = result.mySubmission;
    const isCorrect = mine?.correct ?? false;

    return (
      <div className="flex flex-col items-center justify-center space-y-6 w-full anim-rise">
        <h2 className="text-3xl md:text-4xl font-black">
          {isCorrect ? (
            <span className="text-green-500">정답입니다! 🎉</span>
          ) : mine?.passed ? (
            <span className="text-gray-500">패스했어요 ⏭️</span>
          ) : mine ? (
            <span className="text-red-500">오답입니다 😢</span>
          ) : (
            <span className="text-orange-500">시간 초과! ⏰</span>
          )}
        </h2>

        <div className="bg-white/80 p-6 md:p-8 rounded-3xl shadow-xl w-full max-w-md space-y-3 text-lg md:text-xl">
          <div className="flex justify-between border-b pb-2">
            <span className="font-bold text-gray-500">정답 단어</span>
            <span className="font-black text-blue-600">{result.correctWord}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="font-bold text-gray-500">뜻</span>
            <span className="font-bold text-gray-700">{result.meaning}</span>
          </div>
          <div className="flex justify-between border-b pb-2">
            <span className="font-bold text-gray-500">내 답안</span>
            <span className={`font-black ${isCorrect ? 'text-green-500' : 'text-red-500'}`}>
              {mine && !mine.passed && mine.answer ? mine.answer : '(패스/미제출)'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="font-bold text-gray-500">획득 점수</span>
            <span className="font-black text-purple-600">+{mine?.scoreEarned ?? 0}점</span>
          </div>
        </div>

        {!isSingle && result.scoreboard.length > 1 && (
          <div className="bg-white/60 rounded-2xl p-4 w-full max-w-md">
            <div className="font-bold text-gray-500 mb-2 text-center text-sm">🏆 현재 순위</div>
            <div className="space-y-1">
              {result.scoreboard.slice(0, 5).map((p, i) => (
                <div
                  key={p.id}
                  className={`flex justify-between px-3 py-1.5 rounded-lg font-bold ${
                    p.nickname === nickname ? 'bg-blue-100 text-blue-700' : 'text-gray-600'
                  }`}
                >
                  <span>
                    {i + 1}위 {p.nickname}
                    {p.nickname === nickname && ' (나)'}
                  </span>
                  <span>{p.score}점</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-gray-500 font-bold animate-pulse">잠시 후 다음 문제가 시작됩니다...</p>
      </div>
    );
  };

  return (
    <div className="glass max-w-5xl w-full min-h-[600px] p-4 md:p-8 rounded-3xl flex flex-col relative">
      {/* 상단 상태 바 */}
      <div className="flex justify-between items-center flex-wrap gap-2 mb-4 md:mb-6">
        <span className="bg-white/70 px-3 py-1 rounded-full font-bold text-gray-600 text-sm md:text-base">
          문제 {questionLabel}
        </span>
        <SubmissionStatus visible={!isSingle && phase === 'answering'} />
        <div className="flex items-center gap-2">
          {phase === 'answering' && (
            <span
              className={`px-3 py-1 rounded-full font-black text-sm md:text-base ${
                timeLeft <= 3 ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-white/70 text-gray-700'
              }`}
            >
              ⏱️ {timeLeft}초
            </span>
          )}
          <span className="bg-yellow-100 px-3 py-1 rounded-full font-black text-yellow-700 text-sm md:text-base">
            ⭐ {myScore}점
          </span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center">
        {phase === 'get_ready' && renderGetReady()}
        {phase === 'showing_word' && renderShowingWord()}
        {phase === 'answering' && renderAnswering()}
        {phase === 'round_result' && renderRoundResult()}
      </div>
    </div>
  );
}
