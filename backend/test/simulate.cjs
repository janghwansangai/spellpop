/* 스펠팝 SpellPop — 서버 게임 루프 시뮬레이션 테스트 (소켓 이벤트 기반, 브라우저 불필요)
 *
 * 검증 항목: 싱글 완주 / 2인 멀티(조기종료·타임아웃·이탈·재입장) / 오답알파벳·난이도 가중치 /
 *           힌트(점수 절반·입력차단·멱등) / 최고급 단어 풀 확장
 *
 * 실행법:
 *   1) 로컬 dev 서버 대상:   cd backend && npm run dev   (다른 터미널에서) npm run test:sim
 *   2) 임의 포트 대상:        TEST_PORT=3101 npm run test:sim
 *   3) 배포된 라이브 서버:    TEST_URL=https://spellpop.onrender.com npm run test:sim
 */
const { io } = require('socket.io-client');

const URL = process.env.TEST_URL || 'http://localhost:' + (process.env.TEST_PORT || 3101);
const EVENTS = [
  'room_created', 'room_joined', 'room_state_update', 'game_started',
  'round_start', 'answer_phase', 'submission_ack', 'round_end', 'game_over',
  'error_message', 'submission_update', 'rejoin_success', 'rejoin_failed', 'round_snapshot',
  'hint_data'
];

let passCount = 0, failCount = 0;
const pass = (name, extra = '') => { passCount++; console.log(`  PASS  ${name} ${extra}`); };
const fail = (name, extra = '') => { failCount++; console.log(`  FAIL  ${name} ${extra}`); };
const assert = (cond, name, extra = '') => (cond ? pass(name, extra) : fail(name, extra));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect() {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const log = [];
  for (const ev of EVENTS) socket.on(ev, (data) => log.push({ ev, data, t: Date.now() }));
  return { socket, log };
}

async function until(log, pred, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hit = log.find(pred);
    if (hit) return hit;
    await sleep(40);
  }
  throw new Error(`timeout(${timeoutMs}ms): ${label}`);
}

const sortedChars = (s) => s.split('').sort().join('');

async function testSinglePlayer() {
  console.log('\n[테스트 1] 싱글플레이 5문제 완주');
  const { socket, log } = connect();
  try {
    socket.emit('create_room', {
      settings: { difficulty: 'practice', wordShowTime: 1, answerTime: 5, questionCount: 5, extraLetters: false },
      nickname: '테스터',
      single: true
    });
    const rc = await until(log, (e) => e.ev === 'room_created', 5000, 'room_created');
    const roomId = rc.data.roomId;
    assert(/^[A-Z0-9]{6}$/.test(roomId), '6자리 방 코드 발급', roomId);
    assert(rc.data.single === true, '싱글 모드 플래그');
    await until(log, (e) => e.ev === 'game_started', 5000, 'game_started(자동 시작)');
    pass('대기실 없이 자동 게임 시작');

    const seenWords = [];
    for (let q = 0; q < 5; q++) {
      const rs = await until(log, (e) => e.ev === 'round_start' && e.data.questionIndex === q, 20000, `round_start #${q}`);
      assert(typeof rs.data.word === 'string' && rs.data.word.length >= 3, `Q${q} 단어 노출`, rs.data.word);
      seenWords.push(rs.data.word);
      const ap = await until(log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === q, 20000, `answer_phase #${q}`);
      const letterChars = ap.data.letters.map((l) => l.char).join('');
      assert(sortedChars(letterChars) === sortedChars(rs.data.word), `Q${q} 알파벳 버튼 = 정답 글자 구성`, `[${letterChars}]`);
      assert(ap.data.wordLength === rs.data.word.length, `Q${q} 글자 수 전달`);

      socket.emit('submit_answer', { roomId, answer: rs.data.word });
      const ack = await until(log, (e) => e.ev === 'submission_ack' && e.t >= ap.t, 5000, `ack #${q}`);
      assert(ack.data.correct === true && ack.data.scoreEarned >= 100, `Q${q} 정답 처리 + 속도 점수`, `+${ack.data.scoreEarned}점`);
      const re = await until(log, (e) => e.ev === 'round_end' && e.data.questionIndex === q, 20000, `round_end #${q}`);
      assert(re.t - ap.t < 2500, `Q${q} 제출 즉시 라운드 종료(싱글)`, `${re.t - ap.t}ms`);
      assert(re.data.correctWord === rs.data.word, `Q${q} 결과에 정답 공개`);
    }
    assert(new Set(seenWords).size === 5, '5문제 모두 서로 다른 단어', seenWords.join(','));

    const go = await until(log, (e) => e.ev === 'game_over', 15000, 'game_over');
    const me = go.data.ranking[0];
    assert(go.data.ranking.length === 1 && me.correctCount === 5, '최종 랭킹: 정답 수 5/5', `${me.score}점`);
    assert(go.data.totalQuestions === 5, '총 문제 수 전달');
    assert(me.score >= 500, '점수 누적(문제당 100점 이상)', `${me.score}점`);
  } finally {
    socket.close();
  }
}

