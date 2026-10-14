import { isEmptyHtml, LIMITS, sanitizeHtml } from "@usercue/shared";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { uploadImage } from "../lib/api";
import { usePosts } from "../lib/queries";
import { Bold, Hash, Heading, Highlight, ImageIcon, Italic, LinkIcon, Underline } from "./icons";
import { STATUS_DOT } from "./ui";

interface EditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  maxLength?: number;
  mentions?: boolean;
  headings?: boolean;
  excludeId?: number;
  autoFocus?: boolean;
}

function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readMention(root: HTMLElement | null) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
  const node = range.startContainer as Text;
  if (!root?.contains(node)) return null;
  const end = range.startOffset;
  const text = node.data.slice(0, end);
  const match = text.match(/(^|[\s\u00a0])#([^\s#]*)$/);
  if (!match) return null;
  const query = match[2] ?? "";
  return { node, start: end - query.length - 1, end, query };
}

export function Editor({
  value,
  onChange,
  placeholder = "Add more detail (optional)",
  maxLength = LIMITS.body,
  mentions = false,
  headings = false,
  excludeId,
  autoFocus = false,
}: EditorProps) {
  const root = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const saved = useRef<Range | null>(null);
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("https://");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mention, setMention] = useState<{ query: string; pinned?: boolean } | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (value === "" && el.innerHTML !== "") el.innerHTML = "";
  }, [value]);

  useEffect(() => {
    if (autoFocus) root.current?.focus();
  }, [autoFocus]);

  function emit() {
    const el = root.current;
    const html = sanitizeHtml(el?.innerHTML ?? "");
    el?.classList.toggle("is-empty", isEmptyHtml(el.innerHTML));
    if (html.length > maxLength) return;
    onChange(isEmptyHtml(html) ? "" : html);
  }

  function remember() {
    const sel = window.getSelection();
    saved.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  }

  function restore() {
    const range = saved.current;
    const sel = window.getSelection();
    if (!range || !sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function run(command: string, arg?: string) {
    root.current?.focus();
    exec(command, arg);
    emit();
  }

  function applyLink() {
    restore();
    root.current?.focus();
    const url = href.trim();
    if (url && url !== "https://") exec("createLink", url);
    setLinking(false);
    setHref("https://");
    emit();
  }

  function insertPostRef(id: number, title: string) {
    const found = readMention(root.current);
    root.current?.focus();
    if (found) {
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.setStart(found.node, found.start);
        range.setEnd(found.node, found.end);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      restore();
    }
    exec("insertHTML", `<a href="/post/${id}">${escapeHtml(title)}</a>\u00a0`);
    setMention(null);
    emit();
  }

  async function insertFile(next: File) {
    setError(null);
    setBusy(true);
    try {
      const url = await uploadImage(next);
      root.current?.focus();
      restore();
      exec("insertImage", url);
      emit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload image");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-0.5">
        {headings && (
          <Tool
            label="Heading"
            onClick={() => {
              root.current?.focus();
              const current = document.queryCommandValue("formatBlock").toLowerCase();
              exec("formatBlock", current === "h2" ? "div" : "h2");
              emit();
            }}
          >
            <Heading />
          </Tool>
        )}
        <Tool label="Bold" keys="⌘B" onClick={() => run("bold")}>
          <Bold />
        </Tool>
        <Tool label="Italic" keys="⌘I" onClick={() => run("italic")}>
          <Italic />
        </Tool>
        <Tool label="Underline" keys="⌘U" onClick={() => run("underline")}>
          <Underline />
        </Tool>
        <Tool
          label="Highlight"
          onClick={() => {
            exec("styleWithCSS", "true");
            root.current?.focus();
            exec("hiliteColor", "#ffe4f0");
            exec("backColor", "#ffe4f0");
            emit();
          }}
        >
          <Highlight />
        </Tool>
        <Tool
          label="Link"
          keys="⌘K"
          onClick={() => {
            remember();
            setMention(null);
            setLinking((open) => !open);
          }}
        >
          <LinkIcon />
        </Tool>
        {mentions && (
          <Tool
            label="Reference a suggestion"
            onClick={() => {
              remember();
              setLinking(false);
              setMention({ query: "", pinned: true });
            }}
          >
            <Hash />
          </Tool>
        )}
        <Tool label="Image" onClick={() => file.current?.click()} disabled={busy}>
          <ImageIcon />
        </Tool>
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const next = e.target.files?.[0];
            e.target.value = "";
            if (next) void insertFile(next);
          }}
        />
      </div>

      {linking && (
        <div className="flex items-center gap-2">
          <input
            className="input"
            placeholder="https://"
            value={href}
            autoFocus
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinking(false);
            }}
          />
          <button type="button" className="btn-quiet" onClick={applyLink}>
            Add
          </button>
        </div>
      )}

      {mention && (
        <SuggestionPicker
          query={mention.query}
          excludeId={excludeId}
          onPick={insertPostRef}
          onClose={() => setMention(null)}
        />
      )}

      <div
        ref={root}
        role="textbox"
        aria-multiline="true"
        aria-placeholder={placeholder}
        contentEditable
        data-placeholder={placeholder}
        className="rich editor is-empty min-h-16 outline-none"
        onInput={() => {
          if (mentions) {
            const found = readMention(root.current);
            setMention((open) => (found ? { query: found.query } : open?.pinned ? open : null));
          }
          emit();
        }}
        onPaste={(e) => {
          const image = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
          if (!image) return;
          e.preventDefault();
          remember();
          void insertFile(image);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && mention) {
            e.preventDefault();
            setMention(null);
            return;
          }
          const mod = e.metaKey || e.ctrlKey;
          if (!mod) return;
          const key = e.key.toLowerCase();
          if (key === "b") {
            e.preventDefault();
            run("bold");
          } else if (key === "i") {
            e.preventDefault();
            run("italic");
          } else if (key === "u") {
            e.preventDefault();
            run("underline");
          } else if (key === "k") {
            e.preventDefault();
            remember();
            setLinking(true);
          }
        }}
      />
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}

export function SuggestionPicker({
  query,
  excludeId,
  onPick,
  onClose,
}: {
  query: string;
  excludeId?: number;
  onPick: (id: number, title: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(query);
  useEffect(() => setQ(query), [query]);
  const { data: posts } = usePosts({ q: q.trim() || undefined, sort: "top" });
  const list = (posts ?? []).filter((post) => post.id !== excludeId).slice(0, 7);

  return (
    <div className="card overflow-hidden p-1.5">
      <input
        className="input h-8"
        placeholder="Search suggestions…"
        value={q}
        autoFocus={query === ""}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const first = list[0];
            if (first) onPick(first.id, first.title);
          }
        }}
      />
      <ul className="mt-1 max-h-56 overflow-y-auto">
        {list.length === 0 && (
          <li className="px-2.5 py-2 text-[12px] text-faint">No matching suggestions</li>
        )}
        {list.map((post) => (
          <li key={post.id}>
            <button
              type="button"
              className="flex w-full items-start gap-2 rounded-xl px-2.5 py-1.5 text-left hover:bg-hover"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(post.id, post.title)}
            >
              <span
                className={`mt-1.5 size-1.5 shrink-0 rounded-full ${STATUS_DOT[post.status]}`}
              />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{post.title}</span>
                <span className="block truncate text-[11px] text-faint">{post.authorName}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tool({
  label,
  keys,
  onClick,
  disabled,
  children,
}: {
  label: string;
  keys?: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={keys ? `${label} (${keys})` : label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="inline-flex size-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40"
    >
      {children}
    </button>
  );
}
