import { useI18n } from "@/lib/i18n";
import { CascadeOutput, SemaforoLevel } from "@/lib/cascade";
import { fmtKg, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, CircleMinus as MinusCircle } from "lucide-react";

const semaforoConfig: Record<SemaforoLevel, { bg: string; border: string; text: string; icon: typeof CheckCircle2; label: string }> = {
  verde: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-700", icon: CheckCircle2, label: "DSJ < 1%" },
  amarillo: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700", icon: AlertTriangle, label: "DSJ 1-3%" },
  rojo: { bg: "bg-red-50", border: "border-red-300", text: "text-red-700", icon: MinusCircle, label: "DSJ > 3%" },
};

export const CascadeView = ({ cascade }: { cascade: CascadeOutput }) => {
  const { t } = useI18n();
  const { steps, produced } = cascade;
  const max = Math.max(produced, 1);

  // Index where "produccion real" ends (after reciclado_z2)
  const produccionRealIdx = steps.findIndex((s) => s.key === "reciclado_z2");
  // Index where "diferencia bruta" ends (after inventario)
  const inventarioIdx = steps.findIndex((s) => s.key === "inventario");

  const semaforo = semaforoConfig[cascade.semaforo ?? "verde"] ?? semaforoConfig.verde;
  const SemaforoIcon = semaforo.icon;

  return (
    <div className="space-y-2">
      {steps.map((s, idx) => {
        const isPreGross = idx <= inventarioIdx;
        const displayValue = isPreGross ? s.running : s.value;
        const widthPct = Math.max(2, (Math.abs(displayValue) / max) * 100);
        const isFirst = idx === 0;
        const isPlus = !s.isMinus && !isFirst;
        return (
          <div key={s.key}>
            <div className="grid grid-cols-12 items-center gap-3 text-sm">
              <div className="col-span-12 sm:col-span-5 font-medium text-foreground">
                {t(s.labelKey)}
              </div>
              <div className="col-span-9 sm:col-span-5">
                <div className="h-7 w-full bg-muted rounded-md overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500",
                      isFirst ? "bg-primary" : isPlus ? "bg-emerald-500" : isPreGross ? "bg-secondary" : "bg-accent",
                    )}
                    style={{ width: `${Math.min(100, widthPct)}%` }}
                  />
                </div>
              </div>
              <div className="col-span-3 sm:col-span-2 text-right font-mono font-semibold tabular-nums">
                {fmtKg(displayValue)}
              </div>
            </div>

            {/* Producción real subtotal */}
            {idx === produccionRealIdx && (
              <div className="my-2 flex items-center justify-between border-y border-dashed border-border py-2 px-1 bg-primary/5 rounded">
                <span className="text-sm font-semibold text-foreground">
                  = {t("part.cascade.produccion_real")}
                </span>
                <span className="font-mono font-bold text-base tabular-nums text-primary">
                  {fmtKg(cascade.produccionReal)} {t("common.kg")}
                </span>
              </div>
            )}

            {/* Diferencia bruta subtotal */}
            {idx === inventarioIdx && (
              <div className="my-2 flex items-center justify-between border-y border-dashed border-border py-2 px-1 bg-muted/40 rounded">
                <span className="text-sm font-semibold text-foreground">
                  = {t("part.cascade.gross_diff")}
                </span>
                <span className="font-mono font-bold text-base tabular-nums text-foreground">
                  {fmtKg(cascade.grossDiff)} {t("common.kg")}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* DSJ result + semaforo */}
      <div className="mt-3 border-t border-border pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">
              {t("part.cascade.dsj")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("part.cascade.dsj_help")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "font-mono font-bold text-lg tabular-nums",
                cascade.semaforo === "verde" ? "text-emerald-600" :
                cascade.semaforo === "amarillo" ? "text-amber-600" : "text-red-600",
              )}
            >
              {fmtKg(cascade.unjustifiedDiff)} {t("common.kg")}
            </span>
            <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold", semaforo.bg, semaforo.border, semaforo.text)}>
              <SemaforoIcon className="h-3.5 w-3.5" />
              {fmtPct(cascade.realDeviationPct)} — {semaforo.label}
            </div>
          </div>
        </div>

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
    </div>
  );
};
