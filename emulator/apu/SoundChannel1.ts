import { Addressable } from "../Memory";
import { PaddedSubRegister, SubRegister } from "../Register";
import { Int16Map } from "../util";
import { ChannelCallback } from "./APU";
import { FREQUENCY_SWEEP_PACE } from "./SoundChannel";
import SoundChannel2 from "./SoundChannel2";

const NRX0_SWEEP_CHANGE = 1 << 3;
const NRX0_MULTIPlIER = 0b0000_0111;

/**
 * Sound channel 1 generates a pulse signal, with a wavelength sweep.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-1--pulse-with-wavelength-sweep
 */
class SoundChannel1 extends SoundChannel2 {
    protected override addresses: Int16Map<Addressable> = new Map<u16, Addressable>();

    constructor(callback: ChannelCallback) {
        super(callback);

        this.nrX0 = new PaddedSubRegister(0b1000_0000, 0x80);
        this.nrX1 = new SubRegister(0xbf);
        this.nrX2 = new SubRegister(0xf3);
        this.nrX3 = new SubRegister(0xff);
        this.nrX4 = new SubRegister(0xbf);

        this.addresses.set(0xff10, this.nrX0);
        this.addresses.set(0xff11, this.nrX1);
        this.addresses.set(0xff12, this.nrX2);
        this.addresses.set(0xff13, this.nrX3);
        this.addresses.set(0xff14, this.nrX4);
    }

    // Wavelength sweep pace
    protected waveSweepCounter: i16 = 0;

    protected override doTick(divChanged: boolean): void {
        super.doTick(divChanged);
        if (divChanged && --this.waveSweepCounter <= 0) {
            this.resetSweepPaceCounter(); // Will set to -1 if disabled, positive number
            if (this.waveSweepCounter !== -1) this.applyWavelengthSweep();
        }
    }

    protected applyWavelengthSweep(): void {
        const addOrSub: u16 = this.nrX0.flag(NRX0_SWEEP_CHANGE) ? -1 : 1;
        const multiplier: u16 = this.nrX0.get() & NRX0_MULTIPlIER; // bits 0-2
        const wave: u16 = this.getWavelength();
        // Can't underflow, saturate at 0
        const newWave: u16 = Math.max(0, wave + addOrSub * (wave >> multiplier));

        // On overflow, stop channel
        if (newWave > 0x7ff) this.stop();
        else this.setWavelength(newWave);
    }

    protected resetSweepPaceCounter(): void {
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
}

export default SoundChannel1;
