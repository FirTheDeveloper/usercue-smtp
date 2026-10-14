import { ACCENT_IDS, type AccentId, isHexColor } from "@usercue/shared";

let booted = false;

export function applyAccent(accent: string | null | undefined) {
  const preset: AccentId | undefined = ACCENT_IDS.find((item) => item === accent);
  const custom = typeof accent === "string" && isHexColor(accent) ? accent.toLowerCase() : null;
  const root = document.documentElement;
  if (!booted) root.dataset.accentInstant = "";

  if (custom) {
    root.style.setProperty("--accent-custom", custom);
    root.dataset.accent = "custom";
  } else {
    root.style.removeProperty("--accent-custom");
    if (!preset || preset === "pink") delete root.dataset.accent;
    else root.dataset.accent = preset;
  }

  if (!booted) {
    booted = true;
    requestAnimationFrame(() => {
      delete root.dataset.accentInstant;
    });
  }
}
