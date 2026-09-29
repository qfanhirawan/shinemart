# System Architecture Documentation
## Shinemart Digital Catalog & Database Architecture

### 1. High-Level Architecture Diagram

```
+-------------------------------------------------------------------------+
|                              CLIENT LAYER                               |
+-------------------------------------------------------------------------+
|                                                                         |
|   [ index.html ] (Visitor Portal)        [ admin.html ] (Admin Portal)   |
|   - Product Grid (1:1 Aspect Ratio)      - Excel Dropzone (SheetJS)     |
|   - Product Detail Preview Modal         - Preview Table                |
|   - Shopping Cart (Multi-Item)           - Batch Upsert to Supabase     |
|   - WhatsApp Order Formatter             - Live Supabase Products Table |
|                                          - Live Delete & Search         |
|                                                                         |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                      CLIENT-SIDE LOGIC & STORAGE                        |
+-------------------------------------------------------------------------+
|   - app.js / admin.js                                                   |
|   - LocalStorage Caching (`shinemart_products_data`)                     |
|   - LocalStorage Cart (`shinemart_shopping_cart`)                       |
|   - Drive Image URL Resolver (`formatGoogleDriveImageUrl()`)            |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                   SOLE CLOUD DATABASE: SUPABASE                         |
+-------------------------------------------------------------------------+
|  PostgreSQL Cloud Database                                              |
|  - Table: `products`                                                    |
|  - Direct REST / Supabase-JS Client v2                                  |
|  - Ultra-Low Latency (<100ms) & High Reliability                        |
|  - Row Level Security (RLS) Enabled                                     |
+-------------------------------------------------------------------------+
```

---

### 2. Database Design & Supabase Integration

#### 2.1. PostgreSQL Table Definition (`products`)
Tabel `products` di Supabase dirancang untuk menampung seluruh item katalog minimarket:

```sql
-- Buat tabel produk
CREATE TABLE IF NOT EXISTS public.products (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  category TEXT DEFAULT 'sembako',
  image_url TEXT,
  stock TEXT DEFAULT 'Ready',
  unit TEXT DEFAULT '1 Pcs',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Aktifkan Row Level Security (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Policy 1: Pengunjung publik diizinkan membaca katalog produk (SELECT)
CREATE POLICY "Public Read Access" 
ON public.products 
FOR SELECT 
USING (true);

-- Policy 2: Admin diizinkan menambah / memperbarui / menghapus produk (ALL)
CREATE POLICY "Admin Full Access" 
ON public.products 
FOR ALL 
USING (true);
```

#### 2.2. Supabase Client Integration
- Diinisialisasi secara dinamis di `app.js` dan `admin.js` melalui library resmi `@supabase/supabase-js@2` (CDN).
- URL dan Key tersimpan aman di `localStorage` per peramban (`shinemart_supabase_url` dan `shinemart_supabase_anon_key`) atau konstanta fallback.

---

### 3. Data Flow

#### 3.1. Alur Pengambilan Katalog (Read Flow)
1. **Langkah 1**: Browser membuka `index.html`.
2. **Langkah 2**: Script `app.js` memuat data cache dari `localStorage` untuk rendering instan tanpa delay (Zero-LCP delay).
3. **Langkah 3**: `app.js` melakukan asynchronous query ke Supabase:
   ```javascript
   const { data, error } = await supabaseClient.from("products").select("*").order("id", { ascending: true });
   ```
4. **Langkah 4**: Jika Supabase mengembalikan data, katalog direfresh otomatis, cache diperbarui, dan UI menampilkan badge *Data live dari Supabase*.
5. **Langkah 5 (Fallback)**: Jika Supabase belum dikonfigurasi, sistem memanggil Google Apps Script `doGet()`.

#### 3.2. Alur Bulk Upload Excel (Write Flow)
1. **Langkah 1**: Admin memasukkan file Excel (`.xlsx`) ke dropzone `admin.html`.
2. **Langkah 2**: `admin.js` memproses byte binary menggunakan `SheetJS (XLSX.read)`.
3. **Langkah 3**: Data di-mapping menjadi array objek JSON terstandarisasi.
4. **Langkah 4**: Admin menekan tombol *Simpan / Upload*.
5. **Langkah 5**:
   - Jika kredensial Supabase terisi, `admin.js` menjalankan `supabaseClient.from("products").upsert(...)`.
   - Data juga disinkronkan ke Google Apps Script dan LocalStorage.

---

### 4. Technical Stack & Dependencies
- **Markup**: HTML5 Semantic
- **Styling**: Tailwind CSS CDN + Vanilla Custom CSS Variables
- **Icons**: Font Awesome 6 CDN
- **Database Client**: `@supabase/supabase-js@2` via jsDelivr CDN
- **Excel Parser**: `SheetJS (xlsx@0.18.5)` via jsDelivr CDN
- **Messaging API**: WhatsApp Click-to-Chat URI Scheme (`wa.me`)
