import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { fmtPct } from "@/lib/format";
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

interface Asis {
  id: string;
  date: string;
  zona_id: string;
  plantilla_total: number;
  presentes: number;
  ausentes: number;
}

const Asistencia = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [rows, setRows] = useState<Asis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = `${t("costs.attendance.title")} — ${t("app.name")}`;
  }, [t]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("asistencia_diaria")
      .select("id, date, zona_id, plantilla_total, presentes, ausentes")
      .order("date", { ascending: false })
      .limit(100);
    setRows((data ?? []) as Asis[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const addRow = async () => {
    if (!user) return;
    const { error } = await supabase.from("asistencia_diaria").insert({
      user_id: user.id,
      date: format(new Date(), "yyyy-MM-dd"),
      zona_id: "Z1",
      plantilla_total: 0,
      presentes: 0,
      ausentes: 0,
    });
    if (error) toast.error(error.message);
    else load();
  };

  const update = async (id: string, patch: Partial<Asis>) => {
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("asistencia_diaria").update(patch as any).eq("id", id);
    if (error) toast.error(error.message);
  };

  const remove = async (id: string) => {
    await supabase.from("asistencia_diaria").delete().eq("id", id);
    setRows(rows.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t("costs.attendance.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("costs.attendance.subtitle")}</p>
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
                  <TableHead className="text-right">{t("costs.col.staff")}</TableHead>
                  <TableHead className="text-right">{t("costs.col.present")}</TableHead>
                  <TableHead className="text-right">{t("costs.col.absent")}</TableHead>
                  <TableHead className="text-right">{t("costs.col.attendance_pct")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const pct = r.plantilla_total > 0 ? (r.presentes / r.plantilla_total) * 100 : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Input
                          type="date"
                          value={r.date}
                          onChange={(e) => update(r.id, { date: e.target.value })}
                          className="w-[150px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={r.zona_id}
                          onChange={(e) => update(r.id, { zona_id: e.target.value })}
                          className="w-[110px]"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={r.plantilla_total}
                          onChange={(e) => update(r.id, { plantilla_total: Number(e.target.value) || 0 })}
                          className="w-[90px] text-right font-mono"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={r.presentes}
                          onChange={(e) => update(r.id, { presentes: Number(e.target.value) || 0 })}
                          className="w-[90px] text-right font-mono"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={r.ausentes}
                          onChange={(e) => update(r.id, { ausentes: Number(e.target.value) || 0 })}
                          className="w-[90px] text-right font-mono"
                        />
                      </TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${pct < 90 ? "text-destructive" : "text-success"}`}>
                        {fmtPct(pct)}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Asistencia;