async function testMultiplayer() {
  console.log('\n[테스트 2] 2인 멀티플레이: 조기 종료·타임아웃·이탈·재입장');
  const a = connect(), b = connect();
  let b2 = null;
  try {
    a.socket.emit('create_room', {
      settings: { difficulty: 'basic', wordShowTime: 1, answerTime: 6, questionCount: 5, extraLetters: false },
      nickname: 'A호스트',
      single: false
    });
    const rc = await until(a.log, (e) => e.ev === 'room_created', 5000, 'room_created');
    const roomId = rc.data.roomId;

    b.socket.emit('join_room', { roomId, nickname: 'B친구' });
    await until(b.log, (e) => e.ev === 'room_joined', 5000, 'room_joined');
    const stateAfterJoin = await until(a.log, (e) => e.ev === 'room_state_update' && e.data.players.length === 2, 5000, '참가자 2명 상태');
    pass('방 참가 + 실시간 참가자 목록', `${stateAfterJoin.data.players.map((p) => p.nickname).join(', ')}`);
    assert(!('questions' in stateAfterJoin.data) && !('submissions' in stateAfterJoin.data) && !('hostSocketId' in stateAfterJoin.data),
      '클라이언트 상태에 정답/타인답안/소켓ID 미노출(치팅 방지)');

    // 에러 케이스
    const c = connect();
    c.socket.emit('join_room', { roomId, nickname: 'B친구' });
    const dupErr = await until(c.log, (e) => e.ev === 'error_message', 5000, '중복 닉네임 에러');
    assert(/닉네임/.test(dupErr.data), '중복 닉네임 거부', dupErr.data);
    c.socket.emit('join_room', { roomId: 'ZZZZ99', nickname: '아무개' });
    const noRoom = await until(c.log, (e) => e.ev === 'error_message' && /존재하지/.test(e.data), 5000, '없는 방 에러');
    pass('없는 방 코드 거부', noRoom.data);
    c.socket.close();

    // 방장 아닌 사람이 시작 시도
    b.socket.emit('start_game', { roomId });
    const notHost = await until(b.log, (e) => e.ev === 'error_message' && /방장/.test(e.data), 5000, '방장 아님 에러');
    pass('방장만 시작 가능', notHost.data);

    a.socket.emit('start_game', { roomId });
    await until(a.log, (e) => e.ev === 'game_started', 5000, 'game_started');
    await until(b.log, (e) => e.ev === 'game_started', 5000, 'B도 game_started 수신');

    // ---- Q0: 전원 즉시 제출 → 즉시 다음 단계 ----
    const rs0 = await until(a.log, (e) => e.ev === 'round_start' && e.data.questionIndex === 0, 20000, 'Q0 round_start');
    const ap0a = await until(a.log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === 0, 20000, 'Q0 answer_phase(A)');
    const ap0b = await until(b.log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === 0, 20000, 'Q0 answer_phase(B)');
    assert(JSON.stringify(ap0a.data.letters) === JSON.stringify(ap0b.data.letters), 'Q0 알파벳 배치가 전원 동일(공정성)');

    a.socket.emit('submit_answer', { roomId, answer: rs0.data.word });
    b.socket.emit('submit_answer', { roomId, answer: 'xxxxx' });
    const re0 = await until(a.log, (e) => e.ev === 'round_end' && e.data.questionIndex === 0, 10000, 'Q0 round_end');
    assert(re0.t - ap0a.t < 2000, 'Q0 전원 제출 → 즉시 라운드 종료', `${re0.t - ap0a.t}ms`);
    assert(a.log.some((e) => e.ev === 'submission_update' && e.data.submitted === 2 && e.data.total === 2), '제출 현황 2/2 브로드캐스트');
    const re0b = await until(b.log, (e) => e.ev === 'round_end' && e.data.questionIndex === 0, 5000, 'Q0 round_end(B)');
    assert(re0b.data.mySubmission && re0b.data.mySubmission.correct === false, 'B 오답 개인 결과 전달');
    assert(re0.data.mySubmission && re0.data.mySubmission.correct === true, 'A 정답 개인 결과 전달');

    // ---- Q1: 아무도 제출 안 함 → 제한시간(6초)까지 기다렸다가 종료되어야 함 ----
    // (수정 전 버그: Q0의 죽은 타이머가 Q1을 조기 종료시켜 라운드가 스킵됨)
    const ap1 = await until(a.log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === 1, 20000, 'Q1 answer_phase');
    const re1 = await until(a.log, (e) => e.ev === 'round_end' && e.data.questionIndex === 1, 20000, 'Q1 round_end');
    const dur1 = re1.t - ap1.t;
    assert(dur1 >= 5400 && dur1 <= 8000, '[핵심 회귀] Q1 타임아웃이 제한시간을 온전히 보장', `${dur1}ms (기대 ~6000ms)`);
    assert(re1.data.mySubmission === null, 'Q1 미제출자 결과 null(시간 초과)');

    // ---- Q2: A 제출 후 B 연결 끊김 → 이탈자 제외 판정으로 즉시 종료 ----
    const rs2 = await until(a.log, (e) => e.ev === 'round_start' && e.data.questionIndex === 2, 20000, 'Q2 round_start');
    const ap2 = await until(a.log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === 2, 20000, 'Q2 answer_phase');
    a.socket.emit('submit_answer', { roomId, answer: rs2.data.word });
    await until(a.log, (e) => e.ev === 'submission_ack' && e.t >= ap2.t, 5000, 'Q2 ack(A)');
    b.socket.close(); // B 이탈
    const re2 = await until(a.log, (e) => e.ev === 'round_end' && e.data.questionIndex === 2, 10000, 'Q2 round_end');
    assert(re2.t - ap2.t < 4000, '이탈자 제외하고 전원 제출 판정 → 진행 계속', `${re2.t - ap2.t}ms`);

    // ---- B 재입장 (새로고침 시나리오) ----
    b2 = connect();
    b2.socket.emit('rejoin_room', { roomId, nickname: 'B친구' });
    const rj = await until(b2.log, (e) => e.ev === 'rejoin_success', 5000, 'rejoin_success');
    assert(rj.data.room.roomId === roomId && rj.data.room.status === 'playing', '게임 중 재입장 성공');
    b2.socket.emit('request_round_sync', { roomId });
    const snap = await until(b2.log, (e) => e.ev === 'round_snapshot', 5000, 'round_snapshot');
    assert(snap.data.status === 'playing' && snap.data.myScore >= 0, '라운드 스냅샷 동기화', `phase=${snap.data.phase}`);

    // ---- Q3, Q4: 두 명 모두 정답 제출 ----
    for (const q of [3, 4]) {
      const rs = await until(a.log, (e) => e.ev === 'round_start' && e.data.questionIndex === q, 20000, `Q${q} round_start`);
      const rsB = await until(b2.log, (e) => e.ev === 'round_start' && e.data.questionIndex === q, 20000, `Q${q} round_start(B 재입장 후 수신)`);
      assert(rsB.data.word === rs.data.word, `Q${q} 재입장한 B도 같은 문제 수신`);
      await until(a.log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === q, 20000, `Q${q} answer_phase`);
      await until(b2.log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === q, 20000, `Q${q} answer_phase(B)`);
      a.socket.emit('submit_answer', { roomId, answer: rs.data.word });
      b2.socket.emit('submit_answer', { roomId, answer: rs.data.word });
      await until(a.log, (e) => e.ev === 'round_end' && e.data.questionIndex === q, 20000, `Q${q} round_end`);
    }

    const go = await until(a.log, (e) => e.ev === 'game_over', 20000, 'game_over(A)');
    await until(b2.log, (e) => e.ev === 'game_over', 5000, 'game_over(B)');
    const rank = go.data.ranking;
    const A = rank.find((p) => p.nickname === 'A호스트');
    const B = rank.find((p) => p.nickname === 'B친구');
    assert(rank.length === 2 && rank[0].nickname === 'A호스트', '최종 랭킹: A 1위', rank.map((p) => `${p.nickname}:${p.score}`).join(' '));
    assert(A.correctCount === 4, 'A 정답 수 4 (Q0,2,3,4)', `${A.correctCount}`);
    assert(B.correctCount === 2, 'B 정답 수 2 (재입장 후 Q3,4)', `${B.correctCount}`);
    assert(A.score > B.score, '점수 순위 정렬');
  } finally {
    a.socket.close();
    b.socket.close();
    if (b2) b2.socket.close();
  }
}

