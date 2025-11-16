import { Addressable } from "../Memory";
import { Register, RegisterFF } from "../Register";
import { clamp, Int2, Int4 } from "../util";
import SoundChannel, { NRX4_RESTART_CHANNEL } from "./SoundChannel";

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
    protected NRX1_LENGTH_TIMER_BITS = 0b0011_1111;

    protected nrX1 = new Register(0x3f);
    protected nrX2 = new Register(0x00);
    protected nrX3 = new Register(0xff);
    protected nrX4 = new Register(0xbf);

    protected addresses: Record<number, Addressable> = {
        0xff15: RegisterFF,
        0xff16: this.nrX1,
        0xff17: this.nrX2,
        0xff18: this.nrX3,
        0xff19: this.nrX4,
    };

    // Stores a private copy of wave length on trigger
    protected waveLength: number = 0;

    // For output
    protected ticksPerWaveStep: number = 0;
    protected waveStep: number = 0;
    protected waveStepSubsteps: number = 0;

    // NRx2 needs retriggering when changed
    protected cachedNRX2: number = this.nrX2.get();

    // Channel envelope volume
    protected envelopeVolumeSteps: number = 0;
    protected envelopeVolume: Int4 = 0;

    protected override doTick(): void {
        if (this.waveStepSubsteps++ >= this.ticksPerWaveStep) {
            this.waveStepSubsteps = 0;
            this.waveStep = (this.waveStep + 1) % 8;
        }
    }

    protected tickEnvelope(): void {
        if (this.envelopeVolumeSteps > 0) this.envelopeVolumeSteps--;
        else {
            this.envelopeVolumeSteps = this.cachedNRX2 & 0b111;
            if ((this.cachedNRX2 & 0b111) !== 0) {
                const direction = (this.cachedNRX2 & 0b0000_1000) === 0 ? -1 : 1;
                this.envelopeVolume = clamp(this.envelopeVolume + direction, 0x0, 0xf) as Int4;
            }
        }
    }

    protected override getSample(): Int4 {
        const dutyCycleType = ((this.nrX1.get() >> 6) & 0b11) as Int2;
        const wavePattern = wavePatterns[dutyCycleType];
        // if (this.constructor.name === "SoundChannel1")
        // console.log(this.waveStep, wavePattern[this.waveStep], this.envelopeVolume);
        return (wavePattern[this.waveStep] * this.envelopeVolume) as Int4;
    }

    protected override setWavelength(waveLength: number): void {
        super.setWavelength(waveLength);
        this.ticksPerWaveStep = 2048 - waveLength;
        this.waveLength = waveLength;
    }

    /* Audio control */

    get isDACOn(): boolean {
        return (this.nrX2.get() & NRX2_STOP_DAC) !== 0;
    }

    override onStart(): void {
        this.waveLength = this.getWavelength();

        this.cachedNRX2 = this.nrX2.get();
        this.envelopeVolume = (this.cachedNRX2 >> 4) as Int4;
        this.ticksPerWaveStep = 2048 - this.getWavelength();
    }

    read(pos: number): number {
        const component = this.addresses[pos];

        // bits 0-5 are write only
        if (component === this.nrX1) return component.read(pos) | 0b0011_1111;
        // register is write only
        if (component === this.nrX3) return 0xff;
        // only bit 6 is readable
        if (component === this.nrX4) return component.read(pos) | 0b1011_1111;

        return component.read(pos);
    }

    write(pos: number, data: number): void {
        const component = this.addresses[pos];

        component.write(pos, data);

        // Restart
        if (component === this.nrX4 && (data & NRX4_RESTART_CHANNEL) !== 0) {
            this.stop();
            this.start();
            data &= ~NRX4_RESTART_CHANNEL; // bit is write-only
        }

        // Clearing bits 3-7 of NRX2 turns the DAC (and the channel) off
        if (component === this.nrX2 && (data & NRX2_STOP_DAC) === 0) {
            this.stop();
        }
    }
}

export default SoundChannel2;
