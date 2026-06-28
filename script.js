/* ===========================================================
   DASHBOARD PENCARIAN PERMAINAN — FRONTEND LOGIC
   Vanilla JS murni, gaya HOKIJITU premium.
   =========================================================== */

/* -----------------------------------------------------------
   KONFIGURASI
   GANTI nilai API_URL di bawah dengan URL Web App Apps Script
   kamu yang sudah di-deploy.
----------------------------------------------------------- */
const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbyrIL3bRsVURTlKGaafNhsAuIzEJ5FIAR_VSkDZ3JIY7J32EU1ZMnvey7JCLFY_q-uV/exec",
  PAGE_SIZE: 50,
  CACHE_KEY: "dpp_games_cache_v2",
  CACHE_TTL_MS: 30 * 60 * 1000, // cache "segar" selama 30 menit
};

/* -----------------------------------------------------------
   PALETTE WARNA PROVIDER
   Tiap provider akan dapat 1 warna unik dari palet ini,
   berdasarkan hash dari nama provider. Hasilnya konsisten
   (provider yang sama selalu dapat warna yang sama).
----------------------------------------------------------- */
const PALETTE = [
  [213, 70, 62],  // sapphire
  [174, 55, 48],  // emerald-teal
  [262, 55, 64],  // amethyst
  [152, 50, 48],  // emerald
  [195, 65, 56],  // turquoise
  [345, 55, 60],  // ruby
  [39, 70, 56],   // champagne-gold
  [235, 55, 64],  // indigo
  [275, 52, 60],  // orchid
  [22, 68, 56],   // copper
  [85, 42, 48],   // olive
  [330, 50, 58],  // rose-gold
];

// Cache warna per provider supaya tidak dihitung ulang setiap render
const colorCache = Object.create(null);

function hashProvider(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % PALETTE.length;
}

function providerColor(name) {
  if (colorCache[name]) return colorCache[name];
  const [h, s, l] = PALETTE[hashProvider(name)];
  colorCache[name] = {
    text:     `hsl(${h},${s}%,${l}%)`,
    textHov:  `hsl(${h},${s}%,${l + 14}%)`,
    dot:      `hsl(${h},${s}%,${l}%)`,
    dotGlow:  `hsl(${h},${s}%,${l}%,0.45)`,
    rowHover: `hsl(${h},${s}%,${l}%,0.055)`,
    accent:   `linear-gradient(180deg,hsl(${h},${s}%,${l + 8}%,0.9),hsl(${h},${s}%,${l}%,0.7))`,
    border:   `hsl(${h},${s}%,${l}%,0.22)`,
  };
  return colorCache[name];
}

/* ===========================================================
   STATE GLOBAL
   =========================================================== */
let allGames = [];                  // data master dari server
let filtered = [];                  // hasil setelah search + filter
let page = 1;
let searchTimer = null;
const state = { search: "", provider: "", type: "" };

/* -----------------------------------------------------------
   OPTIMASI PERFORMA
   - collator: 1 instance Intl.Collator dipakai ulang. Memanggil
     a.localeCompare(b, ...) membuat mesin locale BARU tiap perbandingan;
     pada sort data ribuan ini sangat berat. Collator dibuat sekali saja.
   - indexGame: simpan versi lowercase nama & provider sebagai properti
     NON-ENUMERABLE (_ln, _lp). Non-enumerable = otomatis diabaikan
     JSON.stringify, jadi TIDAK ikut tersimpan ke cache / terkirim ke server.
     Tujuannya: search tidak perlu .toLowerCase() ulang tiap ketukan.
----------------------------------------------------------- */
const collator = new Intl.Collator("id", { sensitivity: "base" });

function indexGame(g) {
  if (!g || g._ln !== undefined) return;
  Object.defineProperty(g, "_ln", { value: (g.namaGame || "").toLowerCase(), writable: true, configurable: true });
  Object.defineProperty(g, "_lp", { value: (g.provider || "").toLowerCase(), writable: true, configurable: true });
}
function indexGames(arr) { for (let i = 0; i < arr.length; i++) indexGame(arr[i]); }

/* ===========================================================
   REFERENSI DOM
   =========================================================== */
