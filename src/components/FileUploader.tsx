import { useCallback, useState } from "react";
import { Upload, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";

interface FileUploaderProps {
  onFileLoaded: (content: string) => void;
}

function validateCsvColumns(content: string): string | null {
  const firstLine = content.split("\n")[0] || "";
  const headers = firstLine.split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
  
  const hasEmail = headers.some(h => 
    h.includes("email") || h.includes("mail") || h.includes("correo")
  );
  const hasName = headers.some(h =>
    h.includes("nombre") || h.includes("name") || h.includes("first")
  );
  const hasWeb = headers.some(h =>
    h.includes("web") || h.includes("sitio") || h.includes("url") || h.includes("website")
  );

  if (!hasEmail && !(hasName && hasWeb)) {
    return `No se encontraron columnas suficientes. Columnas detectadas: ${headers.slice(0, 8).join(", ")}. Se necesita email/mail/correo, o bien nombre + web/sitio web.`;
  }

  return null;
}

const FileUploader = ({ onFileLoaded }: FileUploaderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      setError(null);
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "csv" || ext === "txt") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          const validationError = validateCsvColumns(content);
          if (validationError) {
            setError(validationError);
            return;
          }
          onFileLoaded(content);
        };
        reader.readAsText(file);
      } else if (ext === "xlsx" || ext === "xls") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(firstSheet);
          const validationError = validateCsvColumns(csv);
          if (validationError) {
            setError(validationError);
            return;
          }
          onFileLoaded(csv);
        };
        reader.readAsArrayBuffer(file);
      }
    },
    [onFileLoaded]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300 ${
          isDragging
            ? "border-primary bg-primary/5 scale-[1.02]"
            : "border-border hover:border-primary/50 hover:bg-muted/50"
        }`}
      >
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) processFile(file);
          }}
        />
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Upload className="h-7 w-7 text-primary" />
          </div>
          {fileName && !error ? (
            <div>
              <p className="text-lg font-semibold text-foreground">{fileName}</p>
              <p className="text-sm text-muted-foreground">Archivo cargado — arrastra otro para reemplazar</p>
            </div>
          ) : (
            <div>
              <p className="text-lg font-semibold text-foreground">Arrastra tu CSV o Excel aquí</p>
              <p className="text-sm text-muted-foreground">Formatos: .csv, .xlsx, .xls</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Archivo inválido</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
