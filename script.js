



// 1) Paste your published Google Sheet CSV URL here:
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQEtqR5ujlOZY2BmzHIJiTW1QY315hXz0Zj4b_yqgo3G_3swfsAY43LDoDJUSp7J5NWAuFac044e2bS/pub?output=csv";

// 2) Your Instagram username (for Buy DM links & header/footer)
const INSTAGRAM_USERNAME = "diecast_dripz";

// 3) Your public contact info (shown in header)
const CONTACT_EMAIL = "abhaydasah2022@gmail.com";
const CONTACT_PHONE = "+91XXXXXXXXXX";


/***********************************************
 * HELPER: Safe CSV parser (handles quotes, ,) *
 ***********************************************/
function parseCSV(text) {
  const rows = [];
  let i = 0, field = "", row = [];
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; }
        else { inQuotes = false; i++; }
      } else { field += ch; i++; }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === ",") { row.push(field.trim()); field = ""; i++; }
      else if (ch === "\r") { i++; }
      else if (ch === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; i++; }
      else { field += ch; i++; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field.trim()); rows.push(row); }
  return rows;
}

/****************************************
 * Device helpers                       *
 ****************************************/
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/****************************************
 * Instagram DM link strategy           *
 ****************************************/
// Best chance to open app DM to a specific account with prefilled text.
// On mobile, ig.me usually deep-links straight into Instagram app.
function buildIgMeDM(username, message) {
  return `https://ig.me/m/${encodeURIComponent(username)}?text=${encodeURIComponent(message)}`;
}

/****************************************
 * Create product card DOM node         *
 ****************************************/
function createCard(item) {
  const { name, price, description, imageURL, stockRaw } = item;

  const stockNormalized = (stockRaw || "").toLowerCase().trim();
  const isOut =
    stockNormalized === "out of stock" ||
    stockNormalized === "sold out" ||
    stockNormalized === "0" ||
    stockNormalized === "no" ||
    stockNormalized === "false";

  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <img class="card__image" src="${imageURL}" alt="${name}" loading="lazy" referrerpolicy="no-referrer" />
    <div class="card__body">
      <h2 class="card__title">${name}</h2>
      <div class="card__price">${price}</div>
      <p class="card__desc">${description}</p>
      <div>
        <span class="badge ${isOut ? "badge--out" : "badge--in"}">
          ${isOut ? "Out of Stock" : "In Stock"}
        </span>
      </div>
      <div class="card__actions">
        <button class="btn btn--buy" ${isOut ? "disabled" : ""}>
          ${isOut ? "Unavailable" : "Buy on Instagram"}
        </button>
      </div>
    </div>
  `;

  const button = card.querySelector(".btn--buy");
  if (!isOut) {
    button.addEventListener("click", () => {
      const message = `I'm interested in buying the ${name}`;
      const dm = buildIgMeDM(INSTAGRAM_USERNAME, message);

      if (isMobile()) {
        // On mobile: navigating the current tab has the best chance to open the Instagram app
        window.location.href = dm;
      } else {
        // Desktop: open web DM in a new tab
        window.open(dm, "_blank", "noopener");
      }
    });
  }

  return card;
}

/****************************************
 * Status helpers                       *
 ****************************************/
function showOnly({ loading = false, error = false, empty = false }) {
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const emptyEl = document.getElementById("empty");

  loadingEl.hidden = !loading;
  errorEl.hidden = !error;
  emptyEl.hidden = !empty;
}

/****************************************
 * Fetch, parse, and render catalog     *
 ****************************************/
async function loadCatalog() {
  const grid = document.getElementById("catalog-container");
  grid.innerHTML = "";
  showOnly({ loading: true });

  try {
    const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();

    const rows = parseCSV(csvText).filter(r => r && r.length && r.join("").trim().length);
    if (!rows.length) { showOnly({ empty: true }); return; }

    // Header row
    const header = rows[0].map(h => h.toLowerCase().trim());
    const col = (key) => header.indexOf(key);

    const iName  = col("name");
    const iPrice = col("price");
    const iDesc  = col("description");
    const iImage = col("imageurl");
    const iStock = col("stock");

    // If required columns are missing, treat as error
    if (iName === -1 || iImage === -1) throw new Error("Required columns missing: Name, ImageURL");

    let count = 0;
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      // Guard against short rows
      const name        = (row[iName]  || "").trim();
      const price       = (row[iPrice] || "").trim();
      const description = (row[iDesc]  || "").trim();
      const imageURL    = (row[iImage] || "").trim();
      const stockRaw    = (row[iStock] || "").trim();

      if (!name || !imageURL) continue;

      const card = createCard({ name, price, description, imageURL, stockRaw });
      grid.appendChild(card);
      count++;
    }

    if (count === 0) { showOnly({ empty: true }); }
    else { showOnly({}); } // Hide all status messages on success

  } catch (err) {
    console.error("Catalog load error:", err);
    showOnly({ error: true });
  }
}

/********************
 * Init on DOM ready
 ********************/
document.addEventListener("DOMContentLoaded", () => {
  // Footer year only — we do NOT touch header links to avoid duplicates.
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  loadCatalog();
});
