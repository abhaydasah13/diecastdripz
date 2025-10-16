



// 1) Paste your published Google Sheet CSV URL here:
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQEtqR5ujlOZY2BmzHIJiTW1QY315hXz0Zj4b_yqgo3G_3swfsAY43LDoDJUSp7J5NWAuFac044e2bS/pub?output=csv";

// 2) Your Instagram username (for Buy DM links & header/footer)
const INSTAGRAM_USERNAME = "diecast_dripz";


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
      else if (ch === "\r") { i++; }            // ignore CR
      else if (ch === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; i++; }
      else { field += ch; i++; }
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field.trim()); rows.push(row); }
  return rows;
}

/****************************************
 * Device helper                        *
 ****************************************/
function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/****************************************
 * Instagram DM link                    *
 ****************************************/
function buildIgMeDM(username, message) {
  return `https://ig.me/m/${encodeURIComponent(username)}?text=${encodeURIComponent(message)}`;
}

/****************************************
 * Status helpers                       *
 ****************************************/
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

/****************************************
 * Normalizers & de-dup helpers         *
 ****************************************/
function normalizeName(name) {
  return (name || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeImageURL(url) {
  if (!url) return "";
  let u = url.trim();
  // strip query/hash, protocol-insensitive, collapse multiple slashes, remove trailing slash
  try {
    const obj = new URL(u, window.location.origin);
    u = (obj.host + obj.pathname).toLowerCase();
  } catch {
    // fallback: manual strip if URL() fails
    u = u.replace(/^https?:\/\//i, "").split("?")[0].split("#")[0].toLowerCase();
  }
  u = u.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return u;
}

function itemKey(name, imageURL, price) {
  // Strong key using normalized name + normalized image + normalized price
  const n = normalizeName(name);
  const img = normalizeImageURL(imageURL);
  const p = String(price || "").trim().toLowerCase();
  return `${n}||${img}||${p}`;
}

/****************************************
 * Create product card DOM node         *
 ****************************************/
function createCard(item) {
  const { name, price, description, imageURL, stockRaw } = item;

  const stockNormalized = (stockRaw || "").toLowerCase().trim();
  const stockCount = parseInt(stockRaw, 10);

  const isOut =
    stockNormalized === "out of stock" ||
    stockNormalized === "sold out" ||
    stockNormalized === "no" ||
    stockNormalized === "false" ||
    stockCount === 0;

  const stockText = isOut
    ? "Out of Stock"
    : (isNaN(stockCount) ? "In Stock" : `In Stock: ${stockCount} pcs`);

  // Always show ₹ before price (if price exists)
  const formattedPrice = price
    ? (price.includes("₹") ? price : `₹${price}`)
    : "";

  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <img class="card__image" src="${imageURL}" alt="${name}" loading="lazy" referrerpolicy="no-referrer" />
    <div class="card__body">
      <h2 class="card__title">${name}</h2>
      <div class="card__price">${formattedPrice}</div>
      <p class="card__desc">${description}</p>
      <div>
        <span class="badge ${isOut ? "badge--out" : "badge--in"}">${stockText}</span>
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
      const message = `I'm interested in buying the ${name} (${formattedPrice})`;
      const dm = buildIgMeDM(INSTAGRAM_USERNAME, message);
      if (isMobile()) {
        window.location.href = dm;                 // mobile: open app if possible
      } else {
        window.open(dm, "_blank", "noopener");     // desktop: web DM
      }
    });
  }

  return card;
}

/****************************************
 * Fetch, parse, and render catalog     *
 ****************************************/
let __HOTWHEELS_ALREADY_LOADED = false; // run-once guard

