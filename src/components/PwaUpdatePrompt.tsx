import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { APP_VERSION } from "@/generated/appVersion";

const PwaUpdatePrompt = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const isPreviewContext = useMemo(() => {
    const isPreviewHost =
      window.location.hostname.includes("id-preview--") ||
      window.location.hostname.includes("lovableproject.com");

    try {
      return isPreviewHost || window.self !== window.top;
    } catch {
      return true;
    }
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV || isPreviewContext) {
      return;
    }

    const checkVersion = async () => {
      try {
        const res = await fetch("/version.txt?t=" + Date.now(), { cache: "no-store" });
        if (res.ok) {
          const remote = (await res.text()).trim();
          if (remote && remote !== APP_VERSION) {
            setNeedRefresh(true);
          }
        }
      } catch {}
    };

    const handleControllerChange = () => {
      window.location.reload();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void checkVersion();
      }
    };

    const checkForUpdate = async () => {
      try {
        if (!("serviceWorker" in navigator)) {
          return;
        }

        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
      } catch {}
    };

    void checkVersion();
    void checkForUpdate();

    const versionInterval = window.setInterval(checkVersion, 60000);
    const swInterval = window.setInterval(checkForUpdate, 30000);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    }

    window.addEventListener("focus", checkVersion);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      }

      window.removeEventListener("focus", checkVersion);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(swInterval);
      window.clearInterval(versionInterval);
    };
  }, [isPreviewContext]);

  const updateApp = async () => {
    setIsUpdating(true);

    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();

        await Promise.all(
          registrations.map(async (registration) => {
            registration.waiting?.postMessage({ type: "SKIP_WAITING" });
            await registration.update().catch(() => undefined);
          })
        );
      }

      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      window.location.reload();
    } finally {
      setIsUpdating(false);
    }
  };

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-lg">
        <span className="text-sm font-medium">🚀 Nueva versión disponible</span>
        <Button size="sm" onClick={() => void updateApp()} className="gap-1.5" disabled={isUpdating}>
          <RefreshCw className={`h-3.5 w-3.5 ${isUpdating ? "animate-spin" : ""}`} />
          Actualizar aquí
        </Button>
      </div>
    </div>
  );
};

export default PwaUpdatePrompt;
