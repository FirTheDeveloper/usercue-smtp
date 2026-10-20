import { vValidator } from "@hono/valibot-validator";
import { TAG_COLOR_IDS } from "@usercue/shared";
import { Hono } from "hono";
import * as v from "valibot";
import { db } from "../db";
import { type AppEnv, requirePermission } from "../middleware";
import { customerTagMode } from "../workspace";

const tagName = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(24));
const tagColor = v.picklist(TAG_COLOR_IDS);
const idParam = v.object({
  id: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
});

interface TagRow {
  id: number;
  name: string;
  color: string;
}

const listTags = db.query<TagRow>("SELECT id, name, color FROM tags ORDER BY lower(name), id");
const insertTag = db.query<TagRow>(
  "INSERT INTO tags (name, color) VALUES (?, ?) RETURNING id, name, color",
);
const findTag = db.query<TagRow>("SELECT id, name, color FROM tags WHERE id = ?");
const nameTaken = db.query<{ id: number }>(
  "SELECT id FROM tags WHERE lower(name) = lower(?) AND id <> ?",
);
const updateTag = db.query<TagRow>(
  "UPDATE tags SET name = ?, color = ? WHERE id = ? RETURNING id, name, color",
);
const deleteTag = db.query("DELETE FROM tags WHERE id = ?");

const canManageTags = requirePermission("manage_posts", "manage_settings");

const serialize = (row: TagRow) => ({ id: row.id, name: row.name, color: row.color });

export const tags = new Hono<AppEnv>()
  .get("/", async (c) => c.json((await listTags.all()).map(serialize)))

  .post(
    "/",
    canManageTags,
    vValidator("json", v.object({ name: tagName, color: tagColor })),
    async (c) => {
      const { name, color } = c.req.valid("json");
      const taken = await nameTaken.get(name, 0);
      if (taken) return c.json({ error: "A tag with that name already exists." }, 409);
      try {
        const tag = await insertTag.get(name, color);
        if (!tag) return c.json({ error: "Could not create tag" }, 500);
        return c.json(serialize(tag), 201);
      } catch {
        return c.json({ error: "A tag with that name already exists." }, 409);
      }
    },
  )

  .patch(
    "/:id",
    canManageTags,
    vValidator("param", idParam),
    vValidator("json", v.object({ name: v.optional(tagName), color: v.optional(tagColor) })),
    async (c) => {
      const { id } = c.req.valid("param");
      const patch = c.req.valid("json");
      const current = await findTag.get(id);
      if (!current) return c.json({ error: "Tag not found" }, 404);

      const name = patch.name ?? current.name;
      const color = patch.color ?? current.color;
      const taken = await nameTaken.get(name, id);
      if (taken) return c.json({ error: "A tag with that name already exists." }, 409);

      try {
        const tag = await updateTag.get(name, color, id);
        if (!tag) return c.json({ error: "Tag not found" }, 404);
        return c.json(serialize(tag));
      } catch {
        return c.json({ error: "A tag with that name already exists." }, 409);
      }
    },
  )

  .delete("/:id", canManageTags, vValidator("param", idParam), async (c) => {
    const { required } = await customerTagMode();
    if (required && (await listTags.all()).length <= 1) {
      return c.json({ error: "Turn off required tags before deleting the last one." }, 400);
    }
    await deleteTag.run(c.req.valid("param").id);
    return c.json({ ok: true });
  });
