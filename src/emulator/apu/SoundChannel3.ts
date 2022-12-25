import Addressable from "../Addressable";
import { RAM } from "../Memory";
import { SubRegister } from "../Register";
import APU from "./APU";
import SoundChannel from "./SoundChannel";

/**
 * Sound channel 3 generates a wave that can be customised as needed.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-3--wave-output
 */
class SoundChannel3 extends SoundChannel {
    protected nrX0 = new SubRegister();
    protected nrX1 = new SubRegister(0xbf);
    protected nrX2 = new SubRegister(0xf3);
    protected nrX3 = new SubRegister(0xff);
    protected nrX4 = new SubRegister(0xbf);
    protected waveData = new RAM(16);

    tick(apu: APU): void {}

    start(): void {}
    stop(): void {}

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