async function loadCatalog() {
  if (__HOTWHEELS_ALREADY_LOADED) {
    console.warn("loadCatalog() was called more than once; ignoring subsequent calls.");
    return;
  }
  __HOTWHEELS_ALREADY_LOADED = true;

  const grid = document.getElementById("catalog-container");
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const emptyEl = document.getElementById("empty");

  hide(errorEl); hide(emptyEl); show(loadingEl);
  grid.innerHTML = "";

  try {
    const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();

    const rowsRaw = parseCSV(csvText);
    const rows = rowsRaw.filter(r => Array.isArray(r) && r.some(v => (v || "").trim().length));
    if (!rows.length) { hide(loadingEl); show(emptyEl); return; }

    // Header row (case-insensitive + BOM-safe)
    let header = rows[0].map(h => (h || "").toLowerCase().trim());
    if (header[0] && header[0].charCodeAt(0) === 0xfeff) header[0] = header[0].slice(1);
    const col = (key) => header.indexOf(key);

    const iName  = col("name");
    const iPrice = col("price");
    const iDesc  = col("description");
    const iImage = col("imageurl");
    const iStock = col("stock");
    if (iName === -1 || iImage === -1) throw new Error("Required columns missing: Name, ImageURL");

    // Collect normalized items and de-duplicate
    const seenKeys = new Set();
    const items = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const name        = (row[iName]  || "").trim();
      const price       = (row[iPrice] || "").trim();
      const description = (row[iDesc]  || "").trim();
      const imageURL    = (row[iImage] || "").trim();
      const stockRaw    = (row[iStock] || "").trim();

      if (!name || !imageURL) continue;

      const key = itemKey(name, imageURL, price);
      if (seenKeys.has(key)) {
        console.info("Skipped duplicate row:", { name, imageURL, price });
        continue;
      }
      seenKeys.add(key);
      items.push({ name, price, description, imageURL, stockRaw });
    }

    // Debug log so you can see exactly what we render
    console.table(items);

    // Render
    let count = 0;
    for (const it of items) {
      grid.appendChild(createCard(it));
      count++;
    }

    hide(loadingEl);
    if (count === 0) show(emptyEl);

  } catch (err) {
    console.error("Catalog load error:", err);
    hide(loadingEl); show(errorEl);
  }
}

/********************
 * Init on DOM ready
 ********************/
document.addEventListener("DOMContentLoaded", () => {
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
  loadCatalog();
});
// /***********************************************
//  * HELPER: Safe CSV parser (handles quotes, ,) *
//  ***********************************************/
// function parseCSV(text) {
//   const rows = [];
//   let i = 0, field = "", row = [];
//   let inQuotes = false;

//   while (i < text.length) {
//     const ch = text[i];

//     if (inQuotes) {
//       if (ch === '"') {
//         if (text[i + 1] === '"') { field += '"'; i += 2; }
//         else { inQuotes = false; i++; }
//       } else { field += ch; i++; }
//     } else {
//       if (ch === '"') { inQuotes = true; i++; }
//       else if (ch === ",") { row.push(field.trim()); field = ""; i++; }
//       else if (ch === "\r") { i++; }
//       else if (ch === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; i++; }
//       else { field += ch; i++; }
//     }
//   }
//   if (field.length > 0 || row.length > 0) { row.push(field.trim()); rows.push(row); }
//   return rows;
// }

// /****************************************
//  * Device helper                        *
//  ****************************************/
// function isMobile() {
//   return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
// }

// /****************************************
//  * Instagram DM link                    *
//  ****************************************/
// function buildIgMeDM(username, message) {
//   return `https://ig.me/m/${encodeURIComponent(username)}?text=${encodeURIComponent(message)}`;
// }

// /****************************************
//  * Status helpers                       *
//  ****************************************/
// function show(el) { el.classList.remove("hidden"); }
// function hide(el) { el.classList.add("hidden"); }

// /****************************************
//  * Create product card DOM node         *
//  ****************************************/
// function createCard(item) {
//   const { name, price, description, imageURL, stockRaw } = item;

//   const stockNormalized = (stockRaw || "").toLowerCase().trim();
//   const stockCount = parseInt(stockRaw, 10);

