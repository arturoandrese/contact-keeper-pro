import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ShieldCheck, ShieldAlert, Loader2, MailCheck, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface HealthCheck {
  key: string;
  ok: boolean;
  title: string;
  detail: string;
}

interface HealthResult {
  domain: string;
  isFreeProvider: boolean;
  message?: string;
  score?: number;
  checks?: HealthCheck[];
}

interface SenderHealthPanelProps {
  onBack: () => void;
}

const SenderHealthPanel = ({ onBack }: SenderHealthPanelProps) => {
  const [email, setEmail] = useState("arturo@huau.cl");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("check-sender-health", {
        body: { email: email.trim() },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setResult(data as HealthResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo verificar");
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (s: number) =>
    s >= 80 ? "text-green-600 dark:text-green-400" : s >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

  const scoreLabel = (s: number) =>
    s >= 80 ? "Tu correo está bien configurado" : s >= 50 ? "Tu correo tiene problemas que afectan la entrega" : "Tu correo tiene problemas graves: muchos caerán en spam";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Volver
        </Button>
      </div>

      <div className="text-center space-y-2">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <MailCheck className="h-7 w-7 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight">Salud de tu correo</h2>
        <p className="text-sm text-muted-foreground">
          Revisa si tu dominio está bien configurado para que tus correos no caigan en spam
        </p>
      </div>

      <div className="flex gap-2">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tunombre@tuempresa.cl"
          onKeyDown={(e) => e.key === "Enter" && runCheck()}
        />
        <Button onClick={runCheck} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-1.5 h-4 w-4" />}
          Verificar
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result?.isFreeProvider && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>{result.message}</p>
          </div>
        </div>
      )}

      {result && !result.isFreeProvider && typeof result.score === "number" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6 text-center">
            <p className={`font-display text-5xl font-bold ${scoreColor(result.score)}`}>
              {result.score}
              <span className="text-xl text-muted-foreground">/100</span>
            </p>
            <p className={`mt-2 text-sm font-medium ${scoreColor(result.score)}`}>{scoreLabel(result.score)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Dominio: {result.domain}</p>
          </div>

          <div className="space-y-2">
            {result.checks?.map((c) => (
              <div key={c.key} className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                ) : (
                  <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                )}
                <div>
                  <p className="text-sm font-semibold">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">¿Qué más afecta que caigas en spam?</p>
            <p>• Cuánta gente marca tu correo como spam (lo más importante).</p>
            <p>• Tu tasa de rebote: sobre 2% te castiga. Verifica los correos antes de enviar.</p>
            <p>• Enviar ráfagas grandes: mejor 40–60 al día, espaciados.</p>
            <p>• Links y archivos adjuntos en el primer correo bajan la entrega.</p>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Esto revisa la configuración técnica de tu dominio (SPF, DKIM, DMARC, listas negras). No mide tu
            reputación de envío, que depende de rebotes y quejas de spam.
          </p>
        </div>
      )}
    </div>
  );
};

export default SenderHealthPanel;
