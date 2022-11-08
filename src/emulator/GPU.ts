import Readable from "./Addressable";
import System from "./System";

/**
 * The GPU of the GBC, responsible for rendering the current state of the console.
 */
class GPU implements Readable {
    tick(cycles: number, system: System) {}

    read(pos: number): number {
        return 0;
    }
    write(pos: number, data: number): void {
        throw new Error("Method not implemented.");
    }
}

export default GPU;
