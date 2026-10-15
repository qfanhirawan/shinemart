-- ==============================================================================
-- SHINEMART SUPABASE MIGRATION: DYNAMIC PROMOTIONAL SECTIONS
-- Jalankan query ini di SQL Editor pada dashboard Supabase Anda.
-- ==============================================================================

-- 1. Buat Tabel Master: promotional_sections
CREATE TABLE IF NOT EXISTS public.promotional_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    see_all_url TEXT DEFAULT '#katalog',
    banner_image_url TEXT NOT NULL,
    banner_alt TEXT,
    bg_color TEXT DEFAULT 'auto',
    display_order INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Patch Kolom bg_color untuk database yang sudah terlanjur dibuat
ALTER TABLE public.promotional_sections ADD COLUMN IF NOT EXISTS bg_color TEXT DEFAULT 'auto';

CREATE INDEX IF NOT EXISTS idx_promotional_sections_order ON public.promotional_sections (display_order ASC);
CREATE INDEX IF NOT EXISTS idx_promotional_sections_active ON public.promotional_sections (is_active);

-- 2. Buat Tabel Relasi: promotional_section_items
-- CATATAN: product_id menggunakan BIGINT sesuai tipe ID tabel products Supabase Shinemart
CREATE TABLE IF NOT EXISTS public.promotional_section_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES public.promotional_sections(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT uq_section_product UNIQUE (section_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_section_items_section ON public.promotional_section_items (section_id);
CREATE INDEX IF NOT EXISTS idx_section_items_sort ON public.promotional_section_items (sort_order ASC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.promotional_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotional_section_items ENABLE ROW LEVEL SECURITY;

-- Policy Akses Publik (Read-Only untuk Pengunjung Web)
DROP POLICY IF EXISTS "Allow public read active sections" ON public.promotional_sections;
CREATE POLICY "Allow public read active sections" ON public.promotional_sections
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public read section items" ON public.promotional_section_items;
CREATE POLICY "Allow public read section items" ON public.promotional_section_items
    FOR SELECT USING (true);

-- Policy Admin / Anon Key (CRUD Kelola Seksi)
DROP POLICY IF EXISTS "Allow anon insert sections" ON public.promotional_sections;
CREATE POLICY "Allow anon insert sections" ON public.promotional_sections FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update sections" ON public.promotional_sections;
CREATE POLICY "Allow anon update sections" ON public.promotional_sections FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow anon delete sections" ON public.promotional_sections;
CREATE POLICY "Allow anon delete sections" ON public.promotional_sections FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow anon insert section items" ON public.promotional_section_items;
CREATE POLICY "Allow anon insert section items" ON public.promotional_section_items FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon update section items" ON public.promotional_section_items;
CREATE POLICY "Allow anon update section items" ON public.promotional_section_items FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow anon delete section items" ON public.promotional_section_items;
CREATE POLICY "Allow anon delete section items" ON public.promotional_section_items FOR DELETE USING (true);
