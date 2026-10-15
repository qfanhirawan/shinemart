# Design System Specification
## Shinemart Minimarket & Frozen Food

### 1. Brand Identity & Color Palette
Shinemart memadukan warna biru cerah (*sky cyan*) yang melambangkan kesegaran, kebersihan, dan teknologi modern dengan sentuhan merah muda cerah (*hot pink*) yang mencerminkan keceriaan dan keramahan belanja keluarga.

| Token | Nilai Hex | Tailwind CSS Class / CSS Var | Kegunaan |
|---|---|---|---|
| **Primary Sky Blue** | `#38b6ff` | `bg-brand-500` / `--color-primary` | Warna identitas utama, header accents, badge kategori, tombol aksi |
| **Primary Hover / Dark** | `#0099ff` / `#0077d6` | `bg-brand-600` / `bg-brand-700` | State hover tombol, harga produk, icon aktif |
| **Primary Soft Tint** | `#e8f7ff` | `bg-brand-50` / `--color-primary-light` | Background chip kategori, badge info, highlight baris |
| **Accent Hot Pink** | `#ff66c4` | `bg-accent-500` / `--color-accent-pink` | Tombol CTA "+ Keranjang", badge promo, floating cart counter |
| **Accent Pink Hover** | `#e043a5` | `bg-accent-600` | State hover tombol CTA keranjang |
| **Accent Pink Tint** | `#fff0f8` | `bg-accent-50` | Background tag promo, icon snack/bayi |
| **WhatsApp Green** | `#25d366` | `--color-wa` | Tombol floating WA, badge WhatsApp, order CTA |
| **WhatsApp Dark** | `#1da851` | `--color-wa-dark` | Hover order WhatsApp |
| **Neutral Canvas** | `#f8fafc` | `bg-slate-50` | Latar belakang halaman |
| **Card Surface** | `#ffffff` | `bg-white` | Kartu produk, modal backdrop, popover |
| **Text Main** | `#0f172a` | `text-slate-900` | Judul, nama produk, teks harga utama |
| **Text Muted** | `#64748b` | `text-slate-500` / `text-slate-400` | Satuan unit, deskripsi, timestamp |

---

### 2. Typography
- **Primary Font**: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) (Weights: `400`, `500`, `600`, `700`, `800`)
- **Hierarchy**:
  - `Display / H1`: 32px – 40px (Desktop), Extrabold (`font-extrabold`), Tracking tight.
  - `Section Title / H2`: 24px – 28px, Extrabold (`font-extrabold`).
  - `Product Title / H3`: 14px – 16px, Bold (`font-bold`), clamp 2 baris.
  - `Price Tag`: 18px – 24px, Black/Extrabold (`font-black`), Primary Dark (`#0077d6`).
  - `Caption / Unit / Badge`: 10px – 12px, Semi-bold/Bold.

---

### 3. Aspect Ratio & Image Standard (1:1 Ratio System)
Untuk menjamin keseragaman visual dan mencegah bagian foto produk terpotong:
- **Card Container**:
  ```css
  .product-image-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background-color: #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .product-image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 8px;
    transition: transform 0.4s ease;
  }
  ```
- **Modal Preview**:
  ```css
  .preview-image-wrap {
    width: 100%;
    aspect-ratio: 1 / 1;
    background-color: #f1f5f9;
    border-radius: var(--radius-md);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .preview-image-wrap img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 12px;
  }
  ```

---

### 4. Components & Elevation

#### 4.1. Cards
- **Product Card**:
  - Radius: `16px` (`rounded-2xl`).
  - Border: `1px solid #edf2f7`.
  - Shadow default: `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05)`.
  - Hover state: `transform: translateY(-6px)`, `box-shadow: 0 16px 30px -6px rgba(56, 182, 255, 0.20)`.

#### 4.2. Buttons
- **Action Keranjang (`+ Keranjang`)**:
  - Gradient: `linear-gradient(to right, #ff66c4, #e043a5)`.
  - Text: White, Bold, Radius `12px` (`rounded-xl`).
- **Direct WA Card Button**:
  - Background: `bg-slate-100` hover `bg-emerald-50`, text `text-slate-700` hover `text-emerald-700`.
- **Checkout CTA**:
  - Background: `bg-emerald-600` hover `bg-emerald-700`, text White, Radius `16px`, shadow glow hijau.

#### 4.3. Modals
- **Backdrop**: `rgba(15, 23, 42, 0.65)` with `backdrop-filter: blur(6px)`.
- **Content Pop Animation**:
  ```css
  @keyframes modalPop {
    0% { opacity: 0; transform: scale(0.92) translateY(10px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  ```
