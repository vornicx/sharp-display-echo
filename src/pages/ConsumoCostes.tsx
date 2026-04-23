import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { fmtKg } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";

interface Coste {
  id: string;
  date: string;
  zona_id: string;
  tipo: string;
  cantidad: number;
  unidad: string | null;
  coste_unitario: number;
}

const ConsumoCostes = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<Coste[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = `${t("costs.consumption.title")} — ${t("app.name")}`;
  }, [t]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("costes_diarios")
      .select("id, date, zona_id, tipo, cantidad, unidad, coste_unitario")
      .order("date", { ascending: false })
      .limit(100);
    setRows((data ?? []) as Coste[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const addRow = async () => {
    if (!user) return;
    const { error } = await supabase.from("costes_diarios").insert({
      user_id: user.id,
      date: format(new Date(), "yyyy-MM-dd"),
      zona_id: "Z1",
      tipo: "Cera",
      cantidad: 0,
      unidad: "L",
      coste_unitario: 0,
    });
    if (error) toast.error(error.message);
    else load();
  };

  const update = async (id: string, patch: Partial<Coste>) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("costes_diarios").update(patch as any).eq("id", id);
    if (error) toast.error(error.message);
  };

  const remove = async (id: string) => {
    await supabase.from("costes_diarios").delete().eq("id", id);
    setRows(rows.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t("costs.consumption.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("costs.consumption.subtitle")}</p>
        </div>
        <Button onClick={addRow}>
          <Plus className="h-4 w-4 mr-2" />
          {t("costs.add.row")}
        </Button>
      </header>

      <Card className="p-4 shadow-card">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("costs.col.date")}</TableHead>
                  <TableHead>{t("costs.col.zone")}</TableHead>
                  <TableHead>{t("costs.col.type")}</TableHead>
                  <TableHead className="text-right">{t("costs.col.qty")}</TableHead>
                  <TableHead>{t("costs.col.unit")}</TableHead>
                  <TableHead className="text-right">{t("costs.col.unit_cost")}</TableHead>
                  <TableHead className="text-right">{t("costs.col.total")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Input type="date" value={r.date} onChange={(e) => update(r.id, { date: e.target.value })} className="w-[150px]" />
                    </TableCell>
                    <TableCell>
                      <Input value={r.zona_id} onChange={(e) => update(r.id, { zona_id: e.target.value })} className="w-[80px]" />
                    </TableCell>
                    <TableCell>
                      <Input value={r.tipo} onChange={(e) => update(r.id, { tipo: e.target.value })} className="w-[110px]" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        value={r.cantidad}
                        onChange={(e) => update(r.id, { cantidad: Number(e.target.value) || 0 })}
                        className="w-[100px] text-right font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Input value={r.unidad ?? ""} onChange={(e) => update(r.id, { unidad: e.target.value })} className="w-[70px]" />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        value={r.coste_unitario}
                        onChange={(e) => update(r.id, { coste_unitario: Number(e.target.value) || 0 })}
                        className="w-[100px] text-right font-mono"
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {(r.cantidad * r.coste_unitario).toFixed(2)} €
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ConsumoCostes;
