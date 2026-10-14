import { type FormEvent, useEffect, useState } from "react";
import { ErrorText } from "../components/ui";
import { useMe, useUpdateProfile } from "../lib/queries";

export function Account() {
  const { data: me } = useMe();
  const save = useUpdateProfile();
  const user = me?.user;
  const [name, setName] = useState(user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  if (!user) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = password.trim();
    save.mutate(
      {
        name,
        password: next || undefined,
        currentPassword: user?.hasPassword && next ? currentPassword : undefined,
      },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setPassword("");
          setSaved(true);
          window.setTimeout(() => setSaved(false), 2000);
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Settings</h1>
        <p className="mt-1.5 text-muted">Your name is shown on posts and comments.</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-[11px] text-muted">Name</span>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={60}
          required
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-[11px] text-muted">Email</span>
        <input
          className="input"
          value={user.email}
          readOnly
          placeholder="Not shared by this sign-in"
        />
      </label>

      {user.hasPassword && (
        <label className="flex flex-col gap-1.5">
          <span className="px-1 text-[11px] text-muted">Current password</span>
          <input
            className="input"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Required to set a new one"
            required={password.trim().length > 0}
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="px-1 text-[11px] text-muted">
          {user.hasPassword ? "New password" : "Set a password"}
        </span>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          placeholder={
            user.hasPassword ? "Leave blank to keep it" : "Optional, at least 8 characters"
          }
        />
      </label>

      <div className="flex items-center gap-2">
        <ErrorText error={save.error} />
        {saved && !save.error && <p className="text-[12px] text-muted">Saved</p>}
        <div className="flex-1" />
        <button type="submit" className="btn-primary" disabled={save.isPending}>
          Save
        </button>
      </div>
    </form>
  );
}
