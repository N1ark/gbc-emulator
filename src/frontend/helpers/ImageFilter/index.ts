import ImageFilterConcrete from "./Base";
import Identity from "./Identity";
import Scale2x from "./Scale2x";
import Scale4x from "./Scale4x";

export type ImageFilter = typeof ImageFilterConcrete;
export const filterByName = (name: string): ImageFilter | undefined =>
    [Identity, Scale2x, Scale4x].find((f) => f.name === name);
export { Identity, Scale2x, Scale4x };
