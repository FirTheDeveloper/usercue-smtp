import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect, useState } from "react";
import { Close } from "./icons";

export function Pwa() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

  useRegisterSW({
    onOfflineReady: () => setOfflineReady(true),
    onNeedReload: () => setUpdateReady(true),
  });

  useEffect(() => {
    if (!offlineReady) return;
    const id = window.setTimeout(() => setOfflineReady(false), 5000);
    return () => window.clearTimeout(id);
  }, [offlineReady]);

  if (!offlineReady && !updateReady) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setUpdateReady(false);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4"
    >
      <div className="flex items-center gap-3 rounded-full bg-surface py-1.5 pr-1.5 pl-4 text-[13px] shadow-[var(--shadow-lg)] ring-1 ring-line">
        <span>{updateReady ? "A new version is available." : "Ready to work offline."}</span>
        {updateReady && (
          <button
            type="button"
            className="rounded-full bg-accent px-3 py-1 font-medium text-white transition hover:brightness-110"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        )}
        <button
          type="button"
          aria-label={updateReady ? "Dismiss update notice" : "Dismiss"}
          className="inline-flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg"
          onClick={dismiss}
        >
          <Close />
        </button>
      </div>
    </div>
  );
}
