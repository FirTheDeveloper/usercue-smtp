import { relative } from "node:path";
import { serveStatic } from "hono/bun";
import { app } from "./app";
import { initDb } from "./db";
import { env } from "./env";
import { publicOrigin } from "./oauth";
import { entryMeta, injectMeta, metaTags, ogEntry, ogPost, postMeta } from "./og";
import { initRoles } from "./roles";
import { changelogFlags } from "./workspace";

await initDb();
await initRoles();

app.use("/uploads/*", serveStatic({ root: env.dataDir }));

if (env.production) {
  const root = relative(process.cwd(), `${import.meta.dir}/../../web/dist`);
  const indexPath = `${import.meta.dir}/../../web/dist/index.html`;
  let baseHtml: string | null = null;
  const shell = async () => {
    baseHtml ??= await Bun.file(indexPath).text();
    return baseHtml;
  };

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

  app.get("/post/:id", async (c) => {
    const base = await shell();
    const id = Number(c.req.param("id"));
    const post = Number.isInteger(id) ? await ogPost.get(id) : null;
    if (!post) return c.html(base);
    const tags = metaTags(postMeta(publicOrigin(c), post));
    return c.html(injectMeta(base, tags), 200, { "Cache-Control": "public, max-age=60" });
  });

  app.get("/changelog/:id", async (c) => {
    const base = await shell();
    const id = Number(c.req.param("id"));
    const entry = Number.isInteger(id) ? await ogEntry.get(id) : null;
    if (!entry || !(await changelogFlags()).enabled) return c.html(base);
    const tags = metaTags(entryMeta(publicOrigin(c), entry));
    return c.html(injectMeta(base, tags), 200, { "Cache-Control": "public, max-age=60" });
  });

  app.use("*", serveStatic({ root, precompressed: true }));
  app.get("*", serveStatic({ root, path: "index.html", precompressed: true }));
}

if (env.production) {
  console.log(`usercue listening on http://localhost:${env.port}`);
} else {
  console.log(`usercue app  http://localhost:5173`);
  console.log(`usercue api  http://localhost:${env.port}`);
}

export default {
  port: env.port,
  fetch: app.fetch,
};
