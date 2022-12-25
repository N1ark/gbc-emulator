import Addressable from "../Addressable";
import { RegisterFF, SubRegister } from "../Register";
import APU from "./APU";
import SoundChannel from "./SoundChannel";

/**
 * Sound channel 4 generates noise, that can be somewhat customised for softer/harsher noise.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-4--noise
 */
class SoundChannel4 extends SoundChannel {
    protected nrX1 = new SubRegister(0xff);
    protected nrX2 = new SubRegister(0x00);
    protected nrX3 = new SubRegister(0x00);
    protected nrX4 = new SubRegister(0xbf);

    tick(apu: APU): void {}

    start(): void {}
    stop(): void {}

    protected address(pos: number): Addressable {
        switch (pos) {
            case 0xff1f:
                return RegisterFF;
            case 0xff20:
                return this.nrX1;
            case 0xff21:
                return this.nrX2;
            case 0xff22:
                return this.nrX3;
            case 0xff23:
                return this.nrX4;
        }
        throw new Error(`Invalid address passed to sound channel 4: ${pos.toString(16)}`);
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

export default SoundChannel4;
