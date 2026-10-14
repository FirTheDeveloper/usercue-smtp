import { LIMITS } from "@usercue/shared";
import { type FormEvent, useState } from "react";
import { getSavedName, saveName } from "../lib/format";
import { useAuthMethods, useCreatePost, useMe } from "../lib/queries";
import { Editor } from "./Editor";
import { OAuthButtons } from "./OAuthButtons";
import { ErrorText } from "./ui";

export function PostForm({ board, defaultOpen = false }: { board: string; defaultOpen?: boolean }) {
  const { data: me } = useMe();
  const { data: methods } = useAuthMethods();
  const create = useCreatePost();
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState(getSavedName);

  const user = me?.user;
  const identity = me?.identity;
  const guest = !user && !identity;
  const allowGuest = me?.allowGuestFeedback !== false;
  const mustSignIn = guest && !allowGuest;
  const suspended = Boolean(user?.suspended);
  const canPost = !mustSignIn && !suspended;

  function submit(e: FormEvent) {
    e.preventDefault();
    const author = guest ? name.trim() : undefined;
    if (author) saveName(author);

    create.mutate(
      { board, title, body, name: author },
      {
        onSuccess: () => {
          setTitle("");
          setBody("");
          setOpen(false);
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="card overflow-hidden">
      <input
        className="h-12 w-full bg-transparent px-4 text-[13px] outline-none placeholder:text-faint"
        placeholder="Share an idea or report a problem…"
        value={title}
        maxLength={LIMITS.title}
        onFocus={() => setOpen(true)}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      {open && (
        <div className="flex animate-rise flex-col gap-3 px-4 pb-3">
          <Editor value={body} onChange={setBody} maxLength={LIMITS.body} />
          {guest && Boolean(methods?.providers.length) && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <OAuthButtons next="board" />
              {allowGuest && (
                <p className="text-center text-[11px] text-faint">or post as a guest</p>
              )}
            </div>
          )}
          {mustSignIn && !methods?.providers.length && (
            <p className="border-t pt-3 text-[12px] text-muted">
              Sign in is required to share feedback.
            </p>
          )}
          <div className="flex items-center gap-2 border-t pt-3">
            {guest && allowGuest && (
              <input
                className="input max-w-40"
                placeholder="Your name"
                value={name}
                maxLength={LIMITS.name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            {(user || identity) && (
              <span className="px-1 text-[13px] text-muted">{user?.name ?? identity?.name}</span>
            )}
            {suspended && <p className="text-xs text-rose-500">Your account has been suspended.</p>}
            <ErrorText error={create.error} />
            <div className="flex-1" />
            <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={create.isPending || !canPost}>
              Post
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
