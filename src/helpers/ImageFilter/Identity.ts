import ImageFilter from "./Base";

/**
 * An identity filter that doesn't alted the image.
 */
class Identity extends ImageFilter {
    override get outputSize(): [number, number] {
        return [this.width, this.height];
    }
    override apply(image: Uint32Array): void {
        this.output.set(image);
    }
}

export default Identity;
