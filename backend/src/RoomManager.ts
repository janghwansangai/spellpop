import { Server, Socket } from 'socket.io';
import {
  RoomState,
  RoomSettings,
  Player,
  Submission,
  Letter,
  Difficulty,
  PublicRoomState,
  PublicPlayer
} from './types';
import { getWordsByDifficulty } from './data/words';

const MAX_PLAYERS = 30;
const GET_READY_MS = 2500; // 게임 시작 → 1라운드 사이 준비 시간 (클라이언트 화면 전환 여유 포함)
const ROUND_RESULT_MS = 4000; // 문제 결과 표시 시간
const DIFFICULTIES: Difficulty[] = ['practice', 'basic', 'intermediate', 'advanced', 'expert'];

// 난이도 가중치 (계획서 6번: 고급/최고급 배점 가중)
const SCORE_WEIGHT: Record<Difficulty, number> = {
  practice: 1,
  basic: 1,
  intermediate: 1,
  advanced: 1.2,
  expert: 1.5
};

const clamp = (value: number, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

const shuffle = <T>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = a;
  }
  return copy;
};

export class RoomManager {
  private rooms: Map<string, RoomState> = new Map();
  private io: Server;

  // 자동 정리(cleanup) 설정 (계획서 8번)
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000;
  private readonly MAX_IDLE_TIME_MS = 10 * 60 * 1000; // 대기중 방치
  private readonly EMPTY_ROOM_GRACE_PERIOD_MS = 30 * 1000; // 전원 퇴장
  private readonly FINISHED_ROOM_GRACE_PERIOD_MS = 5 * 60 * 1000; // 종료 후 방치
  private readonly ABANDONED_GAME_GRACE_PERIOD_MS = 2 * 60 * 1000; // 게임중 전원 연결끊김

  constructor(io: Server) {
    this.io = io;
    setInterval(() => this.cleanupRooms(), this.CLEANUP_INTERVAL_MS).unref?.();
  }

  // ---------- 정리 로직 ----------

  private cleanupRooms() {
    const now = Date.now();
    for (const [roomId, room] of this.rooms.entries()) {
      const idle = now - room.lastActivityAt;
      const allDisconnected = room.players.length > 0 && room.players.every((p) => !p.connected);
      const shouldDelete =
        (room.players.length === 0 && idle > this.EMPTY_ROOM_GRACE_PERIOD_MS) ||
        (room.status === 'waiting' && idle > this.MAX_IDLE_TIME_MS) ||
        (room.status === 'finished' && idle > this.FINISHED_ROOM_GRACE_PERIOD_MS) ||
        (room.status === 'playing' && allDisconnected && idle > this.ABANDONED_GAME_GRACE_PERIOD_MS);

      if (shouldDelete) {
        console.log(`[cleanup] Removing room ${roomId} (status=${room.status}, idle=${Math.round(idle / 1000)}s)`);
        this.deleteRoom(roomId);
      }
    }
  }

