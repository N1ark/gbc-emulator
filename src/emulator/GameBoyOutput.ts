interface GameBoyOutput {
    /**
     * Receives the GameBoy's output, as an array of RGBA values.
     */
    receive(data: Uint32Array): void;

    /**
     * Optional method that receives the currently loaded background data in 256x256.
     */
    debugBackground?(data: Uint32Array): void;

    /**
     * Optional method that receives an image with the current tileset in 128x192.
     */
    debugTileset?(data: Uint32Array): void;

    /**
     * Optional method that receives the serial output of the gameboy, character by character.
     */
    serialOut?(data: number): void;

    /**
     * Optional method that receives errors raised by the gameboy while it's running.
     */
    errorOut?(error: unknown): void;
}

export default GameBoyOutput;
