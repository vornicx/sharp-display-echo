import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { exportToExcel, exportToPDF, ParteExportRow } from "@/lib/exportPartes";
import { format, subDays } from "date-fns";

interface Props {
  defaultFrom?: string;
  defaultTo?: string;
}

export const ExportPartesDialog = ({ defaultFrom, defaultTo }: Props) => {
  const today = format(new Date(), "yyyy-MM-dd");
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(defaultFrom ?? format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(defaultTo ?? today);
  const [loading, setLoading] = useState<"xlsx" | "pdf" | null>(null);

  const fetchRange = async (): Promise<ParteExportRow[]> => {
    const { data, error } = await supabase
      .from("partes_diarios")
      .select("id, date, estado, kg_mujeres_manual, kg_podrido_calibrador_manual, kg_reciclado_manual, kg_reciclado_malla_z1, kg_reciclado_malla_z2, kg_podrido_manual, kg_inventario_final, kg_palets_pendientes_anterior, notas_inventario, notas_generales, resumen_ia")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true });
    if (error) throw error;
    return (data ?? []) as ParteExportRow[];
  };

  const run = async (kind: "xlsx" | "pdf") => {
    if (from > to) {
      toast.error("La fecha 'desde' debe ser anterior a 'hasta'");
      return;
    }
    setLoading(kind);
    try {
      const rows = await fetchRange();
      if (!rows.length) {
        toast.error("No hay partes en el rango seleccionado");
        return;
      }
      if (kind === "xlsx") exportToExcel(rows, from, to);
      else exportToPDF(rows, from, to);
      toast.success(`Exportado ${rows.length} parte${rows.length > 1 ? "s" : ""}`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Error al exportar");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar partes diarios</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Selecciona el rango de fechas. Se incluirán todos los datos extraídos: producción, mermas, cascada, valores IA y notas.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="from">Desde</Label>
              <Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Hasta</Label>
              <Input id="to" type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              { label: "Hoy", days: 0 },
              { label: "7 días", days: 7 },
              { label: "30 días", days: 30 },
              { label: "90 días", days: 90 },
            ].map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTo(today);
                  setFrom(format(subDays(new Date(), p.days), "yyyy-MM-dd"));
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => run("pdf")} disabled={loading !== null} className="w-full sm:w-auto">
            {loading === "pdf" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            PDF
          </Button>
          <Button onClick={() => run("xlsx")} disabled={loading !== null} className="w-full sm:w-auto">
            {loading === "xlsx" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
            Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
