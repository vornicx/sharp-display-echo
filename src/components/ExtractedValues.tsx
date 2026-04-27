import { FileSpreadsheet, User, TrendingDown, TrendingUp, TriangleAlert as AlertTriangle } from "lucide-react";
import { fmtKg, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SemaforoLevel } from "@/lib/cascade";

interface Source {
  file?: string;
  sheet?: string;
  note?: string;
}

interface Row {
  label: string;
  value: number;
  origin: "extracted" | "manual";
  source?: Source | null;
  hint?: string;
}

interface Props {
  resumenIa: any;
  manual: {
    kg_mujeres_manual: number;
    kg_reciclado_manual: number;
    kg_reciclado_malla_z1: number;
    kg_reciclado_malla_z2: number;
    kg_podrido_manual: number;
    kg_inventario_final: number;
    kg_palets_pendientes_anterior?: number;
  };
}

const semaforoColors: Record<SemaforoLevel, { bg: string; border: string; text: string; icon: string }> = {
  verde: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", icon: "text-emerald-600" },
  amarillo: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: "text-amber-600" },
  rojo: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", icon: "text-red-600" },
};

export const ExtractedValues = ({ resumenIa, manual }: Props) => {
  const r = resumenIa ?? {};
  const s = (r.sources ?? {}) as Record<string, Source | null>;
  const cascade = r.cascade as {
    produccionReal: number;
    paletsAjustados: number;
    grossDiff: number;
    totalShrinkage: number;
    unjustifiedDiff: number;
    deviationPct: number;
    realDeviationPct: number;
    semaforo: SemaforoLevel;
    alerts: string[];
  } | undefined;

  const mujeresLExtracted = r.kg_mujeres_l ?? r.kg_mujeres_calibrador ?? null;
  const mujeresLValue = mujeresLExtracted != null
    ? Number(mujeresLExtracted)
    : Number(manual.kg_mujeres_manual ?? 0);
  const mujeresLOrigin: "extracted" | "manual" = mujeresLExtracted != null ? "extracted" : "manual";
  const mujeresLSource = s.kg_mujeres_l ?? s.kg_mujeres_calibrador ?? null;

  const rows: Row[] = [
    {
      label: "Producción calibrador",
      value: Number(r.kg_produccion_total ?? 0),
      origin: "extracted",
      source: s.kg_produccion_total,
    },
    {
      label: "+ Industria",
      value: manual.kg_reciclado_manual,
      origin: "manual",
      hint: "Kg de cítricos/industria procesados manualmente. Se SUMA a la producción del calibrador.",
    },
    {
      label: "− Mujeres (L)",
      value: mujeresLValue,
      origin: mujeresLOrigin,
      source: mujeresLSource,
      hint: "Clase L del informe de tamaños. Se resta porque el calibrador las cuenta dos veces al recalibrarlas.",
    },
    {
      label: "− Reciclado Z1",
      value: manual.kg_reciclado_malla_z1,
      origin: "manual",
      hint: "Boxes azules reprocesados Zona 1. Se restan porque el calibrador los pesa de nuevo al día siguiente.",
    },
    {
      label: "− Reciclado Z2",
      value: manual.kg_reciclado_malla_z2,
      origin: "manual",
      hint: "Boxes azules reprocesados Zona 2. Se restan porque el calibrador los pesa de nuevo al día siguiente.",
    },
    {
      label: "Palets dados de alta",
      value: Number(r.kg_palets_alta ?? 0),
      origin: "extracted",
      source: s.kg_palets_alta,
    },
    {
      label: "− Inv. día anterior",
      value: Number(manual.kg_palets_pendientes_anterior ?? 0),
      origin: "manual",
      hint: "Inventario final del día anterior. Se resta de los palets para no contar producción de ayer.",
    },
    {
      label: "− Inventario final",
      value: manual.kg_inventario_final,
      origin: "manual",
      hint: "Palets producidos hoy que NO se han dado de alta aún.",
    },
    {
      label: "− Podrido calibrador",
      value: Number(r.kg_podrido_calibrador ?? 0),
      origin: "extracted",
      source: s.kg_podrido_calibrador,
    },
    {
      label: "− Podrido manual",
      value: manual.kg_podrido_manual,
      origin: "manual",
      hint: "Podrido retirado manualmente en el volcador.",
    },
  ];

  const hasCascade = cascade && (cascade.produccionReal > 0);
  const semaforo = cascade?.semaforo ? semaforoColors[cascade.semaforo] : null;

  return (
    <div>
      <div className="divide-y divide-border">
        {rows.map((row) => {
          const hasSource = row.origin === "extracted" && row.source?.file;
          return (
            <div
              key={row.label}
              className="grid grid-cols-12 gap-3 items-start py-3 first:pt-0 last:pb-0"
            >
              <div className="col-span-12 sm:col-span-4">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center h-6 w-6 rounded-md shrink-0",
                      row.origin === "extracted"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                    title={row.origin === "extracted" ? "Extraído del archivo" : "Entrada manual"}
                  >
                    {row.origin === "extracted" ? (
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                    ) : (
                      <User className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="text-sm font-medium text-foreground">{row.label}</span>
                </div>
              </div>

              <div className="col-span-7 sm:col-span-6 text-xs text-muted-foreground leading-relaxed">
                {hasSource ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-foreground/80 break-all">
                        {row.source!.file}
                      </span>
                      {row.source!.sheet && (
                        <>
                          <span className="text-muted-foreground/60">›</span>
                          <span className="font-mono">hoja "{row.source!.sheet}"</span>
                        </>
                      )}
                    </div>
                    {row.source!.note && (
                      <div className="text-muted-foreground/80">{row.source!.note}</div>
                    )}
                  </div>
                ) : row.origin === "extracted" ? (
                  <span className="italic text-muted-foreground/70">
                    Sin archivo detectado — ejecuta "Analizar parte"
                  </span>
                ) : (
                  <span className="italic text-muted-foreground/70">{row.hint}</span>
                )}
              </div>

              <div className="col-span-5 sm:col-span-2 text-right">
                <span className="font-mono font-semibold tabular-nums text-foreground">
                  {fmtKg(row.value)}
                </span>
                <span className="ml-1 text-xs text-muted-foreground">kg</span>
              </div>
            </div>
          );
        })}
      </div>

      {hasCascade && cascade && (
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Resultado DSJ</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <CascadeSummaryCard
              label="Producción real"
              value={cascade.produccionReal}
              unit="kg"
              icon={<TrendingUp className="h-4 w-4" />}
              variant="neutral"
            />
            <CascadeSummaryCard
              label="Diferencia bruta"
              value={cascade.grossDiff}
              unit="kg"
              icon={<TrendingDown className="h-4 w-4" />}
              variant={Math.abs(cascade.deviationPct) > 3 ? "warning" : "neutral"}
            />
            <CascadeSummaryCard
              label="Mermas totales"
              value={cascade.totalShrinkage}
              unit="kg"
              icon={<TrendingDown className="h-4 w-4" />}
              variant="neutral"
            />
            <CascadeSummaryCard
              label="DSJ"
              value={cascade.unjustifiedDiff}
              unit="kg"
              icon={cascade.semaforo === "rojo" ? <AlertTriangle className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              variant={cascade.semaforo === "verde" ? "success" : cascade.semaforo === "amarillo" ? "warning" : "danger"}
            />
          </div>

          {/* Semaforo badge */}
          {semaforo && (
            <div className={cn("flex items-center justify-between rounded-lg border px-4 py-3", semaforo.bg, semaforo.border)}>
              <div className="flex items-center gap-2">
                <span className={cn("font-semibold text-sm", semaforo.text)}>
                  % DSJ: {fmtPct(cascade.realDeviationPct)}
                </span>
              </div>
              <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold", semaforo.bg, semaforo.border, semaforo.text)}>
                {cascade.semaforo === "verde" && "Correcto (< 1%)"}
                {cascade.semaforo === "amarillo" && "Atención (1-3%)"}
                {cascade.semaforo === "rojo" && "Revisar (> 3%)"}
              </div>
            </div>
          )}

          {/* Alerts */}
          {cascade.alerts.length > 0 && (
            <div className="space-y-1.5">
              {cascade.alerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{alert}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CascadeSummaryCard = ({
  label,
  value,
  unit,
  icon,
  variant,
}: {
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  variant: "neutral" | "success" | "warning" | "danger";
}) => {
  const colorMap = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
  };
  const iconColorMap = {
    neutral: "text-muted-foreground",
    success: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  return (
    <div className={cn("rounded-lg border p-3", colorMap[variant])}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={iconColorMap[variant]}>{icon}</span>
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <div className="font-mono font-bold text-lg tabular-nums">
        {fmtKg(value)}
        <span className="ml-1 text-xs font-normal opacity-70">{unit}</span>
      </div>
    </div>
  );
};
