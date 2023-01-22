export class GameBoyInputRead {
    constructor(
        public up: boolean,
        public down: boolean,
        public left: boolean,
        public right: boolean,

        public a: boolean,
        public b: boolean,
        public start: boolean,
        public select: boolean
    ) {}
}

export default class GameBoyInput {
    read(): GameBoyInputRead {
        return new GameBoyInputRead(false, false, false, false, false, false, false, false);
    }
}
