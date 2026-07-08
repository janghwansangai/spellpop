import { Word, Difficulty } from '../types';

// 난이도별 단어 데이터 (각 30개). 교사가 쉽게 추가/수정할 수 있는 단순 구조.
// 추후 JSON 파일이나 DB로 이관하기 쉽도록 이 모듈만 교체하면 된다.

const define = (difficulty: Difficulty, prefix: string, entries: [string, string][]): Word[] =>
  entries.map(([word, meaning], i) => ({
    id: `${prefix}${i + 1}`,
    word,
    meaning,
    difficulty
  }));

// 연습: 워밍업용 3~4글자 쉬운 단어 (전 학년 공용)
export const wordsPractice: Word[] = define('practice', 'p', [
  ['cat', '고양이'], ['dog', '개'], ['hat', '모자'], ['bat', '박쥐'], ['sun', '태양'],
  ['car', '자동차'], ['bus', '버스'], ['pen', '펜'], ['cup', '컵'], ['box', '상자'],
  ['bag', '가방'], ['bed', '침대'], ['egg', '달걀'], ['fox', '여우'], ['pig', '돼지'],
  ['red', '빨간색'], ['run', '달리다'], ['sit', '앉다'], ['ten', '10, 열'], ['top', '꼭대기'],
  ['map', '지도'], ['leg', '다리'], ['arm', '팔'], ['eye', '눈(신체)'], ['ear', '귀'],
  ['jam', '잼'], ['key', '열쇠'], ['lip', '입술'], ['net', '그물'], ['owl', '올빼미']
]);

// 기본: 3~4학년 수준
export const wordsBasic: Word[] = define('basic', 'b', [
  ['apple', '사과'], ['water', '물'], ['house', '집'], ['school', '학교'], ['friend', '친구'],
  ['happy', '행복한'], ['green', '초록색'], ['table', '탁자'], ['clock', '시계'], ['bread', '빵'],
  ['chair', '의자'], ['dance', '춤추다'], ['early', '이른, 일찍'], ['fruit', '과일'], ['grape', '포도'],
  ['heart', '심장, 마음'], ['juice', '주스'], ['lemon', '레몬'], ['money', '돈'], ['mouth', '입'],
  ['music', '음악'], ['night', '밤'], ['paper', '종이'], ['queen', '여왕'], ['river', '강'],
  ['sleep', '자다'], ['smile', '미소'], ['snow', '눈(날씨)'], ['tiger', '호랑이'], ['train', '기차']
]);

// 중급: 4~5학년 수준
export const wordsIntermediate: Word[] = define('intermediate', 'i', [
  ['animal', '동물'], ['window', '창문'], ['doctor', '의사'], ['summer', '여름'], ['yellow', '노란색'],
  ['garden', '정원'], ['family', '가족'], ['winter', '겨울'], ['orange', '오렌지'], ['people', '사람들'],
  ['banana', '바나나'], ['bridge', '다리(건너는)'], ['camera', '카메라'], ['circle', '원, 동그라미'], ['cousin', '사촌'],
  ['dinner', '저녁 식사'], ['flower', '꽃'], ['forest', '숲'], ['jungle', '정글'], ['kitchen', '부엌'],
  ['letter', '편지'], ['market', '시장'], ['monkey', '원숭이'], ['number', '숫자'], ['pencil', '연필'],
  ['pocket', '주머니'], ['rabbit', '토끼'], ['season', '계절'], ['singer', '가수'], ['spring', '봄']
]);

// 고급: 5~6학년 수준
export const wordsAdvanced: Word[] = define('advanced', 'a', [
  ['beautiful', '아름다운'], ['important', '중요한'], ['yesterday', '어제'], ['tomorrow', '내일'], ['hospital', '병원'],
  ['question', '질문'], ['remember', '기억하다'], ['computer', '컴퓨터'], ['daughter', '딸'], ['elephant', '코끼리'],
  ['birthday', '생일'], ['breakfast', '아침 식사'], ['calendar', '달력'], ['children', '아이들'], ['chocolate', '초콜릿'],
  ['dangerous', '위험한'], ['delicious', '맛있는'], ['exercise', '운동'], ['favorite', '가장 좋아하는'], ['festival', '축제'],
  ['holiday', '휴일, 방학'], ['language', '언어'], ['library', '도서관'], ['medicine', '약'], ['mountain', '산'],
  ['sandwich', '샌드위치'], ['shoulder', '어깨'], ['together', '함께'], ['umbrella', '우산'], ['vacation', '방학, 휴가']
]);