const els = {
  totalCount: document.getElementById("totalCount"),
  searchInput: document.getElementById("searchInput"),
  providerFilter: document.getElementById("providerFilter"),
  typeFilter: document.getElementById("typeFilter"),
  tableBody: document.getElementById("tableBody"),
  pagination: document.getElementById("pagination"),
  btnAddGame: document.getElementById("btnAddGame"),
  btnExportCsv: document.getElementById("btnExportCsv"),
  csvLabel: document.getElementById("csvLabel"),
  modalOverlay: document.getElementById("modalOverlay"),
  btnCloseModal: document.getElementById("btnCloseModal"),
  btnCancelModal: document.getElementById("btnCancelModal"),
  formAddGame: document.getElementById("formAddGame"),
  inputProvider: document.getElementById("inputProvider"),
  inputNamaGame: document.getElementById("inputNamaGame"),
  inputTipeGame: document.getElementById("inputTipeGame"),
  providerList: document.getElementById("providerList"),
  tipeGameList: document.getElementById("tipeGameList"),
  btnSubmit: document.getElementById("btnSubmit"),
  toastContainer: document.getElementById("toastContainer"),

  // Crosscheck
  btnCrosscheck: document.getElementById("btnCrosscheck"),
  modalCrosscheckOverlay: document.getElementById("modalCrosscheckOverlay"),
  btnCloseCrosscheck: document.getElementById("btnCloseCrosscheck"),
  btnCancelCrosscheck: document.getElementById("btnCancelCrosscheck"),
  btnCloseCrosscheck2: document.getElementById("btnCloseCrosscheck2"),
  btnCrosscheck2Back: document.getElementById("btnCrosscheck2Back"),
  crosscheckInput: document.getElementById("crosscheckInput"),
  crosscheckLineCount: document.getElementById("crosscheckLineCount"),
  btnRunCrosscheck: document.getElementById("btnRunCrosscheck"),
  crosscheckStep1: document.getElementById("crosscheckStep1"),
  crosscheckStep2: document.getElementById("crosscheckStep2"),
  statMissing: document.getElementById("statMissing"),
  statFound: document.getElementById("statFound"),
  statTotal: document.getElementById("statTotal"),
  badgeMissing: document.getElementById("badgeMissing"),
  badgeFound: document.getElementById("badgeFound"),
  tabMissing: document.getElementById("tabMissing"),
  tabFound: document.getElementById("tabFound"),
  panelMissing: document.getElementById("panelMissing"),
  panelFound: document.getElementById("panelFound"),
  missingList: document.getElementById("missingList"),
  foundList: document.getElementById("foundList"),
  btnSelectAll: document.getElementById("btnSelectAll"),
  batchForm: document.getElementById("batchForm"),
  batchSelectedCount: document.getElementById("batchSelectedCount"),
  batchProvider: document.getElementById("batchProvider"),
  batchTipe: document.getElementById("batchTipe"),
  batchProviderList: document.getElementById("batchProviderList"),
  batchTipeList: document.getElementById("batchTipeList"),
  batchProviderError: document.getElementById("batchProviderError"),
  batchTipeError: document.getElementById("batchTipeError"),
  btnBatchAdd: document.getElementById("btnBatchAdd"),
};

/* ===========================================================
   INISIALISASI
   =========================================================== */
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadData();
});

