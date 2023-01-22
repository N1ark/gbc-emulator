interface GameBoyOutput {
    /**
     * Receives the GameBoy's output, as an array of RGBA values.
     */
    receive?(data: Uint32Array): void;

    /**
     * Optional method that receives the currently loaded background data in 256x256.
     */
    debugBackground?(data: Uint32Array): void;

    /**
     * Optional method that receives an image with the current tileset in 256x192.
     */
    debugTileset?(data: Uint32Array): void;

    /**
     * Optional method that receives a sample of sound. The emulator produces samples at a
     * 44.1Hz rate, and outputs them every 60th of a second (ie. every frame).
     */
    receiveSound?(data: Float32Array): void;

    /**
     * Optional method that receives the serial output of the gameboy, character by character.
     */
    serialOut?(data: number): void;

    /**
     * Optional method that receives the number of cycles executed so far by the system.
     */
    stepCount?(steps: number): void;

    /**
     * Optional method that returns the number of clock cycles per second.
     */
    cyclesPerSec?(cycles: number): void;

    /**
     * Optional method that receives the number of milliseconds taken between the two last frames.
     */
    frameDrawDuration?(ms: number): void;
}

export default GameBoyOutput;
