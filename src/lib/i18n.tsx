import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Lang = "es" | "en";

type Dict = Record<string, string>;

const es: Dict = {
  // App
  "app.name": "Lasarte",
  "app.tagline": "Producción Naranjas",

  // Auth
  "auth.signin": "Iniciar sesión",
  "auth.signup": "Crear cuenta",
  "auth.email": "Email",
  "auth.password": "Contraseña",
  "auth.fullname": "Nombre completo",
  "auth.signin.cta": "Entrar",
  "auth.signup.cta": "Registrarse",
  "auth.toggle.signup": "¿No tienes cuenta? Regístrate",
  "auth.toggle.signin": "¿Ya tienes cuenta? Inicia sesión",
  "auth.signout": "Cerrar sesión",
  "auth.welcome": "Bienvenido a Lasarte",
  "auth.welcome.sub": "Sistema de gestión de producción",
  "auth.error.generic": "No se ha podido completar la operación",
  "auth.success.signup": "Cuenta creada. Ya puedes iniciar sesión.",

  // Nav
  "nav.summary": "Resumen",
  "nav.dashboard": "Dashboard",
  "nav.parts": "Partes diarios",
  "nav.parts.list": "Lista de partes",
  "nav.costs": "Costes",
  "nav.costs.consumption": "Consumos",
  "nav.costs.attendance": "Asistencia",

  // Dashboard
  "dash.title": "Resumen ejecutivo",
  "dash.subtitle": "Visión general de la producción del día",
  "dash.kpi.production": "Producción total",
  "dash.kpi.palets": "Palets dados de alta",
  "dash.kpi.diff": "Diferencia bruta",
  "dash.kpi.diff.real": "Diferencia real",
  "dash.kpi.deviation": "% Descuadre",
  "dash.kpi.shrinkage": "Merma total",
  "dash.kpi.attendance": "Asistencia",
  "dash.chart.cascade": "Cascada de conciliación (últimos 14 días)",
  "dash.chart.compare": "Real vs GSTOCK (30 días)",
  "dash.chart.shrinkage": "Mermas diarias (30 días)",
  "dash.recent.parts": "Últimos partes",
  "dash.empty": "Aún no hay datos. Crea tu primer parte diario para empezar.",

  // Parts list
  "parts.title": "Partes diarios",
  "parts.subtitle": "Gestiona y analiza la producción día a día",
  "parts.new": "Nuevo parte",
  "parts.col.date": "Fecha",
  "parts.col.status": "Estado",
  "parts.col.production": "Producción (kg)",
  "parts.col.palets": "Palets (kg)",
  "parts.col.diff": "Diferencia (kg)",
  "parts.col.deviation": "% Desv.",
  "parts.col.actions": "Acciones",
  "parts.empty": "No hay partes registrados.",
  "parts.filter.all": "Todos los estados",

  // Part detail
  "part.title": "Parte del día",
  "part.tab.info": "Información",
  "part.tab.files": "Archivos",
  "part.tab.manual": "Datos manuales",
  "part.tab.ai": "Análisis IA",
  "part.tab.validation": "Validación",
  "part.field.date": "Fecha",
  "part.field.notes": "Notas generales",
  "part.field.kg_mujeres": "Mujeres (calibrador)",
  "part.field.kg_podrido_calib": "Podrido calibrador",
  "part.field.kg_reciclado_manual": "Industria de la punta",
  "part.field.kg_reciclado_malla_z1": "Reciclado malla zona 1",
  "part.field.kg_reciclado_malla_z2": "Reciclado malla zona 2",
  "part.field.kg_podrido_manual": "Podrido manual bolsa basura",
  "part.field.kg_inventario": "Inventario final (palets sin alta)",
  "part.field.kg_palets_pendientes_anterior": "Palets sin dar de alta del día anterior",
  "part.field.kg_palets_pendientes_anterior.help": "Se RESTA al inventario final para no contarlos dos veces",
  "part.field.notas_inventario": "Notas inventario",
  "part.save": "Guardar",
  "part.saved": "Parte guardado",
  "part.analyze": "Analizar con IA",
  "part.analyzing": "Analizando...",
  "part.analyze.help": "Sube los archivos de GSTOCK, Producción, Box azules y Foto de lotes; luego pulsa Analizar.",
  "part.validate": "Marcar como validado",
  "part.validated": "Parte validado",
  "part.cascade.title": "Cascada de conciliación",
  "part.cascade.production": "Resumen Calibrador",
  "part.cascade.plus_industria": "+ Industria de la punta",
  "part.cascade.minus_mujeres_l": "− Mujeres (L)",
  "part.cascade.minus_mujeres": "− Mujeres (calibrador)",
  "part.cascade.minus_podrido_calib": "− Podrido calibrador",
  "part.cascade.minus_muestra": "− Muestra",
  "part.cascade.minus_reciclado_manual": "− Industria de la punta",
  "part.cascade.minus_reciclado_malla_z1": "− Reciclado malla Z1",
  "part.cascade.minus_reciclado_malla_z2": "− Reciclado malla Z2",
  "part.cascade.minus_podrido_manual": "− Podrido manual bolsa basura",
  "part.cascade.minus_palets": "− Palets dados de alta (neto − inv. ant.)",
  "part.cascade.minus_inventario": "− Inventario final",
  "part.cascade.minus_inventario_neto": "− Inventario final día actual",
  "part.cascade.real_diff": "= Diferencia justificada por podrido y merma natural",
  "part.cascade.gross_diff": "Diferencia bruta (a justificar)",
  "part.cascade.unjustified_diff": "= Diferencia justificada por podrido y merma natural",
  "part.cascade.unjustified_help": "Diferencia entre lo que dicen los informes y lo realmente producido, justificada por podrido y merma natural",
  "part.lotes.title": "Lotes de sala de control",
  "part.lotes.add": "Añadir lote",
  "part.lotes.placeholder": "Código del lote (añadir manualmente)",
  "part.lotes.empty": "Sube la foto en la pestaña Archivos y pulsa Analizar con IA para extraer los lotes automáticamente.",
  "part.lotes.upload_photo": "Subir foto de lotes",

  // Files
  "files.title": "Archivos del parte",
  "files.upload": "Subir archivos",
  "files.dropzone": "Arrastra archivos aquí o haz click para seleccionar",
  "files.type.GSTOCK": "GSTOCK",
  "files.type.Produccion": "Producción",
  "files.type.BoxAzules": "Box azules",
  "files.type.FotoLotes": "Foto lotes",
  "files.type.Otro": "Otro",
  "files.size.max": "Máx 20 MB por archivo",
  "files.empty": "Aún no hay archivos subidos.",
  "files.delete": "Eliminar",

  // Costs
  "costs.consumption.title": "Consumos variables",
  "costs.consumption.subtitle": "Cera, agua, luz y gasoil por zona",
  "costs.attendance.title": "Asistencia diaria",
  "costs.attendance.subtitle": "Plantilla, presentes y ausentes por zona",
  "costs.add.row": "Añadir fila",
  "costs.col.date": "Fecha",
  "costs.col.zone": "Zona",
  "costs.col.type": "Tipo",
  "costs.col.qty": "Cantidad",
  "costs.col.unit": "Unidad",
  "costs.col.unit_cost": "Coste unitario",
  "costs.col.total": "Total",
  "costs.col.staff": "Plantilla",
  "costs.col.present": "Presentes",
  "costs.col.absent": "Ausentes",
  "costs.col.attendance_pct": "% Asistencia",

  // Common
  "common.cancel": "Cancelar",
  "common.delete": "Eliminar",
  "common.edit": "Editar",
  "common.view": "Ver",
  "common.confirm": "Confirmar",
  "common.loading": "Cargando...",
  "common.search": "Buscar",
  "common.kg": "kg",
  "common.back": "Volver",
  "common.error": "Error",
  "common.success": "Hecho",
};

