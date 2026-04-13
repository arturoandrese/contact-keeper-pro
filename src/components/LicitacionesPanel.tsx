import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw, Loader2, ExternalLink, Search, Gavel } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

interface Licitacion {
  codigo: string;
  nombre: string;
  organismo: string;
  fecha_cierre: string;
  fecha_publicacion: string;
  monto: string;
  url: string;
  keyword: string;
}

export default function LicitacionesPanel({ onBack }: { onBack: () => void }) {
  const [licitaciones, setLicitaciones] = useState<Licitacion[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalScanned, setTotalScanned] = useState(0);
  const [filter, setFilter] = useState("");
  const [savedCodes, setSavedCodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadSaved();
    fetchLicitaciones();
  }, []);

  const loadSaved = async () => {
    const { data } = await supabase.from("licitaciones").select("codigo");
    if (data) setSavedCodes(new Set(data.map((d) => d.codigo || "")));
  };

  const fetchLicitaciones = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-licitaciones", {
        body: {},
      });

      if (error) throw error;

      setLicitaciones(data.licitaciones || []);
      setTotalScanned(data.total || 0);

      if ((data.licitaciones || []).length > 0) {
        toast.success(`🎯 ${data.matched} licitaciones encontradas de ${data.total} activas`);
      } else {
        toast.info("No se encontraron licitaciones audiovisuales activas hoy");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error consultando licitaciones");
    }
    setLoading(false);
  };

  const saveLicitacion = async (lic: Licitacion) => {
    const { error } = await supabase.from("licitaciones").upsert(
      {
        codigo: lic.codigo,
        nombre: lic.nombre,
        organismo: lic.organismo,
        fecha_cierre: lic.fecha_cierre,
        fecha_publicacion: lic.fecha_publicacion,
        monto: lic.monto,
        url: lic.url,
        keyword: lic.keyword,
      },
      { onConflict: "codigo" }
    );
    if (error) {
      // If upsert by codigo fails (no unique constraint), try insert
      await supabase.from("licitaciones").insert({
        codigo: lic.codigo,
        nombre: lic.nombre,
        organismo: lic.organismo,
        fecha_cierre: lic.fecha_cierre,
        fecha_publicacion: lic.fecha_publicacion,
        monto: lic.monto,
        url: lic.url,
        keyword: lic.keyword,
      });
    }
    setSavedCodes((prev) => new Set([...prev, lic.codigo]));
    toast.success("Licitación guardada");
  };

  const filtered = licitaciones.filter((lic) => {
    if (!filter) return true;
    const search = filter.toLowerCase();
    return (
      lic.nombre.toLowerCase().includes(search) ||
      lic.organismo.toLowerCase().includes(search) ||
      lic.keyword.toLowerCase().includes(search)
    );
  });

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-display text-2xl font-bold flex items-center gap-2">
              <Gavel className="h-6 w-6 text-primary" />
              Licitaciones ChileCompra
            </h2>
            <p className="text-sm text-muted-foreground">
              Buscando: audiovisual, video, producción, fotografía...
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalScanned > 0 && (
            <span className="text-xs text-muted-foreground">
              {filtered.length} de {totalScanned} activas
            </span>
          )}
          <Button size="sm" variant="outline" onClick={fetchLicitaciones} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Actualizar
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Filtrar por nombre, organismo o keyword..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Gavel className="mx-auto h-12 w-12 mb-4 opacity-30" />
          <p>No se encontraron licitaciones audiovisuales activas</p>
          <p className="text-xs mt-1">Intenta actualizar más tarde</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lic, i) => (
            <div
              key={lic.codigo || i}
              className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">
                      {lic.keyword}
                    </span>
                    {lic.codigo && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {lic.codigo}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 font-semibold text-sm leading-snug line-clamp-2">
                    {lic.nombre}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">{lic.organismo}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    {lic.fecha_cierre && (
                      <span>
                        Cierre: <strong className="text-foreground">{formatDate(lic.fecha_cierre)}</strong>
                      </span>
                    )}
                    {lic.monto && lic.monto !== "No especificado" && (
                      <span>
                        Monto: <strong className="text-foreground">${Number(lic.monto).toLocaleString("es-CL")}</strong>
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {lic.url && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={lic.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-1 h-3 w-3" />
                        Ver
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={savedCodes.has(lic.codigo) ? "secondary" : "default"}
                    onClick={() => saveLicitacion(lic)}
                    disabled={savedCodes.has(lic.codigo)}
                  >
                    {savedCodes.has(lic.codigo) ? "Guardada" : "Guardar"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
