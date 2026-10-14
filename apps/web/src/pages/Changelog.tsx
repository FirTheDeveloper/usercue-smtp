import { CHANGELOG_REACTIONS, type ChangelogReaction, isEmptyHtml, LIMITS } from "@usercue/shared";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Editor, SuggestionPicker } from "../components/Editor";
import { ChevronLeft, Comment, Hash, Pencil, Plus, Trash } from "../components/icons";
import { OAuthButtons } from "../components/OAuthButtons";
import { PostLink, RichText } from "../components/RichText";
import { Avatar, Empty, ErrorText, RoleBadge } from "../components/ui";
import type { ChangelogComment, ChangelogEntry } from "../lib/api";
import { longDate, timeAgo } from "../lib/format";
import {
  can,
  useAddChangelogComment,
  useAuthMethods,
  useChangelog,
  useChangelogEntry,
  useChangelogReaction,
  useCreateChangelogEntry,
  useDeleteChangelogComment,
  useDeleteChangelogEntry,
  useMe,
  useUpdateChangelogEntry,
} from "../lib/queries";

export function Changelog() {
  const params = useParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : undefined;
  const valid = id !== undefined && Number.isInteger(id) && id > 0;
  if (params.id && !valid) return <Empty title="Update not found" />;
  if (valid && id !== undefined) return <EntryPage id={id} />;
  return <ChangelogList />;
}

