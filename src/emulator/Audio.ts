import Addressable from "./Addressable";

class Audio implements Addressable {
    read(pos: number): number {
        if (pos === 0xff26) {
            return 0x00; // all sounds are off
        }
        console.debug("Ignore read for audio.");
        return 0x00;
    }
    write(pos: number, data: number): void {
        console.debug("Ignore write for audio.");
    }
}

export default Audio;
