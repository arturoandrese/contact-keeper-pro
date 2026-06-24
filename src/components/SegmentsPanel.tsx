import { useState, useCallback, useRef, useEffect } from "react";
import { ArrowLeft, Users, MailOpen, Send, Clock, MessageSquareReply, Loader2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ExportDropdown from "@/components/ExportDropdown";
import * as XLSX from "xlsx";

interface SegmentsPanelProps {
  onBack: () => void;
}

interface SegmentContact {
  nombre: string;
  apellido: string;
  empresa: string;
  web: string;
  mail: string;
  status?: string;
  times_contacted?: number;
  last_contacted_at?: string;
}

type SegmentType = "opened_no_reply" | "delivered_no_open" | "most_contacted" | "replied_long_ago";

const SEGMENT_CONFIG: Record<SegmentType, { title: string; description: string; icon: typeof MailOpen; color: string }> = {
  opened_no_reply: {
    title: "Abrieron pero no respondieron",
    description: "Contactos que abrieron tu mail pero nunca respondieron — ideales para re-engagement",
    icon: MailOpen,
    color: "text-amber-500",
  },
  delivered_no_open: {
    title: "Entregados sin apertura",
    description: "Les llegó pero nunca abrieron — probar otro asunto u horario",
    icon: Send,
    color: "text-blue-500",
  },
  most_contacted: {
    title: "Más contactados sin respuesta",
    description: "Han recibido 2+ campañas sin responder — última oportunidad",
    icon: Users,
    color: "text-destructive",
  },
  replied_long_ago: {
    title: "Respondidos hace tiempo",
    description: "Respondieron hace más de X días — retomar conversación",
    icon: MessageSquareReply,
    color: "text-green-500",
  },
};

const SegmentsPanel = ({ onBack }: SegmentsPanelProps) => {
  const [loading, setLoading] = useState(false);
  const [activeSegment, setActiveSegment] = useState<SegmentType | null>(null);
  const [contacts, setContacts] = useState<SegmentContact[]>([]);
  const [daysFilter, setDaysFilter] = useState(30);
  const [minContacted, setMinContacted] = useState(2);

  const generateSegment = useCallback(async (type: SegmentType) => {
    setLoading(true);
    setActiveSegment(type);
    setContacts([]);

    try {
      if (type === "opened_no_reply") {
        // Fetch delivered with status ABIERTO or CLICKEADO
        const { data: delivered } = await supabase
          .from("delivered_contacts")
          .select("mail, nombre, apellido, empresa, web, status, times_contacted, last_contacted_at")
          .in("status", ["ABIERTO", "CLICKEADO"])
          .limit(5000);

        // Fetch replied emails
        const { data: replied } = await supabase
          .from("replied_contacts")
          .select("email")
          .limit(10000);

        const repliedSet = new Set((replied || []).map(r => (r.email || "").toLowerCase()));

        const filtered = (delivered || []).filter(d => !repliedSet.has((d.mail || "").toLowerCase()));
        setContacts(filtered.map(d => ({
          nombre: d.nombre || "",
          apellido: d.apellido || "",
          empresa: d.empresa || "",
          web: d.web || "",
          mail: d.mail || "",
          status: d.status || "",
          times_contacted: d.times_contacted || 1,
        })));

      } else if (type === "delivered_no_open") {
        const { data: delivered } = await supabase
          .from("delivered_contacts")
          .select("mail, nombre, apellido, empresa, web, status, times_contacted, last_contacted_at")
          .eq("status", "ENVIADO")
          .limit(5000);

        setContacts((delivered || []).map(d => ({
          nombre: d.nombre || "",
          apellido: d.apellido || "",
          empresa: d.empresa || "",
          web: d.web || "",
          mail: d.mail || "",
          status: d.status || "",
          times_contacted: d.times_contacted || 1,
        })));

      } else if (type === "most_contacted") {
        const { data: delivered } = await supabase
          .from("delivered_contacts")
          .select("mail, nombre, apellido, empresa, web, status, times_contacted, last_contacted_at")
          .gte("times_contacted", minContacted)
          .limit(5000);

        // Exclude replied
        const { data: replied } = await supabase
          .from("replied_contacts")
          .select("email")
          .limit(10000);

        const repliedSet = new Set((replied || []).map(r => (r.email || "").toLowerCase()));
        const filtered = (delivered || []).filter(d => !repliedSet.has((d.mail || "").toLowerCase()));

        setContacts(filtered.map(d => ({
          nombre: d.nombre || "",
          apellido: d.apellido || "",
          empresa: d.empresa || "",
          web: d.web || "",
          mail: d.mail || "",
          status: d.status || "",
          times_contacted: d.times_contacted || 1,
        })));

      } else if (type === "replied_long_ago") {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysFilter);
        const cutoffISO = cutoff.toISOString().slice(0, 10);

        const { data: replied } = await supabase
          .from("replied_contacts")
          .select("email, nombre, apellido, empresa, cargo, fecha_respuesta")
          .lte("fecha_respuesta", cutoffISO)
          .limit(5000);

        setContacts((replied || []).map(r => ({
          nombre: r.nombre || "",
          apellido: r.apellido || "",
          empresa: r.empresa || "",
          web: "",
          mail: r.email || "",
          status: "RESPONDIDO",
          last_contacted_at: r.fecha_respuesta || "",
        })));
      }

      toast.success("Segmento generado — desplázate abajo para descargarlo");
    } catch (err) {
      console.error(err);
      toast.error("Error generando segmento");
    }
    setLoading(false);
  }, [daysFilter, minContacted]);

  const exportSegment = useCallback(() => {
    if (contacts.length === 0) return;
    const exportData = contacts.map(c => ({
      NOMBRE: c.nombre,
      APELLIDO: c.apellido,
      EMPRESA: c.empresa,
      WEB: c.web,
      MAIL1: c.mail,
      STATUS: c.status || "",
      VECES_CONTACTADO: c.times_contacted || "",
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Segmento");
    const segName = activeSegment ? SEGMENT_CONFIG[activeSegment].title.slice(0, 20) : "segmento";
    XLSX.writeFile(wb, `segmento_${segName.replace(/\s+/g, "_").toLowerCase()}.xlsx`);
  }, [contacts, activeSegment]);

  const copyToClipboard = useCallback(() => {
    if (contacts.length === 0) return;
    const headers = ["NOMBRE", "APELLIDO", "EMPRESA", "WEB", "MAIL1"];
    const rows = contacts.map(c => [c.nombre, c.apellido, c.empresa, c.web, c.mail].join("\t"));
    const tsv = [headers.join("\t"), ...rows].join("\n");
    navigator.clipboard.writeText(tsv)
      .then(() => toast.success("📋 Copiado para Sheets"))
      .catch(() => toast.error("No se pudo copiar"));
  }, [contacts]);
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (contacts.length > 0 && !loading) {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [contacts, loading]);

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          Volver
        </Button>
        <h2 className="font-display text-2xl font-bold">Segmentos inteligentes</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Genera bases filtradas desde tu historial de campañas
        </p>
      </div>

      {/* Config filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Respondidos hace más de:</span>
          <Select value={String(daysFilter)} onValueChange={(v) => setDaysFilter(Number(v))}>
            <SelectTrigger className="w-24 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 días</SelectItem>
              <SelectItem value="30">30 días</SelectItem>
              <SelectItem value="60">60 días</SelectItem>
              <SelectItem value="90">90 días</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Mín. veces contactado:</span>
          <Select value={String(minContacted)} onValueChange={(v) => setMinContacted(Number(v))}>
            <SelectTrigger className="w-20 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2+</SelectItem>
              <SelectItem value="3">3+</SelectItem>
              <SelectItem value="5">5+</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Segment cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.entries(SEGMENT_CONFIG) as [SegmentType, typeof SEGMENT_CONFIG[SegmentType]][]).map(([type, config]) => {
          const Icon = config.icon;
          const isActive = activeSegment === type;
          return (
            <Card
              key={type}
              className={`cursor-pointer transition-all hover:shadow-md ${isActive ? "ring-2 ring-primary" : ""}`}
              onClick={() => !loading && generateSegment(type)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className={`h-5 w-5 ${config.color}`} />
                  {config.title}
                </CardTitle>
                <CardDescription className="text-xs">{config.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {isActive && !loading && contacts.length > 0 && (
                  <Badge variant="secondary">{contacts.length} contactos</Badge>
                )}
                {isActive && loading && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Results */}
      {contacts.length > 0 && !loading && (
        <div ref={resultsRef} className="space-y-4 scroll-mt-4 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <p className="font-display text-lg font-semibold">
              {contacts.length} contactos en segmento
            </p>
            <div className="flex gap-2">
              <ExportDropdown
                label="Exportar segmento"
                onDownload={exportSegment}
                getData={() => ({
                  headers: ["NOMBRE", "APELLIDO", "EMPRESA", "WEB", "MAIL1"],
                  rows: contacts.map(c => [c.nombre, c.apellido, c.empresa, c.web, c.mail]),
                })}
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/60">
                    {["NOMBRE", "APELLIDO", "EMPRESA", "MAIL", "STATUS", "VECES"].map((col) => (
                      <th key={col} className="whitespace-nowrap px-4 py-3 text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contacts.slice(0, 100).map((c, i) => (
                    <tr key={i} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.nombre}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.apellido}</td>
                      <td className="max-w-[150px] truncate whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.empresa}</td>
                      <td className="max-w-[200px] truncate whitespace-nowrap px-4 py-2.5 font-mono text-xs">{c.mail}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                        <Badge variant="outline" className="text-[10px]">{c.status || "—"}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-center">{c.times_contacted || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {contacts.length > 100 && (
              <div className="border-t border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
                Mostrando 100 de {contacts.length} contactos
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SegmentsPanel;
