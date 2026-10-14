import { vValidator } from "@hono/valibot-validator";
import {
  CHANGELOG_REACTION_IDS,
  type ChangelogReaction,
  isEmptyHtml,
  LIMITS,
  sanitizeHtml,
} from "@usercue/shared";
import { Hono } from "hono";
import * as v from "valibot";
import { db } from "../db";
import { type AppEnv, rateLimit, requireTeam, requireUser } from "../middleware";
import { publicOrigin } from "../oauth";
import { hasPermission, parsePermissions } from "../roles";
import { changelogFlags } from "../workspace";

const idParam = v.object({
  id: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
});

const commentParam = v.object({
  id: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
  commentId: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
});

const postId = v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1)));

const entryBody = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(LIMITS.title)),
  body: v.optional(v.pipe(v.string(), v.maxLength(LIMITS.body)), ""),
  postId: v.optional(postId),
});

const entryPatch = v.object({
  title: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(LIMITS.title))),
  body: v.optional(v.pipe(v.string(), v.maxLength(LIMITS.body))),
  postId: v.optional(postId),
});

const commentBody = v.object({
  body: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(LIMITS.comment)),
});

const reactionBody = v.object({
  reaction: v.picklist(CHANGELOG_REACTION_IDS),
});

interface EntryRow {
  id: number;
  title: string;
  body: string;
  author_id: number | null;
  author_name: string;
  author_avatar: string | null;
  author_role_name: string | null;
  author_role_icon: string | null;
  author_role_perms: string | null;
  comment_count: number;
  post_id: number | null;
  linked_title: string | null;
  created_at: number;
  updated_at: number;
}

interface CommentRow {
  id: number;
  entry_id: number;
  author_id: number | null;
  author_name: string;
  body: string;
  is_team: number;
  created_at: number;
  author_avatar: string | null;
  author_role_name: string | null;
  author_role_icon: string | null;
  author_role_perms: string | null;
}

interface ReactionRow {
  entry_id: number;
  reaction: string;
  user_id: number;
}

const ENTRY_SELECT = `
  SELECT e.id, e.title, e.body, e.author_id, e.author_name, e.post_id, e.created_at, e.updated_at,
         u.avatar_url AS author_avatar,
         r.name AS author_role_name,
         r.icon_url AS author_role_icon,
         r.permissions AS author_role_perms,
         lp.title AS linked_title,
         (SELECT COUNT(*)::int FROM changelog_comments c WHERE c.entry_id = e.id) AS comment_count
  FROM changelog_entries e
  LEFT JOIN users u ON u.id = e.author_id
  LEFT JOIN roles r ON r.id = u.role_id
  LEFT JOIN posts lp ON lp.id = e.post_id
`;

const listEntries = db.query<EntryRow>(`${ENTRY_SELECT} ORDER BY e.created_at DESC, e.id DESC`);
const findEntry = db.query<EntryRow>(`${ENTRY_SELECT} WHERE e.id = ?`);
const insertEntry = db.query<{ id: number }>(
  `INSERT INTO changelog_entries (title, body, author_id, author_name, post_id)
   VALUES (?, ?, ?, ?, ?) RETURNING id`,
);
const updateEntry = db.query(
  `UPDATE changelog_entries
   SET title = ?, body = ?, post_id = ?, updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
   WHERE id = ?`,
);
const findFeedback = db.query<{ id: number }>("SELECT id FROM posts WHERE id = ?");
const deleteEntry = db.query("DELETE FROM changelog_entries WHERE id = ?");

