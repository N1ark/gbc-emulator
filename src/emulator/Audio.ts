import Addressable from "./Addressable";

class Audio implements Addressable {
    read(pos: number): number {
        if (pos === 0xff26) {
            return 0x00; // all sounds are off
        }
        return 0x00;
    }
    write(pos: number, data: number): void {}
}

export default Audio;
