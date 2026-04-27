/**
 * DSJ (Diferencia Sin Justificar) reconciliation cascade.
 *
 * Per DSJ Citrícola spec v3:
 *
 *   Paso 1 — Producción real:
 *     produccion_calibrador + industria − mujeres(L) − reciclado_Z1 − reciclado_Z2
 *
 *   Paso 2 — Palets ajustados:
 *     palets_alta − inventario_final_día_anterior
 *
 *   Paso 3 — Diferencia bruta:
 *     producción_real − palets_ajustados − inventario_final
 *
 *   Paso 4 — Mermas totales:
 *     podrido_calibrador + podrido_manual
 *
 *   Paso 5 — DSJ:
 *     diferencia_bruta − mermas_totales
 *
 *   Semaforo: verde <1%, amarillo 1-3%, rojo >3%
 */

export type SemaforoLevel = "verde" | "amarillo" | "rojo";

export interface CascadeInputs {
  kg_production_total: number;
  kg_palets_alta: number;
  kg_mujeres_manual: number;
  kg_podrido_calibrador_manual: number;
  kg_reciclado_manual: number;
  kg_reciclado_malla_z1: number;
  kg_reciclado_malla_z2: number;
  kg_podrido_manual: number;
  kg_inventario_final: number;
  kg_palets_pendientes_anterior: number;
}

export interface CascadeStep {
  key: string;
  labelKey: string;
  value: number;
  running: number;
  isMinus: boolean;
}

export interface CascadeOutput {
  steps: CascadeStep[];
  produced: number;
  produccionReal: number;
  paletsAjustados: number;
  grossDiff: number;
  totalShrinkage: number;
  unjustifiedDiff: number;
  realDiff: number;
  deviationPct: number;
  realDeviationPct: number;
  semaforo: SemaforoLevel;
  alerts: string[];
}

export function computeCascade(i: CascadeInputs): CascadeOutput {
  const produced = Number(i.kg_production_total) || 0;
  const palets = Number(i.kg_palets_alta) || 0;
  const invFinal = Number(i.kg_inventario_final) || 0;
  const invAnterior = Number(i.kg_palets_pendientes_anterior) || 0;
  const mL = Number(i.kg_mujeres_manual) || 0;
  const pc = Number(i.kg_podrido_calibrador_manual) || 0;
  const industria = Number(i.kg_reciclado_manual) || 0;
  const rz1 = Number(i.kg_reciclado_malla_z1) || 0;
  const rz2 = Number(i.kg_reciclado_malla_z2) || 0;
  const pm = Number(i.kg_podrido_manual) || 0;

  const produccionReal = produced + industria - mL - rz1 - rz2;
  const paletsAjustados = palets - invAnterior;
  const grossDiff = produccionReal - paletsAjustados - invFinal;
  const totalShrinkage = pc + pm;
  const unjustifiedDiff = grossDiff - totalShrinkage;
  const deviationPct = produccionReal > 0 ? (grossDiff / produccionReal) * 100 : 0;
  const realDeviationPct = produccionReal > 0 ? (unjustifiedDiff / produccionReal) * 100 : 0;

  const semaforo: SemaforoLevel =
    Math.abs(realDeviationPct) < 1 ? "verde" :
    Math.abs(realDeviationPct) <= 3 ? "amarillo" : "rojo";

  const alerts: string[] = [];
  if (palets > produccionReal + invFinal + 1000) {
    alerts.push("Posible fila TOTAL incluida en palets");
  }
  if (unjustifiedDiff < -500) {
    alerts.push("DSJ negativa: revisar inventario final del día anterior o duplicidades en palets");
  }
  if (produccionReal <= 0 && produced > 0) {
    alerts.push("Producción real <= 0: revisar valores de mujeres y reciclado");
  }
  if (produced <= 0) {
    alerts.push("No se ha podido extraer la producción del calibrador");
  }
  if (palets <= 0 && produced > 0) {
    alerts.push("No se ha podido extraer el peso de palets dados de alta");
  }

  const steps: CascadeStep[] = [
    { key: "production", labelKey: "part.cascade.production", value: produced, isMinus: false, running: 0 },
    { key: "industria", labelKey: "part.cascade.plus_industria", value: industria, isMinus: false, running: 0 },
    { key: "mujeres_l", labelKey: "part.cascade.minus_mujeres_l", value: mL, isMinus: true, running: 0 },
    { key: "reciclado_z1", labelKey: "part.cascade.minus_reciclado_z1", value: rz1, isMinus: true, running: 0 },
    { key: "reciclado_z2", labelKey: "part.cascade.minus_reciclado_z2", value: rz2, isMinus: true, running: 0 },
    { key: "palets", labelKey: "part.cascade.minus_palets", value: paletsAjustados, isMinus: true, running: 0 },
    { key: "inventario", labelKey: "part.cascade.minus_inventario_neto", value: invFinal, isMinus: true, running: 0 },
    { key: "podrido_calib", labelKey: "part.cascade.minus_podrido_calib", value: pc, isMinus: true, running: 0 },
    { key: "podrido_manual", labelKey: "part.cascade.minus_podrido_manual", value: pm, isMinus: true, running: 0 },
  ];

  let running = 0;
  steps.forEach((s, idx) => {
    if (idx === 0) running = s.value;
    else if (s.isMinus) running -= s.value;
    else running += s.value;
    s.running = running;
  });

  return {
    steps,
    produced,
    produccionReal,
    paletsAjustados,
    grossDiff,
    totalShrinkage,
    unjustifiedDiff,
    realDiff: unjustifiedDiff,
    deviationPct,
    realDeviationPct,
    semaforo,
    alerts,
  };
}
