import { Download, ClipboardCopy, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

interface ExportDropdownProps {
  label: string;
  onDownload: () => void | Promise<void>;
  getData: () => { headers: string[]; rows: string[][] } | Promise<{ headers: string[]; rows: string[][] }>;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default";
}

const ExportDropdown = ({ label, onDownload, getData, disabled, variant = "outline", size = "sm" }: ExportDropdownProps) => {
  const handleCopy = async () => {
    try {
      const { headers, rows } = await getData();
      const tsv = [headers.join("\t"), ...rows.map(r => r.join("\t"))].join("\n");
      navigator.clipboard.writeText(tsv).then(() => {
        toast.success("📋 Copiado. Pega en Google Sheets (Ctrl+V)");
      }).catch(() => toast.error("No se pudo copiar"));
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} disabled={disabled}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          {label}
          <ChevronDown className="ml-1 h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onDownload}>
          <Download className="mr-2 h-3.5 w-3.5" />
          Descargar XLSX
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleCopy}>
          <ClipboardCopy className="mr-2 h-3.5 w-3.5" />
          Copiar para Sheets
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportDropdown;
