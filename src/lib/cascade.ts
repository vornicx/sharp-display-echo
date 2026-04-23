/**
 * Reconciliation cascade for a daily report.
 *
 * Order (per Lasarte spec, updated):
 *   1. Producción total (informe de producción)
 *   2. − Palets dados de alta            (lo que SÍ se ha contabilizado físicamente)
 *   3. − Inventario final                (lo que queda en planta sin dar de alta)
 *      = DIFERENCIA BRUTA (lo que falta justificar)
 *   4. − Mujeres calibrador
 *   5. − Podrido calibrador
 *   6. − Reciclado manual
 *   7. − Reciclado malla Z1
 *   8. − Reciclado malla Z2
 *   9. − Podrido manual
 *      = DIFERENCIA SIN JUSTIFICAR (residuo, debe ser pequeño)
 */

export interface CascadeInputs {
  kg_production_total: number;
  kg_palets_alta: number;
  kg_mujeres_manual: number;
  kg_podrido_calibrador_manual: number;
  kg_muestra?: number;
  kg_reciclado_manual: number;
  kg_reciclado_malla_z1?: number;
  kg_reciclado_malla_z2?: number;
  kg_podrido_manual: number;
  kg_inventario_final: number;
}

export interface CascadeOutput {
  steps: Array<{ key: string; labelKey: string; value: number; running: number; isMinus: boolean }>;
  produced: number;
  palets: number;
  grossDiff: number;        // produccion - palets - inventario (lo que falta justificar)
  totalShrinkage: number;   // suma de mermas (mujeres+podrido_calib+recic+podrido_man)
  unjustifiedDiff: number;  // grossDiff - totalShrinkage (residuo final, debería ser ~0)
  realDiff: number;         // alias de unjustifiedDiff (compatibilidad)
  deviationPct: number;     // grossDiff / produced
  realDeviationPct: number; // unjustifiedDiff / produced
}

export function computeCascade(i: CascadeInputs): CascadeOutput {
  const produced = Number(i.kg_production_total) || 0;
  const palets = Number(i.kg_palets_alta) || 0;
  const inv = Number(i.kg_inventario_final) || 0;
  const m = Number(i.kg_mujeres_manual) || 0;
  const pc = Number(i.kg_podrido_calibrador_manual) || 0;
  const mu = Number(i.kg_muestra) || 0;
  const rm = Number(i.kg_reciclado_manual) || 0;
  const rz1 = Number(i.kg_reciclado_malla_z1) || 0;
  const rz2 = Number(i.kg_reciclado_malla_z2) || 0;
  const pm = Number(i.kg_podrido_manual) || 0;

  const steps = [
    { key: "production",         labelKey: "part.cascade.production",              value: produced, isMinus: false, running: 0 },
    { key: "palets",             labelKey: "part.cascade.minus_palets",            value: palets,   isMinus: true,  running: 0 },
    { key: "inventario",         labelKey: "part.cascade.minus_inventario",        value: inv,      isMinus: true,  running: 0 },
    { key: "mujeres",            labelKey: "part.cascade.minus_mujeres",           value: m,        isMinus: true,  running: 0 },
    { key: "podrido_calib",      labelKey: "part.cascade.minus_podrido_calib",     value: pc,       isMinus: true,  running: 0 },
    { key: "muestra",            labelKey: "part.cascade.minus_muestra",           value: mu,       isMinus: true,  running: 0 },
    { key: "reciclado_manual",   labelKey: "part.cascade.minus_reciclado_manual",  value: rm,       isMinus: true,  running: 0 },
    { key: "reciclado_malla_z1", labelKey: "part.cascade.minus_reciclado_malla_z1",value: rz1,      isMinus: true,  running: 0 },
    { key: "reciclado_malla_z2", labelKey: "part.cascade.minus_reciclado_malla_z2",value: rz2,      isMinus: true,  running: 0 },
    { key: "podrido_manual",     labelKey: "part.cascade.minus_podrido_manual",    value: pm,       isMinus: true,  running: 0 },
  ];

  let running = 0;
  steps.forEach((s, idx) => {
    if (idx === 0) running = s.value;
    else running -= s.value;
    s.running = running;
  });

  const grossDiff = produced - palets - inv;
  const totalShrinkage = m + pc + mu + rm + rz1 + rz2 + pm;
  const unjustifiedDiff = grossDiff - totalShrinkage;
  const deviationPct = produced > 0 ? (grossDiff / produced) * 100 : 0;
  const realDeviationPct = produced > 0 ? (unjustifiedDiff / produced) * 100 : 0;

  return {
    steps,
    produced,
    palets,
    grossDiff,
    totalShrinkage,
    unjustifiedDiff,
    realDiff: unjustifiedDiff,
    deviationPct,
    realDeviationPct,
  };
}
