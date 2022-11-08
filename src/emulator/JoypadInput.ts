import Addressable from "./Addressable";
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
import GameInput from "./GameInput";

const READ_ARROWS_BIT = 1 << 4;
const READ_BUTTON_BIT = 1 << 5;
const CONTROL_BITS = READ_ARROWS_BIT & READ_BUTTON_BIT;

/**
 * The joypad input, that takes care of receiving inputs for the buttons and directional arrows.
 * @see https://gbdev.io/pandocs/Joypad_Input.html
 */
class JoypadInput implements Addressable {
    protected input: GameInput;

    // bits 0-3 are state (button or arrow)
    // bit 4 is to read arrow data
    // bit 5 is to read button data
    protected register: number = 0;

    protected buttonData: number = 0;
    protected arrowsData: number = 0;

    protected currentlyReading: "buttons" | "arrows" = "buttons";

    constructor(input: GameInput) {
        this.input = input;
    }

    readInput(): void {
        const data = this.input.read();
        this.buttonData =
            (data.a ? BUTTON_A : 0) |
            (data.b ? BUTTON_B : 0) |
            (data.start ? BUTTON_START : 0) |
            (data.select ? BUTTON_SELECT : 0);
        this.arrowsData =
            (data.up ? ARROW_UP : 0) |
            (data.down ? ARROW_DOWN : 0) |
            (data.left ? ARROW_LEFT : 0) |
            (data.right ? ARROW_RIGHT : 0);
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
