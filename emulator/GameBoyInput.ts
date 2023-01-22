export class GameBoyInputRead {
    constructor(
        up: boolean,
        down: boolean,
        left: boolean,
        right: boolean,

        a: boolean,
        b: boolean,
        start: boolean,
        select: boolean
    ) {}
}

export default class GameBoyInput {
    read(): GameBoyInputRead {
        return new GameBoyInputRead(false, false, false, false, false, false, false, false);
    }
}
