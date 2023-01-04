/**
 * A non-gameboy related class, that handles playing the received sound data.
 * Largely inspired by:
 * @link https://github.com/denislins/gameboy/blob/master/emulator/apu/Player.js
 */
class Player {
    protected context: AudioContext | undefined;
    protected lastPlayEnd: number | undefined;

    protected windowBlurListener: () => void;
    protected windowFocusListener: () => void;

    constructor() {
        this.context = new AudioContext();
        this.windowBlurListener = () => {
            this.context?.close();
            this.context = undefined;
        };
        this.windowFocusListener = () => {
            this.context = new AudioContext();
            this.enqued = 0;
            this.lastPlayEnd = undefined;
            console.log("focused");
        };

        window.addEventListener("blur", this.windowBlurListener, false);
        window.addEventListener("focus", this.windowFocusListener, false);
    }

    delete() {
        this.context?.close();
        delete this.context;
        window.removeEventListener("blur", this.windowBlurListener, false);
        window.removeEventListener("focus", this.windowFocusListener, false);
    }

    enqued: number = 0;
    lastCheck = Date.now();

    enqueue(samples: Float32Array[]) {
        // Not allowed to have more than 8 samples in the queue, to avoid delay
        if (this.enqued > 8 || !this.context) {
            console.log(`skiped enque, ${this.enqued} / ${this.context}`);
            return;
        }

        this.enqued++;

        const startTime =
            this.lastPlayEnd && this.lastPlayEnd >= this.context.currentTime
                ? this.lastPlayEnd + samples[0].length / 44100
                : this.context.currentTime;
        this.lastPlayEnd = startTime;

        let index = 0;
        for (let data of samples) {
            // Create the buffer
            const buffer = this.context.createBuffer(1, data.length, 44100);
            const bufferContent = buffer.getChannelData(0);
            bufferContent.set(data);

            const source = this.context.createBufferSource();
            source.buffer = buffer;
            if (index++ === 0) {
                source.onended = () => this.enqued--;
            }
            source.connect(this.context.destination);
            source.start(startTime);
        }
    }
}

export default Player;
