import Addressable from "../Addressable";
import { CLOCK_SPEED } from "../constants";
import { RegisterFF, SubRegister } from "../Register";
import { Int2 } from "../util";
import APU from "./APU";
import SoundChannel from "./SoundChannel";

const wavePatterns: Record<Int2, (-1 | 1)[]> = {
    0b00: [1, 1, 1, 1, 1, 1, 1, 0].map((n) => (n ? 1 : -1)),
    0b01: [0, 1, 1, 1, 1, 1, 1, 0].map((n) => (n ? 1 : -1)),
    0b10: [0, 1, 1, 1, 1, 0, 0, 0].map((n) => (n ? 1 : -1)),
    0b11: [1, 0, 0, 0, 0, 0, 0, 1].map((n) => (n ? 1 : -1)),
};

const envelopeFrequency = Math.floor(CLOCK_SPEED / 64);
const lengthTimerFrequency = Math.floor(CLOCK_SPEED / 256);

const NRX1_LENGTH_TIMER_BITS = 0b111111;
const NRX4_RESTART_CHANNEL = 1 << 7;
const NRX4_LENGTH_TIMER_FLAG = 1 << 6;

/**
 * Sound channel 2 is identical to channel 1, except that it doesn't have a wavelength sweep.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-2--pulse
 */
class SoundChannel2 extends SoundChannel {
    protected nrX1 = new SubRegister(0x3f);
    protected nrX2 = new SubRegister(0x00);
    protected nrX3 = new SubRegister(0xff);
    protected nrX4 = new SubRegister(0xbf);

    protected enabled: boolean = true;

    // Length timer
    protected lengthTimer = 0;
    // Envelope volume sweep pace
    protected volumeSweepCounter = 0;

    // For output
    protected ticksPerWaveStep = 0;
    protected waveStep = 0;
    protected timeTicks = 0;

    // NRx2 needs retriggering when changed
    protected cachedNRX2: number = this.nrX2.get();
    // Current channel envelope
    protected envelopeVolume: number = 0;

    tick(apu: APU): void {
        if (!this.enabled) return;

        if (this.timeTicks++ >= this.ticksPerWaveStep) {
            this.timeTicks = 0;
            this.waveStep = (this.waveStep + 1) % 8;
        }

        if (
            this.nrX4.flag(NRX4_LENGTH_TIMER_FLAG) &&
            this.lengthTimer++ >= lengthTimerFrequency
        ) {
            const nrx1 = this.nrX1.get();
            const lengthTimer = ((nrx1 & NRX1_LENGTH_TIMER_BITS) + 1) & NRX1_LENGTH_TIMER_BITS;
            this.nrX1.set((nrx1 & ~NRX1_LENGTH_TIMER_BITS) | lengthTimer);
            // overflowed
            if (lengthTimer === 0) {
                this.stop();
            }
        }

        if ((this.cachedNRX2 & 0b11) !== 0 && this.volumeSweepCounter-- === 0) {
            this.envelopeVolume += this.cachedNRX2 >> 3 === 0 ? -1 : 1;
            if (this.envelopeVolume === 0x0 || this.envelopeVolume === 15)
                this.volumeSweepCounter = -1;
            else this.volumeSweepCounter = envelopeFrequency * (this.cachedNRX2 & 0b11);
        }
    }

    getSample() {
        const dutyCycleType = ((this.nrX1.get() >> 6) & 0b11) as Int2;
        const wavePattern = wavePatterns[dutyCycleType];
        return wavePattern[this.waveStep] * this.envelopeVolume;
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
        this.waveLengthUpdate();
    }

    /* Audio control */
    protected waveLengthUpdate() {
        this.ticksPerWaveStep = 2048 - this.getWavelength();
    }

    start(): void {
        if (this.enabled) return;

        this.cachedNRX2 = this.nrX2.get();
        this.envelopeVolume = this.nrX2.get() >> 4;
        this.enabled = true;

        this.waveLengthUpdate();

        this.lengthTimer = 0;
    }

    stop(): void {
        if (!this.enabled) return;
        this.enabled = false;
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

        if (component === this.nrX1) {
            // bits 0-5 are write only
            return component.read(pos) | 0b0011_1111;
        }
        if (component === this.nrX3) {
            // register is write only
            return 0xff;
        }
        if (component === this.nrX4) {
            // only bit 6 is readable
            return component.read(pos) | 0b1011_1111;
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

        // Update volume / envelope
        if (component === this.nrX2) {
            // Clearing bits 3-7 turns the DAC (and the channel) off
            if ((data & 0b11111000) === 0) {
                this.stop();
            }
        }
    }
}

export default SoundChannel2;
