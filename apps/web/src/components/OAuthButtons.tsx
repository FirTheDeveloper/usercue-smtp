import type { AuthProviderId } from "@usercue/shared";
import { useAuthMethods } from "../lib/queries";
import { Discord, GitHub, Google } from "./icons";

const ICONS = {
  github: GitHub,
  discord: Discord,
  google: Google,
} as const;

const MARKS: Partial<Record<AuthProviderId, string>> = {
  roblox: "/roblox.svg",
  azure: "/azure.svg",
};

export function ProviderIcon({
  id,
  className,
}: {
  id: AuthProviderId | string;
  className?: string;
}) {
  const src = MARKS[id as AuthProviderId];
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`size-3.5 ${id === "roblox" ? "roblox-mark" : ""} ${className ?? ""}`}
      />
    );
  }
  const Icon = ICONS[id as keyof typeof ICONS] ?? GitHub;
  return <Icon className={className} />;
}

export function OAuthButtons({
  next,
  className = "btn-ghost h-9 w-full",
}: {
  next: "admin" | "board";
  className?: string;
}) {
  const { data } = useAuthMethods();
  if (!data?.providers.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {data.providers.map((provider) => (
        <a
          key={provider.id}
          href={`/api/auth/oauth/${provider.id}?next=${next}`}
          className={className}
        >
          <ProviderIcon id={provider.id} />
          Continue with {provider.label}
        </a>
      ))}
    </div>
  );
}
