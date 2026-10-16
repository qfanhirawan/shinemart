-- ==============================================================================
-- SHINEMART SUPABASE MIGRATION: SEPARATE MOBILE PROMOS & DYNAMIC BANNERS
-- Script ini membuat tabel terpisah khusus untuk Mobile App:
-- 1. public.mobile_banners (Dynamic Banner Slider Mobile)
-- 2. public.mobile_promotional_sections (Seksi Promo Khusus Mobile App)
--
-- Jalankan script ini di SQL Editor pada dashboard Supabase Anda.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABEL DYNAMIC BANNER KHUSUS MOBILE APP (public.mobile_banners)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mobile_banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    badge TEXT DEFAULT '⚡ FLASH SALE • DISKON 40%',
    title TEXT NOT NULL,
    image_url TEXT NOT NULL,
    action_type TEXT DEFAULT 'category', -- 'category' (buka kategori) | 'voucher' (klaim voucher)
    action_value TEXT DEFAULT 'sembako', -- nama kategori (misal: sembako, frozen) atau kode voucher (misal: ONGKIRGRATIS)
    sort_order INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index untuk sorting & filter aktif
CREATE INDEX IF NOT EXISTS idx_mobile_banners_sort ON public.mobile_banners (sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_mobile_banners_active ON public.mobile_banners (is_active);

-- Row Level Security (RLS)
ALTER TABLE public.mobile_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active mobile banners" ON public.mobile_banners;
CREATE POLICY "Public can view active mobile banners" ON public.mobile_banners FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon insert mobile banners" ON public.mobile_banners;
CREATE POLICY "Allow anon insert mobile banners" ON public.mobile_banners FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update mobile banners" ON public.mobile_banners;
CREATE POLICY "Allow anon update mobile banners" ON public.mobile_banners FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow anon delete mobile banners" ON public.mobile_banners;
CREATE POLICY "Allow anon delete mobile banners" ON public.mobile_banners FOR DELETE USING (true);

-- Seed Data Awal Banner Mobile
INSERT INTO public.mobile_banners (badge, title, image_url, action_type, action_value, sort_order, is_active)
VALUES
('⚡ FLASH SALE • DISKON 40%', 'Diskon Sembako & Kebutuhan Pokok Dapur', 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80', 'category', 'sembako', 1, true),
('🛵 BEBAS ONGKIR SEPUASNYA', 'Gratis Ongkir Kilat 15-25 Menit', 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=1200&q=80', 'voucher', 'ONGKIRGRATIS', 2, true),
('🧊 FROZEN SPECIAL • CASHBACK 20%', 'Stok Frozen Food & Olahan Segar Terlengkap', 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=1200&q=80', 'category', 'frozen', 3, true)
ON CONFLICT DO NOTHING;


-- ------------------------------------------------------------------------------
-- 2. TABEL SEKSI PROMO KHUSUS MOBILE APP (public.mobile_promotional_sections)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mobile_promotional_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT 'Koleksi promo pilihan hemat Shinemart',
    badge TEXT DEFAULT 'PROMO SPESIAL',
    icon TEXT DEFAULT '🔥',
    icon_bg TEXT DEFAULT '#0077D6',
    poster_image TEXT NOT NULL,
    category_filter TEXT DEFAULT 'sembako', -- Kategori produk yang otomatis ditarik di mobile app
    sort_order INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index untuk sorting & filter aktif
CREATE INDEX IF NOT EXISTS idx_mobile_promo_sort ON public.mobile_promotional_sections (sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_mobile_promo_active ON public.mobile_promotional_sections (is_active);

-- Row Level Security (RLS)
ALTER TABLE public.mobile_promotional_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active mobile sections" ON public.mobile_promotional_sections;
CREATE POLICY "Public can view active mobile sections" ON public.mobile_promotional_sections FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon insert mobile sections" ON public.mobile_promotional_sections;
CREATE POLICY "Allow anon insert mobile sections" ON public.mobile_promotional_sections FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update mobile sections" ON public.mobile_promotional_sections;
CREATE POLICY "Allow anon update mobile sections" ON public.mobile_promotional_sections FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow anon delete mobile sections" ON public.mobile_promotional_sections;
CREATE POLICY "Allow anon delete mobile sections" ON public.mobile_promotional_sections FOR DELETE USING (true);

-- Seed Data Awal Seksi Promo Mobile
INSERT INTO public.mobile_promotional_sections (title, subtitle, badge, icon, icon_bg, poster_image, category_filter, sort_order, is_active)
VALUES
('Sembako Murah', 'Koleksi promo pilihan hemat Shinemart', 'PROMO SPESIAL', '🔥', '#0077D6', 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80', 'sembako', 1, true),
('Frozen Food Pilihan', 'Nugget, sosis & stok olahan beku segar', 'KILAT & BEKU', '🧊', '#38B6FF', 'https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?auto=format&fit=crop&w=600&q=80', 'frozen', 2, true),
('Minuman & Snack Segar', 'Segarkan harimu dengan aneka camilan favorit', 'HEMAT SEGAR', '🥤', '#FF66C4', 'https://images.unsplash.com/photo-1621996346565-e3d5d6281741?auto=format&fit=crop&w=600&q=80', 'minuman', 3, true)
ON CONFLICT DO NOTHING;


-- ------------------------------------------------------------------------------
-- 3. REALTIME PUBLICATION UNTUK PERUBAHAN INSTAN DI MOBILE APP
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'mobile_banners'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_banners;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'mobile_promotional_sections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_promotional_sections;
  END IF;
END $$;