function bindEvents() {
  // Search dengan debounce 250ms — supaya tidak re-render setiap ketukan keyboard
  els.searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = e.target.value.trim();
      applyFilters();
    }, 250);
  });

  els.providerFilter.addEventListener("change", (e) => {
    state.provider = e.target.value;
    applyFilters();
  });

  els.typeFilter.addEventListener("change", (e) => {
    state.type = e.target.value;
    applyFilters();
  });

  els.btnExportCsv.addEventListener("click", downloadCSV);

  els.btnAddGame.addEventListener("click", openModal);
  els.btnCloseModal.addEventListener("click", closeModal);
  els.btnCancelModal.addEventListener("click", closeModal);
  els.modalOverlay.addEventListener("click", (e) => {
    if (e.target === els.modalOverlay) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!els.modalOverlay.classList.contains("hidden")) closeModal();
      if (!els.modalCrosscheckOverlay.classList.contains("hidden")) closeCrosscheck();
    }
  });

  els.formAddGame.addEventListener("submit", handleAddGame);

  // Crosscheck
  els.btnCrosscheck.addEventListener("click", openCrosscheck);
  els.btnCloseCrosscheck.addEventListener("click", closeCrosscheck);
  els.btnCancelCrosscheck.addEventListener("click", closeCrosscheck);
  els.btnCloseCrosscheck2.addEventListener("click", closeCrosscheck);
  els.btnCrosscheck2Back.addEventListener("click", crosscheckGoBack);
  els.modalCrosscheckOverlay.addEventListener("click", (e) => {
    if (e.target === els.modalCrosscheckOverlay) closeCrosscheck();
  });
  els.crosscheckInput.addEventListener("input", updateCrosscheckCounter);
  els.btnRunCrosscheck.addEventListener("click", runCrosscheck);
  els.btnSelectAll.addEventListener("click", toggleSelectAll);
  els.btnBatchAdd.addEventListener("click", handleBatchAdd);
  els.tabMissing.addEventListener("click", () => switchCrosscheckTab("missing"));
  els.tabFound.addEventListener("click", () => switchCrosscheckTab("found"));

  // Event delegation untuk hover row — 1 listener bukan ratusan
  // (lebih hemat memori saat data ribuan)
  els.tableBody.addEventListener("mouseover", handleRowHoverIn);
  els.tableBody.addEventListener("mouseout", handleRowHoverOut);
}

/* ===========================================================
   LOAD DATA
   Strategi: tampilkan cache dulu (instan), refresh dari server
   di latar belakang. Pertama kali (belum ada cache) → skeleton.
   =========================================================== */
function loadData() {
  renderSkeleton();

  const cached = loadCache();
  if (cached) {
    allGames = cached;
    indexGames(allGames);
    populateFilters();
    applyFilters();
    // Refresh dari server tanpa skeleton — biar terasa cepat
    fetchFresh(false);
    return;
  }

  fetchFresh(true);
}

async function fetchFresh(showErrorOnFail) {
  try {
    const resp = await fetch(`${CONFIG.API_URL}?action=getGames`);
    const json = await resp.json();
    if (!json.success) throw new Error(json.message || "Gagal memuat data");
    allGames = json.data || [];
    indexGames(allGames);
    saveCache(allGames);
    populateFilters();
    applyFilters();
  } catch (err) {
    console.error(err);
    if (showErrorOnFail) {
      els.tableBody.innerHTML =
        `<div class="empty">⚠️ Gagal memuat data. Coba refresh halaman.<br><small>${escHtml(err.message)}</small></div>`;
      els.pagination.style.display = "none";
    }
  }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CONFIG.CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CONFIG.CACHE_TTL_MS) {
      localStorage.removeItem(CONFIG.CACHE_KEY);
      return null;
    }
    return data;
  } catch (_) {
    return null;
  }
}