const en: Dict = {
  "app.name": "Lasarte",
  "app.tagline": "Orange Production",

  "auth.signin": "Sign in",
  "auth.signup": "Create account",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.fullname": "Full name",
  "auth.signin.cta": "Sign in",
  "auth.signup.cta": "Sign up",
  "auth.toggle.signup": "No account? Sign up",
  "auth.toggle.signin": "Already have an account? Sign in",
  "auth.signout": "Sign out",
  "auth.welcome": "Welcome to Lasarte",
  "auth.welcome.sub": "Production management system",
  "auth.error.generic": "Could not complete the operation",
  "auth.success.signup": "Account created. You can sign in now.",

  "nav.summary": "Summary",
  "nav.dashboard": "Dashboard",
  "nav.parts": "Daily reports",
  "nav.parts.list": "Reports list",
  "nav.costs": "Costs",
  "nav.costs.consumption": "Consumption",
  "nav.costs.attendance": "Attendance",

  "dash.title": "Executive summary",
  "dash.subtitle": "Today's production overview",
  "dash.kpi.production": "Total production",
  "dash.kpi.palets": "Pallets registered",
  "dash.kpi.diff": "Gross difference",
  "dash.kpi.diff.real": "Real difference",
  "dash.kpi.deviation": "% Deviation",
  "dash.kpi.shrinkage": "Total shrinkage",
  "dash.kpi.attendance": "Attendance",
  "dash.chart.cascade": "Reconciliation cascade (last 14 days)",
  "dash.chart.compare": "Actual vs GSTOCK (30 days)",
  "dash.chart.shrinkage": "Daily shrinkage (30 days)",
  "dash.recent.parts": "Recent reports",
  "dash.empty": "No data yet. Create your first daily report to get started.",

  "parts.title": "Daily reports",
  "parts.subtitle": "Manage and analyze production day by day",
  "parts.new": "New report",
  "parts.col.date": "Date",
  "parts.col.status": "Status",
  "parts.col.production": "Production (kg)",
  "parts.col.palets": "Pallets (kg)",
  "parts.col.diff": "Difference (kg)",
  "parts.col.deviation": "% Dev.",
  "parts.col.actions": "Actions",
  "parts.empty": "No reports yet.",
  "parts.filter.all": "All statuses",

  "part.title": "Daily report",
  "part.tab.info": "Information",
  "part.tab.files": "Files",
  "part.tab.manual": "Manual data",
  "part.tab.ai": "AI analysis",
  "part.tab.validation": "Validation",
  "part.field.date": "Date",
  "part.field.notes": "General notes",
  "part.field.kg_mujeres": "Women (calibrator)",
  "part.field.kg_podrido_calib": "Calibrator rotten",
  "part.field.kg_reciclado_manual": "Tip industry (Industria de la punta)",
  "part.field.kg_reciclado_malla_z1": "Mesh recycled zone 1",
  "part.field.kg_reciclado_malla_z2": "Mesh recycled zone 2",
  "part.field.kg_podrido_manual": "Manual rotten (trash bag)",
  "part.field.kg_inventario": "Final inventory (pallets not registered)",
  "part.field.kg_palets_pendientes_anterior": "Pallets not registered from previous day",
  "part.field.kg_palets_pendientes_anterior.help": "Subtracted from final inventory to avoid double counting",
  "part.field.notas_inventario": "Inventory notes",
  "part.save": "Save",
  "part.saved": "Report saved",
  "part.analyze": "Analyze with AI",
  "part.analyzing": "Analyzing...",
  "part.analyze.help": "Upload GSTOCK, Production, Blue Boxes and Lots photo files; then click Analyze.",
  "part.validate": "Mark as validated",
  "part.validated": "Report validated",
  "part.cascade.title": "Reconciliation cascade",
  "part.cascade.production": "Calibrator summary",
  "part.cascade.plus_industria": "+ Tip industry",
  "part.cascade.minus_mujeres_l": "− Women (L)",
  "part.cascade.minus_mujeres": "− Women (calibrator)",
  "part.cascade.minus_podrido_calib": "− Calibrator rotten",
  "part.cascade.minus_muestra": "− Sample",
  "part.cascade.minus_reciclado_manual": "− Tip industry",
  "part.cascade.minus_reciclado_malla_z1": "− Mesh recycled Z1",
  "part.cascade.minus_reciclado_malla_z2": "− Mesh recycled Z2",
  "part.cascade.minus_podrido_manual": "− Manual rotten (trash bag)",
  "part.cascade.minus_palets": "− Pallets registered (net − prev. inv.)",
  "part.cascade.minus_inventario": "− Final inventory",
  "part.cascade.minus_inventario_neto": "− Final inventory (current day)",
  "part.cascade.real_diff": "= Difference justified by rotten and natural shrinkage",
  "part.cascade.gross_diff": "Gross difference (to be justified)",
  "part.cascade.unjustified_diff": "= Difference justified by rotten and natural shrinkage",
  "part.cascade.unjustified_help": "Gap between reported production and what was actually produced, justified by rotten and natural shrinkage",
  "part.lotes.title": "Control room lots",
  "part.lotes.add": "Add lot",
  "part.lotes.placeholder": "Lot code (add manually)",
  "part.lotes.empty": "Upload the photo in the Files tab and click Analyze with AI to extract lots automatically.",
  "part.lotes.upload_photo": "Upload lots photo",

  "files.title": "Report files",
  "files.upload": "Upload files",
  "files.dropzone": "Drag files here or click to select",
  "files.type.GSTOCK": "GSTOCK",
  "files.type.Produccion": "Production",
  "files.type.BoxAzules": "Blue boxes",
  "files.type.FotoLotes": "Lots photo",
  "files.type.Otro": "Other",
  "files.size.max": "Max 20 MB per file",
  "files.empty": "No files uploaded yet.",
  "files.delete": "Delete",

  "costs.consumption.title": "Variable consumption",
  "costs.consumption.subtitle": "Wax, water, electricity and diesel by zone",
  "costs.attendance.title": "Daily attendance",
  "costs.attendance.subtitle": "Staff, present and absent by zone",
  "costs.add.row": "Add row",
  "costs.col.date": "Date",
  "costs.col.zone": "Zone",
  "costs.col.type": "Type",
  "costs.col.qty": "Quantity",
  "costs.col.unit": "Unit",
  "costs.col.unit_cost": "Unit cost",
  "costs.col.total": "Total",
  "costs.col.staff": "Staff",
  "costs.col.present": "Present",
  "costs.col.absent": "Absent",
  "costs.col.attendance_pct": "% Attendance",

  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.view": "View",
  "common.confirm": "Confirm",
  "common.loading": "Loading...",
  "common.search": "Search",
  "common.kg": "kg",
  "common.back": "Back",
  "common.error": "Error",
  "common.success": "Done",
};

const dicts: Record<Lang, Dict> = { es, en };

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const Ctx = createContext<I18nCtx | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("lasarte.lang")) as Lang | null;
    return stored === "en" ? "en" : "es";
  });

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("lasarte.lang", l);
  };

  const t = (key: string) => dicts[lang][key] ?? key;

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
