interface VideoOutput {
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
}

export default VideoOutput;
