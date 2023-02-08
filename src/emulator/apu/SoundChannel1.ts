import { Addressable } from "../Memory";
import { MaskRegister, Register } from "../Register";
import { Int3, Int4 } from "../util";
import SoundChannel2 from "./SoundChannel2";

const NRX0_SWEEP_CHANGE = 1 << 3;
const NRX0_MULTIPlIER = 0b0000_0111;

/**
 * Sound channel 1 generates a pulse signal, with a wavelength sweep.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-1--pulse-with-wavelength-sweep
 */
class SoundChannel1 extends SoundChannel2 {
    // Addresses
    protected readonly nrX0 = 0xff10;
    protected override readonly nrX1 = 0xff11;
    protected override readonly nrX2 = 0xff12;
    protected override readonly nrX3 = 0xff13;
    protected override readonly nrX4 = 0xff14;

    // Sweep settings
    protected sweepPeriod: Int3 = 0;
    protected sweepShift: Int3 = 0;
    protected sweepAddMode: boolean = false;

    // Wavelength sweep pace countdown
    protected waveSweepCounter: number = 0;
    // Whether the sweep is enabled at all
    protected sweepEnabled: boolean = false;

    // Needed because going from negate to positive mode turns off the channel
    protected didNegate: boolean = false;

    protected override tickSweep(): void {
        if (this.waveSweepCounter > 1) this.waveSweepCounter--;
        else {
            if (this.sweepPeriod === 0) {
                this.waveSweepCounter = 8; // 0 is treated as 8
            } else {
                this.waveSweepCounter = this.sweepPeriod;
                if (this.sweepEnabled) this.applyWavelengthSweep();
            }
        }
    }
    protected applyWavelengthSweep(): void {
        const addOrSub = this.sweepAddMode ? +1 : -1;
        const wave = this.waveLength;
        this.didNegate ||= addOrSub === -1;
        const newWave = wave + addOrSub * (wave >> this.sweepShift);
        // On overflow, stop channel
        if (newWave > 0x7ff) this.stop();
        else {
            // Can't underflow, saturate at 0
            if (newWave < 0) this.setWavelength(0);
            // Normal case
            else this.setWavelength(newWave);
        }
    }

    override trigger(): void {
        super.trigger();
        this.waveSweepCounter = this.sweepPeriod === 0 ? 8 : this.sweepPeriod;
        this.sweepEnabled =
            this.sweepPeriod !== 0 || // sweep period != 0
            this.sweepShift !== 0; // sweep shift != 0
        // On start, if the shift isn't 0, a sweep overflow check is made
        if (this.sweepShift !== 0) {
            this.applyWavelengthSweep();
        }
    }

    override read(pos: number): number {
        if (pos === this.nrX0) {
            return (
                0b1000_0000 | // bit 7 always 1
                (this.sweepPeriod << 4) | // bits 4-6
                (this.sweepAddMode ? 0 : NRX0_SWEEP_CHANGE) | // bit 3
                this.sweepShift // bits 0-2
            );
        }
        return super.read(pos);
    }

    override write(pos: number, data: number): void {
        if (pos === this.nrX0) {
            this.sweepPeriod = ((data >> 4) & 0b111) as Int3; // bits 4-6
            this.sweepAddMode = (data & NRX0_SWEEP_CHANGE) === 0; // bit 3
            this.sweepShift = (data & NRX0_MULTIPlIER) as Int3; // bits 0-2

            if (this.didNegate && !this.sweepAddMode) {
                this.stop();
            }
            this.didNegate = false;
        } else super.write(pos, data);
    }
}

export default SoundChannel1;
