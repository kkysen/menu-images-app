/** A picture and short description for a dish. */
export type DishInfo = {
  title: string;
  imageUrl: string;
  summary: string;
  pageUrl: string;
};

type WikipediaPage = {
  title: string;
  index: number;
  thumbnail?: { source: string };
  extract?: string;
};

type CommonsPage = {
  title: string;
  index: number;
  imageinfo?: { thumburl?: string; descriptionurl: string }[];
};

/** Words restaurants add to a dish's name that don't say what the dish is. */
const FILLER_WORDS = new Set([
  "house",
  "special",
  "signature",
  "homemade",
  "home",
  "made",
  "famous",
  "classic",
  "original",
  "traditional",
  "fresh",
  "our",
  "the",
  "chef's",
  "chefs",
  "grandma's",
  "grandmas",
  "mom's",
  "moms",
  "nonna's",
  "sunday",
  "daily",
  "style",
]);

const cache = new Map<string, Promise<DishInfo | undefined>>();

/**
 * Finds a picture of `dish`, without needing an API key or a server.
 * It tries the dish's Wikipedia article first, which has a good photo and description
 * for well-known dishes, then a photo search on Wikimedia Commons,
 * then both again with words like "House" or "Grandma's" left out of the name.
 */
export function lookUpDish(dish: string): Promise<DishInfo | undefined> {
  const key = dish.toLowerCase();
  let info = cache.get(key);
  if (!info) {
    info = findDish(dish);
    cache.set(key, info);
    info.catch(() => cache.delete(key));
  }
  return info;
}

async function findDish(dish: string): Promise<DishInfo | undefined> {
  for (const name of new Set([dish, withoutFillerWords(dish)])) {
    if (!name) {
      continue;
    }
    const info = (await searchWikipedia(name)) ?? (await searchCommons(name));
    if (info) {
      return info;
    }
  }
  return undefined;
}

function withoutFillerWords(dish: string): string {
  return dish
    .split(" ")
    .filter((word) => !FILLER_WORDS.has(word.toLowerCase()))
    .join(" ");
}

async function queryApi<T>(host: string, params: Record<string, string>): Promise<T[]> {
  const search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    generator: "search",
    gsrlimit: "5",
    ...params,
  });
  const response = await fetch(`https://${host}/w/api.php?${search}`);
  if (!response.ok) {
    throw new Error(`${host} lookup failed: ${response.status}`);
  }
  const json = (await response.json()) as { query?: { pages: (T & { index: number })[] } };
  return (json.query?.pages ?? []).sort((a, b) => a.index - b.index);
}

async function searchWikipedia(name: string): Promise<DishInfo | undefined> {
  const pages = await queryApi<WikipediaPage>("en.wikipedia.org", {
    gsrsearch: `${name} food`,
    prop: "pageimages|extracts",
    piprop: "thumbnail",
    pithumbsize: "400",
    exintro: "1",
    explaintext: "1",
    exsentences: "2",
  });
  // Only the top results: further down, the article is rarely about the dish.
  const page = pages.slice(0, 2).find((page) => page.thumbnail);
  if (!page?.thumbnail) {
    return undefined;
  }
  return {
    title: page.title,
    imageUrl: page.thumbnail.source,
    summary: page.extract ?? "",
    pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`,
  };
}

async function searchCommons(name: string): Promise<DishInfo | undefined> {
  const pages = await queryApi<CommonsPage>("commons.wikimedia.org", {
    gsrsearch: `${name} food filetype:bitmap`,
    gsrnamespace: "6", // files
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: "400",
  });
  for (const page of pages) {
    const image = page.imageinfo?.[0];
    if (image?.thumburl) {
      return {
        title: name,
        imageUrl: image.thumburl,
        summary: `Photo from Wikimedia Commons: ${page.title.replace(/^File:|\.\w+$/g, "")}`,
        pageUrl: image.descriptionurl,
      };
    }
  }
  return undefined;
}
