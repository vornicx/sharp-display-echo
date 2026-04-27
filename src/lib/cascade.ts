/**
 * Reconciliation cascade for a daily report.
 *
 * Order (per Lasarte spec, updated):
 *   1. Producción total (informe de producción) — último peso acumulado
 *   2. + Industria / Cítricos manual (antes "reciclado manual / box azules")
 *      = PRODUCCIÓN AJUSTADA
 *   3. − Mujeres (L) — clase L del informe de tamaños, dato duplicado
 *   4. − Palets dados de alta
 *   5. − Inventario final
 *      = DIFERENCIA BRUTA
 *   6. − Podrido calibrador
 *   7. − Reciclado malla Z1
 *   8. − Reciclado malla Z2
 *   9. − Podrido manual
 *      = DIFERENCIA SIN JUSTIFICAR (residuo, debe ser pequeño)
 *
 * Nota: Se han eliminado de la cascada "Mujeres (calibrador)" y "Muestra"
 * porque no deben restarse aquí. La única "mujeres" que se resta es la de
 * clase L del informe de tamaños (campo kg_mujeres_manual en BBDD).
 */

export interface CascadeInputs {
  kg_production_total: number;
  kg_palets_alta: number;
  kg_mujeres_manual: number; // Mujeres (L) — clase L del informe de tamaños
  kg_podrido_calibrador_manual: number;
  kg_muestra?: number; // ya no se usa en la cascada (se mantiene por compatibilidad)
  kg_reciclado_manual: number; // Industria / Cítricos manual — SE SUMA
  kg_reciclado_malla_z1?: number;
  kg_reciclado_malla_z2?: number;
  kg_podrido_manual: number;
  kg_inventario_final: number;
  kg_palets_pendientes_anterior?: number; // Palets sin dar de alta del día anterior — se RESTA al inventario
}

export interface CascadeOutput {
  steps: Array<{ key: string; labelKey: string; value: number; running: number; isMinus: boolean }>;
  produced: number;
  palets: number;
  grossDiff: number;        // produccionAjustada - mujeresL - palets - inventario
  totalShrinkage: number;   // suma de mermas restantes (podrido_calib + recic_z1 + recic_z2 + podrido_man)
  unjustifiedDiff: number;  // grossDiff - totalShrinkage
  realDiff: number;         // alias de unjustifiedDiff (compatibilidad)
  deviationPct: number;     // grossDiff / produced
  realDeviationPct: number; // unjustifiedDiff / produced
}

export function computeCascade(i: CascadeInputs): CascadeOutput {
  const produced = Number(i.kg_production_total) || 0;
  const palets = Number(i.kg_palets_alta) || 0;
  const invRaw = Number(i.kg_inventario_final) || 0;
  const pendAnt = Number(i.kg_palets_pendientes_anterior) || 0;
  const inv = invRaw - pendAnt; // inventario neto = final − pendientes del día anterior
  const mL = Number(i.kg_mujeres_manual) || 0;
  const pc = Number(i.kg_podrido_calibrador_manual) || 0;
  const industria = Number(i.kg_reciclado_manual) || 0;
  const rz1 = Number(i.kg_reciclado_malla_z1) || 0;
  const rz2 = Number(i.kg_reciclado_malla_z2) || 0;
  const pm = Number(i.kg_podrido_manual) || 0;

  const steps = [
    { key: "production",         labelKey: "part.cascade.production",              value: produced,  isMinus: false, running: 0 },
    { key: "industria",          labelKey: "part.cascade.plus_industria",          value: industria, isMinus: false, running: 0 },
    { key: "mujeres_l",          labelKey: "part.cascade.minus_mujeres_l",         value: mL,        isMinus: true,  running: 0 },
    { key: "palets",             labelKey: "part.cascade.minus_palets",            value: palets,    isMinus: true,  running: 0 },
    { key: "inventario",         labelKey: "part.cascade.minus_inventario_neto",   value: inv,       isMinus: true,  running: 0 },
    { key: "podrido_calib",      labelKey: "part.cascade.minus_podrido_calib",     value: pc,        isMinus: true,  running: 0 },
    { key: "reciclado_malla_z1", labelKey: "part.cascade.minus_reciclado_malla_z1",value: rz1,       isMinus: true,  running: 0 },
    { key: "reciclado_malla_z2", labelKey: "part.cascade.minus_reciclado_malla_z2",value: rz2,       isMinus: true,  running: 0 },
    { key: "podrido_manual",     labelKey: "part.cascade.minus_podrido_manual",    value: pm,        isMinus: true,  running: 0 },
  ];

  let running = 0;
  steps.forEach((s, idx) => {
    if (idx === 0) running = s.value;
    else if (s.isMinus) running -= s.value;
    else running += s.value;
    s.running = running;
  });

  const productionAdjusted = produced + industria;
  const grossDiff = productionAdjusted - mL - palets - inv;
  const totalShrinkage = pc + rz1 + rz2 + pm;
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