async function testExtraLetters() {
  console.log('\n[테스트 3] 고급 난이도 오답 알파벳 섞기 + 난이도 가중치');
  const { socket, log } = connect();
  try {
    socket.emit('create_room', {
      settings: { difficulty: 'expert', wordShowTime: 1, answerTime: 5, questionCount: 5, extraLetters: true },
      nickname: '고수',
      single: true
    });
    const rc = await until(log, (e) => e.ev === 'room_created', 5000, 'room_created');
    const roomId = rc.data.roomId;
    const rs = await until(log, (e) => e.ev === 'round_start' && e.data.questionIndex === 0, 15000, 'round_start');
    const ap = await until(log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === 0, 15000, 'answer_phase');
    const extra = ap.data.letters.length - rs.data.word.length;
    assert(extra >= 1 && extra <= 2, '오답 알파벳 1~2개 추가', `+${extra}개`);
    socket.emit('submit_answer', { roomId, answer: rs.data.word });
    const ack = await until(log, (e) => e.ev === 'submission_ack' && e.t >= ap.t, 5000, 'ack');
    assert(ack.data.correct && ack.data.scoreEarned >= 150, '최고급 가중치 x1.5 적용', `+${ack.data.scoreEarned}점(기본 최대 200의 1.5배 이내)`);
  } finally {
    socket.close();
  }
}

