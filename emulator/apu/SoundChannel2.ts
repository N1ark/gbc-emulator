import { Addressable } from "../Memory";
import { RegisterFF, SubRegister } from "../Register";
import { clamp8, Int16Map, u1, u2, u3, u4 } from "../util";
import { SoundChannel, FREQUENCY_ENVELOPE, NRX4_RESTART_CHANNEL } from "./SoundChannel";

const NRX2_STOP_DAC: u8 = 0b1111_1000;
const wavePatterns: StaticArray<Array<u1>> = new StaticArray(4);
wavePatterns[0] = [1, 1, 1, 1, 1, 1, 1, 0];
wavePatterns[1] = [0, 1, 1, 1, 1, 1, 1, 0];
wavePatterns[2] = [0, 1, 1, 1, 1, 0, 0, 0];
wavePatterns[3] = [1, 0, 0, 0, 0, 0, 0, 1];

/**
 * Sound channel 2 is identical to channel 1, except that it doesn't have a wavelength sweep.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-2--pulse
 */
class SoundChannel2 extends SoundChannel {
    protected override NRX1_LENGTH_TIMER_BITS: u8 = 0b0011_1111;

    protected addresses: Int16Map<Addressable> = new Map<u16, Addressable>();

    constructor(onStateChange: (state: boolean) => void) {
        super(onStateChange);

        this.nrX1 = new SubRegister(0x3f);
        this.nrX2 = new SubRegister(0x00);
        this.nrX3 = new SubRegister(0xff);
        this.nrX4 = new SubRegister(0xbf);

        this.addresses.set(0xff15, RegisterFF);
        this.addresses.set(0xff16, this.nrX1);
        this.addresses.set(0xff17, this.nrX2);
        this.addresses.set(0xff18, this.nrX3);
        this.addresses.set(0xff19, this.nrX4);
    }

    // For output
    protected ticksPerWaveStep: number = 0;
    protected waveStep: u3 = 0;
    protected waveStepSubsteps: number = 0;

    // NRx2 needs retriggering when changed
    protected cachedNRX2: u8 = this.nrX2.get();

    // Channel envelope volume
    protected envelopeVolumeSteps: number = 0;
    protected envelopeVolume: u4 = 0;

    protected override doTick(divChanged: boolean): void {
        if (this.waveStepSubsteps++ >= this.ticksPerWaveStep) {
            this.waveStepSubsteps = 0;
            this.waveStep = ((this.waveStep + 1) & 0b111) as u3;
        }

        if (divChanged && this.envelopeVolumeSteps-- <= 0 && (this.cachedNRX2 & 0b111) !== 0) {
            const direction: u8 = (this.cachedNRX2 & 0b0000_1000) === 0 ? -1 : 1;
            this.envelopeVolume = clamp8(this.envelopeVolume + direction, 0x0, 0xf) as u4;
            this.envelopeVolumeSteps = FREQUENCY_ENVELOPE * (this.cachedNRX2 & 0b111);
        }
    }

    protected override getSample(): u4 {
        const dutyCycleType: u2 = (this.nrX1.get() >> 6) & 0b11;
        const wavePattern: Array<u1> = wavePatterns[dutyCycleType];
        return (wavePattern[this.waveStep] * this.envelopeVolume) as u4;
    }

    protected override setWavelength(waveLength: number): void {
        super.setWavelength(waveLength);
        this.waveLengthUpdate();
    }

    /* Audio control */
    protected waveLengthUpdate(): void {
        this.ticksPerWaveStep = 2048 - this.getWavelength();
    }

    start(): void {
        if (this.enabled) return;
        super.start();

        this.cachedNRX2 = this.nrX2.get();
        this.envelopeVolume = (this.cachedNRX2 >> 4) as u4;
        this.waveLengthUpdate();
    }

    read(pos: u16): u8 {
        const component = this.addresses.get(pos);

        // bits 0-5 are write only
        if (component === this.nrX1) return component.read(pos) | 0b0011_1111;
        // register is write only
        if (component === this.nrX3) return 0xff;
        // only bit 6 is readable
        if (component === this.nrX4) return component.read(pos) | 0b1011_1111;

        return component.read(pos);
    }

    write(pos: u16, data: u8): void {
        const component = this.addresses.get(pos);

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
