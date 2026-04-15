import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const APP_VERSION = "2026.04.15.2";

const PwaUpdatePrompt = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Check version mismatch via fetching version.txt
    const checkVersion = async () => {
      try {
        const res = await fetch("/version.txt?t=" + Date.now(), { cache: "no-store" });
        if (res.ok) {
          const remote = (await res.text()).trim();
          const stored = localStorage.getItem("app_version");
          if (stored && stored !== remote) {
            setNeedRefresh(true);
          }
          localStorage.setItem("app_version", remote);
        }
      } catch {}
    };

    checkVersion();
    const versionInterval = setInterval(checkVersion, 60000);

    if (!("serviceWorker" in navigator)) return () => clearInterval(versionInterval);

    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    const onNeedRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.registration) setRegistration(detail.registration);
      setNeedRefresh(true);
    };

    window.addEventListener("vite-pwa:need-refresh", onNeedRefresh);

    const checkForUpdate = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.update();
          if (reg.waiting) {
            setRegistration(reg);
            setNeedRefresh(true);
          }
        }
      } catch {}
    };

    checkForUpdate();
    const interval = setInterval(checkForUpdate, 30000);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("vite-pwa:need-refresh", onNeedRefresh);
      clearInterval(interval);
      clearInterval(versionInterval);
    };
  }, []);

  const updateApp = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
    // Clear all caches
    caches.keys().then(names => {
      Promise.all(names.map(name => caches.delete(name))).then(() => {
        window.location.reload();
      });
    });
  };

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom-4">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3 shadow-lg">
        <span className="text-sm font-medium">🚀 Nueva versión disponible</span>
        <Button size="sm" onClick={updateApp} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Actualizar aquí
        </Button>
      </div>
    </div>
  );
};

export default PwaUpdatePrompt;
