import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { computeCascade } from "@/lib/cascade";
import { fmtKg, fmtPct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "sonner";
import { Plus, Eye, Loader2 } from "lucide-react";

interface Row {
  id: string;
  date: string;
  estado: string;
  kg_mujeres_manual: number;
  kg_podrido_calibrador_manual: number;
  kg_reciclado_manual: number;
  kg_reciclado_malla_z1: number;
  kg_reciclado_malla_z2: number;
  kg_podrido_manual: number;
  kg_inventario_final: number;
  resumen_ia: any;
}

const PartesList = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const dl = lang === "es" ? esLocale : enUS;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [estadoFilter, setEstadoFilter] = useState<string>("all");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    document.title = `${t("parts.title")} — ${t("app.name")}`;
  }, [t]);

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("partes_diarios")
      .select("id, date, estado, kg_mujeres_manual, kg_podrido_calibrador_manual, kg_reciclado_manual, kg_reciclado_malla_z1, kg_reciclado_malla_z2, kg_podrido_manual, kg_inventario_final, resumen_ia")
      .order("date", { ascending: false });
    if (estadoFilter !== "all") query = query.eq("estado", estadoFilter as any);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, estadoFilter]);

  const createNew = async () => {
    if (!user) return;
    setCreating(true);
    const today = format(new Date(), "yyyy-MM-dd");

    // Try to find existing for today
    const { data: existing } = await supabase
      .from("partes_diarios")
      .select("id")
      .eq("user_id", user.id)
      .eq("date", today)
      .maybeSingle();

    if (existing) {
      navigate(`/partes/${existing.id}`);
      setCreating(false);
      return;
    }

    const { data, error } = await supabase
      .from("partes_diarios")
      .insert({ user_id: user.id, date: today })
      .select("id")
      .single();
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate(`/partes/${data.id}`);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t("parts.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("parts.subtitle")}</p>
        </div>
        <Button onClick={createNew} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          {t("parts.new")}
        </Button>
      </header>

      <Card className="p-4 shadow-card">
        <div className="flex flex-wrap gap-3 mb-4">
          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("parts.filter.all")}</SelectItem>
              <SelectItem value="Borrador">Borrador</SelectItem>
              <SelectItem value="Analizado">Analizado</SelectItem>
              <SelectItem value="Con descuadre">Con descuadre</SelectItem>
              <SelectItem value="Validado">Validado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">{t("parts.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("parts.col.date")}</TableHead>
                  <TableHead>{t("parts.col.status")}</TableHead>
                  <TableHead className="text-right">{t("parts.col.production")}</TableHead>
                  <TableHead className="text-right">{t("parts.col.palets")}</TableHead>
                  <TableHead className="text-right">{t("parts.col.diff")}</TableHead>
                  <TableHead className="text-right">{t("parts.col.deviation")}</TableHead>
                  <TableHead className="text-right">{t("parts.col.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const c = computeCascade({
                    kg_production_total: Number(r.resumen_ia?.kg_produccion_total ?? 0),
                    kg_palets_alta: Number(r.resumen_ia?.kg_palets_alta ?? 0),
                    kg_mujeres_manual: Number(r.resumen_ia?.kg_mujeres_server ?? r.kg_mujeres_manual ?? 0),
                    kg_podrido_calibrador_manual: Number(r.resumen_ia?.kg_podrido_server ?? r.kg_podrido_calibrador_manual ?? 0),
                    kg_muestra: Number(r.resumen_ia?.kg_muestra_server ?? 0),
                    kg_reciclado_manual: r.kg_reciclado_manual,
                    kg_reciclado_malla_z1: r.kg_reciclado_malla_z1,
                    kg_reciclado_malla_z2: r.kg_reciclado_malla_z2,
                    kg_podrido_manual: r.kg_podrido_manual,
                    kg_inventario_final: r.kg_inventario_final,
                  });
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">
                        {format(new Date(r.date), "dd MMM yyyy", { locale: dl })}
                      </TableCell>
                      <TableCell>
                        <StatusBadge estado={r.estado} />
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtKg(c.produced)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtKg(c.palets)}</TableCell>
                      <TableCell className={`text-right font-mono ${Math.abs(c.realDiff) > c.produced * 0.05 ? "text-destructive" : ""}`}>
                        {fmtKg(c.realDiff)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${Math.abs(c.realDeviationPct) > 5 ? "text-destructive" : "text-success"}`}>
                        {fmtPct(c.realDeviationPct)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to={`/partes/${r.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            {t("common.view")}
                          </Button>
                        </Link>
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

export default PartesList;
