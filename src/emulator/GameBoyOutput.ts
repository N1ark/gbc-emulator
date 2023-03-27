interface GameBoyOutput {
    /**
     * @param data the GameBoy's screen output, as an array of RGBA values, making up for a
     * 160x144 image.
     */
    receiveGraphics?(data: Uint32Array): void;

    /**
     * @param data a sample of sound. The emulator produces samples at a
     * 44.1Hz rate, and outputs them every 60th of a second (ie. every frame).
     */
    receiveSound?(data: Float32Array): void;

    // Debugging methods:

    /**
     * @param data an array of RGBA values, with the image of the currently loaded background
     * data in 256x256.
     */
    debugBackground?(data: Uint32Array): void;

    /**
     * @param data an array of RGBA values, with the image of the current tileset in 256x192.
     */
    debugTileset?(data: Uint32Array): void;

    /**
     * @param data the serial output of the Gameboy - called everytime a character is pushed.
     */
    serialOut?(data: number): void;
}

export default GameBoyOutput;
