/**
 * A non-gameboy related class, that handles playing the received sound data.
 * Largely inspired by:
 * @link https://github.com/denislins/gameboy/blob/master/emulator/apu/Player.js
 */
class Player {
    protected context: AudioContext;
    protected lastPlayEnd: number | undefined;

    constructor() {
        this.context = new AudioContext();
    }

    delete() {
        this.context.close();
    }

    enqued: number = 0;
    lastCheck = Date.now();

    enqueue(samples: Float32Array[]) {
        // Not allowed to have more than 8 samples in the queue, to avoid delay
        if (this.enqued > 8) return;

        this.enqued++;

        const startTime =
            this.lastPlayEnd && this.lastPlayEnd >= this.context.currentTime
                ? this.lastPlayEnd + samples[0].length / 44100
                : this.context.currentTime;
        this.lastPlayEnd = startTime;

        samples.forEach((data, i) => {
            // Create the buffer
            const buffer = this.context.createBuffer(1, data.length, 44100);
            const bufferContent = buffer.getChannelData(0);
            bufferContent.set(data);

            const source = this.context.createBufferSource();
            source.buffer = buffer;
            if (i === 0) {
                source.onended = () => this.enqued--;
            }
            source.connect(this.context.destination);
            source.start(startTime);
        });
    }
}

export default Player;
