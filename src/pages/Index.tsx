import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { parseAndClean, type CleanedContact, type DomainPatternEntry, FREE_EMAIL_DOMAINS, removeAccents } from "@/lib/contactCleaner";
import { supabase } from "@/integrations/supabase/client";
import FileUploader from "@/components/FileUploader";
import ContactTable from "@/components/ContactTable";
import SaveBaseDialog from "@/components/SaveBaseDialog";
import BBDPanel from "@/components/BBDPanel";
import CompanyPatternsPanel from "@/components/CompanyPatternsPanel";
import CrossReferencePanel from "@/components/CrossReferencePanel";
import BasePreviewPanel from "@/components/BasePreviewPanel";
import UploadFilterDialog, { type UploadFilters } from "@/components/UploadFilterDialog";
import SegmentsPanel from "@/components/SegmentsPanel";
import { Button } from "@/components/ui/button";
import { Download, Database, Building2, Sun, Moon, RefreshCw, ClipboardCopy, Layers } from "lucide-react";
import { toast } from "sonner";
import ccpLogo from "@/assets/ccp-logo.jpg";

type View = "upload" | "bbd" | "patterns" | "crossref" | "preview" | "segments";

const Index = () => {
  const [contacts, setContacts] = useState<CleanedContact[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [view, setView] = useState<View>("upload");
  const [saveOpen, setSaveOpen] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [pendingContent, setPendingContent] = useState<string | null>(null);
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
    // Store content and show filter dialog
    setPendingContent(content);
    setFilterDialogOpen(true);
  };

  const processFileWithFilters = async (filters: UploadFilters) => {
    setFilterDialogOpen(false);
    const content = pendingContent;
    if (!content) return;
    setPendingContent(null);

    const lines = content.split("\n").filter((l) => l.trim()).length - 1;
    setRawCount(Math.max(lines, 0));

    // Load saved domain patterns to prioritize known working emails
    let savedPatterns: DomainPatternEntry[] = [];
    try {
      const { data } = await supabase
        .from("domain_patterns")
        .select("domain, pattern, example_email");
      if (data) savedPatterns = data as DomainPatternEntry[];
    } catch (err) {
      console.warn("No se pudieron cargar patrones de dominio:", err);
    }

    // Learn patterns from replied_contacts (verified working emails)
    try {
      const { data: repliedData } = await supabase
        .from("replied_contacts")
        .select("email, nombre, apellido");
      if (repliedData && repliedData.length > 0) {
        const domainPatterns = new Map<string, { pattern: string; count: number }>();
        for (const r of repliedData) {
          if (!r.email || !r.nombre || !r.apellido) continue;
          const emailLower = r.email.toLowerCase();
          const domain = emailLower.split("@")[1];
          if (!domain || FREE_EMAIL_DOMAINS.has(domain)) continue;
          const local = emailLower.split("@")[0];
          const nombre = removeAccents(r.nombre.toLowerCase().split(/\s+/)[0] || "");
          const apellido = removeAccents(r.apellido.toLowerCase().split(/\s+/)[0] || "");
          if (!nombre || !apellido) continue;
          const initial = nombre.charAt(0);
          let detectedPattern = "";
          if (local === `${nombre}.${apellido}`) detectedPattern = "first.last";
          else if (local === `${initial}${apellido}`) detectedPattern = "initial_last";
          else if (local === `${nombre}${apellido}`) detectedPattern = "first_last";
          else if (local === `${apellido}.${nombre}`) detectedPattern = "last.first";
          else if (local === nombre) detectedPattern = "first";
          if (detectedPattern && !savedPatterns.find(p => p.domain === domain)) {
            const existing = domainPatterns.get(domain);
            if (!existing || existing.count < 1) {
              domainPatterns.set(domain, { pattern: detectedPattern, count: (existing?.count || 0) + 1 });
            }
          }
        }
        for (const [domain, { pattern }] of domainPatterns) {
          savedPatterns.push({ domain, pattern, example_email: "" });
        }
        if (domainPatterns.size > 0) {
          toast.info(`📧 ${domainPatterns.size} patrones aprendidos de contactos respondidos`);
        }
      }
    } catch (err) {
      console.warn("No se pudieron cargar replied_contacts para patrones:", err);
    }

    const cleaned = parseAndClean(content, savedPatterns);
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

    // Filter out bounced emails from blacklist
    try {
      const allMailsForBounce = new Set<string>();
      for (const c of cleaned) {
        [c.MAIL1, c.MAIL2, c.MAIL3, c.MAIL4].forEach(m => {
          if (m) allMailsForBounce.add(m.toLowerCase());
        });
      }

      const mailArrayBounce = Array.from(allMailsForBounce);
      const bouncedSet = new Set<string>();

      for (let i = 0; i < mailArrayBounce.length; i += 300) {
        const chunk = mailArrayBounce.slice(i, i + 300);
        const { data } = await supabase
          .from("bounced_emails")
          .select("email")
          .in("email", chunk);
        if (data) data.forEach(r => bouncedSet.add((r.email || "").toLowerCase()));
      }

      if (bouncedSet.size > 0) {
        let removedMails = 0;
        const contactsToRemove: number[] = [];

        for (let idx = 0; idx < cleaned.length; idx++) {
          const c = cleaned[idx];
          const mails = [c.MAIL1, c.MAIL2, c.MAIL3, c.MAIL4];
          const validMails = mails.filter(m => m && !bouncedSet.has(m.toLowerCase()));

          if (validMails.length === 0) {
            contactsToRemove.push(idx);
            continue;
          }

          const bouncedCount = mails.filter(m => m && bouncedSet.has(m.toLowerCase())).length;
          removedMails += bouncedCount;

          c.MAIL1 = validMails[0] || "";
          c.MAIL2 = validMails[1] || "";
          c.MAIL3 = validMails[2] || "";
          c.MAIL4 = validMails[3] || "";
        }

        for (let i = contactsToRemove.length - 1; i >= 0; i--) {
          cleaned.splice(contactsToRemove[i], 1);
        }

        if (contactsToRemove.length > 0 || removedMails > 0) {
          toast.warning(
            `🚫 Blacklist: ${contactsToRemove.length} contactos eliminados, ${removedMails} mails rebotados removidos`
          );
        }
      }
    } catch (err) {
      console.warn("No se pudo cruzar con bounced_emails:", err);
    }

    // Filter by recently contacted (delivered_contacts)
    if (filters.filterSent) {
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - filters.sentDays);
        const cutoffISO = cutoff.toISOString();

        const allMails = new Set<string>();
        for (const c of cleaned) {
          [c.MAIL1, c.MAIL2, c.MAIL3, c.MAIL4].forEach(m => {
            if (m) allMails.add(m.toLowerCase());
          });
        }

        const recentlyContactedSet = new Set<string>();
        const mailArray = Array.from(allMails);
        for (let i = 0; i < mailArray.length; i += 300) {
          const chunk = mailArray.slice(i, i + 300);
          const { data } = await supabase
            .from("delivered_contacts")
            .select("mail")
            .in("mail", chunk)
            .gte("last_contacted_at", cutoffISO);
          if (data) data.forEach(r => recentlyContactedSet.add((r.mail || "").toLowerCase()));
        }

        if (recentlyContactedSet.size > 0) {
          const before = cleaned.length;
          let idx = cleaned.length - 1;
          while (idx >= 0) {
            const c = cleaned[idx];
            const mails = [c.MAIL1, c.MAIL2, c.MAIL3, c.MAIL4].filter(Boolean);
            if (mails.some(m => recentlyContactedSet.has(m.toLowerCase()))) {
              cleaned.splice(idx, 1);
            }
            idx--;
          }
          const removed = before - cleaned.length;
          if (removed > 0) {
            toast.info(`📬 ${removed} contactos excluidos (contactados en últimos ${filters.sentDays} días)`);
          }
        }
      } catch (err) {
        console.warn("No se pudo filtrar por contactados recientes:", err);
      }
    }

    // Filter by recently replied
    if (filters.filterReplied) {
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - filters.repliedDays);
        const cutoffISO = cutoff.toISOString().slice(0, 10);

        const allMails = new Set<string>();
        for (const c of cleaned) {
          [c.MAIL1, c.MAIL2, c.MAIL3, c.MAIL4].forEach(m => {
            if (m) allMails.add(m.toLowerCase());
          });
        }

        const repliedSet = new Set<string>();
        const mailArray = Array.from(allMails);
        for (let i = 0; i < mailArray.length; i += 300) {
          const chunk = mailArray.slice(i, i + 300);
          const { data } = await supabase
            .from("replied_contacts")
            .select("email")
            .in("email", chunk)
            .gte("fecha_respuesta", cutoffISO);
          if (data) data.forEach(r => repliedSet.add((r.email || "").toLowerCase()));
        }

        if (repliedSet.size > 0) {
          const before = cleaned.length;
          let idx = cleaned.length - 1;
          while (idx >= 0) {
            const c = cleaned[idx];
            const mails = [c.MAIL1, c.MAIL2, c.MAIL3, c.MAIL4].filter(Boolean);
            if (mails.some(m => repliedSet.has(m.toLowerCase()))) {
              cleaned.splice(idx, 1);
            }
            idx--;
          }
          const removed = before - cleaned.length;
          if (removed > 0) {
            toast.info(`💬 ${removed} contactos excluidos (respondieron en últimos ${filters.repliedDays} días)`);
          }
        }
      } catch (err) {
        console.warn("No se pudo filtrar por respondidos:", err);
      }
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
            <Button
              variant={view === "segments" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("segments")}
            >
              <Layers className="mr-1.5 h-3.5 w-3.5" />
              Segmentos
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
                  <Button size="sm" variant="outline" onClick={() => {
                    const headers = ["NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA", "WEB", "MAIL1", "MAIL2", "MAIL3", "MAIL4"];
                    const rows = contacts.map(c => [c.NOMBRE, c.APELLIDO, c.APELLIDO2, c.EMPRESA, c.WEB, c.MAIL1, c.MAIL2, c.MAIL3, c.MAIL4].join("\t"));
                    const tsv = [headers.join("\t"), ...rows].join("\n");
                    navigator.clipboard.writeText(tsv).then(() => {
                      toast.success("📋 Copiado. Pega en Google Sheets (Ctrl+V)");
                    }).catch(() => toast.error("No se pudo copiar"));
                  }}>
                    <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
                    Copiar para Sheets
                  </Button>
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

        {view === "segments" && (
          <SegmentsPanel onBack={() => setView("upload")} />
        )}
      </main>

      <UploadFilterDialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen} onConfirm={processFileWithFilters} />
      <SaveBaseDialog open={saveOpen} onOpenChange={setSaveOpen} onSave={handleSave} />
    </div>
  );
};

export default Index;
