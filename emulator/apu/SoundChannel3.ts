import { CircularRAM, Addressable, RAM } from "../Memory";
import { PaddedSubRegister, SubRegister } from "../Register";
import { fillMap, Int16Map, u1, u2, u4 } from "../util";
import { SoundChannel, NRX4_RESTART_CHANNEL } from "./SoundChannel";

const NRX0_DAC_FLAG: u8 = 1 << 7;
const NRX2_OUTPUT_LEVEL: u8 = 0b0110_0000;

/** How much to shift the sound to the right */
const VOLUME_LEVELS: StaticArray<u8> = new StaticArray<u8>(4);
VOLUME_LEVELS[0b00] = 4; // = muted
VOLUME_LEVELS[0b01] = 0; // = full volume
VOLUME_LEVELS[0b10] = 1; // = 50%
VOLUME_LEVELS[0b11] = 2; // = 25%

/**
 * Sound channel 3 generates a wave that can be customised as needed.
 * @link https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-3--wave-output
 */
class SoundChannel3 extends SoundChannel {
    protected override NRX1_LENGTH_TIMER_BITS: u8 = 0b1111_1111;
    protected waveData: RAM = new CircularRAM(16, 0xff30);

    protected addresses: Int16Map<Addressable> = new Map<u16, Addressable>();

    // For output
    protected ticksNextSample: number = 0;
    protected waveStep: number = 0;
    protected currentSample: u4 = 0;

    protected lastReadByte: u8 = 0xff;

    constructor(onStateChange: (state: boolean) => void) {
        super(onStateChange);

        this.nrX0 = new PaddedSubRegister(0b0111_1111);
        this.nrX1 = new SubRegister(0xbf);
        this.nrX2 = new PaddedSubRegister(0b1001_1111, 0xf3);
        this.nrX3 = new SubRegister(0xff);
        this.nrX4 = new PaddedSubRegister(0b0011_1000, 0xbf);

        this.addresses.set(0xff1a, this.nrX0);
        this.addresses.set(0xff1b, this.nrX1);
        this.addresses.set(0xff1c, this.nrX2);
        this.addresses.set(0xff1d, this.nrX3);
        this.addresses.set(0xff1e, this.nrX4);
        fillMap(0xff30, 0xff3f, this.addresses, this.waveData);
    }

    protected override doTick(): void {
        if (this.ticksNextSample-- <= 0) {
            const frequency = (2048 - this.getWavelength()) >> 1;
            this.ticksNextSample = frequency;

            this.waveStep = (this.waveStep + 1) % 32;

            const waveIndex = this.waveStep >> 1;
            const waveByte = this.waveData.read(waveIndex);
            const waveNibble = this.waveStep & 1 ? waveByte >> 4 : waveByte & 0b1111;
            this.currentSample = waveNibble as u4;
            this.lastReadByte = waveByte;
        } else {
            this.lastReadByte = 0xff;
        }
    }

    protected override getSample(): u4 {
        const outputLevel = ((this.nrX2.get() & NRX2_OUTPUT_LEVEL) >> 5) as u2;
        const volume = VOLUME_LEVELS[outputLevel];
        return (this.currentSample >> volume) as u4;
    }

    override start(): void {
        super.start();
        const frequency = (2048 - this.getWavelength()) >> 1;
        this.ticksNextSample = frequency;
    }

    read(pos: u16): u8 {
        const component = this.addresses.get(pos);

        // registers are write only
        if (component === this.nrX1 || component === this.nrX3) return 0xff;
        // only bit 6 is readable
        if (component === this.nrX4) return this.nrX4.get() | 0b1011_1111;
        // wave data is offset by 0xff30
        if (component === this.waveData) {
            // if (this.enabled) return this.lastReadByte;
        }
        return component.read(pos);
    }

    write(pos: u16, data: u8): void {
        const component = this.addresses.get(pos);

        if (component === this.nrX0) {
            const oldDacState = this.nrX0.flag(NRX0_DAC_FLAG);
            const newDacState = (data & NRX0_DAC_FLAG) === NRX0_DAC_FLAG;
            if (oldDacState && !newDacState) {
                this.stop();
            } else if (!oldDacState && newDacState) {
                this.start();
            }
        }
        if (component === this.nrX4) {
            if (data & NRX4_RESTART_CHANNEL) {
                this.stop();
                this.start();
            }
        }
        component.write(pos, data);
    }
}

export default SoundChannel3;
