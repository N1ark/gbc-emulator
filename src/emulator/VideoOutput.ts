interface VideoOutput {
    /**
     * Receives the GameBoy's output, as an array of RGBA values.
     */
    receive(data: Uint32Array): void;
}

export default VideoOutput;
