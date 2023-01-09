import ImageFilter from "./Base";

/**
 * Filter that uses the Scale2x algorithm
 * @link https://www.scale2x.it/algorithm
 */
class Scale2x extends ImageFilter {
    override get outputSize(): [number, number] {
        return [this.width * 2, this.height * 2];
    }

    read(image: Uint32Array, x: number, y: number, or: number): number {
        return 0 <= x && x < this.width && 0 <= y && y <= this.height
            ? image[x + y * this.width]
            : or;
    }

    override apply(image: Uint32Array): void {
        for (let x = 0; x < this.width; x++) {
            for (let y = 0; y < this.height; y++) {
                const value = image[x + y * this.width];
                const n = this.read(image, x, y - 1, value);
                const s = this.read(image, x, y + 1, value);
                const w = this.read(image, x - 1, y, value);
                const e = this.read(image, x + 1, y, value);
                if (n !== s && w !== e) {
                    this.output[x * 2 + y * 2 * this.width * 2] = w === n ? w : value;
                    this.output[x * 2 + 1 + y * 2 * this.width * 2] = n === e ? e : value;
                    this.output[x * 2 + (y * 2 + 1) * this.width * 2] = w === s ? w : value;
                    this.output[x * 2 + 1 + (y * 2 + 1) * this.width * 2] = s === e ? e : value;
                } else {
                    this.output[x * 2 + y * 2 * this.width * 2] = value;
                    this.output[x * 2 + 1 + y * 2 * this.width * 2] = value;
                    this.output[x * 2 + (y * 2 + 1) * this.width * 2] = value;
                    this.output[x * 2 + 1 + (y * 2 + 1) * this.width * 2] = value;
                }
            }
        }
    }
}

export default Scale2x;
