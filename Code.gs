/**
 * ==============================================================================
 * SHINEMART MINIMARKET & FROZEN FOOD - GOOGLE APPS SCRIPT (Code.gs)
 * ==============================================================================
 * Petunjuk Penyiapan di Google Sheets:
 * 1. Buka Google Spreadsheet baru (beri nama misal: "Shinemart Database Produk").
 * 2. Pada Baris 1 (Header), buat 7 nama kolom:
 *    A1: id
 *    B1: name
 *    C1: price
 *    D1: category
 *    E1: imageUrl
 *    F1: stock
 *    G1: unit
 * 3. Masuk ke menu Extensions (Ekstensi) > Apps Script.
 * 4. Salin dan tempel seluruh kode di bawah ini ke editor (Code.gs).
 * 5. Klik tombol "Deploy" (Terapkan) > "New deployment" (Penerapan baru).
 *    - Pilih type: "Web app" (Aplikasi web)
 *    - Description: "Shinemart API v1"
 *    - Execute as: "Me" (Akun Google Anda)
 *    - Who has access: "Anyone" (Siapa saja)
 * 6. Klik "Deploy", izinkan akses (Authorize Access), lalu salin "Web app URL".
 * 7. Masukkan URL tersebut ke konfigurasi GAS_API_URL pada file app.js dan admin.js.
 */

const SHEET_NAME = "Sheet1"; // Sesuaikan jika nama tab sheet Anda berbeda

/**
 * doGet: Melayani request GET dari app.js (Halaman Pengunjung)
 * Mengembalikan seluruh katalog produk aktif dalam format JSON.
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return createJsonResponse({
        status: "success",
        count: 0,
        data: []
      });
    }

    const headers = data[0].map(h => String(h).trim());
    const products = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      // Lewati baris jika nama dan id kosong
      if (!row[1] && !row[0]) continue;

      const item = {};
      headers.forEach((header, colIdx) => {
        item[header] = row[colIdx];
      });

      // Normalisasi nilai data
      item.id = item.id || `PRD-${i}`;
      item.name = String(item.name || "").trim();
      item.price = Number(item.price) || 0;
      item.category = String(item.category || "sembako").toLowerCase().trim();
      item.imageUrl = String(item.imageUrl || "").trim();
      item.stock = item.stock !== undefined && item.stock !== "" ? item.stock : "Ready";
      item.unit = String(item.unit || "1 Pcs").trim();

      products.push(item);
    }

    return createJsonResponse({
      status: "success",
      count: products.length,
      data: products
    });
  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * doPost: Melayani request POST dari admin.js (Halaman Admin Bulk Upload)
 * Menerima array data produk hasil import Excel dan menyimpannya ke Spreadsheet.
 */
function doPost(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

    // Buat header kolom otomatis jika sheet masih kosong
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["id", "name", "price", "category", "imageUrl", "stock", "unit"]);
    }

    let payload = null;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter && e.parameter.data) {
      payload = JSON.parse(e.parameter.data);
    }

    if (!payload) {
      return createJsonResponse({
        status: "error",
        message: "Tidak ada payload data yang diterima."
      });
    }

    // Jika mode replace dipilih, hapus baris lama (kecuali baris header ke-1)
    if (payload.action === "replace" || payload.replace === true) {
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        sheet.deleteRows(2, lastRow - 1);
      }
    }

    // Ekstrak items (mendukung array langsung atau object dengan properti items)
    let items = [];
    if (Array.isArray(payload)) {
      items = payload;
    } else if (Array.isArray(payload.items)) {
      items = payload.items;
    } else if (payload.data && Array.isArray(payload.data)) {
      items = payload.data;
    } else {
      items = [payload];
    }

    const rowsToAdd = [];
    const timestamp = new Date().getTime();

    items.forEach((item, index) => {
      if (!item.name) return; // Lewati jika nama kosong

      const id = item.id || `PRD-${timestamp}-${index + 1}`;
      const name = String(item.name).trim();
      const price = Number(item.price) || 0;
      const category = String(item.category || "sembako").toLowerCase().trim();
      const imageUrl = String(item.imageUrl || item.image || "").trim();
      const stock = item.stock !== undefined && item.stock !== "" ? item.stock : "Ready";
      const unit = String(item.unit || "1 Pcs").trim();

      rowsToAdd.push([id, name, price, category, imageUrl, stock, unit]);
    });

    if (rowsToAdd.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToAdd.length, 7).setValues(rowsToAdd);
    }

    return createJsonResponse({
      status: "success",
      message: `Berhasil menambahkan ${rowsToAdd.length} produk ke Google Sheets.`,
      addedCount: rowsToAdd.length
    });
  } catch (error) {
    return createJsonResponse({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Helper pembuat Output JSON
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
