import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, GitCompare } from "lucide-react";
import { toast } from "sonner";

interface Contact {
  nombre: string;
  apellido: string;
  apellido2: string;
  empresa: string;
  web: string;
  mail1: string;
  mail2: string;
  mail3: string;
  mail4: string;
}

interface BasePreviewPanelProps {
  baseId: string;
  baseName: string;
  isCrossed: boolean;
  onBack: () => void;
  onCrossReference: () => void;
}

const BasePreviewPanel = ({ baseId, baseName, isCrossed, onBack, onCrossReference }: BasePreviewPanelProps) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("contacts")
        .select("nombre, apellido, apellido2, empresa, web, mail1, mail2, mail3, mail4")
        .eq("base_id", baseId)
        .limit(200);

      if (error) {
        toast.error("Error cargando contactos");
      } else {
        setContacts((data as Contact[]) || []);
      }
      setLoading(false);
    };
    fetch();
  }, [baseId]);

  const columns = ["NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA", "WEB", "MAIL1", "MAIL2", "MAIL3", "MAIL4"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" />
            Volver a BBD
          </Button>
          <h2 className="font-display text-2xl font-bold">{baseName}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {contacts.length} contactos{isCrossed ? " — ✓ Cruzada" : ""}
          </p>
        </div>
        {!isCrossed && (
          <Button size="sm" onClick={onCrossReference}>
            <GitCompare className="mr-1.5 h-3.5 w-3.5" />
            Cruzar con reporte
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/60">
                  {columns.map((col) => (
                    <th key={col} className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.map((c, i) => (
                  <tr key={i} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.nombre || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.apellido || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.apellido2 || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.empresa || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.web || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium text-primary">{c.mail1 || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.mail2 || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.mail3 || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.mail4 || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {contacts.length >= 200 && (
            <div className="border-t border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
              Mostrando primeros 200 contactos
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BasePreviewPanel;
