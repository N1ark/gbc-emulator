import Addressable from "../Addressable";
import { CLOCK_SPEED } from "../constants";
import { SubRegister } from "../Register";
import APU from "./APU";
import SoundChannel from "./SoundChannel";
import SoundChannel2 from "./SoundChannel2";

const wavePatterns: { [k in 0 | 1 | 2 | 3]: (0 | 1)[] } = {
    0b00: [1, 1, 1, 1, 1, 1, 1, 0],
    0b01: [0, 1, 1, 1, 1, 1, 1, 0],
    0b10: [0, 1, 1, 1, 1, 0, 0, 0],
    0b11: [1, 0, 0, 0, 0, 0, 0, 1],
};

const sweepPaceFrequency = Math.floor(CLOCK_SPEED / 128);
const CHAN1_SWEEP_CHANGE = 1 << 3;
const lengthTimerFrequence = Math.floor(CLOCK_SPEED / 256);

const NRX1_LENGTH_TIMER_VALUE = 0b111111;
const NRX4_RESTART_CHANNEL = 1 << 7;
const NRX4_LENGTH_TIMER_FLAG = 1 << 6;

/**
 * Sound channel 1 generates a pulse signal, with a wavelength sweep.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-1--pulse-with-wavelength-sweep
 */
class SoundChannel1 extends SoundChannel2 {
    protected nrX0 = new SubRegister(0x80);
    protected nrX1 = new SubRegister(0xbf);
    protected nrX2 = new SubRegister(0xf3);
    protected nrX3 = new SubRegister(0xff);
    protected nrX4 = new SubRegister(0xbf);

    protected enabled: boolean = true;

    // Sweep pace
    protected sweepPaceCounter = 0;
    // Length timer
    protected lengthTimer = 0;

    // Audio objects
    protected audioContext: AudioContext | undefined;
    protected gainNode: GainNode | undefined;
    protected oscillatorNode: OscillatorNode | undefined;

    tick(apu: APU): void {
        if (!this.enabled) return;

        if (this.sweepPaceCounter === -1 && this.sweepPaceCounter-- === 0) {
            this.resetSweepPaceCounter();
            const addOrSub = this.nrX0.flag(CHAN1_SWEEP_CHANGE) ? -1 : 1;
            const multiplier = this.nrX0.get() & 0b111; // bits 0-2
            const wave = this.getWavelength();
            this.setWavelength(wave + addOrSub * (wave >> multiplier));
        }

        if (
            this.nrX4.flag(NRX4_LENGTH_TIMER_FLAG) &&
            this.lengthTimer++ >= lengthTimerFrequence
        ) {
            const nrx1 = this.nrX1.get();
            const lengthTimer = (nrx1 & NRX1_LENGTH_TIMER_VALUE) + 1;
            this.nrX1.set((nrx1 & ~NRX1_LENGTH_TIMER_VALUE) | lengthTimer);
            if (lengthTimer === 64) {
                this.stop();
            }
        }
    }

    protected resetSweepPaceCounter() {
        const nextCounter = (this.nrX0.get() >> 4) & 0b111; // bits 4-6
        if (nextCounter === 0) this.sweepPaceCounter = -1;
        else this.sweepPaceCounter = sweepPaceFrequency * nextCounter;
    }

    protected getWavelength(): number {
        const lower8 = this.nrX3.get();
        const higher3 = this.nrX4.get() & 0b111;
        return (higher3 << 8) | lower8;
    }

    protected setWavelength(waveLength: number): void {
        waveLength &= (1 << 11) - 1; // ensure it fits in 11bits
        const lower8 = waveLength & 0xff;
        const higher3 = (waveLength >> 8) & 0b111;
        this.nrX3.set(lower8);
        this.nrX4.set((this.nrX4.get() & ~0b111) | higher3);

        if (this.oscillatorNode) {
            if (waveLength > 2000) console.log("wavelength", waveLength);
            const audioFrequency = 131072 / (2048 - waveLength);
            this.oscillatorNode.frequency.value = audioFrequency;
        }
    }

    start(): void {
        if (this.enabled) return;
        this.enabled = true;
        if (this.audioContext && this.gainNode && this.oscillatorNode) {
            this.gainNode.connect(this.audioContext.destination);
            this.oscillatorNode.connect(this.gainNode);
        }
        this.lengthTimer = 0;
        this.resetSweepPaceCounter();
    }

    stop(): void {
        if (!this.enabled) return;
        this.enabled = false;
        this.oscillatorNode?.disconnect();
        this.gainNode?.disconnect();
    }

    setAudioContext(audioContext: AudioContext | null) {
        if (audioContext === null) {
            this.gainNode?.disconnect();
            this.gainNode = undefined;
            this.oscillatorNode?.disconnect();
            this.oscillatorNode = undefined;
            if (this.audioContext?.state !== "closed") this.audioContext?.close();
            this.audioContext = undefined;
        } else {
            // Clear what was there
            if (this.audioContext || this.gainNode || this.oscillatorNode)
                this.setAudioContext(null);

            console.log("Added audio context! ", audioContext);
            this.audioContext = audioContext;
            this.gainNode = audioContext.createGain();
            this.gainNode.gain.value = 0.5;
            this.oscillatorNode = audioContext.createOscillator();
            this.oscillatorNode.type = "square";
            this.oscillatorNode.connect(this.gainNode);
            this.oscillatorNode.start(0);
        }
    }

    protected address(pos: number): Addressable {
        switch (pos) {
            case 0xff10:
                return this.nrX0;
            case 0xff11:
                return this.nrX1;
            case 0xff12:
                return this.nrX2;
            case 0xff13:
                return this.nrX3;
            case 0xff14:
                return this.nrX4;
        }
        throw new Error(`Invalid address passed to sound channel 1: ${pos.toString(16)}`);
    }

    read(pos: number): number {
        const component = this.address(pos);

        if (component === this.nrX1) {
            // bits 0-5 are write only
            return component.read(pos) | 0b111111;
        }

        return component.read(pos);
    }

    write(pos: number, data: number): void {
        const component = this.address(pos);

        // Restart
        if (component === this.nrX4 && (data & NRX4_RESTART_CHANNEL) !== 0) {
            this.stop();
            this.start();
            data &= ~NRX4_RESTART_CHANNEL; // bit is write-only
        }
        component.write(pos, data);
    }
}

export default SoundChannel1;