//   const isOut =
//     stockNormalized === "out of stock" ||
//     stockNormalized === "sold out" ||
//     stockNormalized === "no" ||
//     stockNormalized === "false" ||
//     stockCount === 0;

//   const stockText = isOut
//     ? "Out of Stock"
//     : (isNaN(stockCount)
//         ? "In Stock"
//         : `In Stock: ${stockCount} pcs`);

//   // Ensure ₹ is always shown before price
//   const formattedPrice = price
//     ? (price.includes("₹") ? price : `₹${price}`)
//     : "";

//   const card = document.createElement("article");
//   card.className = "card";
//   card.innerHTML = `
//     <img class="card__image" src="${imageURL}" alt="${name}" loading="lazy" referrerpolicy="no-referrer" />
//     <div class="card__body">
//       <h2 class="card__title">${name}</h2>
//       <div class="card__price">${formattedPrice}</div>
//       <p class="card__desc">${description}</p>
//       <div>
//         <span class="badge ${isOut ? "badge--out" : "badge--in"}">${stockText}</span>
//       </div>
//       <div class="card__actions">
//         <button class="btn btn--buy" ${isOut ? "disabled" : ""}>
//           ${isOut ? "Unavailable" : "Buy on Instagram"}
//         </button>
//       </div>
//     </div>
//   `;

//   const button = card.querySelector(".btn--buy");
//   if (!isOut) {
//     button.addEventListener("click", () => {
//       const message = `I'm interested in buying the ${name} (${formattedPrice})`;
//       const dm = buildIgMeDM(INSTAGRAM_USERNAME, message);

//       if (isMobile()) {
//         window.location.href = dm;
//       } else {
//         window.open(dm, "_blank", "noopener");
//       }
//     });
//   }

//   return card;
// }


// worikng code
// /****************************************
//  * Fetch, parse, and render catalog     *
//  ****************************************/
// async function loadCatalog() {
//   const grid = document.getElementById("catalog-container");
//   const loadingEl = document.getElementById("loading");
//   const errorEl = document.getElementById("error");
//   const emptyEl = document.getElementById("empty");

//   hide(errorEl); hide(emptyEl); show(loadingEl);
//   grid.innerHTML = "";

//   try {
//     const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
//     if (!res.ok) throw new Error(`HTTP ${res.status}`);
//     const csvText = await res.text();

//     const rowsRaw = parseCSV(csvText);
//     const rows = rowsRaw.filter(r => Array.isArray(r) && r.some(v => (v || "").trim().length));

//     if (!rows.length) {
//       hide(loadingEl); show(emptyEl);
//       return;
//     }

//     const header = rows[0].map(h => (h || "").toLowerCase().trim());
//     const col = (key) => header.indexOf(key);

//     const iName  = col("name");
//     const iPrice = col("price");
//     const iDesc  = col("description");
//     const iImage = col("imageurl");
//     const iStock = col("stock");

//     if (iName === -1 || iImage === -1)
//       throw new Error("Required columns missing: Name, ImageURL");

//     let count = 0;
//     for (let r = 1; r < rows.length; r++) {
//       const row = rows[r];
//       const name        = (row[iName]  || "").trim();
//       const price       = (row[iPrice] || "").trim();
//       const description = (row[iDesc]  || "").trim();
//       const imageURL    = (row[iImage] || "").trim();
//       const stockRaw    = (row[iStock] || "").trim();

//       if (!name || !imageURL) continue;
//       grid.appendChild(createCard({ name, price, description, imageURL, stockRaw }));
//       count++;
//     }

//     hide(loadingEl);
//     if (count === 0) show(emptyEl);

//   } catch (err) {
//     console.error("Catalog load error:", err);
//     hide(loadingEl); show(errorEl);
//   }
// }

// /********************
//  * Init on DOM ready
//  ********************/
// document.addEventListener("DOMContentLoaded", () => {
//   const y = document.getElementById("year");
//   if (y) y.textContent = new Date().getFullYear();
//   loadCatalog();
// });