const listComments = db.query<CommentRow>(
  `SELECT c.id, c.entry_id, c.author_id, c.author_name, c.body, c.is_team, c.created_at,
          u.avatar_url AS author_avatar,
          r.name AS author_role_name,
          r.icon_url AS author_role_icon,
          r.permissions AS author_role_perms
   FROM changelog_comments c
   LEFT JOIN users u ON u.id = c.author_id
   LEFT JOIN roles r ON r.id = u.role_id
   WHERE c.entry_id = ?
   ORDER BY c.created_at, c.id`,
);
const findComment = db.query<CommentRow>(
  `SELECT c.id, c.entry_id, c.author_id, c.author_name, c.body, c.is_team, c.created_at,
          u.avatar_url AS author_avatar,
          r.name AS author_role_name,
          r.icon_url AS author_role_icon,
          r.permissions AS author_role_perms
   FROM changelog_comments c
   LEFT JOIN users u ON u.id = c.author_id
   LEFT JOIN roles r ON r.id = u.role_id
   WHERE c.id = ? AND c.entry_id = ?`,
);
const insertComment = db.query<{ id: number }>(
  `INSERT INTO changelog_comments (entry_id, author_id, author_name, body, is_team)
   VALUES (?, ?, ?, ?, ?) RETURNING id`,
);
const deleteComment = db.query("DELETE FROM changelog_comments WHERE id = ? AND entry_id = ?");

const listReactions = db.query<ReactionRow>(
  "SELECT entry_id, reaction, user_id FROM changelog_reactions",
);
const reactionsFor = db.query<ReactionRow>(
  "SELECT entry_id, reaction, user_id FROM changelog_reactions WHERE entry_id = ?",
);
const removeReaction = db.query<{ entry_id: number }>(
  `DELETE FROM changelog_reactions
   WHERE entry_id = ? AND user_id = ? AND reaction = ?
   RETURNING entry_id`,
);
const addReaction = db.query(
  `INSERT INTO changelog_reactions (entry_id, user_id, reaction)
   VALUES (?, ?, ?)
   ON CONFLICT (entry_id, user_id, reaction) DO NOTHING`,
);

function roleBadge(name: string | null, icon: string | null, permissions: string | null) {
  if (!name || !hasPermission(parsePermissions(permissions), "dashboard")) return null;
  return { name, iconUrl: icon || null };
}

function cleanBody(html: string) {
  const clean = sanitizeHtml(html);
  return isEmptyHtml(clean) ? "" : clean;
}

function packReactions(rows: ReactionRow[], userId: number | null, enabled: boolean) {
  if (!enabled) return [];
  const known = new Set<string>(CHANGELOG_REACTION_IDS);
  const counts = new Map<string, { count: number; mine: boolean }>();
  for (const row of rows) {
    if (!known.has(row.reaction)) continue;
    const current = counts.get(row.reaction) ?? { count: 0, mine: false };
    current.count += 1;
    if (userId !== null && row.user_id === userId) current.mine = true;
    counts.set(row.reaction, current);
  }
  return CHANGELOG_REACTION_IDS.flatMap((id) => {
    const row = counts.get(id);
    if (!row) return [];
    return [{ id, count: row.count, mine: row.mine }];
  });
}

function serializeEntry(
  row: EntryRow,
  reactions: { id: ChangelogReaction; count: number; mine: boolean }[],
  commentsOn: boolean,
) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    authorName: row.author_name,
    authorAvatar: row.author_avatar || null,
    authorRole: roleBadge(row.author_role_name, row.author_role_icon, row.author_role_perms),
    commentCount: commentsOn ? row.comment_count : 0,
    reactions,
    linkedPost:
      row.post_id && row.linked_title ? { id: row.post_id, title: row.linked_title } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function linkedPostId(postId: number | null | undefined) {
  if (postId == null) return null;
  if (!(await findFeedback.get(postId))) return undefined;
  return postId;
}

function serializeComment(row: CommentRow, viewer: { id: number; staff: boolean } | null) {
  const canDelete = Boolean(viewer && (viewer.staff || viewer.id === row.author_id));
  return {
    id: row.id,
    authorName: row.author_name,
    authorAvatar: row.author_avatar || null,
    authorRole: roleBadge(row.author_role_name, row.author_role_icon, row.author_role_perms),
    body: row.body,
    isTeam: row.is_team === 1,
    createdAt: row.created_at,
    canDelete,
  };
}

