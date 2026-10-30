-- =========================================================================
-- SETUP SUPABASE STORAGE: BUCKET 'products' UNTUK FOTO PRODUK
-- =========================================================================

-- 1. Buat bucket 'products' dengan status PUBLIC jika belum ada
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'products',
    'products',
    true,
    10485760, -- Maksimal 10 MB per gambar
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET 
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 2. Bersihkan policy lama jika ada
DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Admin can manage product images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon update product images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete product images" ON storage.objects;

-- 3. Policy: Siapa pun (Publik & Aplikasi Mobile) BISA MELIHAT foto produk
CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'products');

-- 4. Policy: Admin terotentikasi BISA UPLOAD, EDIT, & HAPUS foto produk
CREATE POLICY "Admin can manage product images"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'products')
WITH CHECK (bucket_id = 'products');

-- 5. Policy: Izinkan Anon / Web Admin mengunggah & memperbarui foto produk
CREATE POLICY "Allow anon upload product images"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'products');

CREATE POLICY "Allow anon update product images"
ON storage.objects FOR UPDATE
TO anon
USING (bucket_id = 'products');

CREATE POLICY "Allow anon delete product images"
ON storage.objects FOR DELETE
TO anon
USING (bucket_id = 'products');