// /***********************************************
//  * HELPER: Safe CSV parser (handles quotes, ,) *
//  ***********************************************/
// function parseCSV(text) {
//   const rows = [];
//   let i = 0, field = "", row = [];
//   let inQuotes = false;

//   while (i < text.length) {
//     const ch = text[i];

//     if (inQuotes) {
//       if (ch === '"') {
//         if (text[i + 1] === '"') { field += '"'; i += 2; }
//         else { inQuotes = false; i++; }
//       } else { field += ch; i++; }
//     } else {
//       if (ch === '"') { inQuotes = true; i++; }
//       else if (ch === ",") { row.push(field.trim()); field = ""; i++; }
//       else if (ch === "\r") { i++; }
//       else if (ch === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; i++; }
//       else { field += ch; i++; }
//     }
//   }
//   if (field.length > 0 || row.length > 0) { row.push(field.trim()); rows.push(row); }
//   return rows;
// }

// /****************************************
//  * Device helper                        *
//  ****************************************/
// function isMobile() {
//   return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
// }

// /****************************************
//  * Instagram DM link (best for mobile)  *
//  ****************************************/
// function buildIgMeDM(username, message) {
//   return `https://ig.me/m/${encodeURIComponent(username)}?text=${encodeURIComponent(message)}`;
// }

// /****************************************
//  * Status helpers                       *
//  ****************************************/
// function show(el) { el.classList.remove("hidden"); }
// function hide(el) { el.classList.add("hidden"); }
// function hideAllStatuses() {
//   hide(document.getElementById("loading"));
//   hide(document.getElementById("error"));
//   hide(document.getElementById("empty"));
// }

// /****************************************
//  * Create product card DOM node         *
//  ****************************************/
// function createCard(item) {
//   const { name, price, description, imageURL, stockRaw } = item;

//   const stockNormalized = (stockRaw || "").toLowerCase().trim();
//   const stockCount = parseInt(stockRaw, 10);

//   const isOut =
//     stockNormalized === "out of stock" ||
//     stockNormalized === "sold out" ||
//     stockNormalized === "no" ||
//     stockNormalized === "false" ||
//     stockCount === 0;

//   const stockText = isOut
//     ? "Out of Stock"
//     : (isNaN(stockCount)
//         ? "In Stock"
//         : `In Stock: ${stockCount} pcs`);

//   const card = document.createElement("article");
//   card.className = "card";
//   card.innerHTML = `
//     <img class="card__image" src="${imageURL}" alt="${name}" loading="lazy" referrerpolicy="no-referrer" />
//     <div class="card__body">
//       <h2 class="card__title">${name}</h2>
//       <div class="card__price">${price}</div>
//       <p class="card__desc">${description}</p>
//       <div>
//         <span class="badge ${isOut ? "badge--out" : "badge--in"}">${stockText}</span>
//       </div>
//       <div class="card__actions">
//         <button class="btn btn--buy" ${isOut ? "disabled" : ""}>
//           ${isOut ? "Unavailable" : "Buy on Instagram"}
//         </button>
//       </div>
//     </div>
//   `;

//   const button = card.querySelector(".btn--buy");
//   if (!isOut) {
//     button.addEventListener("click", () => {
//       const message = `I'm interested in buying the ${name}`;
//       const dm = buildIgMeDM(INSTAGRAM_USERNAME, message);

//       if (isMobile()) {
//         window.location.href = dm;
//       } else {
//         window.open(dm, "_blank", "noopener");
//       }
//     });
//   }

//   return card;
// }

// /****************************************
//  * Fetch, parse, and render catalog     *
//  ****************************************/
// async function loadCatalog() {
//   const grid = document.getElementById("catalog-container");
//   const loadingEl = document.getElementById("loading");
//   const errorEl = document.getElementById("error");
//   const emptyEl = document.getElementById("empty");

