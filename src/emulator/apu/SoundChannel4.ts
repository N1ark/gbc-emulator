import { Addressable } from "../Memory";
import { MaskRegister, RegisterFF, Register } from "../Register";
import { clamp, Int4 } from "../util";
import SoundChannel, { FREQUENCY_ENVELOPE, NRX4_RESTART_CHANNEL } from "./SoundChannel";

const NRX2_STOP_DAC = 0b1111_1000;
const NRX3_CLOCK_SHIFT_OFFSET = 4;
const NRX3_LFSR_SHORT_MODE = 0b0000_1000;
const NRX3_CLOCK_DIVIDER = 0b0000_0111;

/**
 * Sound channel 4 generates noise, that can be somewhat customised for softer/harsher noise.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-4--noise
 */
class SoundChannel4 extends SoundChannel {
    protected NRX1_LENGTH_TIMER_BITS: number = 0b0011_1111;

    protected nrX1 = new Register(0xff);
    protected nrX2 = new Register(0x00);
    protected nrX3 = new Register(0x00);
    protected nrX4 = new MaskRegister(0b0011_1111, 0xbf);

    protected addresses: Record<number, Addressable> = {
        0xff1f: RegisterFF,
        0xff20: this.nrX1,
        0xff21: this.nrX2,
        0xff22: this.nrX3,
        0xff23: this.nrX4,
    };

    // NRx2 needs retriggering when changed
    protected cachedNRX2: number = this.nrX2.get();

    // Channel envelope volume
    protected envelopeVolumeSteps: number = 0;
    protected envelopeVolume: Int4 = 0;

    // LFSR
    protected ticksForLfsr: number = 0;
    protected lfsr: number = 0x00;

    protected override doTick() {
        if (--this.ticksForLfsr <= 0) {
            this.refreshLsfrTicks();
            const lfsrBit = ~(this.lfsr ^ (this.lfsr >> 1)) & 1;
            const shortMode = this.nrX3.flag(NRX3_LFSR_SHORT_MODE);
            this.lfsr = (this.lfsr >> 1) | (lfsrBit << 15) | (shortMode ? 0 : lfsrBit << 7);
        }
    }

    protected override tickEnvelope(): void {
        if (this.envelopeVolumeSteps-- <= 0 && (this.cachedNRX2 & 0b111) !== 0) {
            const direction = (this.cachedNRX2 & 0b0000_1000) === 0 ? -1 : 1;
            this.envelopeVolume = clamp(this.envelopeVolume + direction, 0x0, 0xf) as Int4;
            this.envelopeVolumeSteps = this.cachedNRX2 & 0b111;
        }
    }

    protected refreshLsfrTicks(): void {
        const clockDivider = this.nrX3.get() & NRX3_CLOCK_DIVIDER || 0.5; // 0 treated as 0.5
        const clockShift = this.nrX3.get() >> NRX3_CLOCK_SHIFT_OFFSET;
        this.ticksForLfsr = 4 * (clockDivider * (1 << clockShift));
    }

    protected override getSample(): Int4 {
        return ((this.lfsr & 1) * this.envelopeVolume) as Int4;
    }

    get isDACOn(): boolean {
        return (this.nrX2.get() & NRX2_STOP_DAC) !== 0;
    }

    override onStart(): void {
        this.cachedNRX2 = this.nrX2.get();
        this.envelopeVolume = (this.cachedNRX2 >> 4) as Int4;
        this.lfsr = 0;
        this.refreshLsfrTicks();
    }

    read(pos: number): number {
        const component = this.addresses[pos];
        // register is write only
        if (component === this.nrX1) return 0xff;
        // only bit 6 is readable
        if (component === this.nrX4) return this.nrX4.get() | 0b1011_1111;
        return component.read(pos);
    }

    write(pos: number, data: number): void {
        const component = this.addresses[pos];

        // Restart
        if (component === this.nrX4 && (data & NRX4_RESTART_CHANNEL) !== 0) {
            this.stop();
            this.start();
            data &= ~NRX4_RESTART_CHANNEL; // bit is write-only
        }
        // Turning off channel
        if (component === this.nrX2 && (data & NRX2_STOP_DAC) === 0) {
            this.stop();
        }

        component.write(pos, data);
    }
}

export default SoundChannel4;
