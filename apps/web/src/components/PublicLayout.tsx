import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth, useMe } from "../lib/queries";
import { useTheme } from "../lib/theme";
import { ArrowUpRight, Gear, Home, LogOut } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { Avatar } from "./ui";

const LOGO = "/usercue.svg";
const REPO = "https://github.com/usercue/usercue";
const DOCS = "https://docs.usercue.app";
const CHROME = "max-w-[1080px]";

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const [location] = useLocation();
  const current =
    href === "/"
      ? !location.startsWith("/roadmap") && !location.startsWith("/changelog")
      : location === href || location.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`inline-flex h-7 items-center rounded-full px-3 text-[13px] transition-colors ${
        current
          ? "bg-surface font-medium text-fg shadow-[var(--shadow)]"
          : "text-muted hover:bg-hover/70 hover:text-fg"
      }`}
    >
      {children}
    </Link>
  );
}

export function Logo({
  compact = false,
  wordmark = true,
  brand = false,
}: {
  compact?: boolean;
  wordmark?: boolean;
  brand?: boolean;
}) {
  const { data: me } = useMe();
  const [theme] = useTheme();
  const custom = theme === "dark" ? me?.logoDarkUrl || me?.logoUrl : me?.logoUrl || me?.logoDarkUrl;
  const src = brand ? LOGO : custom || LOGO;
  return (
    <span className="inline-flex items-center gap-2 text-[13px] font-semibold tracking-tight">
      <img
        src={src}
        alt={wordmark ? "" : "Usercue"}
        className={
          compact ? "h-5 w-auto max-w-28 object-contain" : "h-6 w-auto max-w-32 object-contain"
        }
      />
      {wordmark ? "Usercue" : null}
    </span>
  );
}

function FooterLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: ReactNode;
}) {
  const className =
    "inline-flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-fg";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
        <ArrowUpRight className="size-3 opacity-60" />
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium tracking-[0.12em] text-faint uppercase">{title}</p>
      <ul className="mt-3 flex flex-col gap-2">{children}</ul>
    </div>
  );
}

function Footer() {
  const { data: me } = useMe();

  return (
    <footer className="mt-auto border-t border-line">
      <div
        className={`mx-auto grid grid-cols-2 gap-x-8 gap-y-10 px-5 py-14 min-[720px]:grid-cols-4 ${CHROME}`}
      >
        <div className="col-span-2 flex max-w-xs flex-col gap-3 min-[720px]:col-span-1">
          <Link href="/" className="w-fit">
            <Logo brand wordmark={false} />
          </Link>
          <p className="text-[13px] leading-5 text-muted">
            Suggestions, votes, and a public roadmap.
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] leading-5 text-muted">
            a
            <img src="/paddlewheel.svg" alt="Paddlewheel" className="paddlewheel-mark" />
            product
          </p>
          <p className="text-[12px] leading-5 text-faint">
            {new Date().getFullYear()} UserCue by Paddlewheel Inc.
          </p>
        </div>
        <FooterCol title="Product">
          <li>
            <FooterLink href="/">Feedback</FooterLink>
          </li>
          <li>
            <FooterLink href="/roadmap">Roadmap</FooterLink>
          </li>
          {me?.changelogEnabled && (
            <li>
              <FooterLink href="/changelog">Changelog</FooterLink>
            </li>
          )}
        </FooterCol>
        <FooterCol title="Developers">
          <li>
            <FooterLink href={REPO} external>
              GitHub
            </FooterLink>
          </li>
          <li>
            <FooterLink href={DOCS} external>
              Documentation
            </FooterLink>
          </li>
        </FooterCol>
        <FooterCol title="Guides">
          <li>
            <FooterLink href={`${DOCS}/quickstart`} external>
              Quickstart
            </FooterLink>
          </li>
          <li>
            <FooterLink href={`${DOCS}/settings`} external>
              Settings
            </FooterLink>
          </li>
          <li>
            <FooterLink href={`${DOCS}/oauth`} external>
              OAuth
            </FooterLink>
          </li>
        </FooterCol>
      </div>
    </footer>
  );
}

const accountItem =
  "flex h-8 w-full items-center gap-2.5 rounded-full px-2.5 text-left text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg";

function AccountMenu() {
  const { data: me } = useMe();
  const { logout } = useAuth();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = me?.user;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`inline-flex h-8 items-center gap-2 rounded-full pr-2.5 pl-1 text-[13px] transition-colors ${
          open ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg"
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={user.name} src={user.avatarUrl} size="sm" />
        <span className="hidden max-w-[8rem] truncate sm:inline">{user.name}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 animate-rise rounded-[1.25rem] bg-surface p-1.5 shadow-[0_0_0_1px_var(--line),var(--shadow-lg)]"
        >
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={user.name} src={user.avatarUrl} size="md" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-fg">{user.name}</p>
              <p className="truncate text-[11px] text-faint">{user.email}</p>
            </div>
          </div>
          <div className="mx-2 my-1 h-px bg-line" />
          {user.staff && (
            <Link
              href="/admin"
              role="menuitem"
              className={accountItem}
              onClick={() => setOpen(false)}
            >
              <Home className="text-faint" />
              Workspace
            </Link>
          )}
          <Link
            href="/account"
            role="menuitem"
            className={accountItem}
            onClick={() => setOpen(false)}
          >
            <Gear className="text-faint" />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            className={accountItem}
            onClick={() => {
              setOpen(false);
              logout.mutate(undefined, { onSuccess: () => navigate("/") });
            }}
          >
            <LogOut className="text-faint" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

export function PublicLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { data: me } = useMe();
  const oauthError = new URLSearchParams(useSearch()).get("error");
  const widthClass = wide ? CHROME : "max-w-[720px]";

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-20 bg-bg/75 backdrop-blur-md">
        <div className={`mx-auto flex h-14 w-full items-center gap-6 px-5 ${CHROME}`}>
          <Link href="/">
            <Logo compact wordmark={false} />
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink href="/">Feedback</NavLink>
            <NavLink href="/roadmap">Roadmap</NavLink>
            {(me?.changelogEnabled || me?.user?.staff) && (
              <NavLink href="/changelog">Changelog</NavLink>
            )}
          </nav>
          <div className="flex-1" />
          <ThemeToggle />
          {me?.user ? (
            <AccountMenu />
          ) : me?.identity ? (
            <span className="inline-flex h-7 items-center px-3 text-[13px] text-muted">
              {me.identity.name}
            </span>
          ) : (
            <Link
              href="/signin"
              className="inline-flex h-7 items-center rounded-full px-3 text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>
      {oauthError && (
        <p className={`mx-auto w-full px-5 pt-4 text-center text-xs text-rose-500 ${CHROME}`}>
          {oauthError}
        </p>
      )}
      <main className={`mx-auto w-full min-w-0 flex-1 px-5 pt-8 pb-16 ${widthClass}`}>
        {children}
      </main>
      <Footer />
    </div>
  );
}
