import { Addressable } from "../Memory";
import { CLOCK_SPEED, FRAME_RATE } from "../constants";
import GameBoyOutput from "../GameBoyOutput";
import { PaddedSubRegister, SubRegister } from "../Register";
import { fillMap, Int16Map, u4 } from "../util";
import SoundChannel1 from "./SoundChannel1";
import SoundChannel2 from "./SoundChannel2";
import SoundChannel3 from "./SoundChannel3";
import SoundChannel4 from "./SoundChannel4";
import Timer from "../Timer";
import { SoundChannel } from "./SoundChannel";

const SAMPLE_RATE: i32 = 44100;

/**
 * Cycles for one full sample at 44.1Hz
 * - We divide clock speed by 4 to get M-cycles
 */
const CYCLES_PER_SAMPLE: i32 = CLOCK_SPEED / 4 / SAMPLE_RATE;
/** Number of values in a "frame-wide" sample  */
const SAMPLE_SIZE: i32 = SAMPLE_RATE / FRAME_RATE;

const NR52_APU_TOGGLE: u8 = 1 << 7;
const NR52_CHAN1_ON: u8 = 1 << 0;
const NR52_CHAN2_ON: u8 = 1 << 1;
const NR52_CHAN3_ON: u8 = 1 << 2;
const NR52_CHAN4_ON: u8 = 1 << 3;

const DIV_TICK_BIT: u8 = 1 << 4;

/**
 * Converts a digital value in 0 - F into an analog value in -1 - 1 (negative slope)
 */
function DAC(n: u4): f32 {
    return (-n / 0xf) * 2 + 1;
}

export class ChannelCallback {
    constructor(private register: SubRegister, private flag: u8) {}
    changed(state: boolean): void {
        this.register.sflag(this.flag, state);
    }
}

/**
 * The APU (Audio Processing Unit) of the Gameboy - it handles producing sound.
 */
export class APU implements Addressable {
    /** Master voulume and stereo mix control  */
    protected nr50: SubRegister = new SubRegister(0x77);
    /** Stereo mix control register */
    protected nr51: SubRegister = new SubRegister(0xf3);
    /** Status and control register */
    protected nr52: SubRegister = new PaddedSubRegister(0b0111_0000, 0xf1);

    /** Sound channels */
    protected channel1: SoundChannel = new SoundChannel1(
        new ChannelCallback(this.nr52, NR52_CHAN1_ON)
    );
    protected channel2: SoundChannel = new SoundChannel2(
        new ChannelCallback(this.nr52, NR52_CHAN2_ON)
    );
    protected channel3: SoundChannel = new SoundChannel3(
        new ChannelCallback(this.nr52, NR52_CHAN3_ON)
    );
    protected channel4: SoundChannel = new SoundChannel4(
        new ChannelCallback(this.nr52, NR52_CHAN4_ON)
    );

    protected addresses: Int16Map<Addressable> = new Map<u16, Addressable>();

    /** Ticking control */
    protected oldDivBitState: boolean = false;

    /** Audio output */
    protected cyclesForSample: number = 0;
    protected sampleIndex: number = 0;
    protected audioBuffer: Float32Array = new Float32Array(SAMPLE_SIZE);
    protected output: GameBoyOutput;

    constructor(output: GameBoyOutput) {
        this.output = output;

        fillMap(<u16>0xff10, <u16>0xff14, this.addresses, this.channel1);
        fillMap(<u16>0xff15, <u16>0xff19, this.addresses, this.channel2);
        fillMap(<u16>0xff1a, <u16>0xff1e, this.addresses, this.channel3);
        fillMap(<u16>0xff1f, <u16>0xff23, this.addresses, this.channel4);
        this.addresses.set(0xff24, this.nr50);
        this.addresses.set(0xff25, this.nr51);
        this.addresses.set(0xff26, this.nr52);
        fillMap(<u16>0xff30, <u16>0xff3f, this.addresses, this.channel3); // wave RAM
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

        this.channel1.tick(divChanged);
        this.channel2.tick(divChanged);
        this.channel3.tick(divChanged);
        this.channel4.tick(divChanged);

        if (++this.cyclesForSample >= CYCLES_PER_SAMPLE) {
            this.cyclesForSample -= CYCLES_PER_SAMPLE;

            // Get all variables for processing audio
            const nr51 = this.nr51.get();
            const nr52 = this.nr52.get();

            // Get output from each channel (we only get it if it's used later on)
            const out1 = (nr51 >> 0) | (nr51 >> 4) ? DAC(this.channel1.getOutput()) : 0;
            const out2 = (nr51 >> 1) | (nr51 >> 5) ? DAC(this.channel2.getOutput()) : 0;
            const out3 = (nr51 >> 2) | (nr51 >> 6) ? DAC(this.channel3.getOutput()) : 0;
            const out4 = (nr51 >> 3) | (nr51 >> 7) ? DAC(this.channel4.getOutput()) : 0;

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

    read(pos: u16): u8 {
        return this.addresses.get(pos).read(pos);
    }
    write(pos: u16, data: u8): void {
        const component = this.addresses.get(pos);

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
                    this.write(address, 0x00);
                }
            }
        }

        component.write(pos, data);
    }
}

export default APU;
