// WebAudio 合成音效，零资源文件。首次交互后才能出声（浏览器策略）。
let ctx: AudioContext | null = null;
let muted = localStorage.getItem('mj-mute') === '1';

function ac(): AudioContext | null {
  if (muted) return null;
  ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, dur = 0.08, type: OscillatorType = 'sine', gain = 0.07, delay = 0): void {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export const sfx = {
  discard: () => tone(210, 0.06, 'triangle', 0.09),
  draw: () => tone(640, 0.05, 'sine', 0.04),
  claim: () => {
    tone(170, 0.11, 'square', 0.05);
    tone(230, 0.1, 'square', 0.045, 0.07);
  },
  hu: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15, 'triangle', 0.08, i * 0.09)),
  drawGame: () => tone(196, 0.35, 'sine', 0.06),
};

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  localStorage.setItem('mj-mute', m ? '1' : '0');
}
