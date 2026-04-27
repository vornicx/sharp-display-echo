import { useEffect, useState, useMemo } from "react";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KPICard } from "@/components/KPICard";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Droplets, Zap, Fuel, FlaskConical, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const ZONAS = [
  "Línea de tratamiento",
  "Mallas",
  "Graneles",
  "Mesas",
  "Industria",
  "Drencher",
] as const;

const TIPOS: { value: string; unit: string }[] = [
  { value: "Cera",         unit: "kg"  },
  { value: "Agua",         unit: "L"   },
  { value: "Electricidad", unit: "kWh" },
  { value: "Gasoil",       unit: "L"   },
  { value: "Fungicida",    unit: "kg"  },
];

const TIPO_COLORS: Record<string, string> = {
  Cera:         "bg-amber-100 text-amber-800",
  Agua:         "bg-blue-100 text-blue-800",
  Electricidad: "bg-yellow-100 text-yellow-700",
  Gasoil:       "bg-orange-100 text-orange-800",
  Fungicida:    "bg-green-100 text-green-800",
};

interface Coste {
  id: string;
  date: string;
  zona_id: string;
  tipo: string;
  cantidad: number;
  unidad: string | null;
  coste_unitario: number;
}

interface FormState {
  date: string;
  zona_id: string;
  tipo: string;
  cantidad: string;
  coste_unitario: string;
}

const defaultUnit = (tipo: string) => TIPOS.find((t) => t.value === tipo)?.unit ?? "kg";

const initialForm = (): FormState => ({
  date: format(new Date(), "yyyy-MM-dd"),
  zona_id: "Línea de tratamiento",
  tipo: "Cera",
  cantidad: "",
  coste_unitario: "",
});

function buildKpis(rows: Coste[]) {
  const sum = (tipo: string) => rows.filter((r) => r.tipo === tipo).reduce((a, b) => a + b.cantidad, 0);
  return {
    cera:         sum("Cera"),
    agua:         sum("Agua"),
    electricidad: sum("Electricidad"),
    gasoil:       sum("Gasoil"),
    totalEur:     rows.reduce((a, b) => a + b.cantidad * b.coste_unitario, 0),
  };
}

