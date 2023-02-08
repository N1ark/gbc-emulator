import { Addressable } from "../Memory";
import { CLOCK_SPEED, FRAME_RATE } from "../constants";
import GameBoyOutput from "../GameBoyOutput";
import { MaskRegister, Register } from "../Register";
import { Int4, rangeObject } from "../util";
import SoundChannel1 from "./SoundChannel1";
import SoundChannel2 from "./SoundChannel2";
import SoundChannel3 from "./SoundChannel3";
import SoundChannel4 from "./SoundChannel4";
import Timer from "../Timer";

const SAMPLE_RATE = 44100;

/**
 * Cycles for one full sample at 44.1Hz
 * - We divide clock speed by 4 to get M-cycles
 */
const CYCLES_PER_SAMPLE = CLOCK_SPEED / 4 / SAMPLE_RATE;
/** Number of values in a "frame-wide" sample  */
const SAMPLE_SIZE = Math.floor(SAMPLE_RATE / FRAME_RATE);

const NR52_APU_TOGGLE = 1 << 7;
const NR52_CHAN1_ON = 1 << 0;
const NR52_CHAN2_ON = 1 << 1;
const NR52_CHAN3_ON = 1 << 2;
const NR52_CHAN4_ON = 1 << 3;

const DIV_TICK_BIT = 1 << 4;

/**
 * Converts a digital value in 0 - F into an analog value in -1 - 1 (negative slope)
 */
function DAC(n: Int4): number {
    return (-n / 0xf) * 2 + 1;
}

/**
 * The APU (Audio Processing Unit) of the Gameboy - it handles producing sound.
 */
export class APU implements Addressable {
    protected channel1 = new SoundChannel1((s) => this.nr52.sflag(NR52_CHAN1_ON, s));
    protected channel2 = new SoundChannel2((s) => this.nr52.sflag(NR52_CHAN2_ON, s));
    protected channel3 = new SoundChannel3((s) => this.nr52.sflag(NR52_CHAN3_ON, s));
    protected channel4 = new SoundChannel4((s) => this.nr52.sflag(NR52_CHAN4_ON, s));

    /** Master voulume and stereo mix control  */
    protected nr50 = new Register(0x77);
    /** Stereo mix control register */
    protected nr51 = new Register(0xf3);
    /** Status and control register */
    protected nr52 = new MaskRegister(0b0111_0000, 0xf1);

    /** PCM registers (CGB only) */
    protected pcm12 = new Register();
    protected pcm34 = new Register();

    /** Ticking control */
    protected oldDivBitState = false;

    /** Audio output */
    protected cyclesForSample: number = 0;
    protected sampleIndex: number = 0;
    protected audioBuffer = new Float32Array(SAMPLE_SIZE);
    protected output: GameBoyOutput;

    constructor(output: GameBoyOutput) {
        this.output = output;
    }

    /**
     * Ticks the APU system.
     */
    tick(timer: Timer): void {
        // Turned off
        if (!this.nr52.flag(NR52_APU_TOGGLE)) return;

        const divBitState = (timer.read(0xff04) & DIV_TICK_BIT) === DIV_TICK_BIT;
        const divChanged = !divBitState && this.oldDivBitState;
        this.oldDivBitState = divBitState;

        const chan1Out = this.channel1.tick(divChanged);
        const chan2Out = this.channel2.tick(divChanged);
        const chan3Out = this.channel3.tick(divChanged);
        const chan4Out = this.channel4.tick(divChanged);

        this.pcm12.set(chan1Out | (chan2Out << 4));
        this.pcm34.set(chan3Out | (chan4Out << 4));

        if (++this.cyclesForSample >= CYCLES_PER_SAMPLE) {
            this.cyclesForSample -= CYCLES_PER_SAMPLE;

            // Get all variables for processing audio
            const nr51 = this.nr51.get();
            const nr52 = this.nr52.get();

            // Get output from each channel
            const out1 = DAC(chan1Out);
            const out2 = DAC(chan2Out);
            const out3 = DAC(chan3Out);
            const out4 = DAC(chan4Out);

            // Mix right stereo side, enabling relevant channels
            const rightAudio =
                out1 * ((nr51 >> 0) & 1) +
                out2 * ((nr51 >> 1) & 1) +
                out3 * ((nr51 >> 2) & 1) +
                out4 * ((nr51 >> 3) & 1);

            // Mix left stereo side, enabling relevant channels
            const leftAudio =
                out1 * ((nr51 >> 4) & 1) +
                out2 * ((nr51 >> 5) & 1) +
                out3 * ((nr51 >> 6) & 1) +
                out4 * ((nr51 >> 7) & 1);

            // Get volume for each side in range 1 to 8
            const rightVolume = ((nr52 >> 0) & 0b111) + 1;
            const leftVolume = ((nr52 >> 4) & 0b111) + 1;

            // Mix both sides together, by averaging (taking into account each volume)
            const monoAudio = (rightAudio * rightVolume + leftAudio * leftVolume) / 16;

            // Do some balancing so the level is correct
            this.audioBuffer[this.sampleIndex] = monoAudio / 16;

            if (++this.sampleIndex === SAMPLE_SIZE) {
                this.sampleIndex = 0;
                if (this.output.receiveSound) {
                    this.output.receiveSound(this.audioBuffer);
                }
            }
        }
    }

    protected addresses: Record<number, Addressable> = {
        ...rangeObject(0xff10, 0xff14, this.channel1),
        ...rangeObject(0xff15, 0xff19, this.channel2),
        ...rangeObject(0xff1a, 0xff1e, this.channel3),
        ...rangeObject(0xff1f, 0xff23, this.channel4),
        0xff24: this.nr50,
        0xff25: this.nr51,
        0xff26: this.nr52,
        ...rangeObject(0xff30, 0xff3f, this.channel3), // wave RAM
        0xff76: this.pcm12,
        0xff77: this.pcm34,
    };

    read(pos: number): number {
        if (pos === 0xff26) {
            console.log("-------- read nr52 --------");
        }
        return this.addresses[pos].read(pos);
    }

    write(pos: number, data: number): void {
        const component = this.addresses[pos];
        console.log("Wrote ", pos.toString(16), " <-- ", data.toString(16));
        if (component === this.pcm12 || component === this.pcm34) return; // read-only

        // ignore writes to channel when turned off (except for NRX1 and wave RAM)
        if (
            !this.nr52.flag(NR52_APU_TOGGLE) &&
            component !== this.nr52 &&
            !(0xff30 <= pos && pos <= 0xff3f)
        )
            return;

        if (component === this.nr52) {
            data = data & 0xf0; // lower 4 bits (status of channels) are read-only
            const wasOn = this.nr52.flag(NR52_APU_TOGGLE);
            const isOn = data & NR52_APU_TOGGLE;

            if (wasOn && !isOn) {
                // when turning off, write 0x00 to all registers
                for (let address = 0xff10; address <= 0xff25; address++) {
                    // Except for NR41 for some reason
                    if (address === 0xff20) continue;
                    this.write(address, 0x00);
                }
            }
        }

        component.write(pos, data);
    }
}

export default APU;
