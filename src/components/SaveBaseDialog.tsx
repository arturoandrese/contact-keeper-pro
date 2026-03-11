import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";

interface SaveBaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<void>;
  defaultName?: string;
}

function getDatePrefix(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = String(now.getFullYear()).slice(-2);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${d}-${m}-${y}_${hh}-${mm}_`;
}

const SaveBaseDialog = ({ open, onOpenChange, onSave, defaultName }: SaveBaseDialogProps) => {
  const prefix = getDatePrefix();
  const [suffix, setSuffix] = useState(defaultName || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSuffix(defaultName || "");
    }
  }, [open, defaultName]);

  const fullName = `${prefix}${suffix}`;

  const handleSave = async () => {
    if (!suffix.trim()) return;
    setSaving(true);
    await onSave(fullName.trim());
    setSaving(false);
    setSuffix("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Guardar base</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="base-name">Nombre de la base</Label>
          <div className="flex items-center gap-0">
            <span className="inline-flex items-center rounded-l-md border border-r-0 border-border bg-muted px-3 py-2 text-sm text-muted-foreground font-mono">
              {prefix}
            </span>
            <Input
              id="base-name"
              className="rounded-l-none"
              placeholder="Nombre descriptivo"
              value={suffix}
              onChange={(e) => setSuffix(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">Se guardará como: <span className="font-mono font-medium text-foreground">{fullName || prefix + "..."}</span></p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!suffix.trim() || saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveBaseDialog;
