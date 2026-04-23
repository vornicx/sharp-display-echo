import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { UploadCloud, Trash2, FileText, Image as ImageIcon, Loader2 } from "lucide-react";

type ArchivoTipo = "GSTOCK" | "Produccion" | "BoxAzules" | "FotoLotes" | "Otro";

interface FileRow {
  id: string;
  file_name: string;
  file_path: string;
  file_type: ArchivoTipo;
  file_size: number | null;
  mime_type: string | null;
}

const MAX_SIZE = 20 * 1024 * 1024;

export const FilesUploader = ({ partId, initialType }: { partId: string; initialType?: ArchivoTipo }) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [files, setFiles] = useState<FileRow[]>([]);
  const [tipo, setTipo] = useState<ArchivoTipo>(initialType ?? "Produccion");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (initialType) setTipo(initialType);
  }, [initialType]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("partes_archivos")
      .select("id, file_name, file_path, file_type, file_size, mime_type")
      .eq("part_id", partId)
      .order("uploaded_at", { ascending: false });
    setFiles((data ?? []) as FileRow[]);
  }, [partId]);

  useEffect(() => {
    load();
  }, [load]);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      if (!user) return;
      setUploading(true);
      try {
        for (const file of accepted) {
          if (file.size > MAX_SIZE) {
            toast.error(`${file.name}: > 20 MB`);
            continue;
          }
          const path = `${user.id}/${partId}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, "_")}`;
          const { error: upErr } = await supabase.storage
            .from("partes-archivos")
            .upload(path, file, { contentType: file.type });
          if (upErr) {
            toast.error(`${file.name}: ${upErr.message}`);
            continue;
          }
          const { error: dbErr } = await supabase.from("partes_archivos").insert({
            part_id: partId,
            user_id: user.id,
            file_name: file.name,
            file_path: path,
            file_type: tipo,
            file_size: file.size,
            mime_type: file.type,
          });
          if (dbErr) toast.error(dbErr.message);
        }
        toast.success(t("common.success"));
        await load();
      } finally {
        setUploading(false);
      }
    },
    [partId, tipo, user, load, t]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: MAX_SIZE,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    },
  });

  const remove = async (f: FileRow) => {
    await supabase.storage.from("partes-archivos").remove([f.file_path]);
    await supabase.from("partes_archivos").delete().eq("id", f.id);
    toast.success(t("common.success"));
    await load();
  };

  const isImage = (f: FileRow) => (f.mime_type ?? "").startsWith("image/");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">{t("files.upload")}:</span>
        <Select value={tipo} onValueChange={(v) => setTipo(v as ArchivoTipo)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GSTOCK">{t("files.type.GSTOCK")}</SelectItem>
            <SelectItem value="Produccion">{t("files.type.Produccion")}</SelectItem>
            <SelectItem value="BoxAzules">{t("files.type.BoxAzules")}</SelectItem>
            <SelectItem value="FotoLotes">{t("files.type.FotoLotes")}</SelectItem>
            <SelectItem value="Otro">{t("files.type.Otro")}</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{t("files.size.max")}</span>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-primary bg-primary-soft" : "border-border hover:bg-muted/40"
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        ) : (
          <>
            <UploadCloud className="h-10 w-10 mx-auto text-muted-foreground/60" />
            <p className="mt-2 text-sm text-muted-foreground">{t("files.dropzone")}</p>
          </>
        )}
      </div>

      {files.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">{t("files.empty")}</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {files.map((f) => (
            <Card key={f.id} className="p-3 flex items-start gap-3">
              <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                {isImage(f) ? (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <FileText className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{f.file_name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {t(`files.type.${f.file_type}`)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {f.file_size ? `${Math.round(f.file_size / 1024)} KB` : ""}
                  </span>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(f)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
