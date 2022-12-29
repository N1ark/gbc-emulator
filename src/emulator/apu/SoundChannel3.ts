import Addressable from "../Addressable";
import { RAM } from "../Memory";
import { PaddedSubRegister, SubRegister } from "../Register";
import { Int2 } from "../util";
import SoundChannel, { NRX4_RESTART_CHANNEL } from "./SoundChannel";

const NRX0_DAC_FLAG = 0b1000_0000;
const NRX2_OUTPUT_LEVEL = 0b0110_0000;

const VOLUME_LEVELS: Record<Int2, number> = {
    0b00: 0,
    0b01: 1,
    0b10: 0.5,
    0b11: 0.25,
};

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

    // For output
    protected ticksNextSample = 0;
    protected waveStep = 0;

    protected currentSample = 0;

    override doTick(divChanged: boolean) {
        super.doTick(divChanged);

        if (this.ticksNextSample-- <= 0) {
            const frequency = (2048 - this.getWavelength()) / 2;
            this.ticksNextSample = frequency;

            this.waveStep = (this.waveStep + 1) % 32;

            const waveIndex = this.waveStep >> 1;
            const waveByte = this.waveData.read(waveIndex);
            const waveNibble = this.waveStep & 1 ? waveByte >> 4 : waveByte & 0b1111;
            // Linearly translate [0x0; 0xf] to [-1; 1]
            this.currentSample = (-waveNibble / 0xf) * 2 + 1;
        }
    }

    override getSample(): number {
        if (!this.enabled) return 0;
        const outputLevel = ((this.nrX2.get() & NRX2_OUTPUT_LEVEL) >> 5) as Int2;
        const volume = VOLUME_LEVELS[outputLevel];
        return this.currentSample * volume;
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

        if (component === this.nrX0) {
            const oldDacState = this.nrX0.flag(NRX0_DAC_FLAG);
            const newDacState = (data & NRX0_DAC_FLAG) === NRX0_DAC_FLAG;
            if (oldDacState && !newDacState) {
                this.stop();
            } else if (!oldDacState && newDacState) {
                this.start();
            }
        }
        if (component === this.nrX3) {
            if ((data & NRX4_RESTART_CHANNEL) === NRX4_RESTART_CHANNEL) {
                this.stop();
                this.start();
            }
        }
        if (component === this.waveData) {
            pos -= 0xff30;
        }
        component.write(pos, data);
    }
}

export default SoundChannel3;