let _cacheTimer = null;
function saveCache(data) {
  // JSON.stringify untuk data ribuan game itu berat & sinkron (blok UI).
  // Ditunda ke "idle" berikutnya supaya render/tabel tampil dulu, baru cache
  // ditulis di belakang layar. clearTimeout = gabungkan banyak panggilan
  // beruntun (mis. saat batch add) jadi 1 penulisan saja.
  clearTimeout(_cacheTimer);
  _cacheTimer = setTimeout(() => {
    try {
      localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch (_) {
      // Storage penuh — abaikan, tidak fatal
    }
  }, 0);
}

/* ===========================================================
   FILTER OPTIONS
   =========================================================== */
function populateFilters() {
  const providers = uniqSorted(allGames.map((g) => g.provider));
  const types     = uniqSorted(allGames.map((g) => g.tipeGame));

  // Bersihkan opsi lama (kecuali "Semua ...") lalu isi ulang
  fillSelect(els.providerFilter, providers, "Semua Provider", state.provider);
  fillSelect(els.typeFilter,     types,     "Semua Tipe",     state.type);

  // Datalist di form tambah game — supaya user tidak salah ketik
  els.providerList.innerHTML = providers.map((v) => `<option value="${escHtml(v)}"></option>`).join("");
  els.tipeGameList.innerHTML = types.map((v) => `<option value="${escHtml(v)}"></option>`).join("");
}

function uniqSorted(arr) {
  return [...new Set(arr.filter(Boolean))].sort(collator.compare);
}

function fillSelect(selectEl, values, defaultLabel, currentValue) {
  selectEl.innerHTML =
    `<option value="">${defaultLabel}</option>` +
    values.map((v) => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join("");
  if (values.includes(currentValue)) selectEl.value = currentValue;
}

/* ===========================================================
   APPLY FILTERS
   =========================================================== */
function applyFilters() {
  const q = state.search.toLowerCase();
  const fProvider = state.provider;
  const fType = state.type;

  filtered = allGames.filter((g) => {
    if (fProvider && g.provider !== fProvider) return false;
    if (fType && g.tipeGame !== fType) return false;
    if (q) {
      // Pakai versi lowercase yang sudah dihitung sekali (lihat indexGame),
      // bukan .toLowerCase() ulang tiap game tiap ketukan.
      if (g._ln === undefined) indexGame(g);
      if (!g._ln.includes(q) && !g._lp.includes(q)) return false;
    }
    return true;
  });

  // Urut A-Z berdasarkan Provider (collator dipakai ulang, jauh lebih cepat)
  filtered.sort((a, b) => collator.compare(a.provider, b.provider));

  page = 1;
  render();
}

/* ===========================================================
   RENDER TABEL + PAGINATION
   =========================================================== */
function render() {
  const total = filtered.length;

  els.totalCount.textContent = allGames.length.toLocaleString("id");
  els.btnExportCsv.disabled = total === 0;
  els.csvLabel.textContent = total > 0 ? `CSV (${total.toLocaleString("id")})` : "CSV";

  if (total === 0) {
    els.tableBody.innerHTML = `<div class="empty">Tidak ada game yang sesuai filter.</div>`;
    els.pagination.style.display = "none";
    return;
  }

  const totalPages = Math.ceil(total / CONFIG.PAGE_SIZE);
  page = Math.min(page, totalPages);
  const slice = filtered.slice((page - 1) * CONFIG.PAGE_SIZE, page * CONFIG.PAGE_SIZE);

  // Bangun seluruh HTML sekaligus dengan join — jauh lebih cepat dari appendChild
  // berulang. Penting untuk render 50 baris (dan total data 10K+).
  const parts = new Array(slice.length);
  for (let i = 0; i < slice.length; i++) {
    const g = slice[i];
    const isEven = i % 2 === 0;
    const pc = providerColor(g.provider);

    // Data warna disimpan di data-attribute supaya event delegation
    // hover bisa pakainya tanpa re-compute. encodeURIComponent supaya
    // value yang ada koma/quote tetap aman di HTML attribute.
    parts[i] =
      `<div class="row" ` +
        `style="background:${isEven ? "#11151d" : "#0c0e13"};--row-hover-color:${pc.rowHover}" ` +
        `data-text="${encodeURIComponent(pc.text)}" ` +
        `data-texthov="${encodeURIComponent(pc.textHov)}" ` +
        `data-dot="${encodeURIComponent(pc.dot)}" ` +
        `data-dotglow="${encodeURIComponent(pc.dotGlow)}" ` +
        `data-border="${encodeURIComponent(pc.border)}">` +
        `<div class="row-accent" style="background:${pc.accent}"></div>` +
        `<div class="row-cell">` +
          `<span class="provider-dot" style="background:${pc.dot}"></span>` +
          `<span class="provider-name" style="color:${pc.text}">${escHtml(g.provider)}</span>` +
        `</div>` +
        `<div class="row-cell">` +
          `<span class="game-name">${escHtml(g.namaGame)}</span>` +
        `</div>` +
        `<div class="row-cell">` +
          `<span class="type-badge">${escHtml(g.tipeGame || "—")}</span>` +
        `</div>` +
      `</div>`;
  }
  els.tableBody.innerHTML = parts.join("");

  renderPagination(total, totalPages);
}

function renderPagination(total, totalPages) {
  if (totalPages <= 1) {
    els.pagination.style.display = "none";
    return;
  }

  els.pagination.style.display = "flex";
  els.pagination.innerHTML = `
    <p class="page-info">
      Halaman <b>${page}</b> dari <b>${totalPages}</b> · Total <b>${total.toLocaleString("id")}</b> game
    </p>
    <div class="page-controls">
      <button class="btn-page" id="pFirst" ${page === 1 ? "disabled" : ""}>«</button>
      <button class="btn-page" id="pPrev"  ${page === 1 ? "disabled" : ""}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg> Prev
      </button>
      <div class="page-indicator">${page} / ${totalPages}</div>
      <button class="btn-page" id="pNext" ${page === totalPages ? "disabled" : ""}>
        Next <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <button class="btn-page" id="pLast" ${page === totalPages ? "disabled" : ""}>»</button>
    </div>
  `;

  document.getElementById("pFirst").onclick = () => { page = 1; render(); scrollTop(); };
  document.getElementById("pPrev").onclick  = () => { page = Math.max(1, page - 1); render(); scrollTop(); };
  document.getElementById("pNext").onclick  = () => { page = Math.min(totalPages, page + 1); render(); scrollTop(); };
  document.getElementById("pLast").onclick  = () => { page = totalPages; render(); scrollTop(); };
}

function scrollTop() { window.scrollTo({ top: 0, behavior: "smooth" }); }

/* ===========================================================
   SKELETON LOADER
   =========================================================== */
function renderSkeleton() {
  const widths = [[52, 60, 28], [40, 70, 22], [58, 55, 32], [44, 65, 25]];
  const rows = Array.from({ length: 14 }, (_, i) => {
    const w = widths[i % widths.length];
    return (
      `<div class="skeleton-row">` +
        `<div class="skeleton-cell"><div class="skeleton-bar" style="width:${w[0]}%"></div></div>` +
        `<div class="skeleton-cell"><div class="skeleton-bar" style="width:${w[1]}%"></div></div>` +
        `<div class="skeleton-cell"><div class="skeleton-bar" style="width:${w[2]}%"></div></div>` +
      `</div>`
    );
  });
  els.tableBody.innerHTML = rows.join("");
  els.pagination.style.display = "none";
}

/* ===========================================================
   HOVER ROW (event delegation)
   1 listener untuk seluruh tabel — bukan 50 listener per baris.
   =========================================================== */
function handleRowHoverIn(e) {
  const row = e.target.closest(".row");
  if (!row) return;

  const textHov = decodeURIComponent(row.dataset.texthov);
  const dotGlow = decodeURIComponent(row.dataset.dotglow);
  const border = decodeURIComponent(row.dataset.border);

  row.style.boxShadow = `inset 0 0 0 1px ${border}, 0 2px 16px ${dotGlow}`;
  const dot = row.querySelector(".provider-dot");
  const name = row.querySelector(".provider-name");
  if (dot)  { dot.style.opacity = "1"; dot.style.boxShadow = `0 0 6px ${dotGlow}`; }
  if (name) { name.style.color = textHov; }
}

function handleRowHoverOut(e) {
  const row = e.target.closest(".row");
  if (!row || row.contains(e.relatedTarget)) return;

  const text = decodeURIComponent(row.dataset.text);
  row.style.boxShadow = "none";
  const dot = row.querySelector(".provider-dot");
  const name = row.querySelector(".provider-name");
  if (dot)  { dot.style.opacity = "0.7"; dot.style.boxShadow = "none"; }
  if (name) { name.style.color = text; }
}

/* ===========================================================
   TAMBAH GAME (MODAL + SUBMIT)
   =========================================================== */
function openModal() {
  els.formAddGame.reset();
  clearFormErrors();
  els.modalOverlay.classList.remove("hidden");
  setTimeout(() => els.inputProvider.focus(), 50);
}

function closeModal() {
  els.modalOverlay.classList.add("hidden");
}

function handleAddGame(e) {
  e.preventDefault();

  const provider = els.inputProvider.value.trim();
  const namaGame = els.inputNamaGame.value.trim();
  const tipeGame = els.inputTipeGame.value.trim();

  clearFormErrors();

  let valid = true;
  if (!provider) { setFieldError(els.inputProvider, "Provider wajib diisi"); valid = false; }
  if (!namaGame) { setFieldError(els.inputNamaGame, "Nama game wajib diisi"); valid = false; }
  if (!tipeGame) { setFieldError(els.inputTipeGame, "Tipe game wajib diisi"); valid = false; }
  if (!valid) return;

  setSubmitLoading(true);

  fetch(CONFIG.API_URL, {
    method: "POST",
    // Pakai text/plain — kalau application/json, browser akan kirim
    // preflight OPTIONS yang tidak didukung Apps Script.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ provider, namaGame, tipeGame }),
  })
    .then((res) => res.json())
    .then((json) => {
      if (!json.success) throw new Error(json.message || "Gagal menyimpan data");

      // Optimistic update — langsung muncul tanpa nunggu refetch
      const newGame = { provider, namaGame, tipeGame };
      indexGame(newGame);
      allGames.push(newGame);
      saveCache(allGames);
      populateFilters();
      applyFilters();

      showToast("✓ Game berhasil ditambahkan!", "success");
      closeModal();

      // Sinkronkan ulang dari server di belakang layar
      fetchFresh(false);
    })
    .catch((err) => {
      console.error(err);
      showToast(err.message || "Gagal menambahkan game.", "error");
    })
    .finally(() => setSubmitLoading(false));
}

function setSubmitLoading(loading) {
  els.btnSubmit.disabled = loading;
  els.btnSubmit.textContent = loading ? "Menyimpan..." : "Simpan";
}

function setFieldError(inputEl, message) {
  inputEl.classList.add("input-error");
  const errEl = inputEl.parentElement.querySelector(".field-error");
  if (errEl) errEl.textContent = message;
}

function clearFormErrors() {
  document.querySelectorAll(".input-error").forEach((el) => el.classList.remove("input-error"));
  document.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
}

/* ===========================================================
   EXPORT CSV
   =========================================================== */
function downloadCSV() {
  if (!filtered.length) return;

  const header = ["Provider", "Nama Game", "Tipe Game"];
  const lines = [
    header.join(","),
    ...filtered.map((g) =>
      [g.provider, g.namaGame, g.tipeGame]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];

  // BOM \uFEFF supaya karakter unicode (™, é, dll) muncul benar di Excel
  const csv = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const suffix = (state.search || state.provider || state.type) ? "filtered" : "all";
  const date = new Date().toISOString().slice(0, 10);

  const a = document.createElement("a");
  a.href = url;
  a.download = `data-game-${suffix}-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showToast(`✓ ${filtered.length} game ter-export ke CSV.`, "success");
}

/* ===========================================================
   TOAST
   =========================================================== */
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    toast.style.transition = "opacity 0.25s, transform 0.25s";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/* ===========================================================
   CROSSCHECK PERMAINAN
   =========================================================== */

// State crosscheck
const ccState = {
  missingGames: [],   // nama game yang belum ada di dashboard
  foundGames: [],     // nama game yang sudah ada (beserta data provider/tipenya)
  selectedItems: new Set(), // index dari missingGames yang dipilih
  allSelected: false,
};

function openCrosscheck() {
  // Reset ke step 1
  els.crosscheckInput.value = "";
  els.crosscheckLineCount.textContent = "0";
  els.crosscheckStep1.classList.remove("hidden");
  els.crosscheckStep2.classList.add("hidden");
  els.modalCrosscheckOverlay.classList.remove("hidden");
  setTimeout(() => els.crosscheckInput.focus(), 50);
}

function closeCrosscheck() {
  els.modalCrosscheckOverlay.classList.add("hidden");
}

function crosscheckGoBack() {
  els.crosscheckStep1.classList.remove("hidden");
  els.crosscheckStep2.classList.add("hidden");
  // Reset seleksi saat kembali
  ccState.selectedItems.clear();
  ccState.allSelected = false;
}

function updateCrosscheckCounter() {
  const lines = parseCrosscheckInput(els.crosscheckInput.value);
  els.crosscheckLineCount.textContent = lines.length;
}

/**
 * Parsing input textarea:
 * - Pisah per baris
 * - Trim whitespace
 * - Buang baris kosong & duplikat
 */
function parseCrosscheckInput(raw) {
  const seen = new Set();
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => {
      if (!l) return false;
      // Abaikan baris yang mengandung kata "logo" (di posisi mana pun, case-insensitive)
      if (/logo/i.test(l)) return false;
      if (seen.has(l.toLowerCase())) return false;
      seen.add(l.toLowerCase());
      return true;
    });
}

function runCrosscheck() {
  const inputNames = parseCrosscheckInput(els.crosscheckInput.value);

  if (inputNames.length === 0) {
    showToast("⚠ Masukkan minimal 1 nama game terlebih dahulu.", "error");
    return;
  }

  // Buat lookup dari nama game yang ada di dashboard (case-insensitive)
  // Format: namaLowercase → { provider, tipeGame }
  const existingMap = new Map();
  for (const g of allGames) {
    const key = g.namaGame.toLowerCase().trim();
    if (!existingMap.has(key)) {
      existingMap.set(key, { provider: g.provider, tipeGame: g.tipeGame });
    }
  }

  // Pisahkan: yang belum ada vs yang sudah ada
  ccState.missingGames = [];
  ccState.foundGames = [];

  for (const name of inputNames) {
    const match = existingMap.get(name.toLowerCase());
    if (match) {
      ccState.foundGames.push({ name, provider: match.provider, tipeGame: match.tipeGame });
    } else {
      ccState.missingGames.push(name);
    }
  }

  ccState.selectedItems.clear();
  ccState.allSelected = false;

  // Tampilkan step 2
  renderCrosscheckResult(inputNames.length);
  els.crosscheckStep1.classList.add("hidden");
  els.crosscheckStep2.classList.remove("hidden");
  switchCrosscheckTab("missing");
}

function renderCrosscheckResult(total) {
  const { missingGames, foundGames } = ccState;

  // Update statistik
  els.statMissing.textContent = missingGames.length.toLocaleString("id");
  els.statFound.textContent = foundGames.length.toLocaleString("id");
  els.statTotal.textContent = total.toLocaleString("id");
  els.badgeMissing.textContent = missingGames.length;
  els.badgeFound.textContent = foundGames.length;

  // Render daftar belum terdata
  if (missingGames.length === 0) {
    els.missingList.innerHTML =
      `<div style="padding:40px 0;text-align:center;color:var(--muted);font-size:13px;font-style:italic">
        🎉 Semua game sudah terdata di dashboard!
      </div>`;
  } else {
    els.missingList.innerHTML = missingGames.map((name, idx) => `
      <div class="cc-item" data-idx="${idx}">
        <div class="cc-checkbox">
          <svg class="cc-checkbox-tick" viewBox="0 0 10 10">
            <polyline points="1.5 5 4 7.5 8.5 2.5"/>
          </svg>
        </div>
        <span class="cc-item-name">${escHtml(name)}</span>
      </div>
    `).join("");

    // Event delegation untuk klik item
    els.missingList.onclick = (e) => {
      const item = e.target.closest(".cc-item");
      if (!item) return;
      const idx = Number(item.dataset.idx);
      toggleCcItem(idx, item);
    };
  }

  // Render daftar sudah ada
  if (foundGames.length === 0) {
    els.foundList.innerHTML =
      `<div style="padding:40px 0;text-align:center;color:var(--muted);font-size:13px;font-style:italic">
        Tidak ada game dari daftar yang sudah terdata.
      </div>`;
  } else {
    els.foundList.innerHTML = foundGames.map((g) => `
      <div class="cc-found-item">
        <svg class="cc-found-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="9 12 11.5 14.5 15.5 9.5"/>
        </svg>
        <span class="cc-found-name">${escHtml(g.name)}</span>
        <span class="cc-found-provider">${escHtml(g.provider || "—")}</span>
      </div>
    `).join("");
  }

  // Sync datalist provider & tipe untuk batch form
  const providers = uniqSorted(allGames.map((g) => g.provider));
  const types     = uniqSorted(allGames.map((g) => g.tipeGame));
  els.batchProviderList.innerHTML = providers.map((v) => `<option value="${escHtml(v)}"></option>`).join("");
  els.batchTipeList.innerHTML     = types.map((v) => `<option value="${escHtml(v)}"></option>`).join("");

  // Sembunyikan batch form, reset field
  els.batchForm.classList.add("hidden");
  els.batchProvider.value = "";
  els.batchTipe.value = "";
  els.batchProviderError.textContent = "";
  els.batchTipeError.textContent = "";
}

function toggleCcItem(idx, itemEl) {
  if (ccState.selectedItems.has(idx)) {
    ccState.selectedItems.delete(idx);
    itemEl.classList.remove("selected");
  } else {
    ccState.selectedItems.add(idx);
    itemEl.classList.add("selected");
  }
  updateBatchFormVisibility();
}

function toggleSelectAll() {
  const items = els.missingList.querySelectorAll(".cc-item");
  ccState.allSelected = !ccState.allSelected;

  if (ccState.allSelected) {
    ccState.selectedItems.clear();
    items.forEach((item) => {
      item.classList.add("selected");
      ccState.selectedItems.add(Number(item.dataset.idx));
    });
    els.btnSelectAll.textContent = "Batal Semua";
  } else {
    ccState.selectedItems.clear();
    items.forEach((item) => item.classList.remove("selected"));
    els.btnSelectAll.textContent = "Pilih Semua";
  }
  updateBatchFormVisibility();
}

function updateBatchFormVisibility() {
  const count = ccState.selectedItems.size;
  if (count > 0) {
    els.batchForm.classList.remove("hidden");
    els.batchSelectedCount.textContent = count;
  } else {
    els.batchForm.classList.add("hidden");
  }
  // Sinkronkan teks tombol "Pilih Semua"
  if (ccState.selectedItems.size === ccState.missingGames.length && ccState.missingGames.length > 0) {
    els.btnSelectAll.textContent = "Batal Semua";
    ccState.allSelected = true;
  } else {
    els.btnSelectAll.textContent = "Pilih Semua";
    ccState.allSelected = false;
  }
}

function switchCrosscheckTab(tab) {
  const isMissing = tab === "missing";
  els.tabMissing.classList.toggle("active", isMissing);
  els.tabFound.classList.toggle("active", !isMissing);
  els.panelMissing.classList.toggle("hidden", !isMissing);
  els.panelFound.classList.toggle("hidden", isMissing);
}

async function handleBatchAdd() {
  const provider = els.batchProvider.value.trim();
  const tipeGame = els.batchTipe.value.trim();

  // Validasi
  els.batchProviderError.textContent = "";
  els.batchTipeError.textContent = "";
  let valid = true;
  if (!provider) { els.batchProviderError.textContent = "Provider wajib diisi"; valid = false; }
  if (!tipeGame) { els.batchTipeError.textContent = "Tipe game wajib diisi"; valid = false; }
  if (!valid) return;

  const selectedNames = [...ccState.selectedItems].map((idx) => ccState.missingGames[idx]);

  els.btnBatchAdd.disabled = true;
  els.btnBatchAdd.textContent = `Menyimpan ${selectedNames.length} game...`;

  let successCount = 0;
  let failCount = 0;

  // Kirim satu per satu secara berurutan (agar tidak flood server)
  for (const namaGame of selectedNames) {
    try {
      const res = await fetch(CONFIG.API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ provider, namaGame, tipeGame }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      // Optimistic: langsung tambah ke allGames
      const addedGame = { provider, namaGame, tipeGame };
      indexGame(addedGame);
      allGames.push(addedGame);
      successCount++;
    } catch (_) {
      failCount++;
    }
  }

  // Update cache & filter
  saveCache(allGames);
  populateFilters();
  applyFilters();

  // Hapus game yang berhasil dari daftar missing
  const addedNames = new Set(
    [...ccState.selectedItems]
      .filter((_, i) => i < successCount + failCount - failCount) // hanya yg sukses
      .map((idx) => ccState.missingGames[idx].toLowerCase())
  );

  // Cara lebih aman: rebuild missingGames dari yang belum terdata di allGames (setelah update)
  const existingNow = new Set(allGames.map((g) => g.namaGame.toLowerCase().trim()));
  ccState.missingGames = ccState.missingGames.filter(
    (name) => !existingNow.has(name.toLowerCase())
  );
  ccState.selectedItems.clear();
  ccState.allSelected = false;

  // Re-render hasil
  const newTotal = ccState.missingGames.length + ccState.foundGames.length + successCount;
  renderCrosscheckResult(newTotal);

  // Update statistik live
  els.statMissing.textContent = ccState.missingGames.length.toLocaleString("id");
  els.statFound.textContent   = (ccState.foundGames.length + successCount).toLocaleString("id");
  els.badgeMissing.textContent = ccState.missingGames.length;
  els.badgeFound.textContent   = ccState.foundGames.length + successCount;

  els.btnBatchAdd.disabled = false;
  els.btnBatchAdd.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
    Tambahkan ke Dashboard
  `;

  if (failCount === 0) {
    showToast(`✓ ${successCount} game berhasil ditambahkan!`, "success");
    // Refresh dari server di background
    fetchFresh(false);
  } else {
    showToast(`⚠ ${successCount} berhasil, ${failCount} gagal disimpan.`, "error");
  }
}


function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
