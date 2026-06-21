/** Quick reactions shown on message hover menus. */
export const QUICK_EMOJIS = ["👍", "❤️", "😂", "🔥", "👀", "🎉", "💯", "✨"];

export interface EmojiCategory {
  id: string;
  label: string;
  emojis: string[];
}

/** Curated emoji sets for the compose picker (no external emoji library). */
export const COMPOSE_EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    label: "Smileys",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😍", "🥰",
      "😘", "😎", "🤔", "😮", "😢", "😭", "😡", "🤯", "😴", "🥳",
    ],
  },
  {
    id: "gestures",
    label: "Gestures & hearts",
    emojis: [
      "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "✌️", "🤞", "👀", "💯", "🔥", "✨", "⭐",
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "💕", "💖",
    ],
  },
  {
    id: "animals",
    label: "Animals",
    emojis: ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🦁", "🐯", "🐸", "🐵", "🦄"],
  },
  {
    id: "food",
    label: "Food",
    emojis: ["🍎", "🍕", "🍔", "🍟", "🌮", "🍣", "🍩", "🍪", "🎂", "☕", "🍺", "🥤", "🍜", "🥗"],
  },
  {
    id: "objects",
    label: "Objects",
    emojis: ["🎮", "🎵", "🎧", "📱", "💻", "⌨️", "📷", "🎁", "🏆", "⚽", "🏀", "🎯", "💡", "📌"],
  },
];

/** Common `:shortcode:` → emoji mappings for compose autocomplete. */
export const EMOJI_SHORTCODES: Record<string, string> = {
  smile: "😊",
  grin: "😀",
  laugh: "😂",
  rofl: "🤣",
  wink: "😉",
  blush: "😊",
  heart: "❤️",
  hearts: "💕",
  broken_heart: "💔",
  fire: "🔥",
  star: "⭐",
  sparkles: "✨",
  hundred: "💯",
  eyes: "👀",
  thumbsup: "👍",
  thumbsdown: "👎",
  clap: "👏",
  pray: "🙏",
  muscle: "💪",
  wave: "👋",
  ok: "👌",
  thinking: "🤔",
  cry: "😢",
  sob: "😭",
  angry: "😡",
  mind_blown: "🤯",
  sleep: "😴",
  party: "🎉",
  tada: "🎉",
  dog: "🐶",
  cat: "🐱",
  bear: "🐻",
  fox: "🦊",
  lion: "🦁",
  unicorn: "🦄",
  pizza: "🍕",
  burger: "🍔",
  taco: "🌮",
  coffee: "☕",
  beer: "🍺",
  cake: "🎂",
  cookie: "🍪",
  game: "🎮",
  music: "🎵",
  phone: "📱",
  computer: "💻",
  camera: "📷",
  gift: "🎁",
  trophy: "🏆",
  soccer: "⚽",
  basketball: "🏀",
  bulb: "💡",
  pin: "📌",
};

export interface EmojiShortcodeMatch {
  code: string;
  emoji: string;
}

/** Find shortcodes matching a partial query (without colons). */
export function searchEmojiShortcodes(query: string, limit = 8): EmojiShortcodeMatch[] {
  const normalized = query.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!normalized) return [];

  const matches: EmojiShortcodeMatch[] = [];
  for (const [code, emoji] of Object.entries(EMOJI_SHORTCODES)) {
    if (code.startsWith(normalized) || code.includes(normalized)) {
      matches.push({ code, emoji });
    }
  }
  return matches
    .sort((a, b) => {
      const aStarts = a.code.startsWith(normalized) ? 0 : 1;
      const bStarts = b.code.startsWith(normalized) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.code.localeCompare(b.code);
    })
    .slice(0, limit);
}

/** If the cursor sits inside an unfinished `:shortcode`, return the match context. */
export function getActiveShortcodeQuery(
  text: string,
  cursor: number
): { query: string; start: number; end: number } | null {
  const before = text.slice(0, cursor);
  const match = /(^|\s):([a-zA-Z0-9_]*)$/.exec(before);
  if (!match) return null;
  const query = match[2];
  const start = cursor - query.length - 1;
  return { query, start, end: cursor };
}
