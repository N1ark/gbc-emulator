import ImageFilter from "./Base";

/**
 * Filter that uses the Scale2x algorithm
 * @link https://www.scale2x.it/algorithm
 */
class Scale2x extends ImageFilter {
    override get outputSize(): [number, number] {
        return [this.width * 2, this.height * 2];
    }

    override apply(image: Uint32Array): void {
        for (let y = 0; y < this.height; y++) {
            let value = image[y * this.width];
            let w = value;
            let e = image[y * this.width + 1];
            for (let x = 0; x < this.width; x++) {
                const n = y - 1 < 0 ? value : image[x + (y - 1) * this.width];
                const s = y + 1 >= this.height ? value : image[x + (y + 1) * this.width];
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

                w = value;
                value = e;
                e = x + 2 >= this.width ? value : image[x + 2 + y * this.width];
            }
        }
    }
}

export default Scale2x;
