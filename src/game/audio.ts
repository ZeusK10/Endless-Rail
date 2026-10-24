/**
 * Lightweight synthesized train audio, initialized only after user interaction.
 * No external audio files or network dependencies.
 */
export class TrainAudio {
  private context: AudioContext | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  start(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const context = new AudioContext();
    this.context = context;
    const engine = context.createOscillator();
    const gain = context.createGain();
    engine.type = "triangle";
    engine.frequency.value = 55;
    gain.gain.value = 0.008;
    engine.connect(gain).connect(context.destination);
    engine.start();
    this.engine = engine;
    this.engineGain = gain;
  }

  update(speedKmh: number, paused: boolean): void {
    const context = this.context;
    if (!context || !this.engine || !this.engineGain) return;
    const now = context.currentTime;
    this.engine.frequency.setTargetAtTime(53 + speedKmh * 0.45, now, 0.15);
    this.engineGain.gain.setTargetAtTime(
      paused ? 0 : 0.006 + Math.min(speedKmh / 120, 1) * 0.011,
      now, 0.12,
    );
  }

  horn(): void {
    const context = this.context;
    if (!context) return;
    for (const frequency of [235, 294]) {
      const tone = context.createOscillator();
      const envelope = context.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, context.currentTime);
      envelope.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.04);
      envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
      tone.connect(envelope).connect(context.destination);
      tone.start(context.currentTime);
      tone.stop(context.currentTime + 0.57);
    }
  }
}
