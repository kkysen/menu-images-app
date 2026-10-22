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

/** Lookups in progress or done since the app opened, so a dish is never looked up twice at once. */
const cache = new Map<string, Promise<DishInfo | undefined>>();

/** A finished lookup, saved on the phone so a dish seen before shows instantly, even offline. */
type SavedLookup = {
  info?: DishInfo;
  savedAt: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
/** How long to keep a found photo. */
const FOUND_TTL_MS = 90 * DAY_MS;
/** How long to keep a miss, after which it's retried, in case a different search now finds one. */
const MISSING_TTL_MS = 7 * DAY_MS;

function storageKey(key: string): string {
  return `dish:${key}`;
}

/** Gets a saved lookup, or `null` if there's none, it's expired, or storage is unavailable. */
function loadLookup(key: string): SavedLookup | null {
  try {
    const json = localStorage.getItem(storageKey(key));
    if (!json) {
      return null;
    }
    const saved = JSON.parse(json) as SavedLookup;
    const ttl = saved.info ? FOUND_TTL_MS : MISSING_TTL_MS;
    return Date.now() - saved.savedAt < ttl ? saved : null;
  } catch {
    return null;
  }
}

function saveLookup(key: string, info: DishInfo | undefined) {
  const saved: SavedLookup = info ? { info, savedAt: Date.now() } : { savedAt: Date.now() };
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(saved));
  } catch {
    // Storage is full or blocked (e.g. private browsing): the in-memory cache still works.
  }
}

/**
 * Finds a picture of `dish`, without needing an API key or a server.
 * It tries the dish's Wikipedia article first, which has a good photo and description
 * for well-known dishes, then a photo search on Wikimedia Commons,
 * then both again with words like "House" or "Grandma's" left out of the name.
 * Results are saved on the phone, since the same dishes come up again and again.
 */
export function lookUpDish(dish: string): Promise<DishInfo | undefined> {
  const key = dish.toLowerCase();
  let info = cache.get(key);
  if (!info) {
    const saved = loadLookup(key);
    if (saved) {
      info = Promise.resolve(saved.info);
    } else {
      info = findDish(dish);
      // Only finished lookups are saved: a network error is retried next time.
      info.then(
        (found) => saveLookup(key, found),
        () => cache.delete(key),
      );
    }
    cache.set(key, info);
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
