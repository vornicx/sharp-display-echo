export const fmtKg = (n: number | null | undefined, locale = "es-ES") => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(n));
};

export const fmtPct = (n: number | null | undefined, digits = 1) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return `${Number(n).toFixed(digits)}%`;
};

export const sumBy = <T,>(arr: T[], pick: (x: T) => number) =>
  arr.reduce((acc, x) => acc + (Number(pick(x)) || 0), 0);
