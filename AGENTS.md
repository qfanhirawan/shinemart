# Agent Directives & Instructions (AGENTS.md)
## Shinemart Catalog & System Maintenance

Panduan ini ditujukan bagi AI Coding Assistants, LLM Agents, dan pengembang otomatis yang bekerja pada repositori katalog digital **Shinemart**.

---

### 1. Repository Core Principles & Guardrails

1. **Separation of Visitor & Admin**:
   - `index.html` dan `js/app.js` **HANYA** diperuntukkan bagi pengunjung publik. Jangan pernah menambahkan komponen UI admin, form upload, atau kredensial sensitif di halaman pengunjung.
   - `admin.html` dan `js/admin.js` adalah halaman internal khusus pengelola toko untuk upload file Excel dan konfigurasi database.
2. **Standard Rasio Foto Produk (Wajib 1:1 Aspect Ratio)**:
   - Semua kartu produk dan modal pratinjau **HARUS** mempertahankan aspek rasio persegi 1:1 (`aspect-ratio: 1 / 1`).
   - Gunakan `object-fit: contain` untuk tag `<img>` agar tidak ada bagian foto yang terpotong (`no-crop` rule), dilengkapi dengan padding rapi dan background kontras netral.
3. **Database Precedence**:
   - **Database Utama**: Database Supabase PostgreSQL via `@supabase/supabase-js@2`.
   - **Offline Fallback**: Offline LocalStorage cache (`shinemart_products_data`).
   - Koneksi ke Google Sheets telah dinonaktifkan sepenuhnya demi performa cepat dan keandalan cloud database.
4. **Google Drive Link Compatibility**:
   - Selalu lewatkan URL gambar melalui fungsi `formatGoogleDriveImageUrl(url)`. Ini penting agar link sharing Google Drive (`/file/d/...`) langsung di-convert ke URL direct image thumbnail `https://drive.google.com/thumbnail?id=FILE_ID&sz=w1000`.

---

### 2. File Organization & Map

```
shinemart-catalog/
├── index.html              # Halaman etalase katalog pengunjung & modal keranjang
├── admin.html              # Halaman admin bulk upload Excel & setting koneksi
├── css/
│   └── styles.css          # Desain sistem (Cyan Sky #38b6ff & Hot Pink #ff66c4, 1:1 ratio styles)
├── js/
│   ├── app.js              # Logika pengunjung (Fetch Supabase/GAS, cart, WA checkout, preview modal)
│   └── admin.js            # Logika admin (SheetJS parser, upload Supabase/GAS, preview table)
├── assets/
│   └── images/
│       ├── shinemart_logo.svg  # Logo resmi Shinemart Minimarket & Frozen Food
│       └── shinemart_logo.png  # Fallback logo PNG
├── Code.gs                 # Script Google Apps Script (doGet & doPost) untuk Google Sheets
├── PRD.md                  # Product Requirements Document
├── DESIGN_SYSTEM.md        # Spesifikasi UI token, tipografi, dan komponen
├── ARCHITECTURE.md         # Arsitektur sistem, skema Supabase, dan data flow
└── AGENTS.md               # Aturan kerja & panduan pengembangan untuk AI Agents
```

---

### 3. Agent Task Execution Checklist

Ketika menerima permintaan modifikasi baru:
- [ ] Pastikan tidak ada class yang merusak rasio 1:1 pada `.product-image-wrap` atau `.preview-image-wrap`.
- [ ] Verifikasi bahwa kartu produk tetap memiliki interaksi klik untuk membuka modal preview (`openProductPreview(productId)`).
- [ ] Pastikan tombol `+ Keranjang` dan `Tanya via WA` memiliki `event.stopPropagation()` atau berada di luar area link pratinjau agar klik tombol tidak sengaja membuka modal preview.
- [ ] Jika menambah kolom baru di katalog, perbarui:
  1. Skema SQL di [ARCHITECTURE.md](file:///c:/Users/djihan.hirawan/Downloads/shinemart-catalog/ARCHITECTURE.md)
  2. Mapping Supabase di `app.js` dan `admin.js`
  3. Template unduhan Excel di `admin.js` (`downloadTemplateExcel()`).