const ConsumoCostes = () => {
  const { user } = useAuth();
  const [rows, setRows]             = useState<Coste[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [filterDate, setFilterDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [form, setForm]             = useState<FormState>(initialForm());

  useEffect(() => { document.title = "Consumos — Lasarte SAT"; }, []);

  const load = async () => {
    setLoading(true);
    const since = format(subDays(new Date(), 30), "yyyy-MM-dd");
    const { data, error } = await supabase
      .from("costes_diarios")
      .select("id, date, zona_id, tipo, cantidad, unidad, coste_unitario")
      .gte("date", since)
      .order("date", { ascending: false })
      .order("tipo");
    if (error) toast.error(error.message);
    setRows((data ?? []) as Coste[]);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const dayRows  = useMemo(() => rows.filter((r) => r.date === filterDate), [rows, filterDate]);
  const kpisDay  = useMemo(() => buildKpis(dayRows), [dayRows]);

  const handleAdd = async () => {
    if (!user) return;
    const cantidad       = parseFloat(form.cantidad);
    const coste_unitario = parseFloat(form.coste_unitario);
    if (!form.zona_id || !form.tipo || isNaN(cantidad) || cantidad <= 0) {
      toast.error("Rellena zona, tipo y cantidad.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("costes_diarios").insert({
      user_id: user.id,
      date: form.date,
      zona_id: form.zona_id,
      tipo: form.tipo,
      cantidad,
      unidad: defaultUnit(form.tipo),
      coste_unitario: isNaN(coste_unitario) ? 0 : coste_unitario,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Registro añadido");
    setFilterDate(form.date);
    setForm((f) => ({ ...f, cantidad: "", coste_unitario: "" }));
    load();
  };

  const updateField = async (id: string, patch: Partial<Coste>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const { error } = await supabase.from("costes_diarios").update(patch as any).eq("id", id);
    if (error) toast.error(error.message);
  };

  const remove = async (id: string) => {
    await supabase.from("costes_diarios").delete().eq("id", id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success("Eliminado");
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Consumos variables</h1>
        <p className="text-sm text-muted-foreground mt-1">Cera, agua, electricidad y gasoil · por zona</p>
      </header>

      {/* KPI strip */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Resumen de</span>
          <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-[160px] h-7 text-sm" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard label="Cera"         value={kpisDay.cera.toLocaleString("es-ES", { maximumFractionDigits: 1 })}         unit="kg"  tone="warning" icon={<FlaskConical className="h-5 w-5" />} />
          <KPICard label="Agua"         value={kpisDay.agua.toLocaleString("es-ES", { maximumFractionDigits: 0 })}         unit="L"   tone="info"    icon={<Droplets className="h-5 w-5" />} />
          <KPICard label="Electricidad" value={kpisDay.electricidad.toLocaleString("es-ES", { maximumFractionDigits: 0 })} unit="kWh" tone="warning" icon={<Zap className="h-5 w-5" />} />
          <KPICard label="Gasoil"       value={kpisDay.gasoil.toLocaleString("es-ES", { maximumFractionDigits: 1 })}       unit="L"   tone="default" icon={<Fuel className="h-5 w-5" />} />
        </div>
        {kpisDay.totalEur > 0 && (
          <p className="mt-2 text-right text-sm text-muted-foreground">
            Coste total día: <span className="font-semibold text-foreground">{kpisDay.totalEur.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
          </p>
        )}
      </section>

      {/* Add form */}
      <Card className="p-4 shadow-card border-border/60">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" /> Añadir registro
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Fecha</label>
            <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Zona</label>
            <Select value={form.zona_id} onValueChange={(v) => setForm((f) => ({ ...f, zona_id: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ZONAS.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Tipo</label>
            <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIPOS.map((tp) => <SelectItem key={tp.value} value={tp.value}>{tp.value} ({tp.unit})</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">Cantidad ({defaultUnit(form.tipo)})</label>
            <Input type="number" placeholder="0" value={form.cantidad} onChange={(e) => setForm((f) => ({ ...f, cantidad: e.target.value }))} className="font-mono" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">€ / {defaultUnit(form.tipo)}</label>
            <Input type="number" step="0.001" placeholder="0.000" value={form.coste_unitario} onChange={(e) => setForm((f) => ({ ...f, coste_unitario: e.target.value }))} className="font-mono" />
          </div>
          <Button onClick={handleAdd} disabled={saving} className="self-end">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Añadir</>}
          </Button>
        </div>
      </Card>

      {/* Table */}
      <Card className="p-4 shadow-card border-border/60">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Registros — {filterDate}
            <span className="ml-2 text-muted-foreground font-normal">({dayRows.length} entradas)</span>
          </h2>
          <button onClick={() => setFilterDate(format(new Date(), "yyyy-MM-dd"))} className="text-xs text-primary hover:underline">Ver hoy</button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : dayRows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">Sin registros para esta fecha.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zona</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Ud.</TableHead>
                  <TableHead className="text-right">€ / ud.</TableHead>
                  <TableHead className="text-right">Total €</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayRows.map((r) => (
                  <TableRow key={r.id} className="group">
                    <TableCell>
                      <Select value={r.zona_id} onValueChange={(v) => updateField(r.id, { zona_id: v })}>
                        <SelectTrigger className="h-8 text-xs w-[170px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{ZONAS.map((z) => <SelectItem key={z} value={z} className="text-xs">{z}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", TIPO_COLORS[r.tipo] ?? "bg-muted text-foreground")}>
                        {r.tipo}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" value={r.cantidad} onChange={(e) => updateField(r.id, { cantidad: Number(e.target.value) || 0 })} className="w-[90px] text-right font-mono h-8 text-sm ml-auto" />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.unidad ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="0.001" value={r.coste_unitario} onChange={(e) => updateField(r.id, { coste_unitario: Number(e.target.value) || 0 })} className="w-[90px] text-right font-mono h-8 text-sm ml-auto" />
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold text-sm">
                      {(r.cantidad * r.coste_unitario).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7" onClick={() => remove(r.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-border bg-muted/30">
                  <TableCell colSpan={5} className="text-sm font-semibold text-right pr-4">Total día</TableCell>
                  <TableCell className="text-right font-mono font-bold text-foreground">
                    {kpisDay.totalEur.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ConsumoCostes;
