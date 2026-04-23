import { useI18n } from "@/lib/i18n";
import { CascadeOutput } from "@/lib/cascade";
import { fmtKg } from "@/lib/format";
import { cn } from "@/lib/utils";

export const CascadeView = ({ cascade }: { cascade: CascadeOutput }) => {
  const { t } = useI18n();
  const { steps, produced } = cascade;
  const max = Math.max(produced, 1);

  const inventarioIdx = steps.findIndex((s) => s.key === "inventario");

  return (
    <div className="space-y-2">
      {steps.map((s, idx) => {
        // Pasos 0..inventarioIdx (producción / -palets / -inventario): mostramos el RUNNING
        // (cascada descendente hasta diferencia bruta). Para las mermas mostramos el VALOR INDIVIDUAL
        // de cada partida — NO un acumulado.
        const isPreGross = idx <= inventarioIdx;
        const displayValue = isPreGross ? s.running : s.value;
        const widthPct = Math.max(2, (Math.abs(displayValue) / max) * 100);
        const isFirst = idx === 0;
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
                      isFirst ? "bg-primary" : isPreGross ? "bg-secondary" : "bg-accent",
                    )}
                    style={{ width: `${Math.min(100, widthPct)}%` }}
                  />
                </div>
              </div>
              <div className="col-span-3 sm:col-span-2 text-right font-mono font-semibold tabular-nums">
                {fmtKg(displayValue)}
              </div>
            </div>

            {idx === inventarioIdx && (
              <div className="my-3 flex items-center justify-between border-y border-dashed border-border py-2 px-1 bg-muted/40 rounded">
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

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">
            {t("part.cascade.unjustified_diff")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("part.cascade.unjustified_help")}
          </span>
        </div>
        <span
          className={cn(
            "font-mono font-bold text-lg tabular-nums",
            Math.abs(cascade.unjustifiedDiff) < produced * 0.01 ? "text-success" : "text-destructive",
          )}
        >
          {fmtKg(cascade.unjustifiedDiff)} {t("common.kg")}
        </span>
      </div>
    </div>
  );
};
