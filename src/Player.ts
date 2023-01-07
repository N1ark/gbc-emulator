/**
 * A non-gameboy related class, that handles playing the received sound data.
 * Largely inspired by:
 * @link https://github.com/denislins/gameboy/blob/master/emulator/apu/Player.js
 */
class Player {
    protected context: AudioContext | undefined;
    protected lastPlayEnd: number | undefined;
    protected enqued: number = 0;

    protected windowBlurListener: () => void;
    protected windowFocusListener: () => void;

    constructor() {
        this.context = new AudioContext();
        this.context.resume();
        this.windowBlurListener = () => this.context?.suspend();
        this.windowFocusListener = () => this.context?.resume();
        window.addEventListener("blur", this.windowBlurListener, false);
        window.addEventListener("focus", this.windowFocusListener, false);
    }

    delete() {
        this.context?.close();
        delete this.context;
        window.removeEventListener("blur", this.windowBlurListener, false);
        window.removeEventListener("focus", this.windowFocusListener, false);
    }

    enqueue(sample: Float32Array) {
        // Not allowed to have more than 8 samples in the queue, to avoid delay
        if (this.enqued > 8 || !this.context) {
            return;
        }

        this.enqued++;

        const sampleDuration = sample.length / 44100;
        const startTime =
            this.lastPlayEnd && this.lastPlayEnd >= this.context.currentTime
                ? this.lastPlayEnd + sampleDuration
                : this.context.currentTime + sampleDuration; // add a delay to start
        this.lastPlayEnd = startTime;

        // Create the buffer
        const buffer = this.context.createBuffer(1, sample.length, 44100);
        const bufferContent = buffer.getChannelData(0);
        bufferContent.set(sample);

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.onended = () => this.enqued--;

        source.connect(this.context.destination);
        source.start(startTime);
    }
}

export default Player;