async function testHint() {
  console.log('\n[테스트 4] 힌트 기능: 단어 다시 보기 + 점수 절반');
  const { socket, log } = connect();
  try {
    socket.emit('create_room', {
      settings: { difficulty: 'practice', wordShowTime: 1, answerTime: 6, questionCount: 5, extraLetters: false },
      nickname: '힌트유저',
      single: true
    });
    const rc = await until(log, (e) => e.ev === 'room_created', 5000, 'room_created');
    const roomId = rc.data.roomId;

    // Q0: 힌트 사용 후 정답 제출 → 점수 절반
    const rs0 = await until(log, (e) => e.ev === 'round_start' && e.data.questionIndex === 0, 15000, 'Q0 round_start');
    const ap0 = await until(log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === 0, 15000, 'Q0 answer_phase');
    socket.emit('use_hint', { roomId });
    const hint = await until(log, (e) => e.ev === 'hint_data' && e.data.questionIndex === 0, 5000, 'hint_data');
    assert(hint.data.word === rs0.data.word, '힌트가 정답 단어를 반환', hint.data.word);
    // 토글 재요청해도 추가 감점 없이 같은 단어 (멱등성)
    socket.emit('use_hint', { roomId });
    await until(log, (e) => e.ev === 'hint_data' && e.t > hint.t, 5000, 'hint_data 재요청');
    pass('힌트 토글 재요청 멱등 처리');

    socket.emit('submit_answer', { roomId, answer: rs0.data.word });
    const ack0 = await until(log, (e) => e.ev === 'submission_ack' && e.t >= ap0.t, 5000, 'Q0 ack');
    assert(ack0.data.correct === true && ack0.data.hintUsed === true, 'ack에 힌트 사용 표시');
    assert(ack0.data.scoreEarned >= 50 && ack0.data.scoreEarned <= 105, '[핵심] 힌트 사용 시 점수 절반', `+${ack0.data.scoreEarned}점 (정상 ~199점의 절반)`);
    const re0 = await until(log, (e) => e.ev === 'round_end' && e.data.questionIndex === 0, 15000, 'Q0 round_end');
    assert(re0.data.mySubmission.hintUsed === true, '라운드 결과에 힌트 사용 기록');

    // Q1: 힌트 없이 정답 → 정상 점수 (비교 기준)
    const rs1 = await until(log, (e) => e.ev === 'round_start' && e.data.questionIndex === 1, 20000, 'Q1 round_start');
    const ap1 = await until(log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === 1, 20000, 'Q1 answer_phase');
    socket.emit('submit_answer', { roomId, answer: rs1.data.word });
    const ack1 = await until(log, (e) => e.ev === 'submission_ack' && e.t >= ap1.t, 5000, 'Q1 ack');
    assert(ack1.data.correct === true && ack1.data.hintUsed !== true && ack1.data.scoreEarned >= 150, '힌트 미사용 시 정상 점수', `+${ack1.data.scoreEarned}점`);

    // Q2: 제출 후 힌트 요청 → 무시되어야 함
    const rs2 = await until(log, (e) => e.ev === 'round_start' && e.data.questionIndex === 2, 20000, 'Q2 round_start');
    const ap2 = await until(log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === 2, 20000, 'Q2 answer_phase');
    socket.emit('submit_answer', { roomId, answer: rs2.data.word });
    await until(log, (e) => e.ev === 'submission_ack' && e.t >= ap2.t, 5000, 'Q2 ack');
    const hintCountBefore = log.filter((e) => e.ev === 'hint_data').length;
    socket.emit('use_hint', { roomId });
    await sleep(800);
    const hintCountAfter = log.filter((e) => e.ev === 'hint_data').length;
    assert(hintCountAfter === hintCountBefore, '제출 후 힌트 요청은 무시됨');
  } finally {
    socket.close();
  }
}

