



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
  // Returns array of rows; each row is array of fields (strings)
  const rows = [];
  let i = 0, field = "", row = [];
  let inQuotes = false;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { // escaped quote ""
          field += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        field += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (char === ",") {
        row.push(field.trim());
        field = "";
        i++;
        continue;
      }
      if (char === "\r") { i++; continue; } // ignore CR
      if (char === "\n") {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = "";
        i++;
        continue;
      }
      field += char;
      i++;
    }
  }
  // last field
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

/****************************************
 * Build Instagram links                *
 ****************************************/
function buildInstagramWebDM(username, message) {
  // Web deep link that opens DM composer (prefilled text on many devices)
  return `https://ig.me/m/${encodeURIComponent(username)}?text=${encodeURIComponent(message)}`;
}

function buildInstagramAppProfile(username) {
  // App deep link to open Instagram app on mobile, goes to profile
  return `instagram://user?username=${encodeURIComponent(username)}`;
}

function isProbablyMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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

      // Prefer app on mobile; fallback to web DM with message prefilled
      const appLink = buildInstagramAppProfile(INSTAGRAM_USERNAME);
      const webLink = buildInstagramWebDM(INSTAGRAM_USERNAME, message);

      if (isProbablyMobile()) {
        // Try opening app first
        const start = Date.now();
        // Use location.assign to avoid popup blockers
        window.location.assign(appLink);

        // If app isn't installed / link fails, fallback to web after a short delay
        setTimeout(() => {
          const elapsed = Date.now() - start;
          if (elapsed < 1200) {
            window.open(webLink, "_blank", "noopener");
          }
        }, 800);
      } else {
        // Desktop: go straight to web DM in a new tab
        window.open(webLink, "_blank", "noopener");
      }
    });
  }

  return card;
}

/****************************************
 * Render contact info in header/footer *
 ****************************************/
function wireStaticBits() {
  // Footer year
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  // Header contact (ensure links match config)
  const header = document.querySelector(".site-header .contact");
  if (header) {
    const links = header.querySelectorAll("a");
    links.forEach((a) => {
      if (a.href.includes("mailto:")) a.href = `mailto:${CONTACT_EMAIL}`;
      if (a.href.includes("tel:")) a.href = `tel:${CONTACT_PHONE.replace(/\s+/g, "")}`;
      if (a.href.includes("instagram.com")) a.href = `https://www.instagram.com/${INSTAGRAM_USERNAME}`;
      if (a.textContent.includes("@")) a.textContent = `@${INSTAGRAM_USERNAME}`;
      if (a.textContent.includes("youremail")) a.textContent = CONTACT_EMAIL;
      if (a.textContent.includes("XXXXXXXXXX")) a.textContent = CONTACT_PHONE;
    });
  }
}

/****************************************
 * Fetch, parse, and render catalog     *
 ****************************************/
async function loadCatalog() {
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const grid = document.getElementById("catalog-container");

  loadingEl.hidden = false;
  errorEl.hidden = true;
  grid.innerHTML = "";

  try {
    const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();

    const rows = parseCSV(csvText);
    if (!rows.length) throw new Error("Empty CSV");

    // Expect header in first row
    const header = rows[0].map(h => h.toLowerCase().trim());
    const col = (key) => header.indexOf(key);

    const iName  = col("name");
    const iPrice = col("price");
    const iDesc  = col("description");
    const iImage = col("imageurl");
    const iStock = col("stock");

    // Build cards from remaining rows
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;

      const name        = (row[iName]  || "").trim();
      const price       = (row[iPrice] || "").trim();
      const description = (row[iDesc]  || "").trim();
      const imageURL    = (row[iImage] || "").trim();
      const stockRaw    = (row[iStock] || "").trim();

      if (!name || !imageURL) continue; // minimal validation

      const card = createCard({ name, price, description, imageURL, stockRaw });
      grid.appendChild(card);
    }
  } catch (err) {
    console.error(err);
    errorEl.hidden = false;
  } finally {
    loadingEl.hidden = true;
  }
}

/********************
 * Init on DOM ready
 ********************/
document.addEventListener("DOMContentLoaded", () => {
  wireStaticBits();
  loadCatalog();
});