function ChangelogList() {
  const { data: me } = useMe();
  const staff = Boolean(me?.user?.staff && !me.user.suspended);
  const { data, isLoading, isError } = useChangelog(Boolean(me?.changelogEnabled || staff));
  const [composing, setComposing] = useState(false);

  if (!me?.changelogEnabled && !staff) {
    return <Empty title="Changelog isn't available" />;
  }
  if (isError) return <Empty title="Couldn't load the changelog" />;

  const hidden = data ? !data.enabled && staff : !me?.changelogEnabled && staff;

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-12">
      <header className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Changelog</h1>
            <p className="mt-1 text-muted">What the team shipped.</p>
          </div>
          {staff && !composing && (
            <button type="button" className="btn-primary" onClick={() => setComposing(true)}>
              <Plus /> New
            </button>
          )}
        </div>
        {hidden && (
          <p className="rounded-2xl bg-hover/70 px-4 py-3 text-[13px] leading-5 text-muted">
            These updates are visible to staff.
            {can(me, "manage_settings") && (
              <>
                {" "}
                <Link href="/admin/settings" className="font-medium text-fg">
                  Publish the changelog in Settings
                </Link>{" "}
                when you want everyone to see them.
              </>
            )}
          </p>
        )}
        {composing && <EntryForm onDone={() => setComposing(false)} />}
      </header>

      {isLoading || !data ? null : data.entries.length === 0 ? (
        <Empty title="No updates yet" />
      ) : (
        <ol className="flex flex-col gap-16">
          {data.entries.map((entry) => (
            <li key={entry.id}>
              <FeedEntry entry={entry} staff={staff} commentsEnabled={data.commentsEnabled} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function FeedEntry({
  entry,
  staff,
  commentsEnabled,
}: {
  entry: ChangelogEntry;
  staff: boolean;
  commentsEnabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateChangelogEntry(entry.id);
  const remove = useDeleteChangelogEntry(entry.id);

  if (editing) {
    return (
      <EntryForm
        entry={entry}
        pending={update.isPending}
        error={update.error}
        onDone={() => setEditing(false)}
        onSubmit={(body) => update.mutate(body, { onSuccess: () => setEditing(false) })}
      />
    );
  }

  return (
    <PublishedEntry
      entry={entry}
      staff={staff}
      titleHref={`/changelog/${entry.id}`}
      onEdit={() => setEditing(true)}
      onDelete={() => {
        if (confirm("Delete this update and its comments?")) remove.mutate();
      }}
      deleting={remove.isPending}
      deleteError={remove.error}
    >
      {commentsEnabled && (
        <Link
          href={`/changelog/${entry.id}#comments`}
          className="mt-4 inline-flex w-fit items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-fg"
        >
          <Comment width={13} height={13} />
          {entry.commentCount === 1 ? "1 comment" : `${entry.commentCount} comments`}
        </Link>
      )}
    </PublishedEntry>
  );
}

function EntryPage({ id }: { id: number }) {
  const { data: me } = useMe();
  const staff = Boolean(me?.user?.staff && !me.user.suspended);
  const { data, isLoading, isError } = useChangelogEntry(
    me?.changelogEnabled || staff ? id : undefined,
  );
  const update = useUpdateChangelogEntry(id);
  const remove = useDeleteChangelogEntry(id);
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);

  if (!me?.changelogEnabled && !staff) return <Empty title="Changelog isn't available" />;
  if (isLoading) return null;
  if (isError || !data) return <Empty title="Update not found" />;

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-10">
      <Link
        href="/changelog"
        className="inline-flex h-7 w-fit items-center gap-1 rounded-full px-2.5 text-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <ChevronLeft /> Changelog
      </Link>

      {editing ? (
        <EntryForm
          entry={data}
          pending={update.isPending}
          error={update.error}
          onDone={() => setEditing(false)}
          onSubmit={(body) => update.mutate(body, { onSuccess: () => setEditing(false) })}
        />
      ) : (
        <PublishedEntry
          entry={data}
          staff={staff}
          heading="h1"
          onEdit={() => setEditing(true)}
          onDelete={() => {
            if (confirm("Delete this update and its comments?")) {
              remove.mutate(undefined, { onSuccess: () => navigate("/changelog") });
            }
          }}
          deleting={remove.isPending}
          deleteError={remove.error}
        >
          {data.reactionsEnabled && (
            <div className="mt-5">
              <Reactions id={id} reactions={data.reactions} />
            </div>
          )}
        </PublishedEntry>
      )}

      {data.commentsEnabled && (
        <div className={editing ? undefined : "sm:pl-[calc(9.5rem+3rem)]"}>
          <Comments id={id} comments={data.comments} />
        </div>
      )}
    </div>
  );
}

function PublishedEntry({
  entry,
  staff,
  titleHref,
  heading = "h2",
  onEdit,
  onDelete,
  deleting,
  deleteError,
  children,
}: {
  entry: ChangelogEntry;
  staff: boolean;
  titleHref?: string;
  heading?: "h1" | "h2";
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
  deleteError: Error | null;
  children?: ReactNode;
}) {
  const Title = heading;
  return (
    <article className="grid grid-cols-1 gap-3 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-x-12">
      <time
        dateTime={new Date(entry.createdAt * 1000).toISOString()}
        className="text-[13px] leading-6 text-muted sm:pt-1"
      >
        {longDate(entry.createdAt)}
      </time>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-4">
          <Title
            className={
              heading === "h1"
                ? "text-[22px] leading-7 font-semibold tracking-tight"
                : "text-[18px] leading-7 font-semibold tracking-tight"
            }
          >
            {titleHref ? (
              <Link href={titleHref} className="transition-colors hover:text-accent-text">
                {entry.title}
              </Link>
            ) : (
              entry.title
            )}
          </Title>
          {staff && (
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className="btn-quiet h-7 px-2.5" onClick={onEdit}>
                <Pencil /> Edit
              </button>
              <button
                type="button"
                className="btn-quiet h-7 w-7"
                aria-label="Delete"
                disabled={deleting}
                onClick={onDelete}
              >
                <Trash />
              </button>
            </div>
          )}
        </div>
        {entry.linkedPost && (
          <p className="mt-3">
            <PostLink id={entry.linkedPost.id} title={entry.linkedPost.title} />
          </p>
        )}
        {entry.body && (
          <div className="changelog-body mt-3">
            <RichText html={entry.body} />
          </div>
        )}
        {children}
        <ErrorText error={deleteError} />
      </div>
    </article>
  );
}

function FeedbackLink({
  linked,
  picking,
  onPick,
  onClear,
  onToggle,
  onClose,
}: {
  linked: { id: number; title: string } | null;
  picking: boolean;
  onPick: (id: number, title: string) => void;
  onClear: () => void;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {linked ? (
        <div className="flex min-w-0 items-center gap-2">
          <PostLink id={linked.id} title={linked.title} />
          <button type="button" className="btn-quiet h-7 px-2" onClick={onClear}>
            Remove
          </button>
        </div>
      ) : (
        <button type="button" className="btn-quiet h-7 w-fit px-2.5" onClick={onToggle}>
          <Hash /> Link feedback
        </button>
      )}
      {picking && <SuggestionPicker query="" onPick={onPick} onClose={onClose} />}
    </div>
  );
}

function EntryForm({
  entry,
  pending,
  error,
  onDone,
  onSubmit,
}: {
  entry?: { title: string; body: string; linkedPost: { id: number; title: string } | null };
  pending?: boolean;
  error?: Error | null;
  onDone: () => void;
  onSubmit?: (body: { title: string; body: string; postId: number | null }) => void;
}) {
  const create = useCreateChangelogEntry();
  const [, navigate] = useLocation();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [linked, setLinked] = useState(entry?.linkedPost ?? null);
  const [picking, setPicking] = useState(false);
  const busy = pending ?? create.isPending;
  const failure = error === undefined ? create.error : error;

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = { title: title.trim(), body, postId: linked?.id ?? null };
    if (onSubmit) {
      onSubmit(next);
      return;
    }
    create.mutate(next, {
      onSuccess: (created) => {
        setTitle("");
        setBody("");
        navigate(`/changelog/${created.id}`);
      },
    });
  }

  return (
    <form onSubmit={submit} className="card overflow-hidden">
      <input
        className="h-12 w-full bg-transparent px-4 text-[13px] outline-none placeholder:text-faint"
        placeholder="Update title"
        value={title}
        maxLength={LIMITS.title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <div className="flex flex-col gap-3 px-4 pb-3">
        <Editor
          value={body}
          onChange={setBody}
          placeholder="What changed?  Type # to link a suggestion"
          maxLength={LIMITS.body}
          mentions
          headings
        />
        <FeedbackLink
          linked={linked}
          picking={picking}
          onPick={(id, picked) => {
            setLinked({ id, title: picked });
            setPicking(false);
          }}
          onClear={() => setLinked(null)}
          onToggle={() => setPicking((open) => !open)}
          onClose={() => setPicking(false)}
        />
        <div className="flex items-center gap-2 border-t pt-3">
          <ErrorText error={failure} />
          <div className="flex-1" />
          <button type="button" className="btn-quiet" onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !title.trim()}>
            {entry ? "Save" : "Publish"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Reactions({ id, reactions }: { id: number; reactions: ChangelogEntry["reactions"] }) {
  const { data: me } = useMe();
  const react = useChangelogReaction(id);
  const [needSignIn, setNeedSignIn] = useState(false);
  const user = me?.user;
  const suspended = Boolean(user?.suspended);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {CHANGELOG_REACTIONS.map((item) => {
          const row = reactions.find((reaction) => reaction.id === item.id);
          const mine = Boolean(row?.mine);
          const count = row?.count ?? 0;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={mine}
              aria-label={item.label}
              disabled={react.isPending || suspended}
              onClick={() => {
                if (!user) {
                  setNeedSignIn(true);
                  return;
                }
                react.mutate(item.id as ChangelogReaction);
              }}
              className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] transition-colors ${
                mine
                  ? "bg-accent-soft font-medium text-fg"
                  : "bg-hover/70 text-muted hover:bg-hover hover:text-fg"
              }`}
            >
              <span aria-hidden>{item.emoji}</span>
              <span>{item.label}</span>
              {count > 0 && <span className="tabular-nums text-faint">{count}</span>}
            </button>
          );
        })}
      </div>
      {needSignIn && (
        <p className="text-[12px] text-muted">
          <Link href="/signin" className="font-medium text-fg">
            Sign in
          </Link>{" "}
          to react.
        </p>
      )}
      {suspended && <p className="text-xs text-rose-500">Your account has been suspended.</p>}
      <ErrorText error={react.error} />
    </div>
  );
}

function Comments({ id, comments }: { id: number; comments: ChangelogComment[] }) {
  return (
    <section id="comments" className="mt-8 flex scroll-mt-24 flex-col gap-5 border-t pt-6">
      <h2 className="text-[13px] font-medium">
        Comments
        <span className="ml-2 text-faint tabular-nums">{comments.length}</span>
      </h2>
      {comments.length > 0 && (
        <ul className="flex flex-col gap-5">
          {comments.map((comment) => (
            <CommentItem key={comment.id} entryId={id} comment={comment} />
          ))}
        </ul>
      )}
      <CommentForm entryId={id} />
    </section>
  );
}

function CommentItem({ entryId, comment }: { entryId: number; comment: ChangelogComment }) {
  const remove = useDeleteChangelogComment(entryId);
  return (
    <li className="flex gap-3">
      <Avatar
        name={comment.authorName}
        src={comment.authorAvatar}
        team={comment.isTeam}
        size="md"
      />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[13px] font-medium">{comment.authorName}</span>
          {comment.authorRole && (
            <RoleBadge name={comment.authorRole.name} iconUrl={comment.authorRole.iconUrl} />
          )}
          <span className="text-[12px] text-faint">{timeAgo(comment.createdAt)}</span>
          {comment.canDelete && (
            <button
              type="button"
              className="rounded-full px-2 py-0.5 text-[12px] font-medium text-muted transition-colors hover:bg-hover hover:text-fg"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm("Delete this comment?")) remove.mutate(comment.id);
              }}
            >
              Delete
            </button>
          )}
        </p>
        <div className="mt-1">
          <RichText html={comment.body} />
        </div>
        <ErrorText error={remove.error} />
      </div>
    </li>
  );
}

function CommentForm({ entryId }: { entryId: number }) {
  const { data: me } = useMe();
  const { data: methods } = useAuthMethods();
  const add = useAddChangelogComment(entryId);
  const [body, setBody] = useState("");
  const user = me?.user;
  const suspended = Boolean(user?.suspended);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!user || isEmptyHtml(body)) return;
    add.mutate(body, { onSuccess: () => setBody("") });
  }

  return (
    <form onSubmit={submit} className="card px-3 pt-2.5 pb-2">
      <Editor
        value={body}
        onChange={setBody}
        placeholder="Write a comment…"
        maxLength={LIMITS.comment}
      />
      {!user && Boolean(methods?.providers.length) && (
        <div className="mt-3">
          <OAuthButtons next="board" className="btn-quiet h-9 w-full bg-hover" />
        </div>
      )}
      <div className="mt-4 flex items-center gap-3">
        {user ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 px-1 text-[13px] text-muted">
            <Avatar name={user.name} src={user.avatarUrl} size="xs" />
            <span className="truncate">{user.name}</span>
          </span>
        ) : (
          <p className="min-w-0 text-[12px] text-muted">
            <Link href="/signin" className="font-medium text-fg">
              Sign in
            </Link>{" "}
            to comment.
          </p>
        )}
        <div className="flex-1" />
        {suspended && <p className="text-xs text-rose-500">Your account has been suspended.</p>}
        <ErrorText error={add.error} />
        <button
          type="submit"
          className="btn-primary h-7 px-2.5"
          disabled={add.isPending || !user || suspended || isEmptyHtml(body)}
        >
          Comment
        </button>
      </div>
    </form>
  );
}
