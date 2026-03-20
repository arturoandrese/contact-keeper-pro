import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Copy, RotateCcw } from "lucide-react";
import { toast } from "sonner";

const INDUSTRIES = ["Retail", "Turismo", "Fintech", "Agencia Creativa", "Salud", "Educación", "Energía / Minería", "Otro"];
const EMAIL_TYPES = [
  { value: "presentation", label: "Presentación" },
  { value: "followup", label: "Follow-up" },
  { value: "soft_close", label: "Soft close" },
];

type FormData = {
  contactName: string;
  company: string;
  industry: string;
  emailType: string;
  referredBy: string;
};

function generatePitch(d: FormData): string {
  const firstName = d.contactName.split(" ")[0];
  const ref = d.referredBy ? `Me recomendó escribirte ${d.referredBy}. ` : "";

  const industryHook: Record<string, string> = {
    "Retail": "el contenido audiovisual genera hasta un 80% más de engagement en retail",
    "Turismo": "un buen video puede triplicar las reservas en turismo",
    "Fintech": "en fintech, la confianza se construye con historias bien contadas",
    "Agencia Creativa": "como agencia, saben que la producción audiovisual de calidad marca la diferencia",
    "Salud": "en salud, comunicar con cercanía y profesionalismo es clave",
    "Educación": "el video es la herramienta más poderosa para educar e inspirar",
    "Energía / Minería": "los proyectos de energía y minería necesitan ser comunicados con impacto",
    "Otro": "el contenido audiovisual es clave para diferenciarse",
  };

  const hook = industryHook[d.industry] || industryHook["Otro"];

  if (d.emailType === "presentation") {
    return `Asunto: Una idea para ${d.company}

Hola ${firstName},

${ref}Te escribo porque ${hook}, y creo que hay una oportunidad interesante para ${d.company}.

Soy Arturo Erlwein, de HUAU — somos una productora audiovisual chilena especializada en contenido que conecta marcas con personas. Hemos trabajado con empresas como Coca-Cola, Falabella y BHP, siempre buscando contar historias con impacto real.

Me encantaría conversar 15 minutos para mostrarte cómo podríamos aportar a lo que están haciendo. ¿Te acomoda esta o la próxima semana?

Un abrazo,
Arturo Erlwein
HUAU — Productora Audiovisual
arturo@huau.cl`;
  }

  if (d.emailType === "followup") {
    return `Asunto: Re: Una idea para ${d.company}

Hola ${firstName},

Te escribí hace unos días con una idea para ${d.company} y quería saber si tuviste chance de verlo.

Entiendo que los tiempos son ajustados, así que te lo resumo: en HUAU producimos contenido audiovisual que realmente mueve la aguja — ${hook}.

¿Tienes 15 minutos esta semana para una llamada rápida? Prometo que vale la pena.

Saludos,
Arturo Erlwein
HUAU — Productora Audiovisual
arturo@huau.cl`;
  }

  // soft_close
  return `Asunto: Último intento — ${d.company} + HUAU

Hola ${firstName},

Te he escrito un par de veces y entiendo que quizás no es el momento o no es prioridad — y está perfecto.

Solo quería dejarte la puerta abierta: si en algún momento ${d.company} necesita producción audiovisual de nivel (${hook}), estaremos felices de conversar.

Te dejo mi contacto por si en el futuro te sirve.

¡Mucho éxito!
Arturo Erlwein
HUAU — Productora Audiovisual
arturo@huau.cl`;
}

export default function PitchGenerator({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState<FormData>({ contactName: "", company: "", industry: "", emailType: "presentation", referredBy: "" });
  const [result, setResult] = useState<string | null>(null);

  const update = (key: keyof FormData, value: string) => setForm(f => ({ ...f, [key]: value }));

  const generate = () => {
    if (!form.contactName || !form.company || !form.industry) {
      toast.error("Completa nombre, empresa e industria");
      return;
    }
    setResult(generatePitch(form));
  };

  const copy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result).then(() => toast.success("📋 Copiado al portapapeles")).catch(() => toast.error("No se pudo copiar"));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">Pitch Generator</h2>
          <p className="text-sm text-muted-foreground">Genera correos de prospección personalizados</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nombre del contacto *</label>
              <Input className="mt-1" placeholder="Ej: María González" value={form.contactName} onChange={e => update("contactName", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Empresa *</label>
              <Input className="mt-1" placeholder="Ej: Falabella" value={form.company} onChange={e => update("company", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Industria *</label>
              <Select value={form.industry} onValueChange={v => update("industry", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tipo de email *</label>
              <Select value={form.emailType} onValueChange={v => update("emailType", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{EMAIL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Referido por (opcional)</label>
              <Input className="mt-1" placeholder="Ej: Juan Pérez" value={form.referredBy} onChange={e => update("referredBy", e.target.value)} />
            </div>
          </div>
          <Button onClick={generate} className="w-full">Generar Pitch</Button>
        </div>

        {/* Preview */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Preview</h3>
            {result && (
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={copy}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar</Button>
                <Button variant="ghost" size="sm" onClick={() => setResult(null)}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Limpiar</Button>
              </div>
            )}
          </div>
          {result ? (
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/50 p-4 text-sm leading-relaxed font-sans">{result}</pre>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border h-64">
              <p className="text-sm text-muted-foreground">Completa el formulario y presiona "Generar Pitch"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
