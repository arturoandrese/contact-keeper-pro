import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Brain, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface DomainPattern {
  id: string;
  domain: string;
  pattern: string;
  example_email: string;
  confidence: number;
  created_at: string;
}

interface DomainPatternsPanelProps {
  onBack: () => void;
}

const patternLabels: Record<string, string> = {
  "first": "nombre",
  "last": "apellido",
  "first.last": "nombre.apellido",
  "last.first": "apellido.nombre",
  "initial.last": "i.apellido",
  "initial_last": "inicialapellido",
  "initial_last_initial2": "inicialapellido+inicial2",
  "first_last": "nombreapellido",
  "first_last_underscore": "nombre_apellido",
  "first_initial": "nombreinicial",
  "first_last_initial": "nombreinicial",
};

const DomainPatternsPanel = ({ onBack }: DomainPatternsPanelProps) => {
  const [patterns, setPatterns] = useState<DomainPattern[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPatterns = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("domain_patterns")
      .select("*")
      .order("domain", { ascending: true });

    if (error) {
      toast.error("Error cargando patrones");
    } else {
      setPatterns(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPatterns();
  }, []);

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("domain_patterns").delete().eq("id", id);
    if (error) {
      toast.error("Error eliminando patrón");
    } else {
      setPatterns((prev) => prev.filter((p) => p.id !== id));
      toast.success("Patrón eliminado");
    }
  };

  const grouped = patterns.reduce<Record<string, DomainPattern[]>>((acc, p) => {
    if (!acc[p.domain]) acc[p.domain] = [];
    acc[p.domain].push(p);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          Volver
        </Button>
        <div className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          <h2 className="font-display text-2xl font-bold">Patrones aprendidos</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Formatos de email exitosos detectados por dominio. Se usan para priorizar el mail correcto en futuras limpiezas.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando…</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Brain className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-semibold">Sin patrones aún</p>
          <p className="text-sm text-muted-foreground mt-1">
            Los patrones se aprenden automáticamente al cruzar bases con reportes de email.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([domain, domainPatterns]) => (
            <div
              key={domain}
              className="rounded-xl border border-border bg-card overflow-hidden"
            >
              <div className="bg-muted/60 px-4 py-2.5 border-b border-border">
                <p className="font-mono text-sm font-semibold">@{domain}</p>
              </div>
              <div className="divide-y divide-border/50">
                {domainPatterns.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {patternLabels[p.pattern] || p.pattern}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        ej: {p.example_email}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground text-center pt-2">
            {patterns.length} patrón{patterns.length !== 1 ? "es" : ""} en {Object.keys(grouped).length} dominio{Object.keys(grouped).length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
};

export default DomainPatternsPanel;
