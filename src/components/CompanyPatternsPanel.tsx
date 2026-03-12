import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Building2, ChevronRight, Download, Loader2, Users, Filter, Trash2, Mail, Save } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface DeliveredContact {
  id: string;
  nombre: string;
  apellido: string;
  empresa: string;
  empresa_short: string;
  web: string;
  mail: string;
  status: string;
  times_contacted: number;
  last_contacted_at: string;
}

interface DomainPattern {
  domain: string;
  pattern: string;
  example_email: string;
}

interface CompanyPatternsPanelProps {
  onBack: () => void;
}

const STATUS_OPTIONS = ["TODOS", "CLICKEADO", "ABIERTO", "ENVIADO"] as const;
type StatusFilter = typeof STATUS_OPTIONS[number];

const PATTERN_OPTIONS = [
  { value: "first.last", label: "nombre.apellido", example: "juan.perez@" },
  { value: "initial_last", label: "ninicial+apellido", example: "jperez@" },
  { value: "first_last_initial", label: "nombre+ainicial", example: "juanp@" },
  { value: "first", label: "solo nombre", example: "juan@" },
  { value: "last.first", label: "apellido.nombre", example: "perez.juan@" },
  { value: "initial.last", label: "ninicial.apellido", example: "j.perez@" },
];

const statusColor: Record<string, string> = {
  CLICKEADO: "text-green-700 bg-green-100 border-green-300 dark:text-green-400 dark:bg-green-500/20 dark:border-green-500/30",
  ABIERTO: "text-cyan-700 bg-cyan-100 border-cyan-300 dark:text-cyan-400 dark:bg-cyan-500/20 dark:border-cyan-500/30",
  ENVIADO: "text-muted-foreground bg-muted/50 border-border",
};

