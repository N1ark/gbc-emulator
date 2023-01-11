class ImageFilter {
    protected readonly width: number;
    protected readonly height: number;

    readonly output: Uint32Array;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;

        const outSize = this.outputSize;
        this.output = new Uint32Array(outSize[0] * outSize[1]);
    }

    get outputSize(): [number, number] {
        throw new Error("Not implemented");
    }

    apply(image: Uint32Array): void {
        throw new Error("Not implemented");
    }
}

export default ImageFilter;