// 최고급: 초6 심화부터 중·고등(수능) 수준까지의 도전 단어
export const wordsExpert: Word[] = define('expert', 'e', [
  ['environment', '환경'], ['comfortable', '편안한'], ['temperature', '온도'], ['information', '정보'], ['experience', '경험'],
  ['dictionary', '사전'], ['restaurant', '식당'], ['strawberry', '딸기'], ['understand', '이해하다'], ['vocabulary', '어휘'],
  ['adventure', '모험'], ['celebrate', '축하하다'], ['community', '공동체'], ['curiosity', '호기심'], ['difference', '차이'],
  ['everywhere', '어디에나'], ['friendship', '우정'], ['government', '정부'], ['imagination', '상상력'], ['impossible', '불가능한'],
  ['interesting', '흥미로운'], ['knowledge', '지식'], ['neighborhood', '동네, 이웃'], ['playground', '놀이터'], ['population', '인구'],
  ['president', '대통령'], ['scientist', '과학자'], ['technology', '기술'], ['traditional', '전통적인'], ['communication', '의사소통'],
  // --- 중학 수준 ---
  ['achievement', '성취, 업적'], ['atmosphere', '대기, 분위기'], ['authority', '권위'], ['capacity', '수용력, 능력'], ['colleague', '동료'],
  ['concentrate', '집중하다'], ['confidence', '자신감'], ['definitely', '분명히, 확실히'], ['eliminate', '제거하다'], ['encourage', '격려하다'],
  ['essential', '필수적인'], ['establish', '설립하다'], ['eventually', '결국, 마침내'], ['exhausted', '지친'], ['foundation', '기초, 토대'],
  ['generation', '세대'], ['guarantee', '보장하다'], ['identity', '정체성'], ['immediately', '즉시'], ['individual', '개인'],
  ['influence', '영향'], ['literature', '문학'], ['maintain', '유지하다'], ['necessary', '필요한'], ['obstacle', '장애물'],
  ['participate', '참가하다'], ['persuade', '설득하다'], ['recognize', '알아보다, 인정하다'], ['recommend', '추천하다'], ['relationship', '관계'],
  ['resource', '자원'], ['sacrifice', '희생'], ['strategy', '전략'], ['temporary', '일시적인'], ['volunteer', '자원봉사자'],
  // --- 고등(수능) 수준 ---
  ['appreciate', '감사하다, 감상하다'], ['accomplish', '성취하다, 해내다'], ['characteristic', '특징'], ['circumstance', '상황, 환경'], ['consequence', '결과'],
  ['contribute', '기여하다'], ['demonstrate', '증명하다, 보여주다'], ['distinguish', '구별하다'], ['efficiency', '효율성'], ['emphasize', '강조하다'],
  ['evaluate', '평가하다'], ['evidence', '증거'], ['fundamental', '근본적인'], ['hypothesis', '가설'], ['independence', '독립'],
  ['inevitable', '피할 수 없는'], ['negotiate', '협상하다'], ['perspective', '관점'], ['phenomenon', '현상'], ['philosophy', '철학'],
  ['potential', '잠재력'], ['priority', '우선순위'], ['professional', '전문적인'], ['psychology', '심리학'], ['reluctant', '꺼리는, 마지못한'],
  ['remarkable', '놀라운, 주목할 만한'], ['responsibility', '책임'], ['satisfaction', '만족'], ['significant', '중요한, 상당한'], ['sophisticated', '정교한, 세련된'],
  ['sufficient', '충분한'], ['threaten', '위협하다'], ['transform', '변형시키다'], ['vulnerable', '상처받기 쉬운, 취약한'], ['opportunity', '기회']
]);

const wordsMap: Record<Difficulty, Word[]> = {
  practice: wordsPractice,
  basic: wordsBasic,
  intermediate: wordsIntermediate,
  advanced: wordsAdvanced,
  expert: wordsExpert
};

export const getWordsByDifficulty = (difficulty: Difficulty, count: number): Word[] => {
  const words = wordsMap[difficulty];
  if (!words) return [];
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = a;
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
};
