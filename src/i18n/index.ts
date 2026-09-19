import { sv } from "./sv";
export type Locale = "sv" | "en" | "nb";
// Swedish launches first; additional dictionaries must satisfy the same shape.
export function dictionary(locale: Locale = "sv") {
  if (locale !== "sv") return sv;
  return sv;
}
