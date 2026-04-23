import { FileSpreadsheet, User } from "lucide-react";
import { fmtKg } from "@/lib/format";
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
  };
}

export const ExtractedValues = ({ resumenIa, manual }: Props) => {
  const r = resumenIa ?? {};
  const s = (r.sources ?? {}) as Record<string, Source | null>;

  // Mujeres (L) — preferir el valor extraído de IA si existe, si no el manual
  const mujeresLExtracted = r.kg_mujeres_l ?? r.kg_mujeres_calibrador ?? null;
  const mujeresLValue = mujeresLExtracted != null
    ? Number(mujeresLExtracted)
    : Number(manual.kg_mujeres_manual ?? 0);
  const mujeresLOrigin: "extracted" | "manual" = mujeresLExtracted != null ? "extracted" : "manual";
  const mujeresLSource = s.kg_mujeres_l ?? s.kg_mujeres_calibrador ?? null;

  const rows: Row[] = [
    {
      label: "Producción total",
      value: Number(r.kg_produccion_total ?? 0),
      origin: "extracted",
      source: s.kg_produccion_total,
    },
    {
      label: "Industria / Cítricos manual (+)",
      value: manual.kg_reciclado_manual,
      origin: "manual",
      hint: "Se SUMA a producción. Introducido en la pestaña Manual",
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
      label: "Podrido manual",
      value: manual.kg_podrido_manual,
      origin: "manual",
      hint: "Introducido en la pestaña Manual",
    },
  ];

  return (
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
  );
};
