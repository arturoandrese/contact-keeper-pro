import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { parseAndClean, type CleanedContact } from "@/lib/contactCleaner";
import { supabase } from "@/integrations/supabase/client";
import FileUploader from "@/components/FileUploader";
import ContactTable from "@/components/ContactTable";
import SaveBaseDialog from "@/components/SaveBaseDialog";
import BBDPanel from "@/components/BBDPanel";
import CompanyPatternsPanel from "@/components/CompanyPatternsPanel";
import CrossReferencePanel from "@/components/CrossReferencePanel";
import BasePreviewPanel from "@/components/BasePreviewPanel";
import { Button } from "@/components/ui/button";
import { Download, Database, Building2, Sun, Moon, RefreshCw, ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import ccpLogo from "@/assets/ccp-logo.jpg";

type View = "upload" | "bbd" | "patterns" | "crossref" | "preview";

const Index = () => {
  const [contacts, setContacts] = useState<CleanedContact[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [view, setView] = useState<View>("upload");
  const [saveOpen, setSaveOpen] = useState(false);
  const [selectedBase, setSelectedBase] = useState<{ id: string; name: string; crossed: boolean; sheetId?: string } | null>(null);
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark";
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const handleFile = async (content: string) => {
    const lines = content.split("\n").filter((l) => l.trim()).length - 1;
    setRawCount(Math.max(lines, 0));

    const cleaned = parseAndClean(content);
    if (cleaned.length === 0) {
      setContacts([]);
      setSaveOpen(false);
      toast.error("No se detectaron correos corporativos válidos (MAIL1/email1)");
      return;
    }

    // Cross-reference with delivered_contacts to prioritize verified emails
    try {
      const allMails = new Set<string>();
      for (const c of cleaned) {
        [c.MAIL1, c.MAIL2, c.MAIL3, c.MAIL4].forEach(m => {
          if (m) allMails.add(m.toLowerCase());
        });
      }

      const mailArray = Array.from(allMails);
      const verifiedSet = new Set<string>();

      // Fetch in chunks of 300
      for (let i = 0; i < mailArray.length; i += 300) {
        const chunk = mailArray.slice(i, i + 300);
        const { data } = await supabase
          .from("delivered_contacts")
          .select("mail")
          .in("mail", chunk);
        if (data) data.forEach(r => verifiedSet.add((r.mail || "").toLowerCase()));
      }

      if (verifiedSet.size > 0) {
        let promoted = 0;
        for (const c of cleaned) {
          const mails = [c.MAIL1, c.MAIL2, c.MAIL3, c.MAIL4].filter(Boolean);
          // If MAIL1 is not verified but another one is, promote it
          if (!verifiedSet.has((c.MAIL1 || "").toLowerCase())) {
            const verifiedMail = mails.find(m => verifiedSet.has(m.toLowerCase()));
            if (verifiedMail) {
              const remaining = mails.filter(m => m.toLowerCase() !== verifiedMail.toLowerCase());
              c.MAIL1 = verifiedMail;
              c.MAIL2 = remaining[0] || "";
              c.MAIL3 = remaining[1] || "";
              c.MAIL4 = remaining[2] || "";
              promoted++;
            }
          }
        }
        if (promoted > 0) {
          toast.info(`✅ ${promoted} contactos con mail verificado promovido a MAIL1`);
        }
      }
    } catch (err) {
      console.warn("No se pudo cruzar con delivered_contacts:", err);
    }

    setContacts(cleaned);
    setSaveOpen(true);
  };

  const handleExport = (fmt: "xlsx" | "csv" = "xlsx") => {
    const ws = XLSX.utils.json_to_sheet(contacts);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contactos");
    if (fmt === "csv") {
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contactos_limpios.csv";
      a.click();
      URL.revokeObjectURL(url);
    } else {
      XLSX.writeFile(wb, "contactos_limpios.xlsx");
    }
  };

  const handleSave = async (name: string) => {
    const { data: base, error: baseError } = await supabase
      .from("bases")
      .insert({ name, raw_count: rawCount, clean_count: contacts.length })
      .select("id")
      .single();

    if (baseError || !base) {
      toast.error("Error guardando base");
      return;
    }

    const rows = contacts.map((c) => ({
      base_id: base.id,
      nombre: c.NOMBRE,
      apellido: c.APELLIDO,
      apellido2: c.APELLIDO2,
      empresa: c.EMPRESA,
      web: c.WEB,
      mail1: c.MAIL1,
      mail2: c.MAIL2,
      mail3: c.MAIL3,
      mail4: c.MAIL4,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const batch = rows.slice(i, i + 500);
      const { error } = await supabase.from("contacts").insert(batch);
      if (error) {
        toast.error("Error guardando contactos");
        return;
      }
    }

    toast.success("Base guardada exitosamente");
    setContacts([]);
    setRawCount(0);
    setView("bbd");
  };

  const handleSelectBase = async (baseId: string, baseName: string, crossed: boolean) => {
    // Fetch sheetId for the base
    let baseSheetId: string | undefined;
    try {
      const { data } = await supabase.from("bases").select("sheet_id").eq("id", baseId).single();
      if (data && (data as any).sheet_id) baseSheetId = (data as any).sheet_id;
    } catch {}
    setSelectedBase({ id: baseId, name: baseName, crossed, sheetId: baseSheetId });
    setView("preview");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView("upload")}>
            <img src={ccpLogo} alt="CCP" className="h-10 w-10 rounded-xl object-cover shadow-md" />
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">CCP</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Clean · Cross · Prospect</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => window.location.reload()}
              title="Actualizar app"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button
              variant={view === "bbd" || view === "preview" || view === "crossref" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("bbd")}
            >
              <Database className="mr-1.5 h-3.5 w-3.5" />
              BBD
            </Button>
            <Button
              variant={view === "patterns" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("patterns")}
            >
              <Building2 className="mr-1.5 h-3.5 w-3.5" />
              Empresas
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        {view === "upload" && (
          <div className="mx-auto max-w-xl space-y-8">
            <div className="text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight">Sube tu base de contactos</h2>
              <p className="mt-2 text-muted-foreground">Exporta desde SalesQL en CSV y nosotros la dejamos impecable</p>
            </div>
            <FileUploader onFileLoaded={handleFile} />
            {contacts.length > 0 && (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-4">
                  {[
                    { label: "Originales", value: rawCount },
                    { label: "Limpios", value: contacts.length },
                    { label: "Eliminados", value: rawCount - contacts.length },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-xl border border-border bg-card px-5 py-3">
                      <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                      <p className="font-display text-2xl font-bold">{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={() => handleExport("xlsx")}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Excel
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleExport("csv")}>
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    CSV
                  </Button>
                </div>
                <ContactTable contacts={contacts} />
              </div>
            )}
          </div>
        )}

        {view === "bbd" && <BBDPanel onSelectBase={handleSelectBase} />}

        {view === "patterns" && <CompanyPatternsPanel onBack={() => setView("upload")} />}

        {view === "preview" && selectedBase && (
          <BasePreviewPanel
            baseId={selectedBase.id}
            baseName={selectedBase.name}
            isCrossed={selectedBase.crossed}
            onBack={() => setView("bbd")}
            onCrossReference={() => setView("crossref")}
          />
        )}

        {view === "crossref" && selectedBase && (
          <CrossReferencePanel
            baseId={selectedBase.id}
            baseName={selectedBase.name}
            sheetId={selectedBase.sheetId}
            onBack={() => setView("preview")}
          />
        )}
      </main>

      <SaveBaseDialog open={saveOpen} onOpenChange={setSaveOpen} onSave={handleSave} />
    </div>
  );
};

export default Index;
