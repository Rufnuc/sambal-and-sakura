"use client";

// The new-order alert on Admin -> Orders, made in the browser (no sound files). Each device keeps its own
// choice of sound and volume. One shared audio context, unlocked by the first tap on the page: phones and
// tablets (iPad Safari especially) block sound that a timer starts unless the context was created during a tap.

export type AlarmSound = "alarm" | "bell" | "chime";
export const ALARM_SOUNDS: { id: AlarmSound; label: string }[] = [
  { id: "alarm", label: "Loud alarm" },
  { id: "bell", label: "Bell" },
  { id: "chime", label: "Soft chime" },
];

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
