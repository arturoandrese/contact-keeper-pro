import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Shield, Clock, MessageSquareReply, Building2, Copy } from "lucide-react";

export interface UploadFilters {
  filterSent: boolean;
  sentDays: number;
  filterReplied: boolean;
  repliedDays: number;
  learnFromDelivered: boolean;
  filterDuplicates: boolean;
}

interface UploadFilterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (filters: UploadFilters) => void;
}

const UploadFilterDialog = ({ open, onOpenChange, onConfirm }: UploadFilterDialogProps) => {
  const [filterSent, setFilterSent] = useState(true);
  const [sentDays, setSentDays] = useState(15);
  const [filterReplied, setFilterReplied] = useState(true);
  const [repliedDays, setRepliedDays] = useState(15);
  const [learnFromDelivered, setLearnFromDelivered] = useState(true);
  const [filterDuplicates, setFilterDuplicates] = useState(true);

  const handleConfirm = () => {
    onConfirm({ filterSent, sentDays, filterReplied, repliedDays, learnFromDelivered, filterDuplicates });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Filtros de protección
          </DialogTitle>
          <DialogDescription>
            Excluye contactos para proteger tu reputación de envío
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Learn patterns from delivered */}
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              id="learn-delivered"
              checked={learnFromDelivered}
              onCheckedChange={(v) => setLearnFromDelivered(!!v)}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-1">
              <Label htmlFor="learn-delivered" className="flex items-center gap-2 cursor-pointer">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Aprender emails de empresas conocidas
              </Label>
              <p className="text-xs text-muted-foreground">
                Usa el historial de entregas para encontrar patrones de email validados por dominio
              </p>
            </div>
          </div>

          {/* Filter duplicates across bases */}
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              id="filter-duplicates"
              checked={filterDuplicates}
              onCheckedChange={(v) => setFilterDuplicates(!!v)}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-1">
              <Label htmlFor="filter-duplicates" className="flex items-center gap-2 cursor-pointer">
                <Copy className="h-4 w-4 text-muted-foreground" />
                Excluir duplicados entre bases
              </Label>
              <p className="text-xs text-muted-foreground">
                Detecta contactos que ya existen en otras bases guardadas
              </p>
            </div>
          </div>

          {/* Filter by sent emails */}
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              id="filter-sent"
              checked={filterSent}
              onCheckedChange={(v) => setFilterSent(!!v)}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-2">
              <Label htmlFor="filter-sent" className="flex items-center gap-2 cursor-pointer">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Excluir personas ya contactadas
              </Label>
              <p className="text-xs text-muted-foreground">
                Sacar de la base a personas a las que ya les enviaste mail recientemente
              </p>
              {filterSent && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Últimos</span>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={sentDays}
                    onChange={(e) => setSentDays(Number(e.target.value) || 15)}
                    className="w-20 h-8 text-sm text-center"
                  />
                  <span className="text-xs text-muted-foreground">días</span>
                </div>
              )}
            </div>
          </div>

          {/* Filter by replied contacts */}
          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              id="filter-replied"
              checked={filterReplied}
              onCheckedChange={(v) => setFilterReplied(!!v)}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-2">
              <Label htmlFor="filter-replied" className="flex items-center gap-2 cursor-pointer">
                <MessageSquareReply className="h-4 w-4 text-muted-foreground" />
                Excluir personas que han respondido
              </Label>
              <p className="text-xs text-muted-foreground">
                Sacar de la base a personas que te han contestado mails recientemente
              </p>
              {filterReplied && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Últimos</span>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={repliedDays}
                    onChange={(e) => setRepliedDays(Number(e.target.value) || 15)}
                    className="w-20 h-8 text-sm text-center"
                  />
                  <span className="text-xs text-muted-foreground">días</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onConfirm({ filterSent: false, sentDays: 15, filterReplied: false, repliedDays: 15, learnFromDelivered: false, filterDuplicates: false })}>
            Sin filtros
          </Button>
          <Button onClick={handleConfirm}>
            <Shield className="mr-1.5 h-3.5 w-3.5" />
            Aplicar filtros y limpiar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UploadFilterDialog;
