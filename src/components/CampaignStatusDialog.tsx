import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { fetchSheetTabs, fetchSheetReport } from "@/lib/googleSheets";
import * as XLSX from "xlsx";
import { toast } from "sonner";

type StatusCategory = "sent" | "opened" | "clicked" | "bounced" | "responded" | "notSent" | "delivered";

const STATUS_LABELS: Record<StatusCategory, string> = {
  sent: "Enviados",
  delivered: "Entregados",
  opened: "Abiertos",
  clicked: "Clickeados",
  bounced: "Rebotados",
  responded: "Respondidos",
  notSent: "No enviados",
};

const CATEGORY_STATUSES: Record<StatusCategory, string[]> = {
  sent: ["EMAIL_SENT", "MAIL_MERGE_COMPLETE"],
  delivered: ["EMAIL_DELIVERED"],
  opened: ["EMAIL_OPENED"],
  clicked: ["EMAIL_CLICKED"],
  bounced: ["EMAIL_BOUNCED"],
  responded: ["RESPONDED"],
  notSent: ["EMAIL_NOT_SENT", "UNKNOWN"],
};

interface CampaignStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sheetId: string;
  category: StatusCategory;
  baseName: string;
}

interface ContactRow {
  email: string;
  nombre: string;
  status: string;
  tab: string;
}

const CampaignStatusDialog = ({ open, onOpenChange, sheetId, category, baseName }: CampaignStatusDialogProps) => {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      try {
        const tabs = await fetchSheetTabs(sheetId);
        const allData = await Promise.all(tabs.map(t => fetchSheetReport(sheetId, t.title)));
        const validStatuses = new Set(CATEGORY_STATUSES[category]);
        const rows: ContactRow[] = [];
        const seen = new Set<string>();

        allData.forEach((sheet, idx) => {
          for (const c of sheet.contacts) {
            if (!validStatuses.has(c._status)) continue;
            const email = (c["Email Address"] || c["MAIL_CORREGIDO"] || c["MAIL1"] || c["email"] || "").trim().toLowerCase();
            if (!email || !email.includes("@") || seen.has(email)) continue;
            seen.add(email);
            const nombre = c["Nombre"] || c["NOMBRE"] || c["First Name"] || c["nombre"] || "";
            rows.push({ email, nombre, status: c._status, tab: tabs[idx].title });
          }
        });

        setContacts(rows);
      } catch (err) {
        console.error(err);
        toast.error("Error cargando contactos");
      }
      setLoading(false);
    };
    load();
  }, [open, sheetId, category]);

  const handleDownload = () => {
    if (contacts.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(contacts.map(c => ({
      Email: c.email,
      Nombre: c.nombre,
      Estado: c.status,
      Pestaña: c.tab,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, STATUS_LABELS[category]);
    XLSX.writeFile(wb, `${baseName}_${category}.xlsx`);
    toast.success(`${contacts.length} contactos descargados`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{STATUS_LABELS[category]} — {baseName}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{contacts.length} contactos únicos</p>
              <Button size="sm" onClick={handleDownload} disabled={contacts.length === 0}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Descargar XLSX
              </Button>
            </div>
            <div className="overflow-auto flex-1 rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/60">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">EMAIL</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">NOMBRE</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">PESTAÑA</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.slice(0, 500).map((c, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs">{c.email}</td>
                      <td className="px-4 py-2 text-xs">{c.nombre || "—"}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{c.tab}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {contacts.length > 500 && (
                <div className="text-center py-2 text-xs text-muted-foreground">
                  Mostrando 500 de {contacts.length} — descarga el XLSX para ver todos
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CampaignStatusDialog;
export type { StatusCategory };
