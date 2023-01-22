import GameBoyInput from "./GameBoyInput";
import { Addressable } from "./Memory";
import { SubRegister } from "./Register";

const READ_ARROWS_BIT: u8 = 1 << 4;
const READ_BUTTON_BIT: u8 = 1 << 5;
const CONTROL_BITS: u8 = READ_ARROWS_BIT & READ_BUTTON_BIT;

// Inputs
const BUTTON_A: u8 = 1 << 0;
const BUTTON_B: u8 = 1 << 1;
const BUTTON_SELECT: u8 = 1 << 2;
const BUTTON_START: u8 = 1 << 3;
const ARROW_RIGHT: u8 = 1 << 0;
const ARROW_LEFT: u8 = 1 << 1;
const ARROW_UP: u8 = 1 << 2;
const ARROW_DOWN: u8 = 1 << 3;

enum JoypadMode {
    BUTTONS,
    ARROWS,
}

/**
 * The joypad input, that takes care of receiving inputs for the buttons and directional arrows.
 * @see https://gbdev.io/pandocs/Joypad_Input.html
 */
class JoypadInput implements Addressable {
    protected input: GameBoyInput;

    // bits 0-3 are state (button or arrow)
    // bit 4 is to read arrow data
    // bit 5 is to read button data
    protected register: SubRegister = new SubRegister();

    protected buttonData: u8 = 0;
    protected arrowsData: u8 = 0;

    protected currentlyReading: JoypadMode = JoypadMode.BUTTONS;

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

    read(): u8 {
        const data: u8 =
            this.currentlyReading === JoypadMode.BUTTONS ? this.buttonData : this.arrowsData;
        return (CONTROL_BITS & this.register.get()) | data;
    }

    write(_: u16, data: u8): void {
        this.register.set(data);

        // the switch is done when the bit moves to a LOW state.
        if ((data & READ_ARROWS_BIT) === 0) this.currentlyReading = JoypadMode.ARROWS;
        if ((data & READ_BUTTON_BIT) === 0) this.currentlyReading = JoypadMode.BUTTONS;
    }
}

export default JoypadInput;
