import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { db, COMPANY_REASONS } from "@/lib/autosend";

export interface ProtectPrefill { nombre?: string; apellidos?: string; empresa?: string; cargo?: string; correos?: string[]; linkedin?: string }

/** Small "Proteger" button usable from CRM, BBD, Agentes and Mi correo. */
const ProtectContactButton = ({ prefill, size = "sm" }: { prefill: ProtectPrefill; size?: "sm" | "icon" }) => {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ nombre: "", apellidos: "", empresa: "", cargo: "", correos: "", linkedin: "", motivo: "Contacto gestionado personalmente" });
  const start = () => {
    setF({ nombre: prefill.nombre ?? "", apellidos: prefill.apellidos ?? "", empresa: prefill.empresa ?? "", cargo: prefill.cargo ?? "", correos: (prefill.correos ?? []).filter(Boolean).join(", "), linkedin: prefill.linkedin ?? "", motivo: "Contacto gestionado personalmente" });
    setOpen(true);
  };
  const save = async () => {
    if (!f.nombre.trim()) return toast.error("Falta el nombre");
    const correos = f.correos.split(/[,;\s]+/).map((c) => c.trim().toLowerCase()).filter((c) => c.includes("@"));
    const { error } = await db.from("protected_contacts").insert({ ...f, correos });
    if (error) return toast.error("No se pudo proteger: " + error.message);
    toast.success(`🛡️ ${f.nombre} quedó protegido`);
    setOpen(false);
  };
  return (
    <>
      <Button size={size} variant="ghost" title="Proteger contacto" onClick={(e) => { e.stopPropagation(); start(); }}>
        <ShieldCheck className="h-3.5 w-3.5" />{size === "sm" && <span className="ml-1">Proteger</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader><DialogTitle>Proteger contacto</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(["nombre", "apellidos", "empresa", "cargo", "linkedin"] as const).map((k) => (
              <Input key={k} placeholder={k[0].toUpperCase() + k.slice(1)} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            ))}
            <Input className="col-span-2" placeholder="Correos (separados por coma)" value={f.correos} onChange={(e) => setF({ ...f, correos: e.target.value })} />
            <div className="col-span-2">
              <Select value={f.motivo} onValueChange={(v) => setF({ ...f, motivo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COMPANY_REASONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={save}>Proteger</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
export default ProtectContactButton;
