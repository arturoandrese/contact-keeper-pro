import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Database, Trash2, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Base {
  id: string;
  name: string;
  raw_count: number;
  clean_count: number;
  created_at: string;
}

interface BaseHistoryProps {
  onSelectBase: (baseId: string, baseName: string) => void;
  refreshKey?: number;
}

const BaseHistory = ({ onSelectBase, refreshKey }: BaseHistoryProps) => {
  const [bases, setBases] = useState<Base[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBases = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("bases")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Error cargando historial");
    } else {
      setBases(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchBases();
  }, [refreshKey]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("bases").delete().eq("id", id);
    if (error) {
      toast.error("Error eliminando base");
    } else {
      toast.success("Base eliminada");
      fetchBases();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (bases.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
        <Database className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">
          Aún no tienes bases guardadas
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {bases.map((base) => (
        <div
          key={base.id}
          onClick={() => onSelectBase(base.id, base.name)}
          className="group flex cursor-pointer items-center justify-between rounded-xl border border-border bg-card px-5 py-4 transition-all hover:border-primary/30 hover:shadow-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="font-display font-semibold truncate">{base.name}</p>
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                {format(new Date(base.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
              </span>
              <span>•</span>
              <span>{base.clean_count} contactos</span>
              <span>•</span>
              <span>{base.raw_count - base.clean_count} eliminados</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100"
              onClick={(e) => handleDelete(base.id, e)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      ))}
    </div>
  );
};

export default BaseHistory;
