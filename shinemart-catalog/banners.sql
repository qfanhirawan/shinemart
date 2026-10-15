-- ==============================================================================
-- SCRIPT SQL: TABEL BANNERS & SUPABASE STORAGE BUCKET
-- Sistem Katalog Digital Shinemart
-- Jalankan script ini di SQL Editor dashboard Supabase Anda.
-- ==============================================================================

-- 1. Buat Tabel banners
CREATE TABLE IF NOT EXISTS public.banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    badge_text TEXT DEFAULT 'KATALOG ONLINE',
    title TEXT NOT NULL,
    description TEXT,
    button_text TEXT DEFAULT 'Lihat Katalog Produk',
    button_url TEXT DEFAULT '#katalog',
    image_url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index untuk optimasi query sorting & filter aktif
CREATE INDEX IF NOT EXISTS idx_banners_sort_order ON public.banners (sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_banners_is_active ON public.banners (is_active);

-- 2. Aktifkan Row Level Security (RLS) pada tabel banners
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- 3. Policy Akses Tabel banners
-- Izinkan siapa saja (publik / anon) membaca banner
DROP POLICY IF EXISTS "Public can view active banners" ON public.banners;
CREATE POLICY "Public can view active banners" 
ON public.banners 
FOR SELECT 
USING (true);

-- Izinkan anon key melakukan INSERT (tambah banner dari admin panel)
DROP POLICY IF EXISTS "Allow anon insert banners" ON public.banners;
CREATE POLICY "Allow anon insert banners" 
ON public.banners 
FOR INSERT 
WITH CHECK (true);

-- Izinkan anon key melakukan UPDATE (edit & toggle status banner)
DROP POLICY IF EXISTS "Allow anon update banners" ON public.banners;
CREATE POLICY "Allow anon update banners" 
ON public.banners 
FOR UPDATE 
USING (true);

-- Izinkan anon key melakukan DELETE (hapus banner)
DROP POLICY IF EXISTS "Allow anon delete banners" ON public.banners;
CREATE POLICY "Allow anon delete banners" 
ON public.banners 
FOR DELETE 
USING (true);

-- 4. Konfigurasi Bucket Supabase Storage untuk upload file gambar banner
-- Membuat bucket 'banners' di skema storage jika belum ada
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'banners',
    'banners',
    true,
    5242880, -- Maksimal ukuran gambar 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']
)
ON CONFLICT (id) DO UPDATE 
SET public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];

-- 5. Policy Akses Row Level Security untuk Storage Bucket 'banners'
DROP POLICY IF EXISTS "Public Access Banners Storage" ON storage.objects;
CREATE POLICY "Public Access Banners Storage"
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'banners');

DROP POLICY IF EXISTS "Anon Insert Banners Storage" ON storage.objects;
CREATE POLICY "Anon Insert Banners Storage"
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'banners');

DROP POLICY IF EXISTS "Anon Update Banners Storage" ON storage.objects;
CREATE POLICY "Anon Update Banners Storage"
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'banners');

DROP POLICY IF EXISTS "Anon Delete Banners Storage" ON storage.objects;
CREATE POLICY "Anon Delete Banners Storage"
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'banners');

-- 6. Masukkan Data Awal (Seed Data) dari Banner Default Shinemart
INSERT INTO public.banners (badge_text, title, description, button_text, button_url, image_url, sort_order, is_active)
VALUES 
(
    'KATALOG ONLINE',
    'PROMO SPESIAL SHINEMART',
    'Diskon hingga 35% Sembako & Kebutuhan Dapur Hemat!',
    'Lihat Katalog Produk',
    '#katalog',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&auto=format&fit=crop&q=80',
    1,
    true
),
(
    'HOT DEAL',
    'BELI BUNDLE LEBIH HEMAT',
    'Paket Snack & Minuman Segar Spesial Warna Favorit',
    'Lihat Katalog Produk',
    '#katalog',
    'https://images.unsplash.com/photo-1607344645866-009c320c5ab8?w=800&auto=format&fit=crop&q=80',
    2,
    true
),
(
    'PESAN VIA WA',
    'GRATIS ONGKIR AREA LOKAL',
    'Pesan Multi-Item via WhatsApp, Antar Cepat Dalam 30 Menit!',
    'Lihat Katalog Produk',
    '#katalog',
    'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800&auto=format&fit=crop&q=80',
    3,
    true
);
