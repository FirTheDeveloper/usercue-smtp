import { SITE_DEFAULTS } from "@usercue/shared";

let currentName: string = SITE_DEFAULTS.name;

export function applySite(name: string, faviconUrl: string) {
  if (name !== currentName) {
    const at = document.title.lastIndexOf(currentName);
    if (at >= 0) {
      document.title =
        document.title.slice(0, at) + name + document.title.slice(at + currentName.length);
    }
    currentName = name;
  }
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon && icon.getAttribute("href") !== faviconUrl) {
    icon.removeAttribute("type");
    icon.href = faviconUrl;
  }
}
