export type Difficulty = 'practice' | 'basic' | 'intermediate' | 'advanced' | 'expert';

export interface Word {
  id: string;
  word: string;
  meaning: string;
  difficulty: Difficulty;
}

export interface Player {
  id: string; // 안정적인 플레이어 ID (소켓이 바뀌어도 유지 — 재접속 대비)
  nickname: string;
  socketId: string;
  score: number;
  correctCount: number;
  connected: boolean;
  isHost: boolean;
}

export interface RoomSettings {
  difficulty: Difficulty;
  wordShowTime: number; // 단어 노출 시간(초), 1~10
  answerTime: number; // 풀이 제한 시간(초), 5~30
  questionCount: number; // 문제 수, 5~30
  extraLetters: boolean; // 오답 알파벳 1~2개 섞기 (고급/최고급 권장 옵션)
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

// get_ready: 게임 시작 직후 준비 카운트다운 (클라이언트 화면 전환 시간 확보)
export type RoundPhase = 'get_ready' | 'showing_word' | 'answering' | 'round_result';

export interface Submission {
  answer: string;
  timeTakenMs: number;
  correct: boolean;
  scoreEarned: number;
  passed: boolean;
}

export interface Letter {
  id: string;
  char: string;
}

export interface RoomState {
  roomId: string;
  hostSocketId: string;
  isSingle: boolean;
  settings: RoomSettings;
  status: RoomStatus;
  players: Player[];
  currentQuestionIndex: number;
  questions: Word[];
  currentLetters: Letter[]; // 이번 문제의 (섞인) 알파벳 버튼 — 전원 동일하게 서버에서 생성
  submissions: Record<number, Record<string, Submission>>;
  lastActivityAt: number;
  roundPhase: RoundPhase | null;
  roundEndsAt: number; // 현재 단계가 끝나는 서버 timestamp(ms)
  answeringStartedAt: number; // 서버 측 풀이 시간 측정 기준
  roundTimer: ReturnType<typeof setTimeout> | null; // 방마다 단 하나의 진행 타이머만 유지
}

// 클라이언트로 보내는 상태: 정답(questions)·타인 답안(submissions)·소켓ID는 제외 (치팅 방지)
export interface PublicPlayer {
  id: string;
  nickname: string;
  score: number;
  correctCount: number;
  connected: boolean;
  isHost: boolean;
}

export interface PublicRoomState {
  roomId: string;
  isSingle: boolean;
  settings: RoomSettings;
  status: RoomStatus;
  players: PublicPlayer[];
  currentQuestionIndex: number;
  totalQuestions: number;
  roundPhase: RoundPhase | null;
  roundEndsAt: number;
}
