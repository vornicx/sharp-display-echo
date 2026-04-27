import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calculator, RotateCcw, AlertTriangle, TrendingDown, Package, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

type Fields = {
  produccion_calibrador_kg: string;
  mujeres_kg: string;
  palets_alta_kg: string;
  inventario_final_kg: string;
  podrido_calibrador_kg: string;
  podrido_manual_kg: string;
  podrido_cinta_kg: string;
  reciclado_z1_kg: string;
  reciclado_z2_kg: string;
};

const empty: Fields = {
  produccion_calibrador_kg: "",
  mujeres_kg: "",
  palets_alta_kg: "",
  inventario_final_kg: "",
  podrido_calibrador_kg: "",
  podrido_manual_kg: "",
  podrido_cinta_kg: "",
  reciclado_z1_kg: "",
  reciclado_z2_kg: "",
};

const parseNum = (v: string): number => {
  if (!v) return 0;
  const normalized = v.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (n: number, digits = 2) =>
  new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);

const fmtPct = (n: number) =>
  `${new Intl.NumberFormat("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} %`;

const NumberField = ({
  id,
  label,
  value,
  onChange,
  hint,
  warning,
}: {
  id: keyof Fields;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  warning?: string;
}) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      {warning && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning">
          <AlertTriangle className="h-3 w-3" />
          {warning}
        </span>
      )}
    </div>
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      placeholder="0,00"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        // Allow only digits, comma, dot, minus
        if (/^-?[\d.,]*$/.test(v)) onChange(v);
      }}
      className="kpi-number text-right text-base"
    />
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const ResultCard = ({
  label,
  value,
  unit,
  sub,
  tone = "default",
  emphasis = false,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: "default" | "primary" | "success" | "warning" | "destructive";
  emphasis?: boolean;
  icon?: React.ReactNode;
}) => {
  const toneText: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary-strong",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };
  const toneRing: Record<string, string> = {
    default: "border-border/60",
    primary: "border-primary/40",
    success: "border-success/40",
    warning: "border-warning/50",
    destructive: "border-destructive/50",
  };
  return (
    <Card
      className={cn(
        "p-5 bg-gradient-kpi shadow-card transition-shadow hover:shadow-elevated border-2",
        toneRing[tone],
        emphasis && "shadow-elevated"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <div className={cn("mt-2 flex items-baseline gap-1.5 kpi-number", toneText[tone])}>
            <span className={cn("font-bold leading-none", emphasis ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl")}>
              {value}
            </span>
            {unit && <span className="text-sm font-medium opacity-70">{unit}</span>}
          </div>
          {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
        </div>
        {icon && <div className="text-muted-foreground/60">{icon}</div>}
      </div>
    </Card>
  );
};

const DSJCalculator = () => {
  const [f, setF] = useState<Fields>(empty);

  const update = (k: keyof Fields) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));

  const calc = useMemo(() => {
    const prodCal = parseNum(f.produccion_calibrador_kg);
    const muj = parseNum(f.mujeres_kg);
    const palets = parseNum(f.palets_alta_kg);
    const inv = parseNum(f.inventario_final_kg);
    const podCal = parseNum(f.podrido_calibrador_kg);
    const podMan = parseNum(f.podrido_manual_kg);
    const podCin = parseNum(f.podrido_cinta_kg);
    const rZ1 = parseNum(f.reciclado_z1_kg);
    const rZ2 = parseNum(f.reciclado_z2_kg);

    const produccion_real = prodCal - muj;
    const diferencia_bruta = produccion_real - palets - inv;
    const mermas_total = podCal + podMan + podCin + rZ1 + rZ2;
    const dsj = diferencia_bruta - mermas_total;
    const pct_bruta = produccion_real > 0 ? (diferencia_bruta / produccion_real) * 100 : 0;
    const pct_dsj = produccion_real > 0 ? (dsj / produccion_real) * 100 : 0;

    return { produccion_real, diferencia_bruta, mermas_total, dsj, pct_bruta, pct_dsj };
  }, [f]);

  const dsjTone: "success" | "warning" | "destructive" = (() => {
    const abs = Math.abs(calc.pct_dsj);
    if (abs <= 1) return "success";
    if (abs <= 3) return "warning";
    return "destructive";
  })();

  const reset = () => setF(empty);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-primary-strong">
            <Calculator className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">Calculadora</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-foreground">
            Diferencia justificada por podrido y merma natural
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cuadre diario de producción de la cooperativa citrícola
          </p>
        </div>
        <Button onClick={reset} variant="outline" size="sm">
          <RotateCcw className="h-4 w-4" />
          Limpiar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form */}
        <div className="lg:col-span-3 space-y-6">
          <Card className="p-5 sm:p-6 shadow-card">
            <div className="flex items-center gap-2 mb-4">
              <Scale className="h-4 w-4 text-primary-strong" />
              <h2 className="text-base font-semibold">1. Producción</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberField
                id="produccion_calibrador_kg"
                label="Resumen Calibrador (kg)"
                value={f.produccion_calibrador_kg}
                onChange={update("produccion_calibrador_kg")}
                hint="Peso total reportado por el calibrador"
              />
              <NumberField
                id="mujeres_kg"
                label="Mujeres — clase L (kg)"
                value={f.mujeres_kg}
                onChange={update("mujeres_kg")}
                hint="Se restan: el calibrador las cuenta dos veces"
              />
              <NumberField
                id="palets_alta_kg"
                label="Palets dados de alta (kg)"
                value={f.palets_alta_kg}
                onChange={update("palets_alta_kg")}
                hint="Suma de Netos de palets dados de alta"
              />
              <NumberField
                id="inventario_final_kg"
                label="Inventario final (kg)"
                value={f.inventario_final_kg}
                onChange={update("inventario_final_kg")}
                hint="Producido hoy sin dar de alta aún"
              />
            </div>
          </Card>

          <Card className="p-5 sm:p-6 shadow-card">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown className="h-4 w-4 text-primary-strong" />
              <h2 className="text-base font-semibold">2. Mermas identificadas</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberField
                id="podrido_calibrador_kg"
                label="Podrido calibrador (kg)"
                value={f.podrido_calibrador_kg}
                onChange={update("podrido_calibrador_kg")}
              />
              <NumberField
                id="podrido_manual_kg"
                label="Podrido manual bolsa basura (kg)"
                value={f.podrido_manual_kg}
                onChange={update("podrido_manual_kg")}
              />
              <NumberField
                id="podrido_cinta_kg"
                label="Podrido cinta (kg)"
                value={f.podrido_cinta_kg}
                onChange={update("podrido_cinta_kg")}
                warning="Estimado"
                hint="Estimación del encargado, no medible con exactitud"
              />
              <NumberField
                id="reciclado_z1_kg"
                label="Reciclado malla Z1 (kg)"
                value={f.reciclado_z1_kg}
                onChange={update("reciclado_z1_kg")}
              />
              <NumberField
                id="reciclado_z2_kg"
                label="Reciclado malla Z2 (kg)"
                value={f.reciclado_z2_kg}
                onChange={update("reciclado_z2_kg")}
              />
            </div>
          </Card>
        </div>

        {/* Results */}
        <aside className="lg:col-span-2 lg:sticky lg:top-6 self-start space-y-4">
          <ResultCard
            label="Producción real"
            value={fmt(calc.produccion_real)}
            unit="kg"
            sub="Calibrador − Mujeres"
            tone="primary"
            icon={<Package className="h-5 w-5" />}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
            <ResultCard
              label="Diferencia bruta"
              value={fmt(calc.diferencia_bruta)}
              unit="kg"
              sub={`${fmtPct(calc.pct_bruta)} sobre producción real`}
            />
            <ResultCard
              label="Total mermas"
              value={fmt(calc.mermas_total)}
              unit="kg"
              sub="Podrido + reciclados"
            />
          </div>

          <ResultCard
            label="Diferencia sin justificar"
            value={fmt(calc.dsj)}
            unit="kg"
            sub={`${fmtPct(calc.pct_dsj)} sobre producción real`}
            tone={dsjTone}
            emphasis
            icon={<AlertTriangle className="h-6 w-6" />}
          />

          <Card className="p-4 bg-muted/40 border-dashed">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Umbrales:</span>{" "}
              <span className="text-success font-medium">≤ 1 % OK</span> ·{" "}
              <span className="text-warning font-medium">1–3 % revisar</span> ·{" "}
              <span className="text-destructive font-medium">{">"} 3 % crítico</span>
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
};

export default DSJCalculator;
