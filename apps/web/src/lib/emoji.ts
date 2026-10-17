import type { Gemoji } from "gemoji";

export interface EmojiMatch {
  emoji: string;
  name: string;
}

let list: Gemoji[] | null = null;
let byName: Map<string, string> | null = null;
let loading: Promise<void> | null = null;

// The shortcode table is large, so it stays out of the main bundle until an editor needs it.
export function loadEmoji() {
  loading ??= import("gemoji").then(({ gemoji }) => {
    list = gemoji;
    byName = new Map(gemoji.flatMap((item) => item.names.map((name) => [name, item.emoji])));
  });
  return loading;
}

export function emojiFor(name: string) {
  return byName?.get(name.toLowerCase()) ?? null;
}

export function searchEmoji(query: string, limit = 6): EmojiMatch[] {
  if (!list) return [];
  const q = query.toLowerCase();
  const ranked: [number, EmojiMatch][] = [];
  for (const item of list) {
    const prefix = item.names.find((name) => name.startsWith(q));
    const inside = prefix ?? item.names.find((name) => name.includes(q));
    const name = inside ?? (item.tags.some((tag) => tag.startsWith(q)) ? item.names[0] : undefined);
    if (!name) continue;
    const rank = name === q ? 0 : prefix ? 1 : inside ? 2 : 3;
    ranked.push([rank, { emoji: item.emoji, name }]);
  }
  return ranked
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, match]) => match);
}
