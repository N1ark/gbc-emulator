import Addressable from "../Addressable";
import { CLOCK_SPEED } from "../constants";
import { PaddedSubRegister, SubRegister } from "../Register";
import APU from "./APU";
import { FREQUENCY_SWEEP_PACE } from "./SoundChannel";
import SoundChannel2 from "./SoundChannel2";

const CHAN1_SWEEP_CHANGE = 1 << 3;

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
    protected waveSweepCounter = 0;

    override tick(apu: APU): void {
        if (!this.enabled) return;
        super.tick(apu);

        if (this.waveSweepCounter !== -1 && this.waveSweepCounter-- === 0) {
            this.resetSweepPaceCounter();
            const addOrSub = this.nrX0.flag(CHAN1_SWEEP_CHANGE) ? -1 : 1;
            const multiplier = this.nrX0.get() & 0b111; // bits 0-2
            const wave = this.getWavelength();
            this.setWavelength(wave + addOrSub * (wave >> multiplier));
        }
    }

    protected resetSweepPaceCounter() {
        const nextCounter = (this.nrX0.get() >> 4) & 0b111; // bits 4-6
        if (nextCounter === 0) this.waveSweepCounter = -1;
        else this.waveSweepCounter = FREQUENCY_SWEEP_PACE * nextCounter;
    }

    override start(): void {
        if (this.enabled) return;
        super.start();
        this.resetSweepPaceCounter();
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
