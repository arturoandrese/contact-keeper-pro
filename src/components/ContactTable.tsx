import { useState } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CleanedContact } from "@/lib/contactCleaner";

interface ContactTableProps {
  contacts: CleanedContact[];
}

const columns: (keyof CleanedContact)[] = [
  "NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA", "WEB",
  "MAIL1", "MAIL2", "MAIL3", "MAIL4",
];

const INITIAL_VISIBLE = 20;

const ContactTable = ({ contacts }: ContactTableProps) => {
  const [showAll, setShowAll] = useState(false);

  if (contacts.length === 0) return null;

  const visibleContacts = showAll ? contacts : contacts.slice(0, INITIAL_VISIBLE);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60">
              <th className="whitespace-nowrap px-3 py-3 text-center font-mono-custom text-xs font-semibold uppercase tracking-wider text-muted-foreground w-[40px]">#</th>
              {columns.map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap px-4 py-3 text-left font-mono-custom text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleContacts.map((contact, i) => (
              <tr
                key={i}
                className="border-b border-border/50 transition-colors hover:bg-muted/30"
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-center font-mono text-xs text-muted-foreground/50">{i + 1}</td>
                {columns.map((col) => (
                  <td
                    key={col}
                    className="max-w-[200px] truncate whitespace-nowrap px-4 py-2.5 font-mono-custom text-xs"
                  >
                    {col === "MAIL1" && contact.confirmedPattern ? (
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{contact[col]}</span>
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                      </span>
                    ) : (
                      contact[col] || (
                        <span className="text-muted-foreground/40">—</span>
                      )
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!showAll && contacts.length > INITIAL_VISIBLE && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 text-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowAll(true)}
          >
            <ChevronDown className="mr-1.5 h-4 w-4" />
            Ver más ({contacts.length - INITIAL_VISIBLE} contactos restantes)
          </Button>
        </div>
      )}
      {showAll && contacts.length > INITIAL_VISIBLE && (
        <div className="border-t border-border bg-muted/30 px-4 py-2 text-center text-xs text-muted-foreground">
          Mostrando {contacts.length} contactos
        </div>
      )}
    </div>
  );
};

export default ContactTable;
