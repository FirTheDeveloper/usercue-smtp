import { useTheme } from "../lib/theme";
import { Moon, Sun } from "./icons";

export function ThemeToggle({
  labeled = false,
  className = "",
}: {
  labeled?: boolean;
  className?: string;
}) {
  const [theme, setTheme] = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={
        className ||
        (labeled
          ? "flex h-8 w-full items-center gap-2.5 rounded-full px-2.5 text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg"
          : "inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg")
      }
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      {dark ? <Sun /> : <Moon />}
      {labeled ? <span>{dark ? "Lights on" : "Lights out"}</span> : null}
    </button>
  );
}
