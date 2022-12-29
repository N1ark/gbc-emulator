import Addressable from "../Addressable";
import { PaddedSubRegister, SubRegister } from "../Register";
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
    protected waveSweepSubcounter: number = 0;
    protected waveSweepCounter: number = 0;

    override doTick(divChanged: boolean): void {
        super.doTick(divChanged);

        if (
            divChanged &&
            this.waveSweepSubcounter++ >= FREQUENCY_SWEEP_PACE &&
            this.waveSweepCounter !== -1
        ) {
            this.waveSweepSubcounter = 0;
            if (this.waveSweepCounter-- === 0) {
                this.resetSweepPaceCounter();
                const addOrSub = this.nrX0.flag(CHAN1_SWEEP_CHANGE) ? -1 : 1;
                const multiplier = this.nrX0.get() & 0b111; // bits 0-2
                const wave = this.getWavelength();
                this.setWavelength(wave + addOrSub * (wave >> multiplier));
            }
        }
    }

    protected resetSweepPaceCounter() {
        const nextCounter = (this.nrX0.get() >> 4) & 0b111; // bits 4-6
        this.waveSweepCounter = nextCounter === 0 ? -1 : FREQUENCY_SWEEP_PACE * nextCounter;
        this.waveSweepSubcounter = 0;
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
