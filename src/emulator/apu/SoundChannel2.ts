import Addressable from "../Addressable";
import { RegisterFF, SubRegister } from "../Register";
import APU from "./APU";
import SoundChannel from "./SoundChannel";
import SoundChannel1 from "./SoundChannel1";

/**
 * Sound channel 2 is identical to channel 1, except that it doesn't have a wavelength sweep.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-2--pulse
 */
class SoundChannel2 extends SoundChannel {
    protected nrX1 = new SubRegister(0x3f);
    protected nrX2 = new SubRegister(0x00);
    protected nrX3 = new SubRegister(0xff);
    protected nrX4 = new SubRegister(0xbf);

    tick(apu: APU): void {}

    start(): void {}
    stop(): void {}

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
        return component.read(pos);
    }

    write(pos: number, data: number): void {
        const component = this.address(pos);
        component.write(pos, data);
    }
}

export default SoundChannel2;
