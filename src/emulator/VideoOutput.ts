interface VideoOutput {
    receive(data: Uint8ClampedArray): void;
}

export default VideoOutput;
