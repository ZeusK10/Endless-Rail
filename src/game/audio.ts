/**
 * Layered, offline procedural audio inspired by diesel-electric rail traction,
 * steel wheels, compressed-air horns and running gear. No downloaded recordings.
 * Created only after user interaction for Safari/iPad audio unlock.
 */

export interface TrainSoundFrame {
  speedKmh: number;
  throttle: number;
  brake: number;
  curvature: number;
  derailmentRisk: number;
  traveled: number;
  derailed: boolean;
  paused: boolean;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export class TrainAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private engineLow: OscillatorNode | null = null;
  private engineHigh: OscillatorNode | null = null;
  private engineLowpass: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private engineChop: OscillatorNode | null = null;
  private dieselAir: GainNode | null = null;
  private rolling: GainNode | null = null;
  private wind: GainNode | null = null;
  private brakes: GainNode | null = null;
  private flange: OscillatorNode | null = null;
  private flangeGain: GainNode | null = null;
  private lastJoint = 0;
  private lastDerailed = false;

  start(): void {
    if (this.context) {
      void this.context.resume().catch(() => { /* User may need to tap again. */ });
      return;
    }
    const context = new AudioContext();
    this.context = context;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 14;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.26;
    const output = context.createGain();
    output.gain.value = 0.82;
    output.connect(compressor).connect(context.destination);
    this.output = output;

    // A tiny deterministic noise loop is shared by traction air, wheels,
    // brakes, clack transients, horn breath and derailment impacts.
    const duration = Math.floor(context.sampleRate * 1.7);
    const buffer = context.createBuffer(1, duration, context.sampleRate);
    const values = buffer.getChannelData(0);
    let state = 0xa15f2cf1;
    for (let i = 0; i < duration; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      values[i] = (state / 2147483648 - 1) * 0.86;
    }
    this.noiseBuffer = buffer;

    const low = context.createOscillator();
    low.type = "sawtooth";
    low.frequency.value = 39;
    const high = context.createOscillator();
    high.type = "triangle";
    high.frequency.value = 78;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 280;
    filter.Q.value = 0.55;
    const gain = context.createGain();
    gain.gain.value = 0;
    low.connect(filter);
    high.connect(filter);
    filter.connect(gain).connect(output);
    low.start();
    high.start();
    this.engineLow = low;
    this.engineHigh = high;
    this.engineLowpass = filter;
    this.engineGain = gain;

    // Pulsing cylinder/exhaust texture, rather than a single flat motor tone.
    const pulse = context.createOscillator();
    pulse.type = "sine";
    pulse.frequency.value = 10;
    const pulseGain = context.createGain();
    pulseGain.gain.value = 0.006;
    pulse.connect(pulseGain).connect(gain.gain);
    pulse.start();
    this.engineChop = pulse;

    this.dieselAir = this.loopNoise("lowpass", 260, 0.6, 0.65);
    this.rolling = this.loopNoise("bandpass", 410, 0.45, 1.2);
    this.wind = this.loopNoise("highpass", 1600, 0.35, 1);
    this.brakes = this.loopNoise("bandpass", 1450, 1.0, 0.9);

    const squeal = context.createOscillator();
    squeal.type = "triangle";
    squeal.frequency.value = 690;
    const squealFilter = context.createBiquadFilter();
    squealFilter.type = "bandpass";
    squealFilter.frequency.value = 920;
    squealFilter.Q.value = 1.9;
    const squealGain = context.createGain();
    squealGain.gain.value = 0;
    squeal.connect(squealFilter).connect(squealGain).connect(output);
    squeal.start();
    this.flange = squeal;
    this.flangeGain = squealGain;
  }

  private loopNoise(
    type: BiquadFilterType, frequency: number, q: number, rate: number,
  ): GainNode {
    const context = this.context!;
    const output = this.output!;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = rate;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(output);
    source.start();
    return gain;
  }

  private transient(
    when: number, duration: number, volume: number,
    cutoff: number, type: BiquadFilterType = "bandpass",
  ): void {
    const context = this.context;
    const output = this.output;
    const buffer = this.noiseBuffer;
    if (!context || !output || !buffer) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = 0.78 + cutoff / 5000;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = 0.65;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), when + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(gain).connect(output);
    source.start(when, Math.random() * 0.8);
    source.stop(when + duration + 0.03);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  /** Two offset rail-joint impacts suggest leading and trailing bogies. */
  private railJoint(speedKmh: number): void {
    const now = this.context?.currentTime;
    if (now === undefined) return;
    const level = 0.012 + Math.min(speedKmh / 125, 1) * 0.028;
    this.transient(now, 0.072, level, 850);
    this.transient(now + 0.12, 0.060, level * 0.64, 660);
  }

