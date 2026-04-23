
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('operario', 'admin');
CREATE TYPE public.parte_estado AS ENUM ('Borrador', 'Analizado', 'Con descuadre', 'Validado');
CREATE TYPE public.archivo_tipo AS ENUM ('GSTOCK', 'Produccion', 'BoxAzules', 'FotoLotes', 'Otro');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- PARTES DIARIOS
CREATE TABLE public.partes_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kg_mujeres_manual NUMERIC NOT NULL DEFAULT 0,
  kg_podrido_calibrador_manual NUMERIC NOT NULL DEFAULT 0,
  kg_reciclado_manual NUMERIC NOT NULL DEFAULT 0,
  kg_reciclado_malla_z1 NUMERIC NOT NULL DEFAULT 0,
  kg_reciclado_malla_z2 NUMERIC NOT NULL DEFAULT 0,
  kg_podrido_manual NUMERIC NOT NULL DEFAULT 0,
  kg_inventario_final NUMERIC NOT NULL DEFAULT 0,
  notas_inventario TEXT,
  notas_generales TEXT,
  estado public.parte_estado NOT NULL DEFAULT 'Borrador',
  resumen_ia JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);
CREATE INDEX idx_partes_user_date ON public.partes_diarios(user_id, date DESC);
ALTER TABLE public.partes_diarios ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.production_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.partes_diarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  product TEXT NOT NULL,
  size_range TEXT,
  kg_produced NUMERIC NOT NULL DEFAULT 0,
  destination TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_production_part ON public.production_runs(part_id);
ALTER TABLE public.production_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.gstock_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.partes_diarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  product TEXT NOT NULL,
  size_range TEXT,
  kg_expected NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gstock_part ON public.gstock_entries(part_id);
ALTER TABLE public.gstock_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.box_azules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.partes_diarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kg_reciclado NUMERIC NOT NULL DEFAULT 0,
  kg_podrido NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_box_part ON public.box_azules(part_id);
ALTER TABLE public.box_azules ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.partes_archivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.partes_diarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type public.archivo_tipo NOT NULL,
  file_size NUMERIC,
  mime_type TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_archivos_part ON public.partes_archivos(part_id);
ALTER TABLE public.partes_archivos ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lotes_dia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.partes_diarios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lote_codigo TEXT NOT NULL,
  producto TEXT,
  notas TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lotes_part ON public.lotes_dia(part_id);
ALTER TABLE public.lotes_dia ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.costes_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID REFERENCES public.partes_diarios(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  zona_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  cantidad NUMERIC NOT NULL DEFAULT 0,
  unidad TEXT,
  coste_unitario NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_costes_user_date ON public.costes_diarios(user_id, date DESC);
ALTER TABLE public.costes_diarios ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.asistencia_diaria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID REFERENCES public.partes_diarios(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  zona_id TEXT NOT NULL,
  plantilla_total NUMERIC NOT NULL DEFAULT 0,
  presentes NUMERIC NOT NULL DEFAULT 0,
  ausentes NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_asistencia_user_date ON public.asistencia_diaria(user_id, date DESC);
ALTER TABLE public.asistencia_diaria ENABLE ROW LEVEL SECURITY;

-- TRIGGERS updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_partes_updated BEFORE UPDATE ON public.partes_diarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TRIGGER: auto-create profile + default role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'operario');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS POLICIES
CREATE POLICY "profiles select own or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles update own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "roles select own or admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles admin manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'partes_diarios', 'production_runs', 'gstock_entries',
    'box_azules', 'partes_archivos', 'lotes_dia',
    'costes_diarios', 'asistencia_diaria'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format($f$
      CREATE POLICY "%1$s select own or admin" ON public.%1$I
        FOR SELECT TO authenticated
        USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "%1$s insert own" ON public.%1$I
        FOR INSERT TO authenticated
        WITH CHECK (user_id = auth.uid());
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "%1$s update own or admin" ON public.%1$I
        FOR UPDATE TO authenticated
        USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
    $f$, t);
    EXECUTE format($f$
      CREATE POLICY "%1$s delete own or admin" ON public.%1$I
        FOR DELETE TO authenticated
        USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
    $f$, t);
  END LOOP;
END $$;

-- STORAGE BUCKET
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'partes-archivos',
  'partes-archivos',
  false,
  20971520,
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
);

CREATE POLICY "partes-archivos own select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'partes-archivos'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );
CREATE POLICY "partes-archivos own insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'partes-archivos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "partes-archivos own update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'partes-archivos'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );
CREATE POLICY "partes-archivos own delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'partes-archivos'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'))
  );