const CompanyPatternsPanel = ({ onBack }: CompanyPatternsPanelProps) => {
  const [allContacts, setAllContacts] = useState<DeliveredContact[]>([]);
  const [companies, setCompanies] = useState<{ empresa_short: string; count: number; domain: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("TODOS");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "company" | "contact" | "bulk"; id?: string; name: string } | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  const [companyPatterns, setCompanyPatterns] = useState<DomainPattern[]>([]);
  const [editingPattern, setEditingPattern] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState("");
  const [exampleEmail, setExampleEmail] = useState("");
  const [savingPattern, setSavingPattern] = useState(false);

  useEffect(() => {
    fetchAllContacts();
  }, []);

  const fetchAllContacts = async () => {
    setLoading(true);
    let all: DeliveredContact[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("delivered_contacts")
        .select("id, nombre, apellido, empresa, empresa_short, web, mail, status, times_contacted, last_contacted_at")
        .range(from, from + PAGE - 1);

      if (error) {
        toast.error("Error cargando contactos");
        break;
      }
      all = all.concat((data as DeliveredContact[]) || []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }

    setAllContacts(all);
    buildCompanyList(all);
    setLoading(false);
  };

  const buildCompanyList = (contacts: DeliveredContact[]) => {
    const groups: Record<string, { count: number; domain: string }> = {};
    for (const row of contacts) {
      const emp = row.empresa_short?.trim() || "Sin empresa";
      if (!groups[emp]) {
        const emailDomain = row.mail?.split("@")[1] || "";
        groups[emp] = { count: 0, domain: emailDomain };
      }
      groups[emp].count++;
    }
    const sorted = Object.entries(groups)
      .map(([empresa_short, { count, domain }]) => ({ empresa_short, count, domain }))
      .sort((a, b) => b.count - a.count);
    setCompanies(sorted);
  };

  const fetchCompanyPatterns = async (domain: string) => {
    if (!domain) return;
    const { data } = await supabase
      .from("domain_patterns")
      .select("domain, pattern, example_email")
      .eq("domain", domain);
    setCompanyPatterns((data as DomainPattern[]) || []);
  };

  const handleSelectCompany = (empresa_short: string) => {
    setSelectedCompany(empresa_short);
    setStatusFilter("TODOS");
    setEditingPattern(false);
    const company = companies.find(c => c.empresa_short === empresa_short);
    if (company?.domain) {
      fetchCompanyPatterns(company.domain);
    }
  };

  const handleSavePattern = async () => {
    const company = companies.find(c => c.empresa_short === selectedCompany);
    if (!company?.domain) {
      toast.error("No se encontró dominio para esta empresa");
      return;
    }

    let pattern = selectedPattern;
    let example = exampleEmail.trim().toLowerCase();

    if (example && !pattern) {
      const contact = allContacts.find(c => (c.empresa_short?.trim() || "") === selectedCompany);
      if (contact) {
        const local = example.split("@")[0] || "";
        const n = contact.nombre.toLowerCase();
        const a = contact.apellido.toLowerCase();
        if (local === `${n}.${a}`) pattern = "first.last";
        else if (local === `${n[0]}${a}`) pattern = "initial_last";
        else if (local === `${a}.${n}`) pattern = "last.first";
        else if (local === `${n[0]}.${a}`) pattern = "initial.last";
        else if (local === `${n}`) pattern = "first";
      }
    }

    if (!pattern) {
      toast.error("Selecciona un patrón o escribe un email de ejemplo");
      return;
    }

    if (!example) {
      example = `ejemplo@${company.domain}`;
    }

    if (!example.includes("@")) {
      example = `${example}@${company.domain}`;
    }

    setSavingPattern(true);
    const { error } = await supabase
      .from("domain_patterns")
      .upsert(
        { domain: company.domain, pattern, example_email: example, confidence: 1 },
        { onConflict: "domain,pattern" }
      );

    if (error) {
      toast.error("Error guardando patrón");
    } else {
      toast.success(`Patrón "${pattern}" guardado para ${company.domain}`);
      fetchCompanyPatterns(company.domain);
      setEditingPattern(false);
      setSelectedPattern("");
      setExampleEmail("");
    }
    setSavingPattern(false);
  };

  const handleDeleteCompany = async (empresa_short: string) => {
    const ids = allContacts.filter((c) => (c.empresa_short?.trim() || "Sin empresa") === empresa_short).map((c) => c.id);
    for (let i = 0; i < ids.length; i += 500) {
      await supabase.from("delivered_contacts").delete().in("id", ids.slice(i, i + 500));
    }
    const updated = allContacts.filter((c) => (c.empresa_short?.trim() || "Sin empresa") !== empresa_short);
    setAllContacts(updated);
    buildCompanyList(updated);
    if (selectedCompany === empresa_short) setSelectedCompany(null);
    toast.success(`Empresa "${empresa_short}" eliminada`);
  };

  const handleDeleteContact = async (id: string) => {
    await supabase.from("delivered_contacts").delete().eq("id", id);
    const updated = allContacts.filter((c) => c.id !== id);
    setAllContacts(updated);
    buildCompanyList(updated);
    toast.success("Contacto eliminado");
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "bulk") {
      handleDeleteBulk();
    } else if (deleteTarget.type === "company") {
      handleDeleteCompany(deleteTarget.name);
    } else if (deleteTarget.id) {
      handleDeleteContact(deleteTarget.id);
    }
    setDeleteTarget(null);
  };

  const handleToggleCompany = (empresa_short: string) => {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(empresa_short)) next.delete(empresa_short);
      else next.add(empresa_short);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedCompanies.size === companies.length) {
      setSelectedCompanies(new Set());
    } else {
      setSelectedCompanies(new Set(companies.map((c) => c.empresa_short)));
    }
  };

  const handleDeleteBulk = async () => {
    const toDelete = Array.from(selectedCompanies);
    const ids = allContacts
      .filter((c) => toDelete.includes(c.empresa_short?.trim() || "Sin empresa"))
      .map((c) => c.id);

    for (let i = 0; i < ids.length; i += 500) {
      await supabase.from("delivered_contacts").delete().in("id", ids.slice(i, i + 500));
    }

    const updated = allContacts.filter((c) => !toDelete.includes(c.empresa_short?.trim() || "Sin empresa"));
    setAllContacts(updated);
    buildCompanyList(updated);
    setSelectedCompanies(new Set());
    setBulkMode(false);
    if (selectedCompany && toDelete.includes(selectedCompany)) setSelectedCompany(null);
    toast.success(`${toDelete.length} empresas eliminadas`);
  };

  const scopedContacts = selectedCompany
    ? allContacts.filter((c) => (c.empresa_short?.trim() || "Sin empresa") === selectedCompany)
    : allContacts;

  const filteredContacts = statusFilter === "TODOS"
    ? scopedContacts
    : scopedContacts.filter((c) => c.status === statusFilter);

  const statusCounts = scopedContacts.reduce((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleDownload = () => {
    const rows = filteredContacts.map((c) => ({
      NOMBRE: c.nombre,
      APELLIDO: c.apellido,
      EMPRESA: c.empresa_short,
      WEB: c.web,
      MAIL: c.mail,
      STATUS: c.status,
      VECES_CONTACTADO: c.times_contacted,
      ULTIMO_CONTACTO: c.last_contacted_at ? format(new Date(c.last_contacted_at), "dd/MM/yyyy", { locale: es }) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Contactos");
    const filename = selectedCompany ? `${selectedCompany}_contactos.xlsx` : "todas_empresas_contactos.xlsx";
    XLSX.writeFile(wb, filename);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const StatusFilterBar = () => (
    <div className="flex items-center gap-2 flex-wrap">
      <Filter className="h-3.5 w-3.5 text-muted-foreground" />
      {STATUS_OPTIONS.map((opt) => {
        const count = opt === "TODOS" ? scopedContacts.length : (statusCounts[opt] || 0);
        return (
          <button
            key={opt}
            onClick={() => setStatusFilter(opt)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              statusFilter === opt
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/30"
            }`}
          >
            {opt} ({count})
          </button>
        );
      })}
    </div>
  );

  const PatternEditor = () => {
    const company = companies.find(c => c.empresa_short === selectedCompany);
    const domain = company?.domain || "";

    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Patrón de email — {domain}</span>
        </div>

        {companyPatterns.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {companyPatterns.map((p, i) => {
              const label = PATTERN_OPTIONS.find(o => o.value === p.pattern)?.label || p.pattern;
              return (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
                  {label}
                  <span className="text-muted-foreground">({p.example_email})</span>
                </span>
              );
            })}
          </div>
        )}

        {!editingPattern ? (
          <Button size="sm" variant="outline" onClick={() => setEditingPattern(true)}>
            <Mail className="mr-1.5 h-3.5 w-3.5" />
            {companyPatterns.length > 0 ? "Cambiar patrón" : "Definir patrón"}
          </Button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Seleccionar patrón:</label>
              <div className="flex flex-wrap gap-1.5">
                {PATTERN_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedPattern(opt.value)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all ${
                      selectedPattern === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/50 text-muted-foreground hover:border-primary/30"
                    }`}
                  >
                    {opt.label}
                    <span className="ml-1 opacity-60">{opt.example}…</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                O escribe un email de ejemplo real:
              </label>
              <input
                type="text"
                value={exampleEmail}
                onChange={(e) => setExampleEmail(e.target.value)}
                placeholder={`ej: juan.perez@${domain}`}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={handleSavePattern} disabled={savingPattern || (!selectedPattern && !exampleEmail)}>
                {savingPattern ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingPattern(false); setSelectedPattern(""); setExampleEmail(""); }}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const ContactsTable = () => (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              {["NOMBRE", "APELLIDO", "EMPRESA", "WEB", "EMAIL", "STATUS", "VECES", "ÚLTIMO", ""].map((col) => (
                <th key={col} className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredContacts.slice(0, 500).map((c) => (
              <tr key={c.id} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.nombre || "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.apellido || "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.empresa_short || "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">{c.web || "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium text-primary">{c.mail || "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <span className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${statusColor[c.status] || "text-muted-foreground bg-muted"}`}>
                    {c.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-center">{c.times_contacted}</td>
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {c.last_contacted_at ? format(new Date(c.last_contacted_at), "d MMM yy", { locale: es }) : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <button
                    onClick={() => setDeleteTarget({ type: "contact", id: c.id, name: `${c.nombre} ${c.apellido}` })}
                    className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredContacts.length > 500 && (
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground text-center">
          Mostrando 500 de {filteredContacts.length} contactos. Descarga el Excel para ver todos.
        </div>
      )}
    </div>
  );

  if (selectedCompany) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedCompany(null); setStatusFilter("TODOS"); setEditingPattern(false); }} className="mb-2">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Volver a empresas
            </Button>
            <h2 className="font-display text-2xl font-bold">{selectedCompany}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {filteredContacts.length} contactos corporativos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleDownload} disabled={filteredContacts.length === 0}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Descargar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteTarget({ type: "company", name: selectedCompany })}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Eliminar empresa
            </Button>
          </div>
        </div>
        <PatternEditor />
        <StatusFilterBar />
        <ContactsTable />
        <DeleteDialog target={deleteTarget} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <h2 className="font-display text-2xl font-bold">Empresas</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {companies.length} empresas · {allContacts.length} contactos corporativos
          </p>
        </div>
        <div className="flex items-center gap-2">
          {bulkMode && selectedCompanies.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                setDeleteTarget({
                  type: "bulk",
                  name: `${selectedCompanies.size} empresas`,
                })
              }
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Eliminar ({selectedCompanies.size})
            </Button>
          )}
          <Button
            size="sm"
            variant={bulkMode ? "secondary" : "outline"}
            onClick={() => {
              setBulkMode(!bulkMode);
              if (bulkMode) setSelectedCompanies(new Set());
            }}
          >
            {bulkMode ? "Cancelar selección" : "Seleccionar"}
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={filteredContacts.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Descargar todo
          </Button>
        </div>
      </div>

      <StatusFilterBar />

      {bulkMode && companies.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/30 transition-colors"
          >
            <div
              className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                selectedCompanies.size === companies.length
                  ? "bg-primary border-primary text-primary-foreground"
                  : "border-muted-foreground/40"
              }`}
            >
              {selectedCompanies.size === companies.length && (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            {selectedCompanies.size === companies.length ? "Deseleccionar todas" : "Seleccionar todas"}
          </button>
        </div>
      )}

      {statusFilter !== "TODOS" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {filteredContacts.length} contactos con status "{statusFilter}" en todas las empresas
          </p>
          <ContactsTable />
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-semibold">Sin datos aún</p>
          <p className="text-sm text-muted-foreground mt-1">
            Cruza una base con un reporte de email para ver aquí los contactos confirmados.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {companies.map(({ empresa_short, count }) => (
            <div
              key={empresa_short}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 cursor-pointer transition-all hover:shadow-sm hover:border-primary/30"
            >
              <div className="flex items-center gap-3 flex-1" onClick={() => !bulkMode && handleSelectCompany(empresa_short)}>
                {bulkMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleCompany(empresa_short);
                    }}
                    className="flex-shrink-0"
                  >
                    <div
                      className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                        selectedCompanies.has(empresa_short)
                          ? "bg-primary border-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {selectedCompanies.has(empresa_short) && (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                )}
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <p className="font-display font-medium text-sm">{empresa_short}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {count}
                </div>
                {!bulkMode && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "company", name: empresa_short }); }}
                      className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <DeleteDialog target={deleteTarget} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
};

function DeleteDialog({ target, onConfirm, onCancel }: { target: { type: string; name: string } | null; onConfirm: () => void; onCancel: () => void }) {
  return (
    <AlertDialog open={!!target} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿Eliminar {target?.type === "bulk" ? target?.name : target?.type === "company" ? "empresa" : "contacto"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {target?.type === "bulk"
              ? `Se eliminarán todos los contactos de ${target?.name}. Esta acción no se puede deshacer.`
              : target?.type === "company"
              ? `Se eliminarán todos los contactos de "${target?.name}". Esta acción no se puede deshacer.`
              : `Se eliminará a "${target?.name}". Esta acción no se puede deshacer.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default CompanyPatternsPanel;
