import type { CleanedContact } from "@/lib/contactCleaner";

interface ContactTableProps {
  contacts: CleanedContact[];
}

const columns: (keyof CleanedContact)[] = [
  "NOMBRE", "APELLIDO", "APELLIDO2", "EMPRESA", "WEB",
  "MAIL1", "MAIL2", "MAIL3", "MAIL4",
];

const ContactTable = ({ contacts }: ContactTableProps) => {
  if (contacts.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/60">
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
            {contacts.slice(0, 100).map((contact, i) => (
              <tr
                key={i}
                className="border-b border-border/50 transition-colors hover:bg-muted/30"
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className="max-w-[200px] truncate whitespace-nowrap px-4 py-2.5 font-mono-custom text-xs"
                  >
                    {contact[col] || (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                ))}
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
  );
};

export default ContactTable;