//   hide(errorEl); hide(emptyEl); show(loadingEl);
//   grid.innerHTML = "";

//   try {
//     const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
//     if (!res.ok) throw new Error(`HTTP ${res.status}`);
//     const csvText = await res.text();

//     const rowsRaw = parseCSV(csvText);
//     const rows = rowsRaw.filter(r => Array.isArray(r) && r.some(v => (v || "").trim().length));

//     if (!rows.length) {
//       hide(loadingEl); show(emptyEl);
//       return;
//     }

//     const header = rows[0].map(h => (h || "").toLowerCase().trim());
//     const col = (key) => header.indexOf(key);

//     const iName  = col("name");
//     const iPrice = col("price");
//     const iDesc  = col("description");
//     const iImage = col("imageurl");
//     const iStock = col("stock");

//     if (iName === -1 || iImage === -1) throw new Error("Required columns missing: Name, ImageURL");

//     let count = 0;
//     for (let r = 1; r < rows.length; r++) {
//       const row = rows[r];

//       const name        = (row[iName]  || "").trim();
//       const price       = (row[iPrice] || "").trim();
//       const description = (row[iDesc]  || "").trim();
//       const imageURL    = (row[iImage] || "").trim();
//       const stockRaw    = (row[iStock] || "").trim();

//       if (!name || !imageURL) continue;

//       grid.appendChild(createCard({ name, price, description, imageURL, stockRaw }));
//       count++;
//     }

//     hide(loadingEl);
//     if (count === 0) show(emptyEl);

//   } catch (err) {
//     console.error("Catalog load error:", err);
//     hide(loadingEl); show(errorEl);
//   }
// }

/********************
 * Init on DOM ready
 ********************/
document.addEventListener("DOMContentLoaded", () => {
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
  loadCatalog();
});

// /***********************************************
//  * HELPER: Safe CSV parser (handles quotes, ,) *
//  ***********************************************/
// function parseCSV(text) {
//   const rows = [];
//   let i = 0, field = "", row = [];
//   let inQuotes = false;

//   while (i < text.length) {
//     const ch = text[i];

//     if (inQuotes) {
//       if (ch === '"') {
//         if (text[i + 1] === '"') { field += '"'; i += 2; }
//         else { inQuotes = false; i++; }
//       } else { field += ch; i++; }
//     } else {
//       if (ch === '"') { inQuotes = true; i++; }
//       else if (ch === ",") { row.push(field.trim()); field = ""; i++; }
//       else if (ch === "\r") { i++; }
//       else if (ch === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; i++; }
//       else { field += ch; i++; }
//     }
//   }
//   if (field.length > 0 || row.length > 0) { row.push(field.trim()); rows.push(row); }
//   return rows;
// }

// /****************************************
//  * Device helper                        *
//  ****************************************/
// function isMobile() {
//   return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
// }

// /****************************************
//  * Instagram DM link (best for mobile)  *
//  ****************************************/
// // Using ig.me opens the Instagram DM to your account and (on most mobile devices)
// // pre-fills the message.
// function buildIgMeDM(username, message) {
//   return `https://ig.me/m/${encodeURIComponent(username)}?text=${encodeURIComponent(message)}`;
// }

// /****************************************
//  * Status helpers                       *
//  ****************************************/
// function show(el) { el.classList.remove("hidden"); }
// function hide(el) { el.classList.add("hidden"); }
// function hideAllStatuses() {
//   hide(document.getElementById("loading"));
//   hide(document.getElementById("error"));
//   hide(document.getElementById("empty"));
// }

// /****************************************
//  * Create product card DOM node         *
//  ****************************************/
// function createCard(item) {
//   const { name, price, description, imageURL, stockRaw } = item;

//   const stockNormalized = (stockRaw || "").toLowerCase().trim();
//   const isOut =
//     stockNormalized === "out of stock" ||
//     stockNormalized === "sold out" ||
//     stockNormalized === "0" ||
//     stockNormalized === "no" ||
//     stockNormalized === "false";

