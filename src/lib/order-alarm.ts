"use client";

// The new-order alert on Admin -> Orders, made in the browser (no sound files). Each device keeps its own
// choice of sound and volume. One shared audio context, unlocked by the first tap on the page: phones and
// tablets (iPad Safari especially) block sound that a timer starts unless the context was created during a tap.

export type AlarmSound = "alarm" | "siren" | "phone" | "timer" | "service" | "doorbell" | "bell" | "chime";
// Loudest first. Each is about 2-3 seconds.
export const ALARM_SOUNDS: { id: AlarmSound; label: string }[] = [
  { id: "alarm", label: "Loud alarm" },
  { id: "siren", label: "Siren" },
  { id: "phone", label: "Phone ringing" },
  { id: "timer", label: "Kitchen timer" },
  { id: "service", label: "Service bell" },
  { id: "doorbell", label: "Doorbell" },
  { id: "bell", label: "Bell" },
  { id: "chime", label: "Soft chime" },
];
export const isAlarmSound = (v: unknown): v is AlarmSound => ALARM_SOUNDS.some((a) => a.id === v);

let ctx: AudioContext | null = null;
export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!ctx) ctx = new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { /* no audio */ }
}
export const audioLocked = () => !ctx || ctx.state !== "running";

/** One note: `type` wave at `freq` Hz from `at` seconds for `len` seconds, at `peak` loudness. */
function note(c: AudioContext, out: AudioNode, freq: number, at: number, len: number, peak: number, type: OscillatorType) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  const t = c.currentTime + at;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + len + 0.05);
}

/** A tone that slides from `from` to `to` Hz and back, for the siren. */
function sweep(c: AudioContext, out: AudioNode, from: number, to: number, at: number, len: number, peak: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = "sawtooth";
  const t = c.currentTime + at;
  o.frequency.setValueAtTime(from, t);
  o.frequency.linearRampToValueAtTime(to, t + len / 2);
  o.frequency.linearRampToValueAtTime(from, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.05);
  g.gain.setValueAtTime(Math.max(0.0002, peak), t + len - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + len + 0.05);
}

/** Play the alert. `volume` 0-1. */
export function playAlarm(sound: AlarmSound, volume: number) {
  try {
    unlockAudio();
    const c = ctx;
    if (!c) return;
    // A limiter, so the loud sounds are as loud as the speaker allows without crackling.
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -6; limiter.ratio.value = 12;
    limiter.connect(c.destination);
    const v = Math.min(1, Math.max(0.05, volume));
    if (sound === "alarm") {
      // About 3 seconds of urgent alternating beeps: hard to miss in a noisy kitchen.
      for (let i = 0; i < 12; i++) note(c, limiter, i % 2 ? 784 : 1175, i * 0.25, 0.2, v, "square");
    } else if (sound === "siren") {
      // Three rising-and-falling wails.
      for (let i = 0; i < 3; i++) sweep(c, limiter, 650, 1400, i * 1, 1, v * 0.7);
    } else if (sound === "phone") {
      // A UK phone ring: two short rings, a pause, two more.
      for (const at of [0, 0.6, 2.0, 2.6]) { note(c, limiter, 400, at, 0.4, v * 0.6, "square"); note(c, limiter, 450, at, 0.4, v * 0.6, "square"); }
    } else if (sound === "timer") {
      // A fast digital kitchen-timer beep: three bursts of four.
      for (let b = 0; b < 3; b++) for (let i = 0; i < 4; i++) note(c, limiter, 2000, b * 0.9 + i * 0.12, 0.08, v, "square");
    } else if (sound === "service") {
      // The counter bell: three bright dings.
      for (let i = 0; i < 3; i++) {
        note(c, limiter, 2093, i * 0.7, 0.9, v, "sine");
        note(c, limiter, 4186, i * 0.7, 0.4, v * 0.35, "sine");
        note(c, limiter, 3136, i * 0.7, 0.6, v * 0.25, "triangle");
      }
    } else if (sound === "doorbell") {
      // Ding-dong, twice.
      for (let i = 0; i < 2; i++) { note(c, limiter, 659, i * 1.4, 0.9, v, "sine"); note(c, limiter, 523, i * 1.4 + 0.55, 1.1, v, "sine"); }
    } else if (sound === "bell") {
      // A ringing bell, three strikes.
      for (let i = 0; i < 3; i++) {
        note(c, limiter, 880, i * 0.6, 1.2, v, "sine");
        note(c, limiter, 1760, i * 0.6, 0.8, v * 0.5, "sine");
        note(c, limiter, 2640, i * 0.6, 0.5, v * 0.25, "triangle");
      }
    } else {
      [880, 1320].forEach((f, i) => note(c, limiter, f, i * 0.25, 0.4, v * 0.6, "sine"));
    }
  } catch { /* no audio */ }
}
