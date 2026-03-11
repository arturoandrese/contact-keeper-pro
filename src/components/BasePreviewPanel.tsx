import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, GitCompare, Link2, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import SheetReportPanel from "./SheetReportPanel";

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

function extractSheetId(input: string): string {
  const trimmed = input.trim();
  // Full URL: https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // Already just an ID
  return trimmed;
}

const BasePreviewPanel = ({ baseId, baseName, isCrossed, onBack, onCrossReference }: BasePreviewPanelProps) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetInput, setSheetInput] = useState("");
  const [savingSheet, setSavingSheet] = useState(false);
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [contactsRes, baseRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("nombre, apellido, apellido2, empresa, web, mail1, mail2, mail3, mail4")
          .eq("base_id", baseId)
          .limit(200),
        supabase
          .from("bases")
          .select("sheet_id")
          .eq("id", baseId)
          .single(),
      ]);

      if (contactsRes.error) {
        toast.error("Error cargando contactos");
      } else {
        setContacts((contactsRes.data as Contact[]) || []);
      }

      if (baseRes.data && (baseRes.data as any).sheet_id) {
        setSheetId((baseRes.data as any).sheet_id);
      }

      setLoading(false);
    };
    fetchData();
  }, [baseId]);

  const handleLinkSheet = async () => {
    const id = extractSheetId(sheetInput);
    if (!id) {
      toast.error("Pega un link válido de Google Sheets");
      return;
    }
    setSavingSheet(true);
    const { error } = await supabase
      .from("bases")
      .update({ sheet_id: id } as any)
      .eq("id", baseId);

    if (error) {
      toast.error("Error guardando Sheet ID. ¿Agregaste la columna sheet_id a la tabla bases?");
    } else {
      setSheetId(id);
      toast.success("Google Sheet vinculado correctamente");
    }
    setSavingSheet(false);
  };

  if (showReport && sheetId) {
    return (
      <SheetReportPanel
        baseId={baseId}
        baseName={baseName}
        sheetId={sheetId}
        onBack={() => setShowReport(false)}
      />
    );
  }

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
        <div className="flex items-center gap-2">
          {sheetId && (
            <Button size="sm" variant="default" onClick={() => setShowReport(true)}>
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
              Ver reporte en vivo
            </Button>
          )}
          {!isCrossed && (
            <Button size="sm" variant="outline" onClick={onCrossReference}>
              <GitCompare className="mr-1.5 h-3.5 w-3.5" />
              Cruzar con reporte
            </Button>
          )}
        </div>
      </div>

      {/* Sheet linking */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Google Sheet (YAMM)</h3>
        </div>
        {sheetId ? (
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-muted-foreground truncate flex-1">
              ID: {sheetId}
            </span>
            <Button size="sm" variant="ghost" onClick={() => { setSheetId(null); setSheetInput(""); }}>
              Cambiar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              placeholder="Pega el link de Google Sheets aquí..."
              value={sheetInput}
              onChange={(e) => setSheetInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLinkSheet()}
              className="text-sm"
            />
            <Button size="sm" onClick={handleLinkSheet} disabled={!sheetInput.trim() || savingSheet}>
              {savingSheet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Vincular"}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Vincula la hoja de YAMM para ver métricas de envío en tiempo real. La hoja debe ser pública o accesible con la API Key.
        </p>
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