function rssUrl(origin: string) {
  return `${origin}/api/changelog/rss`;
}

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cdata(value: string) {
  return `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function feedXml(origin: string, entries: EntryRow[]) {
  const items = entries
    .slice(0, 50)
    .map((entry) => {
      const link = `${origin}/changelog/${entry.id}`;
      const when = new Date(entry.created_at * 1000).toUTCString();
      return [
        "<item>",
        `<title>${xmlEscape(entry.title)}</title>`,
        `<link>${xmlEscape(link)}</link>`,
        `<guid isPermaLink="true">${xmlEscape(link)}</guid>`,
        `<pubDate>${when}</pubDate>`,
        `<dc:creator>${xmlEscape(entry.author_name)}</dc:creator>`,
        `<description>${cdata(entry.body || entry.title)}</description>`,
        "</item>",
      ].join("");
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
<title>Changelog</title>
<link>${xmlEscape(`${origin}/changelog`)}</link>
<description>Product updates</description>
<atom:link href="${xmlEscape(rssUrl(origin))}" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>`;
}

async function loadEntry(
  id: number,
  userId: number | null,
  reactionsOn: boolean,
  commentsOn: boolean,
) {
  const row = await findEntry.get(id);
  if (!row) return undefined;
  const reactions = packReactions(await reactionsFor.all(id), userId, reactionsOn);
  return serializeEntry(row, reactions, commentsOn);
}

