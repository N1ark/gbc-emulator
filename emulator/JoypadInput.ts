import {
    ARROW_DOWN,
    ARROW_LEFT,
    ARROW_RIGHT,
    ARROW_UP,
    BUTTON_A,
    BUTTON_B,
    BUTTON_SELECT,
    BUTTON_START,
} from "./constants";
import GameBoyInput from "./GameBoyInput";
import { Addressable } from "./Memory";

const READ_ARROWS_BIT = 1 << 4;
const READ_BUTTON_BIT = 1 << 5;
const CONTROL_BITS = READ_ARROWS_BIT & READ_BUTTON_BIT;

/**
 * The joypad input, that takes care of receiving inputs for the buttons and directional arrows.
 * @see https://gbdev.io/pandocs/Joypad_Input.html
 */
class JoypadInput implements Addressable {
    protected input: GameBoyInput;

    // bits 0-3 are state (button or arrow)
    // bit 4 is to read arrow data
    // bit 5 is to read button data
    protected register: number = 0;

    protected buttonData: number = 0;
    protected arrowsData: number = 0;

    protected currentlyReading: "buttons" | "arrows" = "buttons";

    constructor(input: GameBoyInput) {
        this.input = input;
    }

    readInput(): void {
        const data = this.input.read();
        this.buttonData =
            (data.a ? 0 : BUTTON_A) |
            (data.b ? 0 : BUTTON_B) |
            (data.start ? 0 : BUTTON_START) |
            (data.select ? 0 : BUTTON_SELECT);
        this.arrowsData =
            (data.up ? 0 : ARROW_UP) |
            (data.down ? 0 : ARROW_DOWN) |
            (data.left ? 0 : ARROW_LEFT) |
            (data.right ? 0 : ARROW_RIGHT);
    }

    read(): number {
        const data = this.currentlyReading === "buttons" ? this.buttonData : this.arrowsData;
        return (CONTROL_BITS & this.register) | (~CONTROL_BITS & data);
    }

    write(_: number, data: number): void {
        this.register = data;

        // the switch is done when the bit moves to a LOW state.
        if ((this.register & READ_ARROWS_BIT) === 0) this.currentlyReading = "arrows";
        if ((this.register & READ_BUTTON_BIT) === 0) this.currentlyReading = "buttons";
    }
}

export default JoypadInput;
