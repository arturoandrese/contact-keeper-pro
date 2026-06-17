import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
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
import DashboardPanel from "@/components/DashboardPanel";
import ProspectsCRM from "@/components/ProspectsCRM";
import LicitacionesPanel from "@/components/LicitacionesPanel";
import UnansweredEmailsAlert from "@/components/UnansweredEmailsAlert";
import ScheduledRemindersPanel from "@/components/ScheduledRemindersPanel";
import { APP_VERSION } from "@/generated/appVersion";

import CampaignPerformancePanel from "@/components/CampaignPerformancePanel";
import { Button } from "@/components/ui/button";
import { Download, Database, Building2, Sun, Moon, RefreshCw, ClipboardCopy, Layers, LayoutDashboard, Users, Gavel, BarChart3, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import ccpLogo from "@/assets/ccp-logo.jpg";

type View = "upload" | "bbd" | "patterns" | "crossref" | "preview" | "segments" | "dashboard" | "prospects" | "licitaciones" | "performance" | "reminders";

const Index = () => {
  const [contacts, setContacts] = useState<CleanedContact[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [view, setView] = useState<View>(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view");
    if (v && ["upload","bbd","patterns","crossref","preview","segments","dashboard","prospects","licitaciones","performance","reminders"].includes(v)) {
      // Clean the URL without reloading
      window.history.replaceState({}, "", window.location.pathname);
      return v as View;
    }
    return "upload";
  });
  const [saveOpen, setSaveOpen] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [pendingContent, setPendingContent] = useState<string | null>(null);
  const [selectedBase, setSelectedBase] = useState<{ id: string; name: string; crossed: boolean; sheetId?: string } | null>(null);
  const [reminderPrefill, setReminderPrefill] = useState<{ email: string; subject: string } | null>(null);
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
    let content = pendingContent;
    if (!content) return;
    setPendingContent(null);

    const lines = content.split("\n").filter((l) => l.trim()).length - 1;
    setRawCount(Math.max(lines, 0));

    // Enrich missing web from company name (using delivered_contacts cache + AI)
    try {
      const parsed = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true });
      const rows = parsed.data;
      const headers = parsed.meta.fields || [];
      const norm = (s: string) => removeAccents((s || "").toLowerCase()).replace(/[\s._\-()]/g, "");
      const webKey = headers.find(h => /^(web|website|sitio|url|sitioweb|webempresa|companywebsite)$/i.test(norm(h)));
      const companyKey = headers.find(h => /^(empresa|company|companyname|organizacion)$/i.test(norm(h)));
      const emailKey = headers.find(h => /^(mail|email|mail1|email1|correo|correo1)$/i.test(norm(h)));

      const isSocialOrEmpty = (w: string) => {
        const v = (w || "").trim().toLowerCase();
        if (!v) return true;
        return /linkedin\.com|facebook\.com|twitter\.com|instagram\.com|tiktok\.com/.test(v);
      };

      if (companyKey && !emailKey) {
        const needsEnrich: string[] = [];
        for (const r of rows) {
          const w = webKey ? (r[webKey] || "").trim() : "";
          const c = (r[companyKey] || "").trim();
          if (c && isSocialOrEmpty(w)) needsEnrich.push(c);
        }
        const unique = Array.from(new Set(needsEnrich));

        if (unique.length > 0) {
          const cache = new Map<string, string>();

          // 1) Try to resolve from delivered_contacts (company → domain we already use)
          try {
            const { data: delivered } = await supabase
              .from("delivered_contacts")
              .select("empresa, mail")
              .not("empresa", "is", null)
              .limit(5000);
            if (delivered) {
              const byCompany = new Map<string, string>();
              for (const d of delivered) {
                if (!d.empresa || !d.mail) continue;
                const dom = d.mail.split("@")[1]?.toLowerCase();
                if (!dom || FREE_EMAIL_DOMAINS.has(dom)) continue;
                const key = norm(d.empresa);
                if (!byCompany.has(key)) byCompany.set(key, dom);
              }
              for (const c of unique) {
                const hit = byCompany.get(norm(c));
                if (hit) cache.set(c, hit);
              }
            }
          } catch {}

          const remaining = unique.filter(c => !cache.has(c));
          let aiResolved = 0;

          if (remaining.length > 0) {
            toast.info(`🔎 Buscando dominios web de ${remaining.length} empresas con IA...`);
            try {
              const { data, error } = await supabase.functions.invoke("enrich-company-domains", {
                body: { companies: remaining },
              });
              if (error) throw error;
              const mapping = (data?.mapping || {}) as Record<string, string>;
              for (const [c, dom] of Object.entries(mapping)) {
                if (dom) { cache.set(c, dom); aiResolved++; }
              }
            } catch (err) {
              console.warn("enrich-company-domains failed", err);
              toast.error("No se pudieron enriquecer dominios con IA");
            }
          }

          if (cache.size > 0) {
            // Ensure Web column exists
            let targetWebKey = webKey;
            if (!targetWebKey) {
              targetWebKey = "Web";
              headers.push(targetWebKey);
            }
            let filled = 0;
            for (const r of rows) {
              const w = (r[targetWebKey] || "").trim();
              const c = (r[companyKey] || "").trim();
              // Sobrescribimos cuando el Web actual es social/vacío y tenemos dominio real
              if (c && isSocialOrEmpty(w) && cache.has(c)) {
                r[targetWebKey] = cache.get(c)!;
                filled++;
              }
            }
            content = Papa.unparse(rows, { columns: headers });
            toast.success(`✅ ${filled} dominios completados (${cache.size - aiResolved} desde histórico, ${aiResolved} vía IA)`);
          }
        }
      }

    } catch (err) {
      console.warn("Enriquecimiento de dominios falló:", err);
    }


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

    // Learn patterns from delivered_contacts by domain (if enabled)
    if (filters.learnFromDelivered) {
      try {
        const knownDomains = new Set(savedPatterns.map(p => p.domain));
        const { data: deliveredData } = await supabase
          .from("delivered_contacts")
          .select("mail, nombre, apellido")
          .not("nombre", "is", null)
          .not("apellido", "is", null)
          .limit(5000);
        if (deliveredData && deliveredData.length > 0) {
          const domainPatterns = new Map<string, { pattern: string; count: number; example: string }>();
          for (const r of deliveredData) {
            if (!r.mail || !r.nombre || !r.apellido) continue;
            const emailLower = r.mail.toLowerCase();
            const domain = emailLower.split("@")[1];
            if (!domain || FREE_EMAIL_DOMAINS.has(domain) || knownDomains.has(domain)) continue;
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
            if (detectedPattern) {
              const existing = domainPatterns.get(domain);
              if (!existing || existing.count < 1) {
                domainPatterns.set(domain, { pattern: detectedPattern, count: (existing?.count || 0) + 1, example: emailLower });
              }
            }
          }
          let learned = 0;
          for (const [domain, { pattern, example }] of domainPatterns) {
            savedPatterns.push({ domain, pattern, example_email: example });
            learned++;
          }
          if (learned > 0) {
            toast.info(`🏢 ${learned} patrones aprendidos del historial de entregas`);
          }
        }
      } catch (err) {
        console.warn("No se pudo aprender patrones de delivered_contacts:", err);
      }
    }

    // Load EVERY bounce in the system, grouped by domain (derived from the mail itself).
    // This guarantees any pattern that ever bounced for a domain is blocked across all uploads.
    let bouncedByDomain: Map<string, Set<string>> | undefined;
    try {
      const { loadAllBouncedByDomain } = await import("@/lib/bouncedIndex");
      bouncedByDomain = await loadAllBouncedByDomain();
      const totalBounced = Array.from(bouncedByDomain.values()).reduce((s, set) => s + set.size, 0);
      if (totalBounced > 0) {
        toast.info(`🚫 ${totalBounced} patrones rebotados en ${bouncedByDomain.size} dominios — evitando reuso`);
      }
    } catch (err) {
      console.warn("No se pudo cargar bounced_emails:", err);
    }

    const cleaned = parseAndClean(content, savedPatterns, bouncedByDomain);
    const initialCount = cleaned.length;
    const funnel: string[] = [`📥 ${initialCount} generados`];
    if (cleaned.length === 0) {
      setContacts([]);
      setSaveOpen(false);
      toast.error("No se detectaron correos corporativos válidos (MAIL1/email1)");
      return;
    }

    // Flatten all bounced mails so "recent send" filter can ignore bounces.
    // If a contact's only recent "delivery" was actually a bounce, we WANT to
    // retry that contact with a new pattern — so it must not be filtered out.
    const allBouncedMails = new Set<string>();
    if (bouncedByDomain) {
      for (const [dom, locals] of bouncedByDomain) {
        for (const l of locals) allBouncedMails.add(`${l}@${dom}`);
      }
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
          const currentMail1 = (c.MAIL1 || "").toLowerCase();
          if (!verifiedSet.has(currentMail1) || allBouncedMails.has(currentMail1)) {
            const verifiedMail = mails.find(m => {
              const normalized = m.toLowerCase();
              return verifiedSet.has(normalized) && !allBouncedMails.has(normalized);
            });
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
          .select("mail")
          .in("mail", chunk);
        if (data) data.forEach(r => bouncedSet.add((r.mail || "").toLowerCase()));
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
          if (data) data.forEach(r => {
            const m = (r.mail || "").toLowerCase();
            // IMPORTANT: if a "recent send" actually bounced, do NOT treat it as
            // "already contacted" — we want to retry that contact with a new pattern.
            if (m && !allBouncedMails.has(m)) recentlyContactedSet.add(m);
          });
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
            funnel.push(`📬 -${removed} contactados ≤${filters.sentDays}d`);
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
            funnel.push(`💬 -${removed} respondidos ≤${filters.repliedDays}d`);
            toast.info(`💬 ${removed} contactos excluidos (respondieron en últimos ${filters.repliedDays} días)`);
          }
        }
      } catch (err) {
        console.warn("No se pudo filtrar por respondidos:", err);
      }
    }

    // Filter duplicates across saved bases
    if (filters.filterDuplicates) {
      try {
        const allMails = new Set<string>();
        for (const c of cleaned) {
          if (c.MAIL1) allMails.add(c.MAIL1.toLowerCase());
        }

        const existingMailsSet = new Set<string>();
        const mailArray = Array.from(allMails);
        for (let i = 0; i < mailArray.length; i += 300) {
          const chunk = mailArray.slice(i, i + 300);
          const { data } = await supabase
            .from("contacts")
            .select("mail1")
            .in("mail1", chunk);
          if (data) data.forEach(r => {
            if (r.mail1) existingMailsSet.add(r.mail1.toLowerCase());
          });
        }

        if (existingMailsSet.size > 0) {
          const before = cleaned.length;
          let idx = cleaned.length - 1;
          while (idx >= 0) {
            const c = cleaned[idx];
            if (c.MAIL1 && existingMailsSet.has(c.MAIL1.toLowerCase())) {
              cleaned.splice(idx, 1);
            }
            idx--;
          }
          const removed = before - cleaned.length;
          if (removed > 0) {
            funnel.push(`🔄 -${removed} duplicados en bases`);
            toast.info(`🔄 ${removed} contactos excluidos (ya existen en otras bases)`);
          }
        }
      } catch (err) {
        console.warn("No se pudo filtrar duplicados entre bases:", err);
      }
    }

    funnel.push(`✅ ${cleaned.length} finales`);
    console.log("Embudo de limpieza:", funnel.join(" → "));
    if (initialCount > cleaned.length) {
      toast.success(`Embudo: ${funnel.join(" → ")}`, { duration: 8000 });
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
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex cursor-pointer items-center gap-3" onClick={() => setView("upload")}>
            <img src={ccpLogo} alt="CCP" className="h-10 w-10 rounded-xl object-cover shadow-md" />
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">CCP</h1>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">{APP_VERSION}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
            <Button
              variant={view === "dashboard" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("dashboard")}
            >
              <LayoutDashboard className="mr-1.5 h-3.5 w-3.5" />
              Dashboard
            </Button>
            <Button
              variant={view === "prospects" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("prospects")}
            >
              <Users className="mr-1.5 h-3.5 w-3.5" />
              CRM
            </Button>
            <Button
              variant={view === "performance" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("performance")}
            >
              <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
              Rendimiento
            </Button>
            <Button
              variant={view === "licitaciones" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("licitaciones")}
            >
              <Gavel className="mr-1.5 h-3.5 w-3.5" />
              Licitaciones
            </Button>
            <Button
              variant={view === "reminders" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("reminders")}
            >
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              Agenda
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10 space-y-6">
        <UnansweredEmailsAlert onSchedule={(email, subject) => {
          setReminderPrefill({ email, subject });
          setView("reminders");
        }} />
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

        {view === "dashboard" && (
          <DashboardPanel onBack={() => setView("upload")} />
        )}

        {view === "prospects" && (
          <ProspectsCRM onBack={() => setView("upload")} />
        )}

        {view === "licitaciones" && (
          <LicitacionesPanel onBack={() => setView("upload")} />
        )}

        {view === "performance" && (
          <CampaignPerformancePanel onBack={() => setView("upload")} />
        )}

        {view === "reminders" && (
          <ScheduledRemindersPanel
            onBack={() => setView("upload")}
            prefill={reminderPrefill}
            onClearPrefill={() => setReminderPrefill(null)}
          />
        )}
      </main>

      <UploadFilterDialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen} onConfirm={processFileWithFilters} />
      <SaveBaseDialog open={saveOpen} onOpenChange={setSaveOpen} onSave={handleSave} />
    </div>
  );
};

export default Index;