export const changelog = new Hono<AppEnv>()
  .get("/rss", async (c) => {
    const flags = await changelogFlags();
    if (!flags.enabled) return c.text("Not found", 404);
    const origin = publicOrigin(c);
    const xml = feedXml(origin, await listEntries.all());
    return c.body(xml, 200, {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=120",
    });
  })

  .get("/", async (c) => {
    const flags = await changelogFlags();
    const user = c.get("user");
    const staff = Boolean(user?.staff);
    const origin = publicOrigin(c);
    const meta = {
      enabled: flags.enabled,
      commentsEnabled: flags.comments,
      reactionsEnabled: flags.reactions,
      rssUrl: staff && flags.enabled ? rssUrl(origin) : null,
    };
    if (!flags.enabled && !staff) {
      return c.json({
        enabled: false,
        commentsEnabled: false,
        reactionsEnabled: false,
        rssUrl: null,
        entries: [],
      });
    }

    const rows = await listEntries.all();
    const reactions = flags.reactions ? await listReactions.all() : [];
    const byEntry = new Map<number, ReactionRow[]>();
    for (const row of reactions) {
      const list = byEntry.get(row.entry_id) ?? [];
      list.push(row);
      byEntry.set(row.entry_id, list);
    }
    return c.json({
      ...meta,
      entries: rows.map((row) =>
        serializeEntry(
          row,
          packReactions(byEntry.get(row.id) ?? [], user?.id ?? null, flags.reactions),
          flags.comments,
        ),
      ),
    });
  })

  .post("/", requireTeam, rateLimit(20, 60), vValidator("json", entryBody), async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    const { title, body, postId } = c.req.valid("json");
    const linked = await linkedPostId(postId);
    if (linked === undefined) return c.json({ error: "That suggestion was not found." }, 400);
    const created = await insertEntry.get(title, cleanBody(body), user.id, user.name, linked);
    if (!created) return c.json({ error: "Could not publish that update." }, 500);
    const flags = await changelogFlags();
    const entry = await loadEntry(created.id, user.id, flags.reactions, flags.comments);
    if (!entry) return c.json({ error: "Could not publish that update." }, 500);
    return c.json(entry, 201);
  })

  .get("/:id", vValidator("param", idParam), async (c) => {
    const flags = await changelogFlags();
    const user = c.get("user");
    const staff = Boolean(user?.staff);
    if (!flags.enabled && !staff) return c.json({ error: "Not found" }, 404);
    const { id } = c.req.valid("param");
    const entry = await loadEntry(id, user?.id ?? null, flags.reactions, flags.comments);
    if (!entry) return c.json({ error: "Not found" }, 404);
    const comments = flags.comments
      ? (await listComments.all(id)).map((row) =>
          serializeComment(row, user ? { id: user.id, staff } : null),
        )
      : [];
    return c.json({
      enabled: flags.enabled,
      commentsEnabled: flags.comments,
      reactionsEnabled: flags.reactions,
      rssUrl: staff && flags.enabled ? rssUrl(publicOrigin(c)) : null,
      ...entry,
      comments,
    });
  })

  .patch(
    "/:id",
    requireTeam,
    vValidator("param", idParam),
    vValidator("json", entryPatch),
    async (c) => {
      const { id } = c.req.valid("param");
      const current = await findEntry.get(id);
      if (!current) return c.json({ error: "Not found" }, 404);
      const patch = c.req.valid("json");
      if (patch.title === undefined && patch.body === undefined && patch.postId === undefined) {
        return c.json({ error: "Nothing to update." }, 400);
      }
      const linked =
        patch.postId === undefined ? current.post_id : await linkedPostId(patch.postId);
      if (linked === undefined) return c.json({ error: "That suggestion was not found." }, 400);
      const title = patch.title ?? current.title;
      const body = patch.body === undefined ? current.body : cleanBody(patch.body);
      await updateEntry.run(title, body, linked, id);
      const flags = await changelogFlags();
      const entry = await loadEntry(id, c.get("user")?.id ?? null, flags.reactions, flags.comments);
      if (!entry) return c.json({ error: "Not found" }, 404);
      return c.json(entry);
    },
  )

  .delete("/:id", requireTeam, vValidator("param", idParam), async (c) => {
    const { id } = c.req.valid("param");
    if (!(await findEntry.get(id))) return c.json({ error: "Not found" }, 404);
    await deleteEntry.run(id);
    return c.json({ ok: true });
  })

  .post(
    "/:id/comments",
    requireUser,
    rateLimit(20, 60),
    vValidator("param", idParam),
    vValidator("json", commentBody),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      if (user.suspended) return c.json({ error: "Your account has been suspended." }, 403);
      const flags = await changelogFlags();
      if (!flags.enabled && !user.staff) return c.json({ error: "Not found" }, 404);
      if (!flags.comments) return c.json({ error: "Comments are turned off." }, 403);
      const { id } = c.req.valid("param");
      if (!(await findEntry.get(id))) return c.json({ error: "Not found" }, 404);
      const clean = cleanBody(c.req.valid("json").body);
      if (!clean) return c.json({ error: "Comment cannot be empty" }, 400);
      const created = await insertComment.get(id, user.id, user.name, clean, user.staff ? 1 : 0);
      if (!created) return c.json({ error: "Could not post that comment." }, 500);
      const row = await findComment.get(created.id, id);
      if (!row) return c.json({ error: "Could not post that comment." }, 500);
      return c.json(serializeComment(row, { id: user.id, staff: user.staff }), 201);
    },
  )

  .delete("/:id/comments/:commentId", requireUser, vValidator("param", commentParam), async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);
    if (user.suspended) return c.json({ error: "Your account has been suspended." }, 403);
    const flags = await changelogFlags();
    if (!flags.enabled && !user.staff) return c.json({ error: "Not found" }, 404);
    if (!flags.comments) return c.json({ error: "Comments are turned off." }, 403);
    const { id, commentId } = c.req.valid("param");
    const row = await findComment.get(commentId, id);
    if (!row) return c.json({ error: "Not found" }, 404);
    if (!user.staff && row.author_id !== user.id) return c.json({ error: "Forbidden" }, 403);
    await deleteComment.run(commentId, id);
    return c.json({ ok: true });
  })

  .post(
    "/:id/reactions",
    requireUser,
    rateLimit(60, 60),
    vValidator("param", idParam),
    vValidator("json", reactionBody),
    async (c) => {
      const user = c.get("user");
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      if (user.suspended) return c.json({ error: "Your account has been suspended." }, 403);
      const flags = await changelogFlags();
      if (!flags.enabled && !user.staff) return c.json({ error: "Not found" }, 404);
      if (!flags.reactions) return c.json({ error: "Reactions are turned off." }, 403);
      const { id } = c.req.valid("param");
      if (!(await findEntry.get(id))) return c.json({ error: "Not found" }, 404);
      const { reaction } = c.req.valid("json");
      const removed = await removeReaction.get(id, user.id, reaction);
      if (!removed) await addReaction.run(id, user.id, reaction);
      return c.json({
        reactions: packReactions(await reactionsFor.all(id), user.id, true),
      });
    },
  );
