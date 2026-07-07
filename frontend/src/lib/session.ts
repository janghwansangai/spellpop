// 새로고침해도 같은 탭에서 게임에 재입장할 수 있도록 방 코드+닉네임을 보관 (계획서 9번)

const KEY = 'spelling-game-session';

export interface GameSession {
  roomId: string;
  nickname: string;
}

export function saveSession(session: GameSession) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // 저장 불가 환경(시크릿 모드 등)에서는 재입장만 포기
  }
}

export function loadSession(): GameSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameSession>;
    if (typeof parsed.roomId === 'string' && typeof parsed.nickname === 'string') {
      return { roomId: parsed.roomId, nickname: parsed.nickname };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
