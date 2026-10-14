const VOID = new Set(["br", "img"]);
const SKIP = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "svg"]);
const ALLOWED = new Set([
  "p",
  "br",
  "div",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "mark",
  "a",
  "img",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
]);

const ATTR = /([a-zA-Z_:][a-zA-Z0-9:._-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function isEmptyHtml(html: string): boolean {
  if (/<img\b/i.test(html)) return false;
  return stripHtml(html).length === 0;
}

export function isPostHref(value: string): boolean {
  return /^\/(?:p|post)\/\d+$/.test(value.trim());
}

function safeHref(value: string): string | null {
  const v = value.trim();
  if (isPostHref(v)) return v;
  try {
    const url = new URL(v);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

function safeSrc(value: string): string | null {
  const v = value.trim();
  if (/^\/(?:api\/)?uploads\/[A-Za-z0-9._-]+$/.test(v)) return v;
  try {
    const url = new URL(v);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    return null;
  }
  return null;
}

function highlightSpan(attrs: string): boolean {
  return /background(?:-color)?\s*:/i.test(attrs);
}

function attrsFor(tag: string, raw: string): string {
  if (tag !== "a" && tag !== "img") return "";
  let out = "";
  ATTR.lastIndex = 0;
  for (const match of raw.matchAll(ATTR)) {
    const name = (match[1] ?? "").toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!name) continue;
    if (tag === "a" && name === "href") {
      const href = safeHref(value);
      if (href && isPostHref(href)) out += ` href="${href}"`;
      else if (href) out += ` href="${href}" target="_blank" rel="nofollow noopener noreferrer"`;
    }
    if (tag === "img" && name === "src") {
      const src = safeSrc(value);
      if (src) out += ` src="${src}"`;
    }
    if (tag === "img" && name === "alt") {
      out += ` alt="${value.replace(/"/g, "&quot;").slice(0, 200)}"`;
    }
  }
  return out;
}

function hasSrc(raw: string): boolean {
  ATTR.lastIndex = 0;
  for (const match of raw.matchAll(ATTR)) {
    if (
      (match[1] ?? "").toLowerCase() === "src" &&
      safeSrc(match[2] ?? match[3] ?? match[4] ?? "")
    ) {
      return true;
    }
  }
  return false;
}

export function sanitizeHtml(input: string): string {
  if (!input) return "";
  let out = "";
  let i = 0;
  const stack: string[] = [];

  while (i < input.length) {
    if (input.charAt(i) !== "<") {
      const next = input.indexOf("<", i);
      out += next === -1 ? input.slice(i) : input.slice(i, next);
      i = next === -1 ? input.length : next;
      continue;
    }
    if (input.startsWith("<!--", i)) {
      const end = input.indexOf("-->", i + 4);
      i = end === -1 ? input.length : end + 3;
      continue;
    }
    const close = input.indexOf(">", i + 1);
    if (close === -1) break;
    const raw = input.slice(i + 1, close);
    i = close + 1;

    const closing = raw.startsWith("/");
    const body = raw.replace(/^\//, "").replace(/\/$/, "").trim();
    const match = /^([a-zA-Z][a-zA-Z0-9]*)/.exec(body);
    const tagName = match?.[1];
    if (!tagName) continue;
    const name = tagName.toLowerCase();
    const attrStr = body.slice(match[0].length);

    if (SKIP.has(name)) {
      if (!closing) {
        const endTag = `</${name}>`;
        const end = input.toLowerCase().indexOf(endTag, i);
        i = end === -1 ? input.length : end + endTag.length;
      }
      continue;
    }

    if (closing) {
      const idx = stack.lastIndexOf(name === "span" ? "mark" : name);
      if (idx === -1) continue;
      while (stack.length > idx) out += `</${stack.pop()}>`;
      continue;
    }

    let tag = name;
    if (name === "span") {
      if (!highlightSpan(attrStr)) continue;
      tag = "mark";
    } else if (!ALLOWED.has(name)) {
      continue;
    }

    if (tag === "img" && !hasSrc(attrStr)) continue;

    const attrs = attrsFor(tag, attrStr);
    if (tag === "img" && !attrs.includes("src=")) continue;
    if (tag === "a" && !attrs.includes("href=")) continue;

    if (VOID.has(tag)) {
      out += `<${tag}${attrs}>`;
      continue;
    }
    stack.push(tag);
    out += `<${tag}${attrs}>`;
  }

  while (stack.length) out += `</${stack.pop()}>`;
  return out.trim();
}
