-- =========================================================================
-- SQL MIGRATION: STORE SETTINGS & PRODUCT VISIBILITY UNTUK SHINEMART MOBILE
-- =========================================================================

-- 1. Tambah kolom is_active di tabel products jika belum ada (default true)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Buat tabel store_settings untuk konfigurasi operasional toko & mobile app
CREATE TABLE IF NOT EXISTS public.store_settings (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'main_store',
    is_store_open BOOLEAN DEFAULT true,
    auto_close_notes TEXT DEFAULT 'Toko sedang tutup sementara. Pesanan kilat akan dibuka kembali pukul 07.00 WIB.',
    delivery_fee_per_km NUMERIC(10, 2) DEFAULT 2500,
    base_delivery_fee NUMERIC(10, 2) DEFAULT 10000,
    max_delivery_distance_km NUMERIC(5, 2) DEFAULT 10.0,
    free_delivery_min_spend NUMERIC(12, 2) DEFAULT 30000,
    store_whatsapp VARCHAR(50) DEFAULT '6287782603733',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert nilai default jika belum ada
INSERT INTO public.store_settings (id, is_store_open, base_delivery_fee, delivery_fee_per_km, max_delivery_distance_km, free_delivery_min_spend)
VALUES ('main_store', true, 10000, 2500, 10.0, 30000)
ON CONFLICT (id) DO NOTHING;

-- RLS untuk store_settings
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'store_settings' AND policyname = 'Public can view store_settings'
  ) THEN
    CREATE POLICY "Public can view store_settings" ON public.store_settings FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'store_settings' AND policyname = 'Admin can update store_settings'
  ) THEN
    CREATE POLICY "Admin can update store_settings" ON public.store_settings FOR UPDATE USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'store_settings' AND policyname = 'Admin can insert store_settings'
  ) THEN
    CREATE POLICY "Admin can insert store_settings" ON public.store_settings FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 4. Pastikan tabel orders dan store_settings masuk publikasi realtime secara aman (tanpa duplikasi)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'store_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_settings;
  END IF;
END $$;
