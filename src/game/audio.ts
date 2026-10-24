/**
 * Small, offline railway soundscape. Three bundled CC0 field recordings provide
 * the recognisable mechanical foundation, with lightweight Web Audio accents.
 * Attribution/provenance: AUDIO_SOURCES.md.
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

interface LoopVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

type SampleName = "idle" | "rolling" | "horn";

const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n));

export class TrainAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private readonly samples = new Map<SampleName, AudioBuffer>();
  private idleVoice: LoopVoice | null = null;
  private railVoice: LoopVoice | null = null;
  private fallbackEngine: OscillatorNode | null = null;
  private fallbackGain: GainNode | null = null;
  private brakeGain: GainNode | null = null;
  private flange: OscillatorNode | null = null;
  private flangeGain: GainNode | null = null;
  private lastJoint = 0;
  private lastDerailed = false;
  private lastHornAt = -100;

  start(): void {
    if (this.context) {
      void this.context.resume().catch(() => { /* Await next user gesture. */ });
      return;
    }
    const context = new AudioContext();
    this.context = context;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;
    const output = context.createGain();
    output.gain.value = 0.80;
    output.connect(compressor).connect(context.destination);
    this.output = output;

    const length = Math.floor(context.sampleRate * 1.8);
    const noise = context.createBuffer(1, length, context.sampleRate);
    const samples = noise.getChannelData(0);
    let randomState = 0x4d5f7ac1;
    for (let i = 0; i < length; i++) {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      samples[i] = (randomState / 2147483648 - 1) * 0.7;
    }
    this.noiseBuffer = noise;

    // A very quiet mechanical pulse provides a fallback while the recordings
    // decode. Unlike the previous sawtooth drone, it has no turbine whine.
    const low = context.createOscillator();
    low.type = "triangle";
    low.frequency.value = 39;
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 115;
    const gain = context.createGain();
    gain.gain.value = 0;
    low.connect(lowpass).connect(gain).connect(output);
    low.start();
    this.fallbackEngine = low;
    this.fallbackGain = gain;

    const brakeNoise = context.createBufferSource();
    brakeNoise.buffer = noise;
    brakeNoise.loop = true;
    brakeNoise.playbackRate.value = 0.93;
    const brakeFilter = context.createBiquadFilter();
    brakeFilter.type = "bandpass";
    brakeFilter.frequency.value = 1160;
    brakeFilter.Q.value = 0.62;
    const brakeGain = context.createGain();
    brakeGain.gain.value = 0;
    brakeNoise.connect(brakeFilter).connect(brakeGain).connect(output);
    brakeNoise.start();
    this.brakeGain = brakeGain;

    const flange = context.createOscillator();
    flange.type = "sine";
    flange.frequency.value = 620;
    const flangeGain = context.createGain();
    flangeGain.gain.value = 0;
    flange.connect(flangeGain).connect(output);
    flange.start();
    this.flange = flange;
    this.flangeGain = flangeGain;

    void this.loadRecordings(context);
  }

  private async loadRecordings(context: AudioContext): Promise<void> {
    const names: SampleName[] = ["idle", "rolling", "horn"];
    await Promise.all(names.map(async name => {
      try {
        const url = import.meta.env.BASE_URL + "audio/" + name + ".mp3";
        const response = await fetch(url);
        if (!response.ok) throw new Error("Audio response " + response.status);
        const sound = await context.decodeAudioData(await response.arrayBuffer());
        if (this.context !== context) return;
        this.samples.set(name, sound);
        if (name === "idle") this.idleVoice = this.makeLoop(sound, 1600);
        if (name === "rolling") this.railVoice = this.makeLoop(sound, 3300);
      } catch (error) {
        // Keep offline procedural fallback if a preview is unavailable.
        console.warn("Could not load bundled railway audio", name, error);
      }
    }));
  }

  /** Overlap the end with the beginning to prevent a click at each loop. */
  private seamlessLoop(buffer: AudioBuffer): AudioBuffer {
    const context = this.context!;
    const fade = Math.min(Math.floor(buffer.sampleRate * 0.42),
      Math.floor(buffer.length / 5));
    const length = buffer.length - fade;
    const result = context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const input = buffer.getChannelData(channel);
      const output = result.getChannelData(channel);
      output.set(input.subarray(0, length));
      for (let i = 0; i < fade; i++) {
        const t = i / fade;
        output[i] = input[length + i] * (1 - t) + input[i] * t;
      }
    }
    return result;
  }

  private makeLoop(buffer: AudioBuffer, highCut: number): LoopVoice {
    const context = this.context!;
    const output = this.output!;
    const source = context.createBufferSource();
    source.buffer = this.seamlessLoop(buffer);
    source.loop = true;
    const cleanBass = context.createBiquadFilter();
    cleanBass.type = "highpass";
    cleanBass.frequency.value = 48;
    const cleanTreble = context.createBiquadFilter();
    cleanTreble.type = "lowpass";
    cleanTreble.frequency.value = highCut;
    cleanTreble.Q.value = 0.5;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(cleanBass).connect(cleanTreble).connect(gain).connect(output);
    source.start();
    return { source, gain };
  }

  private noiseBurst(
    when: number, duration: number, peak: number,
    frequency: number, type: BiquadFilterType = "bandpass",
  ): void {
    const context = this.context;
    const output = this.output;
    if (!context || !output || !this.noiseBuffer) return;
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.85;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, when);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(envelope).connect(output);
    source.start(when, Math.random() * 0.6);
    source.stop(when + duration + 0.04);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
  }

  private railJoint(speedKmh: number): void {
    const now = this.context?.currentTime;
    if (now === undefined) return;
    const strength = 0.007 + clamp(speedKmh / 110) * 0.014;
    this.noiseBurst(now, 0.052, strength, 650);
    this.noiseBurst(now + 0.105, 0.044, strength * 0.65, 430);
  }

  update(frame: TrainSoundFrame): void {
    const context = this.context;
    if (!context || !this.fallbackEngine || !this.fallbackGain ||
      !this.brakeGain || !this.flange || !this.flangeGain) return;
    const now = context.currentTime;
    const speed = clamp(frame.speedKmh / 125);
    const throttle = clamp(frame.throttle);
    const risk = clamp(frame.derailmentRisk);
    const moving = frame.speedKmh > 2.5 && !frame.derailed;
    const active = !frame.paused && !frame.derailed;
    const ramp = (param: AudioParam, target: number, t = 0.18) =>
      param.setTargetAtTime(target, now, t);

    // Recorded idle runs at slightly higher pitch under throttle, and
    // becomes quieter once wheel-on-rail sound takes over.
    if (this.idleVoice) {
      ramp(this.idleVoice.source.playbackRate, 0.94 + throttle * 0.17 + speed * 0.05, 0.35);
      ramp(this.idleVoice.gain.gain, active
        ? 0.35 + throttle * 0.11 - speed * 0.09 : 0);
    }
    if (this.railVoice) {
      ramp(this.railVoice.source.playbackRate, 0.83 + speed * 0.49, 0.26);
      const speedBlend = clamp((frame.speedKmh - 3) / 22);
      ramp(this.railVoice.gain.gain,
        active && moving ? speedBlend * (0.24 + Math.sqrt(speed) * 0.31) : 0, 0.27);
    }

    // No jet-like continuous whoosh. The low fallback pulse fades as soon as
    // the field-recorded diesel arrives; wind is already present in the rails.
    ramp(this.fallbackEngine.frequency, 38 + throttle * 18 + speed * 9, 0.28);
    ramp(this.fallbackGain.gain,
      active ? (this.idleVoice ? 0.005 : 0.027 + throttle * 0.015) : 0);
    ramp(this.brakeGain.gain,
      active && moving ? clamp(frame.brake) * Math.sqrt(speed) * 0.032 : 0);

    const curve = clamp(frame.curvature / 0.00048);
    const flangeAmount = curve * Math.pow(speed, 0.8) * (0.003 + risk * 0.012);
    ramp(this.flangeGain.gain, active && moving ? flangeAmount : 0, 0.25);
    ramp(this.flange.frequency, 570 + speed * 260 + risk * 130, 0.3);

    if (active && moving) {
      const joint = Math.floor(frame.traveled / 14);
      if (joint > this.lastJoint) {
        this.lastJoint = joint;
        this.railJoint(frame.speedKmh);
      }
    } else {
      this.lastJoint = Math.floor(frame.traveled / 14);
    }

    if (frame.derailed && !this.lastDerailed && !frame.paused) this.derailment();
    this.lastDerailed = frame.derailed;
  }

  horn(): void {
    const context = this.context;
    const output = this.output;
    if (!context || !output) return;
    const now = context.currentTime;
    if (now - this.lastHornAt < 1.5) return;
    this.lastHornAt = now;

    const recording = this.samples.get("horn");
    if (recording) {
      // The recorded locomotive blast is ~5.4 seconds: much longer than
      // the former 1.9-second synthesized note.
      const source = context.createBufferSource();
      source.buffer = recording;
      const equalizer = context.createBiquadFilter();
      equalizer.type = "highpass";
      equalizer.frequency.value = 90;
      const volume = context.createGain();
      const length = recording.duration;
      volume.gain.setValueAtTime(0.001, now);
      volume.gain.linearRampToValueAtTime(0.85, now + 0.11);
      volume.gain.setValueAtTime(0.85, now + Math.max(0.12, length - 0.45));
      volume.gain.linearRampToValueAtTime(0.001, now + length);
      source.connect(equalizer).connect(volume).connect(output);
      source.start(now);
      source.stop(now + length + 0.01);
      source.onended = () => { source.disconnect(); equalizer.disconnect(); volume.disconnect(); };
      return;
    }

    // Full-length fallback, used only if the recording has not loaded.
    const length = 4.8;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.65, now + 0.16);
    envelope.gain.setValueAtTime(0.65, now + length - 0.8);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + length);
    envelope.connect(output);
    for (const frequency of [233, 294, 349]) {
      const tone = context.createOscillator();
      tone.type = "sawtooth";
      tone.frequency.value = frequency;
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1100;
      const level = context.createGain();
      level.gain.value = 0.025;
      tone.connect(filter).connect(level).connect(envelope);
      tone.start(now);
      tone.stop(now + length + 0.05);
      tone.onended = () => { tone.disconnect(); filter.disconnect(); level.disconnect(); };
    }
  }

  private derailment(): void {
    const context = this.context;
    const output = this.output;
    if (!context || !output) return;
    const now = context.currentTime;
    this.noiseBurst(now, 1.04, 0.22, 250, "lowpass");
    this.noiseBurst(now + 0.09, 0.57, 0.13, 1140);
    this.noiseBurst(now + 0.26, 0.47, 0.10, 660);
    this.noiseBurst(now + 0.44, 0.39, 0.08, 940);
    const skid = context.createOscillator();
    skid.type = "sawtooth";
    skid.frequency.setValueAtTime(1060, now);
    skid.frequency.exponentialRampToValueAtTime(175, now + 1.12);
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1850;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.048, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    skid.connect(lowpass).connect(gain).connect(output);
    skid.start(now);
    skid.stop(now + 1.25);
    skid.onended = () => { skid.disconnect(); lowpass.disconnect(); gain.disconnect(); };
  }
}
