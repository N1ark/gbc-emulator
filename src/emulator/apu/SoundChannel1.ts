import { Addressable } from "../Memory";
import { MaskRegister, Register } from "../Register";
import { Int4 } from "../util";
import SoundChannel2 from "./SoundChannel2";

const NRX0_SWEEP_CHANGE = 1 << 3;
const NRX0_MULTIPlIER = 0b0000_0111;

/**
 * Sound channel 1 generates a pulse signal, with a wavelength sweep.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-1--pulse-with-wavelength-sweep
 */
class SoundChannel1 extends SoundChannel2 {
    protected nrX0 = new MaskRegister(0b1000_0000, 0x80);
    protected nrX1 = new Register(0xbf);
    protected nrX2 = new Register(0xf3);
    protected nrX3 = new Register(0xff);
    protected nrX4 = new Register(0xbf);

    // Needed because going from negate to positive mode turns off the channel
    protected inNegateMode: boolean = false;
    // Wavelength sweep pace countdown
    protected waveSweepCounter: number = 0;
    // Whether the sweep is enabled at all
    protected sweepEnabled: boolean = false;

    protected override addresses: Record<number, Addressable> = {
        0xff10: this.nrX0,
        0xff11: this.nrX1,
        0xff12: this.nrX2,
        0xff13: this.nrX3,
        0xff14: this.nrX4,
    };

    protected override tickSweep(): void {
        if (this.waveSweepCounter > 1) this.waveSweepCounter--;
        else {
            const nextCounter = (this.nrX0.get() >> 4) & 0b111; // bits 4-6
            if (nextCounter === 0) {
                this.waveSweepCounter = 8; // 0 is treated as 8
            } else {
                this.waveSweepCounter = nextCounter;
                if (this.sweepEnabled) this.applyWavelengthSweep();
            }
        }
    }

    protected applyWavelengthSweep(): void {
        const addOrSub = this.nrX0.flag(NRX0_SWEEP_CHANGE) ? -1 : 1;
        const multiplier = this.nrX0.get() & NRX0_MULTIPlIER; // bits 0-2

        const wave = this.waveLength;
        this.inNegateMode ||= addOrSub === -1;
        const newWave = wave + addOrSub * (wave >> multiplier);

        // On overflow, stop channel
        if (newWave > 0x7ff) this.stop();
        else {
            // Can't underflow, saturate at 0
            if (newWave < 0) this.setWavelength(0);
            // Normal case
            else this.setWavelength(newWave);
        }
    }

    write(pos: number, data: number): void {
        super.write(pos, data);

        if (pos === 0xff10) {
            const wasNegating = this.inNegateMode;
            const isNegating = this.nrX0.flag(NRX0_SWEEP_CHANGE);
            if (wasNegating && !isNegating) {
                this.stop();
            }
            this.inNegateMode = false;
        }
    }

    override onStart(): void {
        super.onStart();

        const nrX0 = this.nrX0.get();
        const nextCounter = (nrX0 >> 4) & 0b111; // bits 4-6
        this.waveSweepCounter = nextCounter === 0 ? 8 : nextCounter;
        this.sweepEnabled =
            ((nrX0 >> 4) & 0b111) !== 0 || // sweep period != 0
            (nrX0 & NRX0_MULTIPlIER) !== 0; // sweep shift != 0

        // On start, if the shift isn't 0, a sweep overflow check is made
        if ((nrX0 & NRX0_MULTIPlIER) > 0) {
            this.applyWavelengthSweep();
        }
    }
}

export default SoundChannel1;
