import Addressable from "../Addressable";
import { RegisterFF, SubRegister } from "../Register";
import { clamp, Int2, Int4 } from "../util";
import SoundChannel, { FREQUENCY_ENVELOPE, NRX4_RESTART_CHANNEL } from "./SoundChannel";

const NRX2_STOP_DAC = 0b1111_1000;
const wavePatterns: Record<Int2, (0 | 1)[]> = {
    0b00: [1, 1, 1, 1, 1, 1, 1, 0],
    0b01: [0, 1, 1, 1, 1, 1, 1, 0],
    0b10: [0, 1, 1, 1, 1, 0, 0, 0],
    0b11: [1, 0, 0, 0, 0, 0, 0, 1],
};

/**
 * Sound channel 2 is identical to channel 1, except that it doesn't have a wavelength sweep.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-2--pulse
 */
class SoundChannel2 extends SoundChannel {
    protected NRX1_LENGTH_TIMER_BITS = 0b0011_1111;

    protected nrX1 = new SubRegister(0x3f);
    protected nrX2 = new SubRegister(0x00);
    protected nrX3 = new SubRegister(0xff);
    protected nrX4 = new SubRegister(0xbf);

    // For output
    protected ticksPerWaveStep: number = 0;
    protected waveStep: number = 0;
    protected waveStepSubsteps: number = 0;

    // NRx2 needs retriggering when changed
    protected cachedNRX2: number = this.nrX2.get();

    // Channel envelope volume
    protected envelopeVolumeSteps: number = 0;
    protected envelopeVolume: Int4 = 0;

    override doTick(divChanged: boolean): void {
        super.doTick(divChanged);

        if (this.waveStepSubsteps++ >= this.ticksPerWaveStep) {
            this.waveStepSubsteps = 0;
            this.waveStep = (this.waveStep + 1) % 8;
        }

        if (divChanged && this.envelopeVolumeSteps-- <= 0 && (this.cachedNRX2 & 0b111) !== 0) {
            const direction = (this.cachedNRX2 & 0b0000_1000) === 0 ? -1 : 1;
            this.envelopeVolume = clamp(this.envelopeVolume + direction, 0x0, 0xf) as Int4;
            this.envelopeVolumeSteps = FREQUENCY_ENVELOPE * (this.cachedNRX2 & 0b111);
        }
    }

    protected override getSample(): Int4 {
        const dutyCycleType = ((this.nrX1.get() >> 6) & 0b11) as Int2;
        const wavePattern = wavePatterns[dutyCycleType];
        return (wavePattern[this.waveStep] * this.envelopeVolume) as Int4;
    }

    protected override setWavelength(waveLength: number): void {
        super.setWavelength(waveLength);
        this.waveLengthUpdate();
    }

    /* Audio control */
    protected waveLengthUpdate() {
        this.ticksPerWaveStep = 2048 - this.getWavelength();
    }

    start(): void {
        if (this.enabled) return;
        super.start();

        this.cachedNRX2 = this.nrX2.get();
        this.envelopeVolume = (this.cachedNRX2 >> 4) as Int4;
        this.waveLengthUpdate();
    }

    protected address(pos: number): Addressable {
        switch (pos) {
            case 0xff15:
                return RegisterFF;
            case 0xff16:
                return this.nrX1;
            case 0xff17:
                return this.nrX2;
            case 0xff18:
                return this.nrX3;
            case 0xff19:
                return this.nrX4;
        }
        throw new Error(`Invalid address passed to sound channel 2: ${pos.toString(16)}`);
    }

    read(pos: number): number {
        const component = this.address(pos);

        // bits 0-5 are write only
        if (component === this.nrX1) return component.read(pos) | 0b0011_1111;
        // register is write only
        if (component === this.nrX3) return 0xff;
        // only bit 6 is readable
        if (component === this.nrX4) return component.read(pos) | 0b1011_1111;

        return component.read(pos);
    }

    write(pos: number, data: number): void {
        const component = this.address(pos);

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
