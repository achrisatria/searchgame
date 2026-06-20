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
    if (e.key === "Escape" && !els.modalOverlay.classList.contains("hidden")) {
      closeModal();
    }
  });

  els.formAddGame.addEventListener("submit", handleAddGame);

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

function saveCache(data) {
  try {
    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch (_) {
    // Storage penuh — abaikan, tidak fatal
  }
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
  return [...new Set(arr.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "id", { sensitivity: "base" })
  );
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

  filtered = allGames.filter((g) => {
    if (state.provider && g.provider !== state.provider) return false;
    if (state.type && g.tipeGame !== state.type) return false;
    if (q && !g.namaGame.toLowerCase().includes(q) && !g.provider.toLowerCase().includes(q)) return false;
    return true;
  });

  // Urut A-Z berdasarkan Provider
  filtered.sort((a, b) => a.provider.localeCompare(b.provider, "id", { sensitivity: "base" }));

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
      allGames.push({ provider, namaGame, tipeGame });
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
   UTILITY
   =========================================================== */
function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
