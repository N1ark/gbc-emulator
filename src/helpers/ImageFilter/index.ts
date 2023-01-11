import ImageFilterConcrete from "./Base";
import Identity from "./Identity";
import Scale2x from "./Scale2x";
import Scale4x from "./Scale4x";

export type ImageFilter = typeof ImageFilterConcrete;
export { Identity, Scale2x, Scale4x };
