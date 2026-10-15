# Product Requirements Document (PRD)
## Shinemart - Digital Catalog & Quick Ordering System

### 1. Project Overview
**Shinemart** adalah platform katalog digital minimarket dan frozen food modern yang menyajikan pengalaman belanja cepat, visual menarik, dan terintegrasi langsung dengan WhatsApp Kasir untuk pemesanan multi-item tanpa birokrasi checkout rumit.

- **Nama Brand**: Shinemart Minimarket & Frozen Food
- **Warna Identitas**: Vibrant Sky Blue (`#38b6ff`) & Hot Pink (`#ff66c4`)
- **Lokasi Toko**: Jl. Utan Jati No.32A, Pegadungan, Kec. Kalideres, Jakarta Barat
- **Target Pengguna**: Pelanggan rumah tangga, warga sekitar Kalideres & Jakarta Barat yang menginginkan belanja sembako, minuman, biskuit, dan frozen food siap antar cepat.

---

### 2. User Personas & Pain Points
1. **Pelanggan Minimarket / Ibu Rumah Tangga**:
   - *Problem*: Ingin tahu katalog barang dan harga sebelum ke toko tanpa perlu repot chat tanya satu per satu barang ke kasir.
   - *Need*: Katalog visual jelas (rasio 1:1 tanpa foto terpotong), pratinjau detail produk, filter kategori instan, dan keranjang belanja untuk pesan banyak item sekaligus ke WhatsApp.
2. **Admin Toko / Kasir**:
   - *Problem*: Kesulitan memperbarui katalog jika harus mengedit kode JavaScript manual.
   - *Need*: Dashboard admin terpisah untuk impor produk massal (Bulk Upload Excel `.xlsx`/`.csv`) langsung tersimpan ke cloud database (Supabase PostgreSQL / Google Sheets).

---

### 3. Key Feature Specifications

#### 3.1. Halaman Pengunjung (`index.html` & `app.js`)
- **1:1 Aspect Ratio Product Cards**:
  - Semua foto produk ditampilkan dalam rasio persegi 1:1 sempurna (`aspect-square` / `aspect-ratio: 1/1`) dengan `object-fit: contain` dan padding rapi, menjamin tidak ada foto produk yang terpotong.
- **Product Detail Preview Modal**:
  - Mengklik area kartu produk (foto, nama, harga) membuka modal pratinjau resolusi tinggi 1:1, status stok, satuan jual, nama produk, kategori, dan tombol cepat *+ Tambahkan ke Keranjang* serta *Tanya via WhatsApp*.
- **Multi-Item Shopping Cart**:
  - Keranjang belanja sementara berbasis `localStorage` (`shinemart_shopping_cart`).
  - Fitur tambah, kurang, hapus item, dan hitung subtotal & total otomatis.
- **WhatsApp Checkout Automation**:
  - Format pesan belanja terstruktur rapi dengan nomor list, nama item, jumlah pesanan, subtotal, dan total perkiraan.
  - Link otomatis mengarah ke nomor WhatsApp kasir resmi (`wa.me/62...`).
- **Pencarian Real-Time & Filter Kategori**:
  - Filter 8 kategori: *Sembako, Minuman, Snack, Kebersihan, Fresh, Frozen, Ibu & Bayi, Perawatan*.
  - Live search instan mencocokkan nama barang dan kategori.
- **Google Drive Image Direct Link Resolver**:
  - Otomatis mengubah link berbagi Google Drive (`/file/d/ID/view`) menjadi URL thumbnail langsung tanpa perlu hosting gambar eksternal.

#### 3.2. Halaman Khusus Admin (`admin.html` & `admin.js`)
- **Separation of Concerns**: Halaman admin terpisah dari publik untuk keamanan dan kenyamanan toko.
- **Supabase Cloud Database**:
  - Koneksi database cloud PostgreSQL Supabase via REST API & `@supabase/supabase-js@2`.
  - Form penyimpanan kredensial `Project URL` dan `Publishable / Anon Key`.
- **Bulk Upload Excel / CSV (SheetJS)**:
  - Drag-and-drop file spreadsheet `.xlsx`, `.xls`, `.csv`.
  - Tabel pratinjau interaktif data produk sebelum diunggah ke Supabase.
  - Pilihan metode simpan: *Append/Upsert* (tambah/update) atau *Replace* (timpa semua).
- **Manajemen Daftar Produk Live di Admin**:
  - Tabel interaktif yang menampilkan seluruh produk tersimpan di Supabase secara real-time.
  - Fitur pencarian instan (*live search*) di halaman admin.
  - Tombol hapus (*delete*) per produk langsung menghapus baris di Supabase.
- **Download Template Excel**:
  - Tombol download template resmi siap pakai yang sudah diformat dengan kolom standar.

---

### 4. Database Schema (Supabase `products` Table)
```sql
CREATE TABLE products (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  category TEXT DEFAULT 'sembako',
  image_url TEXT,
  stock TEXT DEFAULT 'Ready',
  unit TEXT DEFAULT '1 Pcs',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
```

---

### 5. Success Metrics
- **Akurasi Visual**: 100% foto produk berasio 1:1 tanpa pemotongan gambar (aspect-ratio preservation).
- **Kecepatan Muat**: Waktu load katalog produk < 1.5 detik dari database Supabase / cache lokal.
- **Efisiensi Admin**: Input 50+ produk massal selesai dalam < 10 detik via Excel upload.
