/**
 * ===========================================================
 * DASHBOARD PENCARIAN PERMAINAN — BACKEND (Google Apps Script)
 * ===========================================================
 * File ini berfungsi sebagai API JSON. Cara pakainya:
 *  1. Buka Google Spreadsheet kamu.
 *  2. Menu Extensions > Apps Script.
 *  3. Hapus isi default, lalu paste seluruh kode ini.
 *  4. Deploy sebagai Web App (lihat README.md untuk langkah detail).
 *
 * Struktur Sheet yang dipakai (otomatis dibuat jika belum ada):
 *  Kolom A = Provider
 *  Kolom B = Nama Game
 *  Kolom C = Tipe Game
 * ===========================================================
 */

// Nama sheet/tab yang dipakai sebagai database
const SHEET_NAME = "Games";

/**
 * Mengambil referensi sheet "Games".
 * Kalau sheet belum ada, otomatis dibuatkan beserta header-nya.
 * getActiveSpreadsheet() bekerja karena script ini "terikat" (bound)
 * ke Spreadsheet tempat kamu membuatnya lewat Extensions > Apps Script.
 */
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["Provider", "Nama Game", "Tipe Game"]);
    sheet.getRange(1, 1, 1, 3).setFontWeight("bold");
  }

  return sheet;
}

/**
 * doGet — dipanggil saat frontend melakukan GET request.
 * Dipakai untuk mengambil daftar game.
 * Contoh pemanggilan dari frontend:
 *   fetch(API_URL + "?action=getGames")
 */
function doGet(e) {
  const action = e.parameter.action;

  if (action === "getGames") {
    return jsonResponse({ success: true, data: getAllGames() });
  }

  return jsonResponse({
    success: false,
    message: "Action tidak dikenali. Gunakan ?action=getGames"
  });
}

/**
 * doPost — dipanggil saat frontend mengirim data baru (tambah game).
 * Body request berupa JSON string, dikirim dengan Content-Type: text/plain
 * (sengaja text/plain, bukan application/json, supaya browser tidak
 * mengirim "preflight request" OPTIONS yang tidak didukung Apps Script).
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    const provider = (body.provider || "").toString().trim();
    const namaGame = (body.namaGame || "").toString().trim();
    const tipeGame = (body.tipeGame || "").toString().trim();

    // Validasi server-side — jangan percaya validasi frontend saja
    if (!provider || !namaGame || !tipeGame) {
      return jsonResponse({
        success: false,
        message: "Semua field (Provider, Nama Game, Tipe Game) wajib diisi."
      });
    }

    getSheet().appendRow([provider, namaGame, tipeGame]);

    return jsonResponse({
      success: true,
      message: "Game berhasil ditambahkan."
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      message: "Terjadi kesalahan di server: " + err.message
    });
  }
}

/**
 * Mengambil seluruh data game dari sheet, sudah diurutkan
 * berdasarkan Provider A-Z, dan dikembalikan sebagai array of object.
 */
function getAllGames() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();

  // Kalau cuma ada baris header (atau kosong sama sekali), kembalikan array kosong
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  const games = values
    // Lewati baris yang benar-benar kosong di ketiga kolomnya
    .filter(row => row[0] !== "" || row[1] !== "" || row[2] !== "")
    .map(row => ({
      provider: row[0].toString().trim(),
      namaGame: row[1].toString().trim(),
      tipeGame: row[2].toString().trim()
    }));

  // Urutkan A-Z berdasarkan Provider (case-insensitive)
  games.sort((a, b) => a.provider.localeCompare(b.provider, "id", { sensitivity: "base" }));

  return games;
}

/**
 * Helper untuk membungkus response jadi JSON yang valid.
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
