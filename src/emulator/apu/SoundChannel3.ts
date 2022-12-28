import Addressable from "../Addressable";
import { RAM } from "../Memory";
import { PaddedSubRegister, SubRegister } from "../Register";
import APU from "./APU";
import SoundChannel from "./SoundChannel";

/**
 * Sound channel 3 generates a wave that can be customised as needed.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-3--wave-output
 */
class SoundChannel3 extends SoundChannel {
    protected NRX1_LENGTH_TIMER_BITS: number = 0b1111_1111;

    protected nrX0 = new PaddedSubRegister([0b0111_1111]);
    protected nrX1 = new SubRegister(0xbf);
    protected nrX2 = new PaddedSubRegister([0b1001_1111], 0xf3);
    protected nrX3 = new SubRegister(0xff);
    protected nrX4 = new PaddedSubRegister([0b0011_1000], 0xbf);
    protected waveData = new RAM(16);

    override doTick(divChanged: boolean) {
        super.doTick(divChanged);
    }

    override getSample(): number {
        return 0;
    }

    protected address(pos: number): Addressable {
        switch (pos) {
            case 0xff1a:
                return this.nrX0;
            case 0xff1b:
                return this.nrX1;
            case 0xff1c:
                return this.nrX2;
            case 0xff1d:
                return this.nrX3;
            case 0xff1e:
                return this.nrX4;
        }
        if (0xff30 <= pos && pos <= 0xff3f) return this.waveData;
        throw new Error(`Invalid address passed to sound channel 3: ${pos.toString(16)}`);
    }

    read(pos: number): number {
        const component = this.address(pos);

        // registers are write only
        if (component === this.nrX1 || component === this.nrX3) return 0xff;
        // only bit 6 is readable
        if (component === this.nrX4) return this.nrX4.get() | 0b1011_1111;
        // wave data is offset by 0xff30
        if (component === this.waveData) pos -= 0xff30;
        return component.read(pos);
    }

    write(pos: number, data: number): void {
        const component = this.address(pos);
        if (component === this.waveData) {
            pos -= 0xff30;
        }
        component.write(pos, data);
    }
}

export default SoundChannel3;