  private deleteRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.clearRoundTimer(room);
    this.rooms.delete(roomId);
  }

  // ---------- 타이머: 방마다 단 하나만 유지 ----------
  // 이전 구현은 setTimeout이 라운드마다 쌓여, 전원이 일찍 제출한 뒤 남아있던
  // 옛 타이머가 "다음" 문제의 풀이 단계를 조기 종료시키는 버그가 있었다.
  // 진행 타이머를 방당 1개로 강제해 스테일 타이머 자체가 존재할 수 없게 한다.

  private clearRoundTimer(room: RoomState) {
    if (room.roundTimer) {
      clearTimeout(room.roundTimer);
      room.roundTimer = null;
    }
  }

  private setRoundTimer(room: RoomState, ms: number, fn: () => void) {
    this.clearRoundTimer(room);
    room.roundTimer = setTimeout(() => {
      room.roundTimer = null;
      fn();
    }, ms);
  }

  // ---------- 상태 브로드캐스트 (새니타이즈) ----------
  // 정답 목록/타인의 답안/소켓ID는 절대 클라이언트로 보내지 않는다 (계획서 5번 부정행위 방지).

  private toPublicPlayer(p: Player): PublicPlayer {
    return {
      id: p.id,
      nickname: p.nickname,
      score: p.score,
      correctCount: p.correctCount,
      connected: p.connected,
      isHost: p.isHost
    };
  }

  private toPublicState(room: RoomState): PublicRoomState {
    return {
      roomId: room.roomId,
      isSingle: room.isSingle,
      settings: room.settings,
      status: room.status,
      players: room.players.map((p) => this.toPublicPlayer(p)),
      currentQuestionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length || room.settings.questionCount,
      roundPhase: room.roundPhase,
      roundEndsAt: room.roundEndsAt
    };
  }

  private broadcastRoomState(roomId: string) {
    const room = this.rooms.get(roomId);
    if (room) {
      this.io.to(roomId).emit('room_state_update', this.toPublicState(room));
    }
  }

  private scoreboard(room: RoomState): PublicPlayer[] {
    return [...room.players]
      .map((p) => this.toPublicPlayer(p))
      .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount || a.nickname.localeCompare(b.nickname));
  }

  // ---------- 방 생성/참가 ----------

  private generateRoomId(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 혼동 문자(I/1, O/0, L) 제외
    let result;
    do {
      result = '';
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (this.rooms.has(result));
    return result;
  }

  private sanitizeSettings(raw: Partial<RoomSettings> | undefined): RoomSettings {
    const difficulty = raw && DIFFICULTIES.includes(raw.difficulty as Difficulty)
      ? (raw.difficulty as Difficulty)
      : 'basic';
    return {
      difficulty,
      wordShowTime: clamp(raw?.wordShowTime ?? 3, 1, 10, 3),
      answerTime: clamp(raw?.answerTime ?? 10, 5, 30, 10),
      questionCount: clamp(raw?.questionCount ?? 10, 5, 30, 10),
      extraLetters: raw?.extraLetters === true
    };
  }

  private sanitizeNickname(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const nickname = raw.trim();
    if (nickname.length < 1 || nickname.length > 12) return null;
    return nickname;
  }

  private makePlayer(socket: Socket, nickname: string, isHost: boolean): Player {
    return {
      id: `p_${Math.random().toString(36).slice(2, 10)}`,
      nickname,
      socketId: socket.id,
      score: 0,
      correctCount: 0,
      connected: true,
      isHost
    };
  }

  // 브라우저 뒤로가기 등으로 로비에 돌아와 새 방을 만들/참가할 때
  // 기존 방에서 먼저 내보내 소켓이 두 방에 동시에 속하지 않게 한다.
  private leaveCurrentRoom(socket: Socket) {
    this.handleDisconnect(socket);
    for (const roomId of socket.rooms) {
      if (roomId !== socket.id) socket.leave(roomId);
    }
  }

  public createRoom(socket: Socket, rawSettings: Partial<RoomSettings>, rawNickname: unknown, single: boolean) {
    const nickname = this.sanitizeNickname(rawNickname);
    if (!nickname) {
      socket.emit('error_message', '닉네임은 1~12자로 입력해주세요.');
      return;
    }
    this.leaveCurrentRoom(socket);

    const settings = this.sanitizeSettings(rawSettings);
    const roomId = this.generateRoomId();
    const hostPlayer = this.makePlayer(socket, nickname, true);

    const newRoom: RoomState = {
      roomId,
      hostSocketId: socket.id,
      isSingle: single,
      settings,
      status: 'waiting',
      players: [hostPlayer],
      currentQuestionIndex: 0,
      questions: [],
      currentLetters: [],
      submissions: {},
      lastActivityAt: Date.now(),
      roundPhase: null,
      roundEndsAt: 0,
      answeringStartedAt: 0,
      roundTimer: null
    };

    this.rooms.set(roomId, newRoom);
    socket.join(roomId);
    socket.emit('room_created', { roomId, single });
    this.broadcastRoomState(roomId);

    // 싱글플레이는 대기실 없이 곧바로 시작 (계획서 2번)
    if (single) {
      this.beginGame(newRoom);
    }
  }

  public joinRoom(socket: Socket, roomId: unknown, rawNickname: unknown) {
    const nickname = this.sanitizeNickname(rawNickname);
    if (!nickname) {
      socket.emit('error_message', '닉네임은 1~12자로 입력해주세요.');
      return;
    }

    const room = typeof roomId === 'string' ? this.rooms.get(roomId.toUpperCase()) : undefined;
    if (!room) {
      socket.emit('error_message', '존재하지 않는 방 코드입니다. 다시 확인해주세요.');
      return;
    }
    if (room.status !== 'waiting') {
      socket.emit('error_message', '이미 게임이 시작된 방입니다.');
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('error_message', `방 인원이 가득 찼습니다. (최대 ${MAX_PLAYERS}명)`);
      return;
    }
    if (room.players.some((p) => p.nickname === nickname)) {
      socket.emit('error_message', '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.');
      return;
    }
    this.leaveCurrentRoom(socket);

    const newPlayer = this.makePlayer(socket, nickname, false);
    room.players.push(newPlayer);
    room.lastActivityAt = Date.now();
    socket.join(room.roomId);
    socket.emit('room_joined', { roomId: room.roomId });
    this.broadcastRoomState(room.roomId);
  }

  // ---------- 게임 진행 ----------

  public startGame(socket: Socket, roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.hostSocketId !== socket.id) {
      socket.emit('error_message', '방장만 게임을 시작할 수 있습니다.');
      return;
    }
    if (room.status !== 'waiting') return;
    this.beginGame(room);
  }

  private beginGame(room: RoomState) {
    room.status = 'playing';
    room.currentQuestionIndex = 0;
    room.submissions = {};
    room.questions = getWordsByDifficulty(room.settings.difficulty, room.settings.questionCount);
    room.lastActivityAt = Date.now();

    if (room.questions.length === 0) {
      room.status = 'waiting';
      this.io.to(room.roomId).emit('error_message', '단어 데이터를 불러오지 못했습니다.');
      return;
    }

    // 준비 단계를 두어 클라이언트가 게임 화면으로 전환할 시간을 확보한다.
    // (이전 구현은 game_started 직후 곧바로 round_start를 보내 첫 문제 단어가 표시되지 않았다.)
    room.roundPhase = 'get_ready';
    room.roundEndsAt = Date.now() + GET_READY_MS;
    this.io.to(room.roomId).emit('game_started');
    this.broadcastRoomState(room.roomId);
    this.setRoundTimer(room, GET_READY_MS, () => this.startRound(room.roomId));
  }

  private startRound(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    if (room.currentQuestionIndex >= room.questions.length) {
      this.endGame(roomId);
      return;
    }

    const question = room.questions[room.currentQuestionIndex];
    if (!question) {
      this.endGame(roomId);
      return;
    }

    room.lastActivityAt = Date.now();
    room.roundPhase = 'showing_word';
    room.roundEndsAt = Date.now() + room.settings.wordShowTime * 1000;
    room.currentLetters = this.buildLetters(room, question.word);

    this.io.to(roomId).emit('round_start', {
      questionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      word: question.word,
      meaning: question.meaning,
      endsAt: room.roundEndsAt,
      showTime: room.settings.wordShowTime
    });
    this.broadcastRoomState(roomId);

    this.setRoundTimer(room, room.settings.wordShowTime * 1000, () => this.startAnsweringPhase(roomId));
  }

  // 알파벳 버튼 생성: 서버에서 한 번만 섞어 모든 참가자가 같은 배치를 받는다(공정성).
  // extraLetters 옵션 시 오답 알파벳 1~2개 추가 (계획서 3번 고급/최고급 옵션).
  private buildLetters(room: RoomState, word: string): Letter[] {
    const letters: Letter[] = word.split('').map((char, i) => ({ id: `L${i}`, char }));
    if (room.settings.extraLetters) {
      const alphabet = 'abcdefghijklmnopqrstuvwxyz';
      const dummyCount = 1 + Math.floor(Math.random() * 2); // 1~2개
      for (let d = 0; d < dummyCount; d++) {
        const char = alphabet.charAt(Math.floor(Math.random() * alphabet.length));
        letters.push({ id: `X${d}`, char });
      }
    }
    return shuffle(letters);
  }

  private startAnsweringPhase(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'playing' || room.roundPhase !== 'showing_word') return;

    const question = room.questions[room.currentQuestionIndex];
    if (!question) return;

    room.roundPhase = 'answering';
    room.answeringStartedAt = Date.now();
    room.roundEndsAt = room.answeringStartedAt + room.settings.answerTime * 1000;
    room.submissions[room.currentQuestionIndex] = {};

    this.io.to(roomId).emit('answer_phase', {
      questionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      meaning: question.meaning,
      wordLength: question.word.length,
      letters: room.currentLetters,
      endsAt: room.roundEndsAt,
      answerTime: room.settings.answerTime
    });
    this.emitSubmissionUpdate(room);
    this.broadcastRoomState(roomId);

    // 제한시간 초과 시 강제 종료 (전원 제출 시에는 setRoundTimer가 먼저 교체/해제됨)
    this.setRoundTimer(room, room.settings.answerTime * 1000, () => this.endRound(roomId));
  }

  private emitSubmissionUpdate(room: RoomState) {
    const submissions = room.submissions[room.currentQuestionIndex] ?? {};
    const total = room.players.filter((p) => p.connected).length;
    this.io.to(room.roomId).emit('submission_update', {
      submitted: Object.keys(submissions).length,
      total
    });
  }

  public submitAnswer(socket: Socket, roomId: string, rawAnswer: unknown, passed = false) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'playing' || room.roundPhase !== 'answering') return;

    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    const qIndex = room.currentQuestionIndex;
    const submissions = room.submissions[qIndex] ?? (room.submissions[qIndex] = {});
    if (submissions[player.id]) return; // 한 문제당 한 번만 제출 허용

    const question = room.questions[qIndex];
    if (!question) return;

    const answer = passed ? '' : String(typeof rawAnswer === 'string' ? rawAnswer : '').trim().toLowerCase();
    // 풀이 시간은 클라이언트 신고값이 아니라 서버 시계로 계산한다 (조작 방지, 계획서 9번)
    const timeTakenMs = Math.min(
      Math.max(0, Date.now() - room.answeringStartedAt),
      room.settings.answerTime * 1000
    );

    const isCorrect = !passed && answer === question.word;
    let scoreEarned = 0;
    if (isCorrect) {
      const baseScore = 100;
      const maxMs = room.settings.answerTime * 1000;
      const speedScore = Math.floor(((maxMs - timeTakenMs) / maxMs) * 100);
      scoreEarned = Math.round((baseScore + speedScore) * SCORE_WEIGHT[room.settings.difficulty]);
      player.score += scoreEarned;
      player.correctCount += 1;
    }

    const submission: Submission = { answer, timeTakenMs, correct: isCorrect, scoreEarned, passed };
    submissions[player.id] = submission;
    room.lastActivityAt = Date.now();

    // 본인에게 즉시 피드백 (계획서 5번: 정답/오답 즉시 피드백)
    socket.emit('submission_ack', {
      correct: isCorrect,
      scoreEarned,
      passed,
      answer
    });

    this.emitSubmissionUpdate(room);
    this.checkRoundComplete(room);
  }

  public passQuestion(socket: Socket, roomId: string) {
    this.submitAnswer(socket, roomId, '', true);
  }

  // 접속 중인 전원이 제출/패스했으면 즉시 라운드 종료 (계획서 2-8)
  private checkRoundComplete(room: RoomState) {
    if (room.status !== 'playing' || room.roundPhase !== 'answering') return;
    const submissions = room.submissions[room.currentQuestionIndex] ?? {};
    const connectedPlayers = room.players.filter((p) => p.connected);
    if (connectedPlayers.length === 0) return; // 전원 이탈 시 타임아웃/클린업에 맡김
    const everyoneSubmitted = connectedPlayers.every((p) => submissions[p.id]);
    if (everyoneSubmitted) {
      this.endRound(room.roomId);
    }
  }

  private endRound(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'playing' || room.roundPhase !== 'answering') return;

    this.clearRoundTimer(room);
    room.roundPhase = 'round_result';
    room.roundEndsAt = Date.now() + ROUND_RESULT_MS;
    room.lastActivityAt = Date.now();

    const qIndex = room.currentQuestionIndex;
    const question = room.questions[qIndex];
    const submissions = room.submissions[qIndex] ?? {};
    const board = this.scoreboard(room);

    // 각 참가자에게 "본인 결과만" 전송 — 타인의 답안은 노출하지 않는다 (계획서 5번)
    for (const player of room.players) {
      if (!player.connected) continue;
      this.io.to(player.socketId).emit('round_end', {
        questionIndex: qIndex,
        totalQuestions: room.questions.length,
        correctWord: question?.word ?? '',
        meaning: question?.meaning ?? '',
        mySubmission: submissions[player.id] ?? null,
        scoreboard: board
      });
    }

    room.currentQuestionIndex++;
    this.broadcastRoomState(roomId);
    this.setRoundTimer(room, ROUND_RESULT_MS, () => this.startRound(roomId));
  }

  private endGame(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.clearRoundTimer(room);
    room.status = 'finished';
    room.roundPhase = null;
    room.roundEndsAt = 0;
    room.lastActivityAt = Date.now();

    this.io.to(roomId).emit('game_over', {
      ranking: this.scoreboard(room),
      totalQuestions: room.questions.length
    });
    this.broadcastRoomState(roomId);
  }

  // ---------- 라운드 동기화/재입장 (계획서 9번) ----------

  // 게임 화면이 늦게 마운트되거나 새로고침해도 현재 라운드 상태를 복원할 수 있게
  // 요청 시점의 스냅샷을 내려준다.
  public sendRoundSnapshot(socket: Socket, roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    const snapshot: Record<string, unknown> = {
      status: room.status,
      phase: room.roundPhase,
      endsAt: room.roundEndsAt,
      questionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length || room.settings.questionCount,
      myScore: player.score
    };

    if (room.status === 'finished') {
      snapshot.ranking = this.scoreboard(room);
    } else if (room.status === 'playing') {
      // round_result 단계에서는 다음 문제 인덱스가 이미 증가해 있으므로 직전 문제를 참조
      const qIndex = room.roundPhase === 'round_result'
        ? room.currentQuestionIndex - 1
        : room.currentQuestionIndex;
      const question = room.questions[qIndex];
      if (question) {
        snapshot.questionIndex = qIndex;
        snapshot.meaning = question.meaning;
        snapshot.wordLength = question.word.length;
        if (room.roundPhase === 'showing_word') {
          snapshot.word = question.word;
        }
        if (room.roundPhase === 'answering') {
          snapshot.letters = room.currentLetters;
          const submissions = room.submissions[qIndex] ?? {};
          const mine = submissions[player.id];
          snapshot.mySubmission = mine ?? null;
          snapshot.submitted = Object.keys(submissions).length;
          snapshot.total = room.players.filter((p) => p.connected).length;
        }
        if (room.roundPhase === 'round_result') {
          const submissions = room.submissions[qIndex] ?? {};
          snapshot.correctWord = question.word;
          snapshot.mySubmission = submissions[player.id] ?? null;
          snapshot.scoreboard = this.scoreboard(room);
        }
      }
    }

    socket.emit('round_snapshot', snapshot);
  }

  // 새로고침/순간 연결 끊김 후 방 코드 + 닉네임으로 재입장
  public rejoinRoom(socket: Socket, roomId: unknown, rawNickname: unknown) {
    const nickname = this.sanitizeNickname(rawNickname);
    const room = typeof roomId === 'string' ? this.rooms.get(roomId.toUpperCase()) : undefined;
    if (!room || !nickname) {
      socket.emit('rejoin_failed');
      return;
    }

    const player = room.players.find((p) => p.nickname === nickname);
    if (!player) {
      socket.emit('rejoin_failed');
      return;
    }

    // 기존 연결이 살아있는 소켓을 다른 탭이 가로채지 못하게 차단
    if (player.connected && this.io.sockets.sockets.has(player.socketId)) {
      socket.emit('rejoin_failed');
      return;
    }

    player.socketId = socket.id;
    player.connected = true;
    if (player.isHost) {
      room.hostSocketId = socket.id;
    }
    room.lastActivityAt = Date.now();
    socket.join(room.roomId);

    socket.emit('rejoin_success', { room: this.toPublicState(room), nickname });
    this.broadcastRoomState(room.roomId);
    if (room.status === 'playing' && room.roundPhase === 'answering') {
      this.emitSubmissionUpdate(room);
    }
  }

  // ---------- 연결 끊김 처리 ----------

  public handleDisconnect(socket: Socket) {
    for (const [roomId, room] of this.rooms.entries()) {
      const playerIndex = room.players.findIndex((p) => p.socketId === socket.id);
      if (playerIndex === -1) continue;

      const player = room.players[playerIndex]!;
      room.lastActivityAt = Date.now();

      if (room.status === 'waiting') {
        // 대기실에서는 목록에서 제거
        room.players.splice(playerIndex, 1);
        if (player.isHost && room.players.length > 0) {
          this.transferHost(room, room.players[0]!);
        }
      } else {
        // 게임 중에는 연결 끊김으로만 표시 — 나머지 인원 진행에 영향 없음 (계획서 12번)
        player.connected = false;
        if (player.isHost) {
          const nextHost = room.players.find((p) => p.connected);
          if (nextHost) {
            player.isHost = false;
            this.transferHost(room, nextHost);
          }
        }
        if (room.status === 'playing' && room.roundPhase === 'answering') {
          // 이탈자를 제외하고 전원 제출 여부 재판정
          this.emitSubmissionUpdate(room);
          this.checkRoundComplete(room);
        }
      }

      this.broadcastRoomState(roomId);
      break;
    }
  }

  private transferHost(room: RoomState, nextHost: Player) {
    for (const p of room.players) p.isHost = false;
    nextHost.isHost = true;
    room.hostSocketId = nextHost.socketId;
  }
}
