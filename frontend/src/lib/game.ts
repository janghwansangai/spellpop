import type { Difficulty } from '../types';

// 개발 시엔 로컬 백엔드(3001), 배포 빌드에선 프론트를 서빙하는 같은 주소로 접속
export const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

export const DIFFICULTY_ORDER: Difficulty[] = ['practice', 'basic', 'intermediate', 'advanced', 'expert'];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  practice: '연습',
  basic: '기본',
  intermediate: '중급',
  advanced: '고급',
  expert: '최고급'
};

export const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  practice: '워밍업 · 3~4글자',
  basic: '3~4학년 수준',
  intermediate: '4~5학년 수준',
  advanced: '5~6학년 수준',
  expert: '6학년 심화 · 긴 단어'
};

// 난이도 선택 시 추천 기본값 (계획서 3번). 사용자가 이후 슬라이더로 조정 가능.
export const DIFFICULTY_PRESETS: Record<
  Difficulty,
  { wordShowTime: number; answerTime: number; extraLetters: boolean }
> = {
  practice: { wordShowTime: 4, answerTime: 15, extraLetters: false },
  basic: { wordShowTime: 3, answerTime: 12, extraLetters: false },
  intermediate: { wordShowTime: 3, answerTime: 10, extraLetters: false },
  advanced: { wordShowTime: 2, answerTime: 10, extraLetters: true },
  expert: { wordShowTime: 2, answerTime: 8, extraLetters: true }
};
