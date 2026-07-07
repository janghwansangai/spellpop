// 효과음: 외부 파일 없이 WebAudio로 간단한 톤 생성 (계획서 5번 즉시 피드백)

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, startOffset: number, duration: number, type: OscillatorType = 'sine', volume = 0.12) {
  const audio = getCtx();
  if (!audio) return;
  try {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t0 = audio.currentTime + startOffset;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch {
    // 사운드 실패는 게임 진행에 영향 없음
  }
}

export const playClick = () => tone(700, 0, 0.06, 'square', 0.04);
export const playErase = () => tone(300, 0, 0.08, 'square', 0.04);
export const playCorrect = () => {
  tone(659, 0, 0.12, 'sine', 0.12);
  tone(880, 0.12, 0.22, 'sine', 0.12);
};
export const playWrong = () => tone(180, 0, 0.3, 'sawtooth', 0.07);
export const playStart = () => {
  tone(523, 0, 0.1, 'triangle', 0.1);
  tone(659, 0.1, 0.1, 'triangle', 0.1);
  tone(784, 0.2, 0.18, 'triangle', 0.1);
};
