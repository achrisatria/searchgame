# Dashboard Pencarian Permainan — Panduan Setup

Aplikasi ini terdiri dari 2 bagian terpisah:

- **Backend (API)**: `Code.gs` — dijalankan di Google Apps Script, terhubung ke Google Spreadsheet sebagai database.
- **Frontend**: `Index.html` + `style.css` + `script.js` — file statis biasa, bisa kamu buka langsung di browser atau host di mana saja. Frontend ini memanggil API backend lewat `fetch()`.

Kenapa dipisah begini? Karena Apps Script tidak bisa menyajikan file `.css`/`.js` mandiri — hanya `.gs` dan `.html`. Dengan memisahkan frontend jadi file statis murni, kamu dapat 3 file (HTML/CSS/JS) yang benar-benar terpisah seperti yang diminta, dan backend-nya tetap simpel sebagai API JSON saja.

---

## LANGKAH 1 — Siapkan Google Spreadsheet

1. Buat Google Spreadsheet baru (boleh kosong, tidak perlu diisi manual).
2. Tidak perlu membuat sheet "Games" secara manual — `Code.gs` akan otomatis membuatnya beserta header (Provider, Nama Game, Tipe Game) saat pertama kali dijalankan. Tapi kalau kamu mau isi manual, pastikan:
   - Kolom A = Provider
   - Kolom B = Nama Game
   - Kolom C = Tipe Game
   - Baris 1 = header, data mulai dari baris 2.

## LANGKAH 2 — Pasang Apps Script

1. Di Spreadsheet, klik menu **Extensions > Apps Script**.
2. Hapus semua kode default di `Code.gs`, lalu paste isi file `Code.gs` yang sudah dibuatkan.
3. Klik ikon disket / **Save** (atau Ctrl+S).

## LANGKAH 3 — Deploy sebagai Web App

1. Klik tombol **Deploy** (kanan atas) > **New deployment**.
2. Klik ikon gear ⚙️ di sebelah "Select type", pilih **Web app**.
3. Isi konfigurasi:
   - **Description**: bebas, misal "Dashboard Game API v1"
   - **Execute as**: **Me** (akun Google kamu)
   - **Who has access**: **Anyone** ⚠️ *(wajib "Anyone", bukan "Anyone with Google account", supaya frontend bisa mengakses tanpa login)*
4. Klik **Deploy**.
5. Google akan minta otorisasi izin — klik **Authorize access**, pilih akun kamu, lalu klik **Advanced > Go to (nama project) (unsafe)** jika muncul peringatan (ini normal untuk script buatan sendiri), lalu **Allow**.
6. Setelah berhasil, kamu akan dapat **Web app URL** yang formatnya seperti:
   ```
   https://script.google.com/macros/s/AKfycb..................../exec
   ```
   **Copy URL ini.**

> 🔁 **Catatan penting**: Setiap kali kamu mengubah kode `Code.gs`, kamu harus membuat **deployment versi baru** lewat **Deploy > Manage deployments > Edit (ikon pensil) > Version: New version > Deploy**, supaya perubahan benar-benar aktif di URL yang sama.

## LANGKAH 4 — Hubungkan Frontend ke API

1. Buka file `script.js`.
2. Cari baris ini di bagian paling atas:
   ```javascript
   const CONFIG = {
     API_URL: "https://script.google.com/macros/s/GANTI_DENGAN_DEPLOYMENT_ID_KAMU/exec",
     ...
   };
   ```
3. Ganti URL tersebut dengan **Web app URL** yang kamu copy di Langkah 3.

## LANGKAH 5 — Jalankan Dashboard

Cara paling simpel: buka file `Index.html` langsung dua kali klik di file explorer — akan terbuka di browser dan langsung berfungsi.

Kalau mau lebih rapi (disarankan, supaya tidak ada batasan keamanan browser untuk file lokal), host ketiga file (`Index.html`, `style.css`, `script.js`) di salah satu:
- GitHub Pages (gratis)
- Netlify / Vercel (gratis)
- Hosting statis apapun

Pastikan ketiga file ada di folder yang sama.

---

## Cara Cek API Sudah Jalan

Sebelum bingung kenapa dashboard kosong, tes dulu API-nya langsung di browser:

```
https://script.google.com/macros/s/xxxxxxxxxx/exec?action=getGames
```

Kalau muncul JSON seperti `{"success":true,"data":[...]}`, berarti backend sudah benar. Kalau muncul error/halaman login Google, cek lagi setting **"Who has access"** harus **Anyone**.

---

## Troubleshooting Umum

| Masalah | Kemungkinan Penyebab | Solusi |
|---|---|---|
| Data tidak muncul, toast "Gagal memuat data" | URL API belum diganti / salah | Cek kembali `API_URL` di `script.js` |
| Error CORS di console browser | Deployment access bukan "Anyone" | Edit deployment, ubah access ke "Anyone" |
| Tambah game gagal terus | Deployment masih versi lama | Buat deployment versi baru setelah edit `Code.gs` |
| Data sudah ditambah di Sheet tapi tidak muncul di dashboard | Cache browser belum expired | Cache otomatis refresh tiap 5 menit, atau reload halaman browser |
| Urutan kolom kacau | Kolom di Sheet tidak sesuai A=Provider, B=Nama Game, C=Tipe Game | Perbaiki urutan kolom di Spreadsheet |

---

## Tips Pengembangan Lanjutan

- **Hapus/Edit data**: saat ini API hanya mendukung baca & tambah data (sesuai spesifikasi). Untuk hapus/edit, bisa ditambahkan fungsi `doPost` baru dengan parameter `action: "deleteGame"` / `"updateGame"` yang mencari baris berdasarkan kombinasi data, lalu `sheet.deleteRow()` atau `setValues()`.
- **Autentikasi**: saat ini siapa saja dengan URL bisa menambah data. Kalau perlu dibatasi, tambahkan API key sederhana yang dicek di `doPost` sebelum menyimpan.
- **Data > 10.000 baris**: dashboard ini sudah pakai caching (localStorage) + render tabel yang dioptimalkan. Kalau datanya jauh lebih besar lagi (puluhan ribu+), pertimbangkan pagination di sisi server (`?action=getGames&page=1&limit=500`).
