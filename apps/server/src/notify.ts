import { STATUS_LABELS, type Status, stripHtml } from "@usercue/shared";
import { db } from "./db";
import { decryptSecret } from "./secret";
import { getWorkspace } from "./workspace";

const COLORS: Record<Status, number> = {
  open: 0x8a8178,
  planned: 0x38bdf8,
  in_progress: 0x8b5cf6,
  complete: 0x34d399,
  closed: 0xfb7185,
};

interface PostInfo {
  id: number;
  title: string;
  body: string;
  authorName: string;
  boardName: string;
  status: Status;
}

const readMessageId = db.query<{ message_id: string }>(
  "SELECT message_id FROM post_discord WHERE post_id = ?",
);
const saveMessageId = db.query(
  `INSERT INTO post_discord (post_id, message_id) VALUES (?, ?)
   ON CONFLICT (post_id) DO UPDATE SET message_id = EXCLUDED.message_id`,
);

export function isDiscordWebhook(url: string): boolean {
  return /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w.-]+\/?$/.test(
    url.trim(),
  );
}

export function isTeamsWebhook(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;
  if (host === "outlook.office.com" || host === "outlook.office365.com") {
    return path.startsWith("/webhook/");
  }
  if (host === "webhook.office.com" || host.endsWith(".webhook.office.com")) {
    return path.includes("/webhookb2/");
  }
  if (host.endsWith(".logic.azure.com")) return path.includes("/workflows/");
  if (host.endsWith(".powerplatform.com") || host.endsWith(".powerautomate.com")) {
    return path.length > 1;
  }
  return false;
}

export async function discordConfigured(): Promise<boolean> {
  return Boolean((await getWorkspace()).discord_webhook_cipher);
}

export async function teamsConfigured(): Promise<boolean> {
  return Boolean((await getWorkspace()).teams_webhook_cipher);
}

async function webhookUrl(): Promise<string | null> {
  const workspace = await getWorkspace();
  if (workspace.discord_enabled !== 1 || !workspace.discord_webhook_cipher) return null;
  try {
    return decryptSecret(workspace.discord_webhook_cipher).trim().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

async function postMessage(url: string, payload: unknown): Promise<string | null> {
  try {
    const response = await fetch(`${url}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const message = (await response.json()) as { id?: string };
    return message.id ?? null;
  } catch {
    return null;
  }
}

async function editMessage(url: string, messageId: string, payload: unknown): Promise<boolean> {
  try {
    const response = await fetch(`${url}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function postEmbed(origin: string, post: PostInfo, activity?: string) {
  const excerpt = stripHtml(post.body).slice(0, 300);
  return {
    title: post.title,
    url: `${origin}/post/${post.id}`,
    description: excerpt || undefined,
    color: COLORS[post.status],
    author: { name: `Post by ${post.authorName}` },
    fields: [
      { name: "Board", value: post.boardName, inline: true },
      { name: "Status", value: STATUS_LABELS[post.status], inline: true },
    ],
    footer: activity ? { text: activity } : undefined,
    timestamp: new Date().toISOString(),
  };
}

async function syncPostMessage(origin: string, post: PostInfo, activity?: string): Promise<void> {
  const url = await webhookUrl();
  if (!url) return;

  const payload = { embeds: [postEmbed(origin, post, activity)] };
  const existing = (await readMessageId.get(post.id))?.message_id ?? "";
  if (existing && (await editMessage(url, existing, payload))) return;

  const created = await postMessage(url, payload);
  if (created && created !== existing) await saveMessageId.run(post.id, created);
}

async function teamsWebhookUrl(): Promise<string | null> {
  const workspace = await getWorkspace();
  if (workspace.teams_enabled !== 1 || !workspace.teams_webhook_cipher) return null;
  try {
    return decryptSecret(workspace.teams_webhook_cipher).trim();
  } catch {
    return null;
  }
}

function teamsCard(origin: string, post: PostInfo, activity: string) {
  const excerpt = stripHtml(post.body).slice(0, 300);
  const link = `${origin}/post/${post.id}`;
  const body: Record<string, unknown>[] = [
    {
      type: "TextBlock",
      text: activity,
      size: "Small",
      weight: "Bolder",
      wrap: true,
      isSubtle: true,
    },
    { type: "TextBlock", text: post.title, size: "Medium", weight: "Bolder", wrap: true },
  ];
  if (excerpt) body.push({ type: "TextBlock", text: excerpt, wrap: true });
  body.push({
    type: "FactSet",
    facts: [
      { title: "Board", value: post.boardName },
      { title: "Status", value: STATUS_LABELS[post.status] },
      { title: "Author", value: post.authorName },
    ],
  });
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
          actions: [{ type: "Action.OpenUrl", title: "Open suggestion", url: link }],
        },
      },
    ],
  };
}

async function postTeams(origin: string, post: PostInfo, activity: string): Promise<void> {
  const url = await teamsWebhookUrl();
  if (!url || !isTeamsWebhook(url)) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamsCard(origin, post, activity)),
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch {}
}

export async function notifyNewPost(origin: string, post: PostInfo): Promise<void> {
  await Promise.all([
    syncPostMessage(origin, post, "New post"),
    postTeams(origin, post, "New post"),
  ]);
}

export async function notifyStatusChange(
  origin: string,
  post: PostInfo,
  actorName: string,
): Promise<void> {
  const activity = `${actorName} moved this to ${STATUS_LABELS[post.status]}`;
  await Promise.all([syncPostMessage(origin, post, activity), postTeams(origin, post, activity)]);
}

export async function notifyComment(
  origin: string,
  post: PostInfo,
  comment: { authorName: string },
): Promise<void> {
  const activity = `${comment.authorName} commented`;
  await Promise.all([syncPostMessage(origin, post, activity), postTeams(origin, post, activity)]);
}
