interface Addressable {
    read(pos: number): number;
    write(pos: number, data: number): void;
}

export default Addressable;
