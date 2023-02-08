import { Addressable } from "../Memory";
import { RegisterFF, Register } from "../Register";
import { clamp, Int2, Int4 } from "../util";
import SoundChannel, {
    NRX4_LENGTH_TIMER_FLAG,
    NRX4_RESTART_CHANNEL,
    VolumeEnvelope,
} from "./SoundChannel";

const NRX2_STOP_DAC = 0b1111_1000;
const wavePatterns: (0 | 1)[][] = [
    [1, 1, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 1],
];

/**
 * Sound channel 2 is identical to channel 1, except that it doesn't have a wavelength sweep.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-2--pulse
 */
class SoundChannel2 extends SoundChannel {
    protected static NRX1_LENGTH_TIMER_BITS = 0b0011_1111;

    // Addresses
    protected readonly nrX1 = 0xff11;
    protected readonly nrX2 = 0xff12;
    protected readonly nrX3 = 0xff13;
    protected readonly nrX4 = 0xff14;

    // Square wave
    protected currentWavePattern: Int2 = 0;

    // Stores a private copy of wave length on trigger
    protected waveLength: number = 0;

    // For output
    protected ticksPerWaveStep: number = 0;
    protected waveStep: number = 0;
    protected waveStepSubsteps: number = 0;

    constructor(onStateChange: (state: boolean) => void) {
        super(onStateChange, SoundChannel2.NRX1_LENGTH_TIMER_BITS);
        this.envelope = new VolumeEnvelope();
    }

    protected override doTick(): void {
        if (this.waveStepSubsteps++ >= this.ticksPerWaveStep) {
            this.waveStepSubsteps = 0;
            this.waveStep = (this.waveStep + 1) % 8;
        }
    }

    protected override getSample(): Int4 {
        const pattern = wavePatterns[this.currentWavePattern];
        return (pattern[this.waveStep] * this.envelope!.volume) as Int4;
    }

    protected setWavelength(waveLength: number): void {
        this.ticksPerWaveStep = 2048 - waveLength;
        this.waveLength = waveLength;
    }

    /* Audio control */

    protected override trigger(): void {
        super.trigger();
    }

    read(pos: number): number {
        switch (pos) {
            case this.nrX1:
                return (this.currentWavePattern << 6) | 0b0011_1111;

            case this.nrX2:
                return this.envelope!.read();

            case this.nrX3:
                return 0xff;

            case this.nrX4:
                return (
                    0b1011_0000 | (this.lengthCounter.isEnabled ? NRX4_LENGTH_TIMER_FLAG : 0)
                );
        }
        throw new Error("Invalid read in Channel2: " + pos.toString(16));
    }

    write(pos: number, data: number): void {
        switch (pos) {
            case this.nrX1: {
                this.currentWavePattern = (data >> 6) as Int2;
                this.lengthCounter.set(data & SoundChannel2.NRX1_LENGTH_TIMER_BITS);
                break;
            }
            case this.nrX2: {
                this.envelope!.write(data);
                this.isDACOn = (data & NRX2_STOP_DAC) !== 0;
                if (!this.isDACOn) this.stop();
                break;
            }
            case this.nrX3: {
                this.setWavelength((this.waveLength & 0b111_0000_0000) | data);
                break;
            }
            case this.nrX4: {
                this.setWavelength((this.waveLength & 0b000_1111_1111) | ((data & 0b111) << 8));

                this.lengthCounter.enable((data & NRX4_LENGTH_TIMER_FLAG) !== 0, this.step);
                if (!this.lengthCounter.isActive) this.stop();

                if ((data & NRX4_RESTART_CHANNEL) !== 0) {
                    if (this.isDACOn) {
                        this.start();
                    }
                    console.log("triggered", this.constructor.name);
                    this.trigger();
                }
                break;
            }
        }
    }
}

export default SoundChannel2;
