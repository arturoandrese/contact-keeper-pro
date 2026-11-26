import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Lock, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { checkPinSession, logoutPin, restorePinSessionAfterOAuth } from "@/lib/ccpSession";

// UI only: every table and server function enforces the PIN session on the server.
const PinGate = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<"loading" | "locked" | "ok">("loading");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await restorePinSessionAfterOAuth();
      setState((await checkPinSession()) === "ok" ? "ok" : "locked");
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setState("locked");
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (value: string) => {
    if (value.length !== 4 || busy) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.functions.invoke("ccp-auth", { body: { action: "login", pin: value } });
    let body = data;
    if (error) { try { body = await (error as { context?: Response }).context?.json(); } catch { body = null; } }
    setPin(""); setBusy(false);
    if (body?.ok && body.access_token) {
      await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
      setState("ok"); return;
    }
    if (body?.code === "locked") setMsg("Demasiados intentos. Espera 15 minutos e intenta de nuevo.");
    else if (body?.code === "wrong_pin") setMsg(`PIN incorrecto. Te quedan ${body.attempts_left} intentos.`);
    else if (body?.code === "not_configured") setMsg("El PIN aún no está configurado en el servidor.");
    else setMsg("No se pudo validar el PIN. Intenta de nuevo.");
  };

  if (state === "loading") return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (state === "locked") return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-5 rounded-xl border bg-card p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
        <div>
          <h1 className="font-display text-2xl font-bold">Acceso requerido</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ingresa tu PIN de 4 dígitos.</p>
        </div>
        <div className="flex justify-center">
          <InputOTP maxLength={4} value={pin} onChange={(v) => { setPin(v.replace(/\D/g, "")); if (v.length === 4) submit(v); }} disabled={busy} inputMode="numeric">
            <InputOTPGroup>{[0, 1, 2, 3].map(i => <InputOTPSlot key={i} index={i} className="h-12 w-12 text-lg [-webkit-text-security:disc]" />)}</InputOTPGroup>
          </InputOTP>
        </div>
        {busy && <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />}
        {msg && <p className="text-sm text-destructive">{msg}</p>}
      </div>
    </div>
  );
  return (
    <>
      {children}
      <Button variant="outline" size="sm" className="fixed bottom-4 left-4 z-50" onClick={async () => { await logoutPin(); setState("locked"); }}>
        <LogOut className="mr-1.5 h-3.5 w-3.5" />Cerrar sesión
      </Button>
    </>
  );
};
export default PinGate;
