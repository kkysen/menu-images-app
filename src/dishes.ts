import type { TextLine } from "./ocr";

/** Common menu words that are section headers or boilerplate, not dishes. */
const NON_DISHES = new Set([
  "menu",
  "appetizers",
  "appetizer",
  "starters",
  "starter",
  "entrees",
  "entree",
  "mains",
  "main courses",
  "soups",
  "soup",
  "salads",
  "salad",
  "sides",
  "side dishes",
  "desserts",
  "dessert",
  "drinks",
  "beverages",
  "breakfast",
  "lunch",
  "dinner",
  "specials",
  "small plates",
  "large plates",
  "sandwiches",
  "pasta",
  "cocktails",
  "wine",
  "wines",
  "beer",
  "beers",
  "kids",
  "kids menu",
  "add",
  "add ons",
  "add-ons",
  "extras",
  "gluten free",
  "vegetarian",
  "vegan",
  "spicy",
]);

const PRICE = /[$€£¥]?\s*\d+(?:[.,]\d{1,2})?\s*[$€£¥]?/g;

/** Removes prices and leaders like `.....` from a menu line. */
function cleanLine(text: string): string {
  return text
    .replace(PRICE, " ")
    .replace(/[.·•_\-–—]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}]+|[^\p{L})]+$/gu, "")
    .trim();
}

/** Guesses whether a cleaned line is a dish name rather than a header, description, or note. */
function looksLikeDish(text: string): boolean {
  const words = text.split(" ");
  if (text.length < 3 || words.length > 7) {
    return false; // too short to mean anything, or long enough to be a description
  }
  if (NON_DISHES.has(text.toLowerCase())) {
    return false;
  }
  const letters = text.replace(/[^\p{L}]/gu, "");
  if (letters.length < text.replace(/\s/g, "").length * 0.6) {
    return false; // mostly digits or symbols
  }
  // Descriptions usually start lowercase or end with a sentence; names don't.
  return !/^\p{Ll}/u.test(text) && !/[.,;]$/.test(text);
}

export type Dish = {
  name: string;
  line: TextLine;
};

/** Picks out the lines of a menu that look like dish names. */
export function findDishes(lines: TextLine[]): Dish[] {
  const seen = new Set<string>();
  const dishes: Dish[] = [];
  for (const line of lines) {
    if (line.confidence < 0.7) {
      continue;
    }
    const name = cleanLine(line.text);
    const key = name.toLowerCase();
    if (!looksLikeDish(name) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    dishes.push({ name, line });
  }
  return dishes;
}
