import Addressable from "../Addressable";
import { PaddedSubRegister, SubRegister } from "../Register";
import System from "../System";
import { FREQUENCY_SWEEP_PACE } from "./SoundChannel";
import SoundChannel2 from "./SoundChannel2";

const NRX0_SWEEP_CHANGE = 1 << 3;
const NRX0_MULTIPlIER = 0b0000_0111;

/**
 * Sound channel 1 generates a pulse signal, with a wavelength sweep.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-1--pulse-with-wavelength-sweep
 */
class SoundChannel1 extends SoundChannel2 {
    protected nrX0 = new PaddedSubRegister(7, 0x80);
    protected nrX1 = new SubRegister(0xbf);
    protected nrX2 = new SubRegister(0xf3);
    protected nrX3 = new SubRegister(0xff);
    protected nrX4 = new SubRegister(0xbf);

    // Wavelength sweep pace
    protected waveSweepCounter: number = 0;

    override doTick(divChanged: boolean): void {
        super.doTick(divChanged);
        if (divChanged && --this.waveSweepCounter <= 0) {
            this.resetSweepPaceCounter(); // Will set to -1 if disabled, positive number
            if (this.waveSweepCounter !== -1) this.applyWavelengthSweep();
        }
    }

    protected applyWavelengthSweep(): void {
        const addOrSub = this.nrX0.flag(NRX0_SWEEP_CHANGE) ? -1 : 1;
        const multiplier = this.nrX0.get() & NRX0_MULTIPlIER; // bits 0-2
        const wave = this.getWavelength();
        // Can't underflow, saturate at 0
        const newWave = Math.max(0, wave + addOrSub * (wave >> multiplier));

        // On overflow, stop channel
        if (newWave > 0x7ff) this.stop();
        else this.setWavelength(newWave);
    }

    protected resetSweepPaceCounter() {
        const nextCounter = (this.nrX0.get() >> 4) & 0b111; // bits 4-6
        this.waveSweepCounter = nextCounter === 0 ? -1 : FREQUENCY_SWEEP_PACE * nextCounter;
    }

    override start(): void {
        if (this.enabled) return;
        super.start();

        // On start, if the shift isn't 0, a sweep overflow check is made
        if ((this.nrX0.get() & NRX0_MULTIPlIER) !== 0) {
            this.applyWavelengthSweep();
        }
    }

    protected override address(pos: number): Addressable {
        switch (pos) {
            case 0xff10:
                return this.nrX0;
            case 0xff11:
                return this.nrX1;
            case 0xff12:
                return this.nrX2;
            case 0xff13:
                return this.nrX3;
            case 0xff14:
                return this.nrX4;
        }
        throw new Error(`Invalid address passed to sound channel 1: ${pos.toString(16)}`);
    }
}

export default SoundChannel1;
