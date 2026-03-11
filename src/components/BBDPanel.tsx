import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Trash2, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import * as XLSX from "xlsx";

interface Base {
  id: string;
  name: string;
  raw_count: number;
  clean_count: number;
  crossed: boolean;
  crossed_at: string | null;
  created_at: string;
}

interface BBDPanelProps {
  onSelectBase: (baseId: string, baseName: string, crossed: boolean) => void;
}

const BBDPanel = ({ onSelectBase }: BBDPanelProps) => {
  const [bases, setBases] = useState<Base[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const fetchBases = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bases")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error cargando bases");
    } else {
      setBases((data as Base[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBases();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("contacts").delete().eq("base_id", id);
    const { error } = await supabase.from("bases").delete().eq("id", id);
    if (error) {
      toast.error("Error eliminando base");
    } else {
      setBases((prev) => prev.filter((b) => b.id !== id));
      toast.success("Base eliminada");
    }
  };

  const handleDownload = async (base: Base, type: "clean" | "crossed", e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(base.id);
    try {
      const { data, error } = await supabase
        .from("contacts")
        .select("nombre, apellido, apellido2, empresa, web, mail1, mail2, mail3, mail4")
        .eq("base_id", base.id);

      if (error || !data) {
        toast.error("Error descargando contactos");
        return;
      }

      const { extractCompanyFromDomain } = await import("@/lib/companyName");
      let rows;
      if (type === "crossed") {
        rows = data.map((c) => {
          const web = (c.web || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
          const domain = (c.mail1 || "").split("@")[1] || "";
          return {
            NOMBRE: c.nombre,
            APELLIDO: c.apellido,
            APELLIDO2: c.apellido2,
            EMPRESA: extractCompanyFromDomain(web || domain),
            WEB: c.web,
            MAIL1: c.mail1,
          };
        });
      } else {
        rows = data.map((c) => ({
          NOMBRE: c.nombre,
          APELLIDO: c.apellido,
          APELLIDO2: c.apellido2,
          EMPRESA: c.empresa,
          WEB: c.web,
          MAIL1: c.mail1,
          MAIL2: c.mail2,
          MAIL3: c.mail3,
          MAIL4: c.mail4,
        }));
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contactos");
      const suffix = type === "crossed" ? "_cruzada" : "_limpia";
      XLSX.writeFile(wb, `${base.name}${suffix}.xlsx`);
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold">BBD — Bases de Datos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tus bases subidas. Pincha una para verla o cruzarla.
        </p>
      </div>

      {bases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <p className="font-semibold">Sin bases aún</p>
          <p className="text-sm text-muted-foreground mt-1">
            Sube un CSV desde la pantalla principal para empezar.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {bases.map((base) => (
            <div
              key={base.id}
              onClick={() => onSelectBase(base.id, base.name, base.crossed)}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-5 py-4 cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
            >
              <div className="flex items-center gap-4">
                {base.crossed ? (
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                )}
                <div>
                  <p className="font-display font-semibold">{base.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {base.clean_count} contactos
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(base.created_at), "d MMM yyyy", { locale: es })}
                    </span>
                    {base.crossed && (
                      <>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs font-medium text-primary">✓ Cruzada</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => handleDownload(base, "clean", e)}
                  disabled={exporting === base.id}
                  className="text-xs"
                >
                  {exporting === base.id ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3.5 w-3.5" />
                  )}
                  Limpia
                </Button>
                {base.crossed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handleDownload(base, "crossed", e)}
                    disabled={exporting === base.id}
                    className="text-xs"
                  >
                    {exporting === base.id ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1 h-3.5 w-3.5" />
                    )}
                    Cruzada
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) => handleDelete(base.id, e)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BBDPanel;
