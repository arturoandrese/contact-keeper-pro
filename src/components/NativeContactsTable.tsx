import { useState } from "react";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NATIVE_HEADERS } from "@/lib/nativeBaseExport";
import ProtectContactButton from "@/components/autosend/ProtectContactDialog";

export interface NativeContact {
  id?: string;
  nombre: string | null; apellido: string | null; apellido2: string | null; empresa: string | null; web: string | null;
  mail1: string | null; mail2: string | null; mail3: string | null; mail4: string | null;
}

interface Props {
  contacts: NativeContact[];
  /** Show every row (e.g. while searching) instead of the first 20. */
  expanded?: boolean;
  /** Omit for read-only mode (no "Acción" column). */
  onDelete?: (c: NativeContact) => void;
  deletingId?: string | null;
}

const FIELDS = ["nombre", "apellido", "apellido2", "empresa", "web", "mail1", "mail2", "mail3", "mail4"] as const;
const INITIAL = 20;

/** The native "Mis bases" contacts table, shared by Mis bases and Agentes. */
const NativeContactsTable = ({ contacts, expanded, onDelete, deletingId }: Props) => {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll || expanded ? contacts : contacts.slice(0, INITIAL);
  const th = "whitespace-nowrap px-4 py-3 text-left font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="native-contacts-table">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="whitespace-nowrap px-3 py-3 text-center font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground w-[40px]">#</th>
              {NATIVE_HEADERS.map((col) => <th key={col} className={th}>{col}</th>)}
              {onDelete && <th className="px-3 py-3 text-center font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground w-[90px]">Acción</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((c, i) => (
              <tr key={c.id ?? i} className="border-b border-border/50 transition-colors hover:bg-muted/30">
                <td className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-xs text-muted-foreground/50">{i + 1}</td>
                {FIELDS.map((f) => (
                  <td key={f} className={`whitespace-nowrap px-4 py-2.5 font-mono text-xs ${f === "web" ? "text-muted-foreground" : f === "mail1" ? "font-medium text-primary" : ""}`}>
                    {c[f] || "—"}
                  </td>
                ))}
                {onDelete && (
                  <td className="whitespace-nowrap px-3 py-2.5 text-center">
                    <ProtectContactButton size="icon" prefill={{ nombre: c.nombre ?? "", apellidos: [c.apellido, c.apellido2].filter(Boolean).join(" "), empresa: c.empresa ?? "", correos: [c.mail1, c.mail2, c.mail3, c.mail4].filter(Boolean) as string[] }} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Eliminar contacto"
                      disabled={deletingId === c.id} onClick={() => onDelete(c)}>
                      {deletingId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!showAll && !expanded && contacts.length > INITIAL && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 text-center">
          <Button variant="ghost" size="sm" className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setShowAll(true)}>
            <ChevronDown className="mr-1.5 h-4 w-4" />Ver más ({contacts.length - INITIAL} contactos restantes)
          </Button>
        </div>
      )}
    </div>
  );
};

export default NativeContactsTable;