  update(frame: TrainSoundFrame): void {
    const context = this.context;
    if (!context || !this.engineLow || !this.engineHigh ||
      !this.engineLowpass || !this.engineGain || !this.engineChop ||
      !this.dieselAir || !this.rolling || !this.wind || !this.brakes ||
      !this.flange || !this.flangeGain) return;
    const now = context.currentTime;
    const speed = clamp(frame.speedKmh / 125);
    const throttle = clamp(frame.throttle);
    const brake = clamp(frame.brake);
    const risk = clamp(frame.derailmentRisk);
    const moving = frame.speedKmh > 1.5 && !frame.derailed;
    const active = !frame.paused && !frame.derailed;
    const smooth = (param: AudioParam, v: number, t = 0.13) =>
      param.setTargetAtTime(v, now, t);

    // Low idling chug -> loaded revs -> smooth cruise as traction settles.
    const engineHz = 42 + throttle * 26 + speed * 21;
    smooth(this.engineLow.frequency, engineHz, 0.2);
    smooth(this.engineHigh.frequency, engineHz * 2.015, 0.2);
    smooth(this.engineChop.frequency, 8.5 + throttle * 10 + speed * 3, 0.2);
    smooth(this.engineLowpass.frequency, 190 + throttle * 240 + speed * 85);
    smooth(this.engineGain.gain,
      active ? 0.031 + throttle * 0.018 + speed * 0.011 : 0);
    smooth(this.dieselAir.gain,
      active ? 0.005 + throttle * 0.017 + speed * 0.006 : 0);
    smooth(this.rolling.gain, active && moving ? 0.010 + Math.pow(speed, 0.8) * 0.082 : 0);
    smooth(this.wind.gain, active && moving ? Math.pow(speed, 1.8) * 0.037 : 0);
    smooth(this.brakes.gain,
      active && moving ? Math.pow(speed, 0.7) * brake * 0.068 : 0);

    // Curve squeal gets sharper with wheel speed and instability. It is
    // audible as a gentle flange rub before derailment risk becomes high.
    const curve = clamp(frame.curvature / 0.00048);
    const squeal = curve * Math.pow(speed, 0.75) * (0.008 + risk * 0.035);
    smooth(this.flangeGain.gain, active && moving ? squeal : 0, 0.22);
    smooth(this.flange.frequency, 650 + speed * 460 + risk * 270, 0.22);

    if (active && moving) {
      const joint = Math.floor(frame.traveled / 15);
      if (joint > this.lastJoint) {
        this.lastJoint = joint;
        this.railJoint(frame.speedKmh);
      }
    } else {
      this.lastJoint = Math.floor(frame.traveled / 15);
    }

    if (frame.derailed && !this.lastDerailed && !frame.paused) {
      this.derailment();
    }
    this.lastDerailed = frame.derailed;
  }

  /** A held diesel air-horn chord with breath, harmonics, detuning and release. */
  horn(): void {
    const context = this.context;
    const output = this.output;
    if (!context || !output) return;
    const now = context.currentTime;
    const length = 1.9;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.72, now + 0.14);
    envelope.gain.setValueAtTime(0.72, now + 1.18);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + length);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1380;
    filter.Q.value = 0.54;
    filter.connect(envelope).connect(output);

    // Minor-seventh-ish dissonance helps suggest a multi-chime air horn.
    for (const [i, frequency] of [233, 293.7, 349.2].entries()) {
      for (let overtone = 1; overtone <= 2; overtone++) {
        const tone = context.createOscillator();
        tone.type = overtone === 1 ? "sawtooth" : "triangle";
        tone.frequency.setValueAtTime(frequency * overtone * (1 - 0.002), now);
        tone.frequency.linearRampToValueAtTime(
          frequency * overtone * (1 + i * 0.0012), now + 0.20);
        const volume = context.createGain();
        volume.gain.value = overtone === 1 ? 0.028 : 0.009;
        tone.connect(volume).connect(filter);
        tone.start(now);
        tone.stop(now + length + 0.04);
        tone.onended = () => { tone.disconnect(); volume.disconnect(); };
      }
    }
    // Compressed-air rush gives the chord the missing horn attack.
    this.transient(now, 1.55, 0.032, 1200);
  }

  /** One-shot metallic skid/crash, distinct from normal curve squeal. */
  private derailment(): void {
    const context = this.context;
    const output = this.output;
    if (!context || !output) return;
    const now = context.currentTime;
    this.transient(now, 1.05, 0.31, 250, "lowpass");
    this.transient(now + 0.08, 0.56, 0.16, 1250);
    this.transient(now + 0.23, 0.50, 0.13, 690);
    this.transient(now + 0.46, 0.47, 0.09, 920);

    const skid = context.createOscillator();
    skid.type = "sawtooth";
    skid.frequency.setValueAtTime(1200, now);
    skid.frequency.exponentialRampToValueAtTime(180, now + 1.22);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1900;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
    skid.connect(filter).connect(gain).connect(output);
    skid.start(now);
    skid.stop(now + 1.3);
    skid.onended = () => { skid.disconnect(); filter.disconnect(); gain.disconnect(); };
  }
}