//   const card = document.createElement("article");
//   card.className = "card";
//   card.innerHTML = `
//     <img class="card__image" src="${imageURL}" alt="${name}" loading="lazy" referrerpolicy="no-referrer" />
//     <div class="card__body">
//       <h2 class="card__title">${name}</h2>
//       <div class="card__price">${price}</div>
//       <p class="card__desc">${description}</p>
//       <div>
//         <span class="badge ${isOut ? "badge--out" : "badge--in"}">
//           ${isOut ? "Out of Stock" : "In Stock"}
//         </span>
//       </div>
//       <div class="card__actions">
//         <button class="btn btn--buy" ${isOut ? "disabled" : ""}>
//           ${isOut ? "Unavailable" : "Buy on Instagram"}
//         </button>
//       </div>
//     </div>
//   `;

//   const button = card.querySelector(".btn--buy");
//   if (!isOut) {
//     button.addEventListener("click", () => {
//       const message = `I'm interested in buying the ${name}`;

//       // On mobile, navigating current tab gives best chance to jump into the app
//       const dm = buildIgMeDM(INSTAGRAM_USERNAME, message);
//       if (isMobile()) {
//         window.location.href = dm; // opens Instagram app DM with pre-filled text on most phones
//       } else {
//         window.open(dm, "_blank", "noopener"); // desktop web DM fallback
//       }
//     });
//   }

//   return card;
// }

// /****************************************
//  * Fetch, parse, and render catalog     *
//  ****************************************/
// async function loadCatalog() {
//   const grid = document.getElementById("catalog-container");
//   const loadingEl = document.getElementById("loading");
//   const errorEl = document.getElementById("error");
//   const emptyEl = document.getElementById("empty");

//   // initial state
//   hide(errorEl); hide(emptyEl); show(loadingEl);
//   grid.innerHTML = "";

//   try {
//     const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
//     if (!res.ok) throw new Error(`HTTP ${res.status}`);
//     const csvText = await res.text();

//     // Filter out blank rows
//     const rowsRaw = parseCSV(csvText);
//     const rows = rowsRaw.filter(r => Array.isArray(r) && r.some(v => (v || "").trim().length));

//     if (!rows.length) {
//       hide(loadingEl); hide(errorEl); show(emptyEl);
//       return;
//     }

//     // Header row (make it case-insensitive)
//     const header = rows[0].map(h => (h || "").toLowerCase().trim());
//     const col = (key) => header.indexOf(key);

//     const iName  = col("name");
//     const iPrice = col("price");
//     const iDesc  = col("description");
//     const iImage = col("imageurl");
//     const iStock = col("stock");

//     if (iName === -1 || iImage === -1) {
//       throw new Error("Required columns missing: Name, ImageURL");
//     }

//     let count = 0;
//     for (let r = 1; r < rows.length; r++) {
//       const row = rows[r];

//       const name        = (row[iName]  || "").trim();
//       const price       = (row[iPrice] || "").trim();
//       const description = (row[iDesc]  || "").trim();
//       const imageURL    = (row[iImage] || "").trim();
//       const stockRaw    = (row[iStock] || "").trim();

//       if (!name || !imageURL) continue;

//       grid.appendChild(createCard({ name, price, description, imageURL, stockRaw }));
//       count++;
//     }

//     // Final status update
//     hide(loadingEl);
//     if (count === 0) {
//       show(emptyEl);
//     } else {
//       hide(errorEl); hide(emptyEl); // success = hide all status
//     }
//   } catch (err) {
//     console.error("Catalog load error:", err);
//     hide(loadingEl); hide(emptyEl); show(errorEl);
//   }
// }

// /********************
//  * Init on DOM ready
//  ********************/
// document.addEventListener("DOMContentLoaded", () => {
//   const y = document.getElementById("year");
//   if (y) y.textContent = new Date().getFullYear();
//   loadCatalog();
// });
