import Addressable from "../Addressable";
import { APU } from "./APU";

abstract class SoundChannel implements Addressable {
    abstract tick(apu: APU): void;

    abstract start(): void;
    abstract stop(): void;

    abstract read(pos: number): number;
    abstract write(pos: number, data: number): void;
}

export default SoundChannel;
