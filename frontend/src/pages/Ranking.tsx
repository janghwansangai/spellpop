import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore';
import { clearSession } from '../lib/session';
import type { PublicPlayer } from '../types';

export default function Ranking() {
  const navigate = useNavigate();
  const nickname = useGameStore((s) => s.nickname);
  const finalResult = useGameStore((s) => s.finalResult);
  const roomState = useGameStore((s) => s.roomState);

  // game_over 데이터가 우선, 없으면(예외 경로) 방 상태의 점수로 정렬해 대체
  const ranking: PublicPlayer[] =
    finalResult?.ranking ??
    (roomState ? [...roomState.players].sort((a, b) => b.score - a.score) : []);
  const totalQuestions = finalResult?.totalQuestions ?? roomState?.totalQuestions ?? 0;

  if (ranking.length === 0) {
    return (
      <div className="glass max-w-2xl w-full p-8 rounded-3xl text-center anim-pop">
        <h2 className="text-2xl font-bold text-gray-500">결과를 불러올 수 없습니다.</h2>
        <button onClick={() => navigate('/')} className="btn-primary mt-8">
          처음으로
        </button>
      </div>
    );
  }

  const goHome = () => {
    clearSession();
    // 전체 새로고침으로 소켓/상태를 깨끗하게 초기화
    window.location.href = '/';
  };

  const accuracy = (p: PublicPlayer) =>
    totalQuestions > 0 ? Math.round((p.correctCount / totalQuestions) * 100) : 0;

  const podium = (p: PublicPlayer | undefined, place: 1 | 2 | 3) => {
    if (!p) return <div className="w-1/3" />;
    const style = {
      1: { height: 'h-44 md:h-48', bg: 'bg-yellow-300 border-yellow-500', num: 'text-yellow-700', medal: '🥇', delay: 'anim-rise-delay-2' },
      2: { height: 'h-32', bg: 'bg-gray-300 border-gray-400', num: 'text-gray-500', medal: '🥈', delay: 'anim-rise-delay-1' },
      3: { height: 'h-24', bg: 'bg-orange-300 border-orange-400', num: 'text-orange-600', medal: '🥉', delay: 'anim-rise' }
    }[place];

    return (
      <div className={`flex flex-col items-center w-1/3 ${place === 1 ? 'z-10' : ''} anim-rise ${style.delay}`}>
        <div className="text-3xl md:text-4xl mb-1">{style.medal}</div>
        <div
          className={`font-black mb-1 truncate w-full text-center px-1 ${
            place === 1 ? 'text-xl md:text-2xl text-yellow-600' : 'text-lg md:text-xl text-gray-600'
          }`}
        >
          {p.nickname}
          {p.nickname === nickname && ' (나)'}
        </div>
        <div className="text-base md:text-lg font-bold text-blue-600 mb-1">{p.score}점</div>
        <div className="text-xs font-bold text-gray-500 mb-2">
          정답률 {accuracy(p)}% ({p.correctCount}/{totalQuestions})
        </div>
        <div
          className={`w-full ${style.height} ${style.bg} rounded-t-2xl flex items-start justify-center pt-3 border-4 border-b-0 shadow-xl`}
        >
          <span className={`text-4xl md:text-5xl font-black ${style.num}`}>{place}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="glass max-w-4xl w-full p-6 md:p-8 rounded-3xl flex flex-col items-center anim-pop">
      <h1 className="text-4xl md:text-5xl font-black text-blue-600 drop-shadow-sm mb-2">🏆 최종 랭킹</h1>
      <p className="text-gray-500 font-bold mb-8">모두 수고했어요! 👏</p>

      {/* 상위 3명 시상대 (계획서 7번) */}
      <div className="flex items-end justify-center gap-3 md:gap-4 mb-10 w-full max-w-2xl">
        {podium(ranking[1], 2)}
        {podium(ranking[0], 1)}
        {podium(ranking[2], 3)}
      </div>

      {/* 4위 이하 목록 */}
      {ranking.length > 3 && (
        <div className="w-full max-w-2xl space-y-2 bg-white/50 p-4 md:p-6 rounded-3xl border border-white">
          {ranking.slice(3).map((player, idx) => (
            <div
              key={player.id}
              className={`flex justify-between items-center p-3 md:p-4 bg-white rounded-xl shadow-sm ${
                player.nickname === nickname ? 'ring-2 ring-blue-400 bg-blue-50' : ''
              }`}
            >
              <div className="flex gap-3 md:gap-4 items-center min-w-0">
                <span className="font-black text-gray-400 w-8 text-center shrink-0">{idx + 4}</span>
                <span className="font-bold text-gray-700 text-base md:text-lg truncate">
                  {player.nickname}
                  {player.nickname === nickname && ' (나)'}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className="font-black text-blue-500">{player.score}점</span>
                <span className="block text-xs font-bold text-gray-400">
                  정답률 {accuracy(player)}% ({player.correctCount}/{totalQuestions})
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={goHome} className="btn-primary flex items-center gap-2 mt-10 px-8">
        🏠 처음으로 돌아가기
      </button>
    </div>
  );
}
