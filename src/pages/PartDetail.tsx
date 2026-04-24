import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { computeCascade } from "@/lib/cascade";
import { fmtKg, fmtPct } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { CascadeView } from "@/components/CascadeView";
import { ExtractedValues } from "@/components/ExtractedValues";
import { ExportPartesDialog } from "@/components/ExportPartesDialog";
import { FilesUploader } from "@/components/FilesUploader";
import { toast } from "sonner";
import { ArrowLeft, Save, Sparkles, Loader2, Plus, X, CheckCircle2, UploadCloud } from "lucide-react";

interface Parte {
  id: string;
  date: string;
  estado: "Borrador" | "Analizado" | "Con descuadre" | "Validado";
  kg_mujeres_manual: number;
  kg_podrido_calibrador_manual: number;
  kg_reciclado_manual: number;
  kg_reciclado_malla_z1: number;
  kg_reciclado_malla_z2: number;
  kg_podrido_manual: number;
  kg_inventario_final: number;
  notas_inventario: string | null;
  notas_generales: string | null;
  resumen_ia: any;
}

interface Lote { id: string; lote_codigo: string; producto: string | null; source: string }
interface Run { id: string; product: string; size_range: string | null; kg_produced: number; destination: string | null }
interface Gstock { id: string; product: string; size_range: string | null; kg_expected: number }

const PartDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();

  const [parte, setParte] = useState<Parte | null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [gstock, setGstock] = useState<Gstock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [newLote, setNewLote] = useState("");
  const [tab, setTab] = useState("info");
  const [initialFileType, setInitialFileType] = useState<"GSTOCK" | "Produccion" | "BoxAzules" | "FotoLotes" | "Otro">("Produccion");

  useEffect(() => {
    document.title = `${t("part.title")} — ${t("app.name")}`;
  }, [t]);

  const loadAll = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: p }, { data: l }, { data: r }, { data: g }] = await Promise.all([
      supabase.from("partes_diarios").select("*").eq("id", id).maybeSingle(),
      supabase.from("lotes_dia").select("id, lote_codigo, producto, source").eq("part_id", id),
      supabase.from("production_runs").select("id, product, size_range, kg_produced, destination").eq("part_id", id),
      supabase.from("gstock_entries").select("id, product, size_range, kg_expected").eq("part_id", id),
    ]);
    setParte(p as Parte | null);
    setLotes((l ?? []) as Lote[]);
    setRuns((r ?? []) as Run[]);
    setGstock((g ?? []) as Gstock[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  const cascade = useMemo(() => {
    if (!parte) return null;
    return computeCascade({
      kg_production_total: Number(parte.resumen_ia?.kg_produccion_total ?? 0),
      kg_palets_alta: Number(parte.resumen_ia?.kg_palets_alta ?? 0),
      kg_mujeres_manual: Number(parte.resumen_ia?.kg_mujeres_l ?? parte.kg_mujeres_manual ?? 0),
      kg_podrido_calibrador_manual: Number(parte.resumen_ia?.kg_podrido_server ?? parte.kg_podrido_calibrador_manual ?? 0),
      kg_reciclado_manual: parte.kg_reciclado_manual,
      kg_reciclado_malla_z1: parte.kg_reciclado_malla_z1,
      kg_reciclado_malla_z2: parte.kg_reciclado_malla_z2,
      kg_podrido_manual: parte.kg_podrido_manual,
      kg_inventario_final: parte.kg_inventario_final,
    });
  }, [parte]);

  const updateField = (k: keyof Parte, v: any) => {
    if (!parte) return;
    setParte({ ...parte, [k]: v });
  };

  const save = async () => {
    if (!parte) return;
    setSaving(true);
    const { error } = await supabase
      .from("partes_diarios")
      .update({
        date: parte.date,
        kg_mujeres_manual: parte.kg_mujeres_manual,
        kg_podrido_calibrador_manual: parte.kg_podrido_calibrador_manual,
        kg_reciclado_manual: parte.kg_reciclado_manual,
        kg_reciclado_malla_z1: parte.kg_reciclado_malla_z1,
        kg_reciclado_malla_z2: parte.kg_reciclado_malla_z2,
        kg_podrido_manual: parte.kg_podrido_manual,
        kg_inventario_final: parte.kg_inventario_final,
        notas_inventario: parte.notas_inventario,
        notas_generales: parte.notas_generales,
      })
      .eq("id", parte.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success(t("part.saved"));
  };

  const analyze = async () => {
    if (!parte) return;
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analizar-parte", {
        body: { part_id: parte.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error ?? "Unknown");
      toast.success(t("common.success"));
      await loadAll();
    } catch (err: any) {
      toast.error(err?.message ?? t("auth.error.generic"));
    } finally {
      setAnalyzing(false);
    }
  };

  const addLote = async () => {
    if (!newLote.trim() || !parte || !user) return;
    const { error } = await supabase.from("lotes_dia").insert({
      part_id: parte.id,
      user_id: user.id,
      lote_codigo: newLote.trim(),
      source: "manual",
    });
    if (error) toast.error(error.message);
    else {
      setNewLote("");
      const { data } = await supabase.from("lotes_dia").select("id, lote_codigo, producto, source").eq("part_id", parte.id);
      setLotes((data ?? []) as Lote[]);
    }
  };

  const removeLote = async (loteId: string) => {
    await supabase.from("lotes_dia").delete().eq("id", loteId);
    setLotes(lotes.filter((l) => l.id !== loteId));
  };

  const validate = async () => {
    if (!parte) return;
    const { error } = await supabase.from("partes_diarios").update({ estado: "Validado" }).eq("id", parte.id);
    if (error) toast.error(error.message);
    else {
      toast.success(t("part.validated"));
      setParte({ ...parte, estado: "Validado" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!parte) {
    return <div className="text-center py-12 text-muted-foreground">404</div>;
  }

  // Build descuadres comparison
  const descuadres = runs.map((r) => {
    const match = gstock.find((g) => g.product === r.product && (g.size_range ?? "") === (r.size_range ?? ""));
    const expected = match?.kg_expected ?? 0;
    const diff = r.kg_produced - expected;
    const pct = expected > 0 ? (diff / expected) * 100 : 0;
    return { ...r, expected, diff, pct };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/partes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t("common.back")}
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {t("part.title")} — {format(new Date(parte.date), "dd/MM/yyyy")}
            </h1>
            <div className="mt-1">
              <StatusBadge estado={parte.estado} />
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportPartesDialog defaultFrom={parte.date} defaultTo={parte.date} />
          <Button variant="outline" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {t("part.save")}
          </Button>
          <Button onClick={analyze} disabled={analyzing}>
            {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {analyzing ? t("part.analyzing") : t("part.analyze")}
          </Button>
        </div>
      </div>

      {cascade && (
        <Card className="p-5 shadow-card">
          <h2 className="text-base font-semibold text-foreground mb-4">{t("part.cascade.title")}</h2>
          <CascadeView cascade={cascade} />
        </Card>
      )}

      <Card className="p-5 shadow-card">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Valores extraídos</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Origen de cada valor usado en la cascada (archivo · hoja · columna)
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-primary/60" /> Extraído del archivo
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-muted-foreground/40" /> Entrada manual
            </span>
          </div>
        </div>
        <ExtractedValues
          resumenIa={parte.resumen_ia}
          manual={{
            kg_mujeres_manual: parte.kg_mujeres_manual,
            kg_reciclado_manual: parte.kg_reciclado_manual,
            kg_reciclado_malla_z1: parte.kg_reciclado_malla_z1,
            kg_reciclado_malla_z2: parte.kg_reciclado_malla_z2,
            kg_podrido_manual: parte.kg_podrido_manual,
            kg_inventario_final: parte.kg_inventario_final,
          }}
        />
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="info">{t("part.tab.info")}</TabsTrigger>
          <TabsTrigger value="files">{t("part.tab.files")}</TabsTrigger>
          <TabsTrigger value="manual">{t("part.tab.manual")}</TabsTrigger>
          <TabsTrigger value="ai">{t("part.tab.ai")}</TabsTrigger>
          <TabsTrigger value="validation">{t("part.tab.validation")}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4 mt-4">
          <Card className="p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="date">{t("part.field.date")}</Label>
              <Input
                id="date"
                type="date"
                value={parte.date}
                onChange={(e) => updateField("date", e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{t("part.field.notes")}</Label>
              <Textarea
                id="notes"
                rows={4}
                value={parte.notas_generales ?? ""}
                onChange={(e) => updateField("notas_generales", e.target.value)}
              />
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h3 className="font-semibold">{t("part.lotes.title")}</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setInitialFileType("FotoLotes");
                  setTab("files");
                }}
              >
                <UploadCloud className="h-4 w-4 mr-2" />
                {t("part.lotes.upload_photo")}
              </Button>
            </div>
            <div className="flex gap-2 mb-3">
              <Input
                placeholder={t("part.lotes.placeholder")}
                value={newLote}
                onChange={(e) => setNewLote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLote())}
              />
              <Button onClick={addLote} variant="outline">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {lotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("part.lotes.empty")}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {lotes.map((l) => (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1.5 rounded-full bg-secondary text-secondary-foreground px-3 py-1 text-sm"
                  >
                    {l.lote_codigo}
                    {l.source === "ia" && <Sparkles className="h-3 w-3 text-primary" />}
                    <button onClick={() => removeLote(l.id)} className="opacity-60 hover:opacity-100">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-4">{t("files.title")}</h3>
            <FilesUploader partId={parte.id} initialType={initialFileType} />
          </Card>
        </TabsContent>

        <TabsContent value="manual" className="mt-4">
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumField
                label={t("part.field.kg_reciclado_manual")}
                value={parte.kg_reciclado_manual}
                onChange={(v) => updateField("kg_reciclado_manual", v)}
              />
              <NumField
                label={t("part.field.kg_reciclado_malla_z1")}
                value={parte.kg_reciclado_malla_z1}
                onChange={(v) => updateField("kg_reciclado_malla_z1", v)}
              />
              <NumField
                label={t("part.field.kg_reciclado_malla_z2")}
                value={parte.kg_reciclado_malla_z2}
                onChange={(v) => updateField("kg_reciclado_malla_z2", v)}
              />
              <NumField
                label={t("part.field.kg_podrido_manual")}
                value={parte.kg_podrido_manual}
                onChange={(v) => updateField("kg_podrido_manual", v)}
              />
              <NumField
                label={t("part.field.kg_inventario")}
                value={parte.kg_inventario_final}
                onChange={(v) => updateField("kg_inventario_final", v)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invn">{t("part.field.notas_inventario")}</Label>
              <Textarea
                id="invn"
                rows={3}
                value={parte.notas_inventario ?? ""}
                onChange={(e) => updateField("notas_inventario", e.target.value)}
              />
            </div>
            <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("part.save")}
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="mt-4 space-y-4">
          <Card className="p-5">
            <p className="text-sm text-muted-foreground">{t("part.analyze.help")}</p>
            <Button onClick={analyze} disabled={analyzing} className="mt-3">
              {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {analyzing ? t("part.analyzing") : t("part.analyze")}
            </Button>
          </Card>

          {parte.resumen_ia && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Análisis</h3>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-96 whitespace-pre-wrap">
                {parte.resumen_ia.analisis ?? JSON.stringify(parte.resumen_ia, null, 2)}
              </pre>
            </Card>
          )}

          {descuadres.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Descuadres por producto</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead>Tamaño</TableHead>
                      <TableHead className="text-right">Real (kg)</TableHead>
                      <TableHead className="text-right">GSTOCK (kg)</TableHead>
                      <TableHead className="text-right">Diff</TableHead>
                      <TableHead className="text-right">% Desv.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {descuadres.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>{d.product}</TableCell>
                        <TableCell>{d.size_range ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">{fmtKg(d.kg_produced)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtKg(d.expected)}</TableCell>
                        <TableCell className={`text-right font-mono ${Math.abs(d.diff) > d.expected * 0.05 ? "text-destructive" : ""}`}>
                          {fmtKg(d.diff)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmtPct(d.pct)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="validation" className="mt-4">
          <Card className="p-5 space-y-4">
            {cascade && <CascadeView cascade={cascade} />}
            <div className="pt-3 border-t">
              <Button
                onClick={validate}
                disabled={parte.estado === "Validado"}
                variant={parte.estado === "Validado" ? "outline" : "default"}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {parte.estado === "Validado" ? t("part.validated") : t("part.validate")}
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const NumField = ({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) => (
  <div className="space-y-2">
    <Label>{label}</Label>
    <div className="relative">
      <Input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="pr-10 font-mono"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">kg</span>
    </div>
  </div>
);

export default PartDetail;