async function testExpertWords() {
  console.log('\n[테스트 5] 최고급 단어 풀 확장 (고3 수준 포함, 30문제 중복 없음)');
  const { socket, log } = connect();
  try {
    socket.emit('create_room', {
      settings: { difficulty: 'expert', wordShowTime: 1, answerTime: 5, questionCount: 30, extraLetters: false },
      nickname: '수능도전',
      single: true
    });
    const rc = await until(log, (e) => e.ev === 'room_created', 5000, 'room_created');
    const roomId = rc.data.roomId;
    const words = [];
    for (let q = 0; q < 30; q++) {
      const rs = await until(log, (e) => e.ev === 'round_start' && e.data.questionIndex === q, 25000, `Q${q} round_start`);
      words.push(rs.data.word);
      socket.emit('pass_question', { roomId }); // 빠르게 소진... 풀이 단계 진입 후에만 유효
      await until(log, (e) => e.ev === 'answer_phase' && e.data.questionIndex === q, 25000, `Q${q} answer_phase`);
      socket.emit('pass_question', { roomId });
      await until(log, (e) => e.ev === 'round_end' && e.data.questionIndex === q, 25000, `Q${q} round_end`);
    }
    await until(log, (e) => e.ev === 'game_over', 15000, 'game_over');
    assert(new Set(words).size === 30, '30문제 전부 서로 다른 단어 출제', `${new Set(words).size}종`);
    const longWords = words.filter((w) => w.length >= 10);
    assert(longWords.length >= 5, '고난도(10자 이상) 단어 포함', longWords.slice(0, 5).join(','));
  } finally {
    socket.close();
  }
}

(async () => {
  try {
    await testSinglePlayer();
    await testMultiplayer();
    await testExtraLetters();
    await testHint();
    await testExpertWords();
  } catch (err) {
    fail('테스트 실행 중단', err.message);
  }
  console.log(`\n결과: ${passCount} PASS / ${failCount} FAIL`);
  process.exit(failCount > 0 ? 1 : 0);
})();
