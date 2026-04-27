import { FileSpreadsheet, User, TrendingDown, TrendingUp, TriangleAlert as AlertTriangle } from "lucide-react";
import { fmtKg, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

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

export const ExtractedValues = ({ resumenIa, manual }: Props) => {
  const r = resumenIa ?? {};
  const s = (r.sources ?? {}) as Record<string, Source | null>;
  const cascade = r.cascade as { grossDiff: number; unjustifiedDiff: number; deviationPct: number; realDeviationPct: number; totalShrinkage: number } | undefined;

  // Mujeres (L) — preferir el valor extraído de IA si existe, si no el manual
  const mujeresLExtracted = r.kg_mujeres_l ?? r.kg_mujeres_calibrador ?? null;
  const mujeresLValue = mujeresLExtracted != null
    ? Number(mujeresLExtracted)
    : Number(manual.kg_mujeres_manual ?? 0);
  const mujeresLOrigin: "extracted" | "manual" = mujeresLExtracted != null ? "extracted" : "manual";
  const mujeresLSource = s.kg_mujeres_l ?? s.kg_mujeres_calibrador ?? null;

  const rows: Row[] = [
    {
      label: "Resumen Calibrador",
      value: Number(r.kg_produccion_total ?? 0),
      origin: "extracted",
      source: s.kg_produccion_total,
    },
    {
      label: "Industria de la punta (+)",
      value: manual.kg_reciclado_manual,
      origin: "manual",
      hint: "Se SUMA al Resumen Calibrador. Introducido en la pestaña Manual",
    },
    {
      label: "Mujeres (L)",
      value: mujeresLValue,
      origin: mujeresLOrigin,
      source: mujeresLSource,
      hint: "Clase L del informe de tamaños — dato duplicado, se resta",
    },
    {
      label: "Palets dados de alta",
      value: Number(r.kg_palets_alta ?? 0),
      origin: "extracted",
      source: s.kg_palets_alta,
    },
    {
      label: "Inventario final",
      value: manual.kg_inventario_final,
      origin: "manual",
      hint: "Introducido en la pestaña Manual",
    },
    {
      label: "Palets sin alta del día anterior (−)",
      value: Number(manual.kg_palets_pendientes_anterior ?? 0),
      origin: "manual",
      hint: "Se RESTA al inventario final para no contarlos dos veces",
    },
    {
      label: "Podrido calibrador",
      value: Number(r.kg_podrido_calibrador ?? 0),
      origin: "extracted",
      source: s.kg_podrido_calibrador,
    },
    {
      label: "Reciclado malla Z1",
      value: manual.kg_reciclado_malla_z1,
      origin: "manual",
      hint: "Introducido en la pestaña Manual",
    },
    {
      label: "Reciclado malla Z2",
      value: manual.kg_reciclado_malla_z2,
      origin: "manual",
      hint: "Introducido en la pestaña Manual",
    },
    {
      label: "Podrido manual bolsa basura",
      value: manual.kg_podrido_manual,
      origin: "manual",
      hint: "Introducido en la pestaña Manual",
    },
  ];

  const hasCascade = cascade && (cascade.grossDiff !== 0 || cascade.unjustifiedDiff !== 0);
  const isDescuadre = hasCascade && Math.abs(cascade.realDeviationPct) > 3;

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

      {hasCascade && (
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Resultado de la cascada</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <CascadeSummaryCard
              label="Diferencia bruta"
              value={cascade.grossDiff}
              unit="kg"
              icon={<TrendingDown className="h-4 w-4" />}
              variant={Math.abs(cascade.deviationPct) > 3 ? "warning" : "neutral"}
            />
            <CascadeSummaryCard
              label="Merma total"
              value={cascade.totalShrinkage}
              unit="kg"
              icon={<TrendingDown className="h-4 w-4" />}
              variant="neutral"
            />
            <CascadeSummaryCard
              label="Diferencia sin justificar"
              value={cascade.unjustifiedDiff}
              unit="kg"
              icon={isDescuadre ? <AlertTriangle className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              variant={isDescuadre ? "danger" : "success"}
            />
            <CascadeSummaryCard
              label="% Desviación real"
              value={cascade.realDeviationPct}
              unit="%"
              icon={isDescuadre ? <AlertTriangle className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              variant={isDescuadre ? "danger" : "success"}
              isPercent
            />
          </div>
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
  isPercent,
}: {
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  variant: "neutral" | "success" | "warning" | "danger";
  isPercent?: boolean;
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
        {isPercent ? fmtPct(value) : fmtKg(value)}
        <span className="ml-1 text-xs font-normal opacity-70">{unit}</span>
      </div>
    </div>
  );
};
