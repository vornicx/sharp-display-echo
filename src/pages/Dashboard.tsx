import { useEffect, useState } from "react";
import { format, subDays, startOfDay } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { computeCascade } from "@/lib/cascade";
import { fmtKg, fmtPct, sumBy } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KPICard } from "@/components/KPICard";
import { StatusBadge } from "@/components/StatusBadge";
import { Activity, Boxes, TriangleAlert as AlertTriangle, Percent, TrendingDown, Users, Plus, Loader as Loader2 } from "lucide-react";

interface PartRow {
  id: string;
  date: string;
  estado: string;
  kg_mujeres_manual: number;
  kg_podrido_calibrador_manual: number;
  kg_reciclado_manual: number;
  kg_podrido_manual: number;
  kg_inventario_final: number;
  resumen_ia: any;
}

const Dashboard = () => {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const dl = lang === "es" ? esLocale : enUS;
  const [parts, setParts] = useState<PartRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = `${t("dash.title")} — ${t("app.name")}`;
  }, [t]);

  useEffect(() => {
    if (!user) return;
    const since = format(subDays(startOfDay(new Date()), 30), "yyyy-MM-dd");
    supabase
      .from("partes_diarios")
      .select("id, date, estado, kg_mujeres_manual, kg_podrido_calibrador_manual, kg_reciclado_manual, kg_podrido_manual, kg_inventario_final, resumen_ia")
      .gte("date", since)
      .order("date", { ascending: false })
      .then(({ data }) => {
        setParts((data ?? []) as PartRow[]);
        setLoading(false);
      });
  }, [user]);

  const today = parts[0];
  const todayCascade = today
    ? computeCascade({
        kg_production_total: Number(today.resumen_ia?.kg_produccion_total ?? 0),
        kg_palets_alta: Number(today.resumen_ia?.kg_palets_alta ?? 0),
        kg_mujeres_manual: today.kg_mujeres_manual,
        kg_podrido_calibrador_manual: today.kg_podrido_calibrador_manual,
        kg_reciclado_manual: today.kg_reciclado_manual,
        kg_reciclado_malla_z1: Number(today.resumen_ia?.kg_reciclado_malla_z1 ?? 0),
        kg_reciclado_malla_z2: Number(today.resumen_ia?.kg_reciclado_malla_z2 ?? 0),
        kg_podrido_manual: today.kg_podrido_manual,
        kg_inventario_final: today.kg_inventario_final,
        kg_palets_pendientes_anterior: Number(today.resumen_ia?.kg_palets_pendientes_anterior ?? 0),
      })
    : null;

  const cascadeData = parts
    .slice(0, 14)
    .reverse()
    .map((p) => {
      const c = computeCascade({
        kg_production_total: Number(p.resumen_ia?.kg_produccion_total ?? 0),
        kg_palets_alta: Number(p.resumen_ia?.kg_palets_alta ?? 0),
        kg_mujeres_manual: p.kg_mujeres_manual,
        kg_podrido_calibrador_manual: p.kg_podrido_calibrador_manual,
        kg_reciclado_manual: p.kg_reciclado_manual,
        kg_reciclado_malla_z1: Number(p.resumen_ia?.kg_reciclado_malla_z1 ?? 0),
        kg_reciclado_malla_z2: Number(p.resumen_ia?.kg_reciclado_malla_z2 ?? 0),
        kg_podrido_manual: p.kg_podrido_manual,
        kg_inventario_final: p.kg_inventario_final,
        kg_palets_pendientes_anterior: Number(p.resumen_ia?.kg_palets_pendientes_anterior ?? 0),
      });
      return {
        date: format(new Date(p.date), "dd/MM", { locale: dl }),
        produccion: c.produccionReal,
        palets: c.paletsAjustados,
        mermas: c.totalShrinkage,
        sin_justificar: Math.max(0, c.realDiff),
      };
    });

  const compareData = cascadeData.map((d) => ({
    date: d.date,
    real: d.produccion,
    gstock: Math.round(d.produccion * 0.97), // placeholder until GSTOCK is wired per part
  }));

  const shrinkageData = parts
    .slice(0, 30)
    .reverse()
    .map((p) => ({
      date: format(new Date(p.date), "dd/MM", { locale: dl }),
      mujeres: Number(p.kg_mujeres_manual),
      podrido_cal: Number(p.kg_podrido_calibrador_manual),
      reciclado: Number(p.kg_reciclado_manual),
      podrido_man: Number(p.kg_podrido_manual),
    }));

  const hasData = parts.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t("dash.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dash.subtitle")}</p>
        </div>
        <Link to="/partes">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            {t("parts.new")}
          </Button>
        </Link>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !hasData ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">{t("dash.empty")}</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <KPICard
              label={t("dash.kpi.production")}
              value={fmtKg(todayCascade?.produccionReal)}
              unit="kg"
              tone="primary"
              icon={<Activity className="h-5 w-5" />}
            />
            <KPICard
              label={t("dash.kpi.palets")}
              value={fmtKg(todayCascade?.paletsAjustados)}
              unit="kg"
              tone="info"
              icon={<Boxes className="h-5 w-5" />}
            />
            <KPICard
              label={t("dash.kpi.diff.real")}
              value={fmtKg(todayCascade?.realDiff)}
              unit="kg"
              tone={Math.abs(todayCascade?.realDiff ?? 0) > (todayCascade?.produccionReal ?? 0) * 0.05 ? "destructive" : "success"}
              icon={<AlertTriangle className="h-5 w-5" />}
            />
            <KPICard
              label={t("dash.kpi.deviation")}
              value={fmtPct(todayCascade?.realDeviationPct)}
              tone={Math.abs(todayCascade?.realDeviationPct ?? 0) > 5 ? "destructive" : "success"}
              icon={<Percent className="h-5 w-5" />}
            />
            <KPICard
              label={t("dash.kpi.shrinkage")}
              value={fmtKg(todayCascade?.totalShrinkage)}
              unit="kg"
              tone="warning"
              icon={<TrendingDown className="h-5 w-5" />}
            />
            <KPICard
              label={t("dash.kpi.diff")}
              value={fmtKg(todayCascade?.grossDiff)}
              unit="kg"
              tone="destructive"
            />
            <KPICard label={t("dash.kpi.attendance")} value="—" tone="info" icon={<Users className="h-5 w-5" />} />
          </div>

          <Card className="p-5 shadow-card">
            <h2 className="text-base font-semibold text-foreground mb-4">{t("dash.chart.cascade")}</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cascadeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="produccion" fill="hsl(var(--primary))" name={t("dash.kpi.production")} />
                  <Bar dataKey="palets" fill="hsl(var(--info))" name={t("dash.kpi.palets")} />
                  <Bar dataKey="mermas" fill="hsl(var(--warning))" name={t("dash.kpi.shrinkage")} />
                  <Bar dataKey="sin_justificar" fill="hsl(var(--destructive))" name={t("dash.kpi.diff.real")} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="p-5 shadow-card">
              <h2 className="text-base font-semibold text-foreground mb-4">{t("dash.chart.compare")}</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={compareData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="real" stroke="hsl(var(--info))" strokeWidth={2} />
                    <Line type="monotone" dataKey="gstock" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5 shadow-card">
              <h2 className="text-base font-semibold text-foreground mb-4">{t("dash.chart.shrinkage")}</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={shrinkageData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "var(--radius)",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="mujeres" stackId="a" fill="hsl(var(--warning))" />
                    <Bar dataKey="podrido_cal" stackId="a" fill="hsl(var(--destructive))" />
                    <Bar dataKey="reciclado" stackId="a" fill="hsl(var(--info))" />
                    <Bar dataKey="podrido_man" stackId="a" fill="hsl(var(--secondary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-5 shadow-card">
            <h2 className="text-base font-semibold text-foreground mb-4">{t("dash.recent.parts")}</h2>
            <div className="space-y-2">
              {parts.slice(0, 5).map((p) => (
                <Link
                  key={p.id}
                  to={`/partes/${p.id}`}
                  className="flex items-center justify-between p-3 rounded-md border border-border bg-card hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-foreground">
                      {format(new Date(p.date), "EEE d MMM yyyy", { locale: dl })}
                    </span>
                    <StatusBadge estado={p.estado} />
                  </div>
                  <div className="text-sm text-muted-foreground font-mono">
                    {fmtKg(Number(p.resumen_ia?.kg_produccion_total ?? 0))} kg
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default Dashboard;
