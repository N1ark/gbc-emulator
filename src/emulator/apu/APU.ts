import Addressable from "../Addressable";
import { CLOCK_SPEED, FRAME_RATE } from "../constants";
import { SubRegister } from "../Register";
import System from "../System";
import Player from "./Player";
import SoundChannel1 from "./SoundChannel1";
import SoundChannel2 from "./SoundChannel2";
import SoundChannel3 from "./SoundChannel3";
import SoundChannel4 from "./SoundChannel4";

const SAMPLE_RATE = 44100;

/** Cycles for one full sample at 44.1Hz (for some reason was 4 times too slow?) */
const CYCLES_PER_SAMPLE = Math.floor(CLOCK_SPEED / 4 / SAMPLE_RATE);
/** Frequency at which we push new sound samples */
const SAMPLE_SIZE = Math.floor(SAMPLE_RATE / FRAME_RATE);

const NR52_APU_TOGGLE = 1 << 7;
const NR52_CHAN1_ON = 1 << 0;
const NR52_CHAN2_ON = 1 << 1;
const NR52_CHAN3_ON = 1 << 2;
const NR52_CHAN4_ON = 1 << 3;

/**
 * The APU (Audio Processing Unit) of the Gameboy - it handles producing sound.
 */
export class APU implements Addressable {
    protected channel1: SoundChannel1;
    protected channel2: SoundChannel2;
    protected channel3: SoundChannel3;
    protected channel4: SoundChannel4;

    /** Master voulume and stereo mix control  */
    protected nr50 = new SubRegister(0x77);
    /** Stereo mix control register */
    protected nr51 = new SubRegister(0xf3);
    /** Status and control register */
    protected nr52 = new SubRegister(0xf1);

    /** Audio output */
    protected cyclesForSample: number = 0;
    protected sampleIndex: number = 0;
    protected player: Player | null = null;
    protected audioBuffer: Float32Array[] = [
        new Float32Array(SAMPLE_SIZE),
        new Float32Array(SAMPLE_SIZE),
        // new Float32Array(SAMPLE_SIZE),
        // new Float32Array(SAMPLE_SIZE),
    ];

    constructor() {
        this.channel1 = new SoundChannel1();
        this.channel2 = new SoundChannel2();
        this.channel3 = new SoundChannel3();
        this.channel4 = new SoundChannel4();
    }

    addAudioContext() {
        if (!this.player) this.player = new Player();
    }

    removeAudio() {
        this.player = null;
    }

    /**
     * Ticks the APU system.
     */
    tick(system: System): void {
        // Turned off
        if (!this.nr52.flag(NR52_APU_TOGGLE)) return;

        this.channel1.tick(this);
        this.channel2.tick(this);
        this.channel3.tick(this);
        this.channel4.tick(this);

        if (++this.cyclesForSample === CYCLES_PER_SAMPLE) {
            this.cyclesForSample = 0;

            this.audioBuffer[0][this.sampleIndex] = this.channel1.getSample() * 0.01;
            this.audioBuffer[1][this.sampleIndex] = this.channel2.getSample() * 0.01;

            if (++this.sampleIndex === SAMPLE_SIZE) {
                this.sampleIndex = 0;

                if (this.player) {
                    this.player.enqueue(this.audioBuffer);
                }
            }
        }
    }

    address(pos: number): Addressable {
        switch (pos) {
            case 0xff10:
            case 0xff11:
            case 0xff12:
            case 0xff13:
            case 0xff14:
                return this.channel1;
            case 0xff15:
            case 0xff16:
            case 0xff17:
            case 0xff18:
            case 0xff19:
                return this.channel2;
            case 0xff1a:
            case 0xff1b:
            case 0xff1c:
            case 0xff1d:
            case 0xff1e:
                return this.channel3;
            case 0xff1f:
            case 0xff20:
            case 0xff21:
            case 0xff22:
            case 0xff23:
                return this.channel4;
            case 0xff24:
                return this.nr50;
            case 0xff25:
                return this.nr51;
            case 0xff26:
                return this.nr52;
        }

        // Wave ram
        if (0xff30 <= pos && pos <= 0xff3f) return this.channel3;

        throw new Error(`Invalid address given to APU: ${pos.toString(16)}`);
    }

    read(pos: number): number {
        const component = this.address(pos);
        return component.read(pos);
    }
    write(pos: number, data: number): void {
        const component = this.address(pos);

        // ignore writes to channel when turned off (except for NRX1)
        if (
            !this.nr52.flag(NR52_APU_TOGGLE) &&
            (component === this.channel1 ||
                component === this.channel2 ||
                component === this.channel3 ||
                component === this.channel4)
        ) {
            return;
        }

        if (component === this.nr52) {
            data = data & 0xf0; // lower 4 bits (status of channels) are read-only
        }

        component.write(pos, data);
    }
}

export default APU;
