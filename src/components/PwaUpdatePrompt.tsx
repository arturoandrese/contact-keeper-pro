import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

const PwaUpdatePrompt = () => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    // Listen for the custom event from vite-plugin-pwa
    const onNeedRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.registration) setRegistration(detail.registration);
      setNeedRefresh(true);
    };

    // vite-plugin-pwa with registerType: 'prompt' dispatches these events
    window.addEventListener("vite-pwa:need-refresh", onNeedRefresh);

    // Also check on interval for waiting SW
    const checkForUpdate = async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          setRegistration(reg);
          setNeedRefresh(true);
        }
      } catch {}
    };

    checkForUpdate();
    const interval = setInterval(checkForUpdate, 30000);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("vite-pwa:need-refresh", onNeedRefresh);
      clearInterval(interval);
    };
  }, []);

  const updateApp = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
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
