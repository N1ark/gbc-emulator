import Addressable from "./Addressable";

class Audio implements Addressable {
    read(pos: number): number {
        return 0x00;
    }
    write(pos: number, data: number): void {}
}

export default Audio;
