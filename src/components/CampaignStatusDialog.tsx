import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { fetchSheetTabs, fetchSheetReport } from "@/lib/googleSheets";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import ExportDropdown from "./ExportDropdown";

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
  apellido: string;
  apellido2: string;
  empresa: string;
  web: string;
  mail1: string;
  mail2: string;
  mail3: string;
  mail4: string;
  status: string;
  tab: string;
}

function pick(c: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (c[k] != null && String(c[k]).trim()) return String(c[k]).trim();
  }
  return "";
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
            const nombre = pick(c, ["NOMBRE", "Nombre", "nombre", "First Name", "first_name"]);
            const apellido = pick(c, ["APELLIDO", "Apellido", "apellido", "Last Name", "last_name"]);
            const apellido2 = pick(c, ["APELLIDO2", "Apellido2", "apellido2", "Second Last Name"]);
            const empresa = pick(c, ["EMPRESA", "Empresa", "empresa", "Company", "company", "company_name"]);
            const web = pick(c, ["WEB", "Web", "web", "Website", "website", "company_website"]);
            const mail1 = pick(c, ["MAIL1", "Mail1", "mail1"]) || email;
            const mail2 = pick(c, ["MAIL2", "Mail2", "mail2"]);
            const mail3 = pick(c, ["MAIL3", "Mail3", "mail3"]);
            const mail4 = pick(c, ["MAIL4", "Mail4", "mail4"]);
            rows.push({
              email, nombre, apellido, apellido2, empresa, web,
              mail1, mail2, mail3, mail4,
              status: c._status, tab: tabs[idx].title,
            });
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

  const buildExport = () => contacts.map(c => ({
    NOMBRE: c.nombre,
    APELLIDO: c.apellido,
    APELLIDO2: c.apellido2,
    EMPRESA: c.empresa,
    WEB: c.web,
    MAIL1: c.mail1,
    MAIL2: c.mail2,
    MAIL3: c.mail3,
    MAIL4: c.mail4,
    ESTADO: c.status,
    PESTAÑA: c.tab,
  }));

  const EXPORT_HEADERS = ["NOMBRE","APELLIDO","APELLIDO2","EMPRESA","WEB","MAIL1","MAIL2","MAIL3","MAIL4","ESTADO","PESTAÑA"];

  const handleDownload = () => {
    if (contacts.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(buildExport());
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
              <ExportDropdown
                label={STATUS_LABELS[category]}
                disabled={contacts.length === 0}
                onDownload={handleDownload}
                getData={() => ({
                  headers: ["Email", "Nombre", "Estado", "Pestaña"],
                  rows: contacts.map(c => [c.email, c.nombre, c.status, c.tab]),
                })}
              />
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
