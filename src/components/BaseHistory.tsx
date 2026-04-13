import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Database, Trash2, ArrowRight, Loader2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Base {
  id: string;
  name: string;
  raw_count: number;
  clean_count: number;
  created_at: string;
  sheet_id: string | null;
  crossed: boolean | null;
}

interface BaseHistoryProps {
  onSelectBase: (baseId: string, baseName: string) => void;
  refreshKey?: number;
}

const BaseHistory = ({ onSelectBase, refreshKey }: BaseHistoryProps) => {
  const [bases, setBases] = useState<Base[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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

  const handleDeleteClick = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    setDeleteTarget(null);
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
            <div className="flex items-center gap-2">
              <p className="font-display font-semibold truncate">{base.name}</p>
              {base.sheet_id && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        base.crossed
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-primary/10 text-primary"
                      }`}>
                        <FileSpreadsheet className="h-3 w-3" />
                        CCP
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Vinculada a Google Sheet — {base.crossed ? "cruzada ✅" : "pendiente de cruce"}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
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
              onClick={(e) => handleDeleteClick(base.id, base.name, e)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      ))}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta base?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar <strong>"{deleteTarget?.name}"</strong>. Esta acción no se puede deshacer y se perderán todos los contactos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BaseHistory;
