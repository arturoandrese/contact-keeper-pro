import { useCallback, useState } from "react";
import { Upload } from "lucide-react";
import * as XLSX from "xlsx";

interface FileUploaderProps {
  onFileLoaded: (content: string) => void;
}

const FileUploader = ({ onFileLoaded }: FileUploaderProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const processFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      const ext = file.name.split(".").pop()?.toLowerCase();

      if (ext === "csv" || ext === "txt") {
        const reader = new FileReader();
        reader.onload = (e) => {
          onFileLoaded(e.target?.result as string);
        };
        reader.readAsText(file);
      } else if (ext === "xlsx" || ext === "xls") {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const csv = XLSX.utils.sheet_to_csv(firstSheet);
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
        {fileName ? (
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
  );
};

export default FileUploader;
