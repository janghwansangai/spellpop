// 서버와 주고받는 데이터 타입 (backend/src/types.ts 의 Public* 타입과 동일 구조)

export type Difficulty = 'practice' | 'basic' | 'intermediate' | 'advanced' | 'expert';

export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type RoundPhase = 'get_ready' | 'showing_word' | 'answering' | 'round_result';

export interface RoomSettings {
  difficulty: Difficulty;
  wordShowTime: number;
  answerTime: number;
  questionCount: number;
  extraLetters: boolean;
}

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

export interface Letter {
  id: string;
  char: string;
}

export interface Submission {
  answer: string;
  timeTakenMs: number;
  correct: boolean;
  scoreEarned: number;
  passed: boolean;
}

export interface RoundStartPayload {
  questionIndex: number;
  totalQuestions: number;
  word: string;
  meaning: string;
  endsAt: number;
  showTime: number;
}

export interface AnswerPhasePayload {
  questionIndex: number;
  totalQuestions: number;
  meaning: string;
  wordLength: number;
  letters: Letter[];
  endsAt: number;
  answerTime: number;
}

export interface SubmissionAckPayload {
  correct: boolean;
  scoreEarned: number;
  passed: boolean;
  answer: string;
}

export interface RoundEndPayload {
  questionIndex: number;
  totalQuestions: number;
  correctWord: string;
  meaning: string;
  mySubmission: Submission | null;
  scoreboard: PublicPlayer[];
}

export interface GameOverPayload {
  ranking: PublicPlayer[];
  totalQuestions: number;
}

export interface RoundSnapshot {
  status: RoomStatus;
  phase: RoundPhase | null;
  endsAt: number;
  questionIndex: number;
  totalQuestions: number;
  myScore: number;
  word?: string;
  meaning?: string;
  wordLength?: number;
  letters?: Letter[];
  mySubmission?: Submission | null;
  correctWord?: string;
  scoreboard?: PublicPlayer[];
  ranking?: PublicPlayer[];
  submitted?: number;
  total?: number;
}
