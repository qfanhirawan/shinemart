-- ==============================================================================
-- MIGRASI MULTI-CABANG SHINEMART: TABEL store_branches & AUTO-ROUTING HUB
-- ==============================================================================

-- 1. Buat tabel store_branches
CREATE TABLE IF NOT EXISTS public.store_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_code VARCHAR(30) UNIQUE NOT NULL,      -- Contoh: 'HUB-KALIDERES', 'HUB-PURI'
    name VARCHAR(150) NOT NULL,                   -- Contoh: 'Shinemart Hub 1 (Utanjati Kalideres)'
    address TEXT NOT NULL,                        -- Alamat fisik lengkap
    latitude NUMERIC(10, 6) NOT NULL,             -- Titik koordinat Lat
    longitude NUMERIC(10, 6) NOT NULL,            -- Titik koordinat Lng
    max_delivery_distance_km NUMERIC(5, 2) DEFAULT 10.0,
    base_delivery_fee NUMERIC(12, 2) DEFAULT 10000,
    delivery_fee_per_km NUMERIC(12, 2) DEFAULT 2500,
    free_delivery_min_spend NUMERIC(12, 2) DEFAULT 30000,
    store_whatsapp VARCHAR(50) DEFAULT '6287782603733',
    is_active BOOLEAN NOT NULL DEFAULT true,      -- Saklar Buka / Tutup cabang
    is_main_branch BOOLEAN NOT NULL DEFAULT false,-- Penanda Kantor Pusat / Hub Utama
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Index untuk pencarian cepat
CREATE INDEX IF NOT EXISTS idx_store_branches_code ON public.store_branches(branch_code);
CREATE INDEX IF NOT EXISTS idx_store_branches_active ON public.store_branches(is_active);

-- 3. Row Level Security (RLS)
ALTER TABLE public.store_branches ENABLE ROW LEVEL SECURITY;

-- Policy 1: Publik/Pelanggan dapat membaca seluruh cabang yang aktif
DROP POLICY IF EXISTS "Public can read active branches" ON public.store_branches;
CREATE POLICY "Public can read active branches" ON public.store_branches
    FOR SELECT USING (true);

-- Policy 2: Admin / Authenticated role dapat mengelola cabang (INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "Admin can manage branches" ON public.store_branches;
CREATE POLICY "Admin can manage branches" ON public.store_branches
    FOR ALL USING (true)
    WITH CHECK (true);

-- 4. Tambahkan kolom relasi cabang pada tabel orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.store_branches(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS branch_name VARCHAR(150);

-- 5. Masukkan Data Awal Cabang Shinemart (Jakarta Barat)
INSERT INTO public.store_branches (
    branch_code,
    name,
    address,
    latitude,
    longitude,
    max_delivery_distance_km,
    base_delivery_fee,
    delivery_fee_per_km,
    free_delivery_min_spend,
    store_whatsapp,
    is_active,
    is_main_branch
)
VALUES
    (
        'HUB-KALIDERES',
        'Shinemart Hub 1 (Utanjati Kalideres)',
        'Jl. Utanjati Rt.003/011, no.32a, Kalideres, Jakarta Barat',
        -6.143200,
        106.702500,
        10.0,
        10000,
        2500,
        30000,
        '6287782603733',
        true,
        true
    ),
    (
        'HUB-PURI',
        'Shinemart Hub 2 (Puri Kembangan)',
        'Jl. Puri Indah Raya Blok U1, Kembangan Selatan, Jakarta Barat',
        -6.187800,
        106.734500,
        10.0,
        10000,
        2500,
        30000,
        '6287782603733',
        true,
        false
    ),
    (
        'HUB-KEBONJERUK',
        'Shinemart Hub 3 (Kebon Jeruk)',
        'Jl. Panjang No. 18, Kedoya Selatan, Kebon Jeruk, Jakarta Barat',
        -6.185000,
        106.768000,
        10.0,
        10000,
        2500,
        30000,
        '6287782603733',
        true,
        false
    )
ON CONFLICT (branch_code) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    max_delivery_distance_km = EXCLUDED.max_delivery_distance_km,
    base_delivery_fee = EXCLUDED.base_delivery_fee,
    delivery_fee_per_km = EXCLUDED.delivery_fee_per_km,
    free_delivery_min_spend = EXCLUDED.free_delivery_min_spend,
    store_whatsapp = EXCLUDED.store_whatsapp,
    is_active = EXCLUDED.is_active,
    is_main_branch = EXCLUDED.is_main_branch,
    updated_at = NOW();

-- 6. Tambahkan ke publikasi Realtime Supabase
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'store_branches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_branches;
  END IF;
END $$;
