import Scale2x from "./Scale2x";

class Scale4x extends Scale2x {
    protected subFilter: Scale2x;

    constructor(width: number, height: number) {
        super(width * 2, height * 2);
        this.subFilter = new Scale2x(width, height);
    }

    override apply(image: Uint32Array): void {
        this.subFilter.apply(image);
        super.apply(this.subFilter.output);
    }
}

export default Scale4x;
