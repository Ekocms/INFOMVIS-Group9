// ========= Helpers =========
function getBoxSize(el) {
  const r = el.getBoundingClientRect();
  // Guard against hidden/collapsed panels causing negative/zero sizes
  return {
    width: Math.max(1, r.width),
    height: Math.max(1, r.height)
  };
}

function setSvgToPanel(svgSelector, panelId) {
  const svg = d3.select(svgSelector);
  const panel = document.getElementById(panelId);
  const { width, height } = getBoxSize(panel);

  svg.attr("viewBox", `0 0 ${width} ${height}`)
     .attr("preserveAspectRatio", "xMidYMid meet");

  return { svg, width, height };
}

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’']/g, "'");
}

function isYes(v) {
  const n = norm(v);
  return n === "yes" || n === "y" || n === "true" || n === "1";
}

function isFiniteNumber(x) {
  return Number.isFinite(x) && !Number.isNaN(x);
}

// Loose continent bounding boxes (lat/lon) to hide overseas territories.
const CONTINENT_BBOX = new Map([
  ["Europe",        { lonMin: -25, lonMax:  45, latMin:  34, latMax:  72 }],
  ["North America", { lonMin: -170,lonMax: -50, latMin:   5, latMax:  83 }],
  ["South America", { lonMin:  -95,lonMax: -30, latMin: -60, latMax:  15 }],
  ["Africa",        { lonMin:  -25,lonMax:  60, latMin: -40, latMax:  38 }],
  ["Asia",          { lonMin:   25,lonMax: 180, latMin:  -5, latMax:  82 }],
  ["Oceania",       { lonMin:  110,lonMax: 180, latMin: -50, latMax:  10 }]
]);

function inBBox(lon, lat, bbox, pad = 0) {
  if (!bbox) return true;
  return (
    lon >= (bbox.lonMin - pad) &&
    lon <= (bbox.lonMax + pad) &&
    lat >= (bbox.latMin - pad) &&
    lat <= (bbox.latMax + pad)
  );
}

// Split a label into 2 lines (best-effort) for axis tick labels
function splitTwoLines(label) {
  const s = String(label ?? "").trim();
  if (!s) return ["", ""];
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [s, ""];

  const total = words.reduce((acc, w) => acc + w.length, 0);
  const target = total / 2;

  let bestIdx = 1;
  let bestDiff = Infinity;
  let leftLen = 0;
  for (let i = 1; i < words.length; i++) {
    leftLen += words[i - 1].length;
    const rightLen = total - leftLen;
    const diff = Math.abs(leftLen - target) + Math.abs(rightLen - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  const line1 = words.slice(0, bestIdx).join(" ");
  const line2 = words.slice(bestIdx).join(" ");
  return [line1, line2];
}

function getLargestPolygonCentroid(feature, path) {
  if (feature.geometry.type === "Polygon") {
    return path.centroid(feature);
  }

  if (feature.geometry.type === "MultiPolygon") {
    let bestPoly = null;
    let maxArea = 0;

    feature.geometry.coordinates.forEach(coords => {
      const poly = { type: "Polygon", coordinates: coords };
      const area = d3.geoArea(poly);

      if (area > maxArea) {
        maxArea = area;
        bestPoly = poly;
      }
    });

    if (bestPoly) return path.centroid(bestPoly);
  }

  return path.centroid(feature);
}

function pickFirst(row, candidates) {
  for (const k of candidates) {
    const v = row?.[k];
    if (v === 0) return v;
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return "";
}

// ========= Columns (from your CSV) =========
const COL_COUNTRY = "Country";
const COL_CITY    = "City";
const COL_STATUS  = "Present stage of the intervention";
const COL_LAT     = "lat";
const COL_LON     = "lon";

// Types
const TYPE_COLUMNS = [
  { label: "Blue infrastructure", col: "Type of nature-based solution/Ecological domain : Blue infrastructure" },
  { label: "Community gardens and allotments", col: "Type of nature-based solution/Ecological domain : Community gardens and allotments" },
  { label: "Green areas for water management", col: "Type of nature-based solution/Ecological domain : Green areas for water management" },
  { label: "Grey infrastructure featuring greens", col: "Type of nature-based solution/Ecological domain : Grey infrastructure featuring greens" },
  { label: "Intentionally unmanaged areas", col: "Type of nature-based solution/Ecological domain : Intentionally unmanaged areas" },
  { label: "Nature in buildings (indoor)", col: "Type of nature-based solution/Ecological domain : Nature in buildings (indoor)" },
  { label: "Nature on buildings (external)", col: "Type of nature-based solution/Ecological domain : Nature on buildings (external)" },
  { label: "Parks and urban forests", col: "Type of nature-based solution/Ecological domain : Parks and urban forests" }
];

// Challenges (subset)
const CHALLENGE_COLUMNS = [
  { label: "Climate action", col: "Sustainability challenge(s) addressed : Climate action for adaptation, resilience and mitigation" },
  { label: "Biodiversity", col: "Sustainability challenge(s) addressed : Green space, habitats and biodiversity" },
  { label: "Water management", col: "Sustainability challenge(s) addressed : Water management" },
  { label: "Health & well-being", col: "Sustainability challenge(s) addressed : Health and well-being" },
  { label: "Urban regeneration", col: "Sustainability challenge(s) addressed : Regeneration, land-use and urban development" },
  { label: "Environmental quality", col: "Sustainability challenge(s) addressed : Environmental quality" }
];

// ========= App State =========
const state = {
  filters: { country: "", typeLabel: "", status: "" },
  selectedType: "",
  selectedStatus: "",
  selectedChallenge: "",
  selectedContinent: "",
  mapTransform: d3.zoomIdentity,

  // popup + compare
  overlay: {
    isOpen: false,
    activeRows: [],
    activeIndex: 0,
    compare: [] // max 3
  }
};

// ========= Data =========
let rawData = [];
let worldGeo = null;                 // GeoJSON FeatureCollection
let countryToContinent = new Map();  // norm(country name) -> continent string
let countryFeatureByName = new Map();// norm(country name) -> feature
let mapZoom = null;

// ========= DOM =========
const appEl = document.getElementById("app");
const btnMapExpand = document.getElementById("btnMapExpand");
const btnClearFilters = document.getElementById("btnClearFilters");
const filterForm = document.getElementById("filterForm");

const elCountry = document.getElementById("f-country");
const elType    = document.getElementById("f-type");
const elStatus  = document.getElementById("f-status");

// Overlay DOM
const factOverlay = document.getElementById("factOverlay");
const factOverlayBackdrop = document.getElementById("factOverlayBackdrop");
const btnCloseOverlay = document.getElementById("btnCloseOverlay");
const btnCompareView = document.getElementById("btnCompareView");
const compareCountEl = document.getElementById("compareCount");

const factTitle = document.getElementById("factTitle");
const factSubtitle = document.getElementById("factSubtitle");
const factPickerRow = document.getElementById("factPickerRow");
const factPicker = document.getElementById("factPicker");
const btnLoadPicked = document.getElementById("btnLoadPicked");

const factCardHost = document.getElementById("factCardHost");
const compareArea = document.getElementById("compareArea");
const compareCards = document.getElementById("compareCards");

// ========= Populate dropdowns from CSV =========
function populateFiltersFromData() {
  const countries = Array.from(new Set(rawData.map(d => (d[COL_COUNTRY] ?? "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  elCountry.innerHTML = `<option value="">All</option>` + countries.map(c => `<option value="${c}">${c}</option>`).join("");

  elType.innerHTML = `<option value="">All</option>` + TYPE_COLUMNS.map(t => `<option value="${t.label}">${t.label}</option>`).join("");

  const statuses = Array.from(new Set(rawData.map(d => (d[COL_STATUS] ?? "").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  elStatus.innerHTML = `<option value="">All</option>` + statuses.map(s => `<option value="${s}">${s}</option>`).join("");
}

// ========= Central filtering (used by ALL views) =========
function applyAllFilters() {
  let filtered = rawData;

  // Dropdown filters
  if (state.filters.country) {
    filtered = filtered.filter(d => (d[COL_COUNTRY] ?? "") === state.filters.country);
  }
  if (state.filters.status) {
    filtered = filtered.filter(d => (d[COL_STATUS] ?? "") === state.filters.status);
  }
  if (state.filters.typeLabel) {
    const t = TYPE_COLUMNS.find(x => x.label === state.filters.typeLabel);
    if (t) filtered = filtered.filter(d => isYes(d[t.col]));
  }

  // Cross-view selections
  if (state.selectedType) {
    const t = TYPE_COLUMNS.find(x => x.label === state.selectedType);
    if (t) filtered = filtered.filter(d => isYes(d[t.col]));
  }
  if (state.selectedStatus) {
    filtered = filtered.filter(d => (d[COL_STATUS] ?? "") === state.selectedStatus);
  }
  if (state.selectedChallenge) {
    const ch = CHALLENGE_COLUMNS.find(x => x.label === state.selectedChallenge);
    if (ch) filtered = filtered.filter(d => isYes(d[ch.col]));
  }
  if (state.selectedContinent) {
    filtered = filtered.filter(d => {
      const c = norm(d[COL_COUNTRY]);
      const cont = countryToContinent.get(c) ?? "";
      return cont === state.selectedContinent;
    });
  }

  return filtered;
}

// ========= Mode Toggle (Dashboard <-> Map Expanded) =========
btnMapExpand.addEventListener("click", () => {
  const isMapMode = appEl.classList.contains("mode-map");
  appEl.classList.toggle("mode-map", !isMapMode);
  appEl.classList.toggle("mode-dashboard", isMapMode);

  btnMapExpand.textContent = !isMapMode ? "Back to dashboard" : "Expand map";
  renderAll();
});

// ========= Filters (dropdowns) =========
filterForm.addEventListener("change", () => {
  const formData = new FormData(filterForm);
  const filters = Object.fromEntries(formData.entries());

  state.filters.country   = filters.country ?? "";
  state.filters.typeLabel = filters.type ?? "";
  state.filters.status    = filters.status ?? "";

  // If user uses dropdown "type", clear bar-click selection
  if (state.filters.typeLabel) state.selectedType = "";

  // Selecting a country should override continent drilldown
  if (state.filters.country) state.selectedContinent = "";

  renderAll();
});

btnClearFilters.addEventListener("click", () => {
  filterForm.reset();

  state.filters = { country: "", typeLabel: "", status: "" };
  state.selectedType = "";
  state.selectedStatus = "";
  state.selectedChallenge = "";
  state.selectedContinent = "";

  // Reset map zoom transform
  state.mapTransform = d3.zoomIdentity;

  renderAll();
});

// ========= Overlay: Fact builder + UI =========
function rowIdentity(row) {
  // Best-effort unique-ish id for basket dedupe
  const name = pickFirst(row, [
    "Name of the NBS intervention",
    "Native title of the NBS intervention",
    "Project name",
    "Project Name",
    "Intervention name",
    "Intervention Name",
    "Name",
    "Title"
  ]);
  const city = (row?.[COL_CITY] ?? "").trim();
  const country = (row?.[COL_COUNTRY] ?? "").trim();
  const status = (row?.[COL_STATUS] ?? "").trim();
  const lat = String(row?.[COL_LAT] ?? "");
  const lon = String(row?.[COL_LON] ?? "");
  return norm(`${name}__${city}__${country}__${status}__${lat}__${lon}`);
}

function buildFact(row) {
  const name = pickFirst(row, [
    "Name of the NBS intervention",
    "Native title of the NBS intervention",
    "Project name",
    "Project Name",
    "Intervention name",
    "Intervention Name",
    "Name",
    "Title"
  ]) || "Unnamed project";

  const city = (row?.[COL_CITY] ?? "").trim();
  const country = (row?.[COL_COUNTRY] ?? "").trim();
  const status = (row?.[COL_STATUS] ?? "").trim() || "Unknown";

  const types = TYPE_COLUMNS.filter(t => isYes(row?.[t.col])).map(t => t.label);
  const challenges = CHALLENGE_COLUMNS.filter(c => isYes(row?.[c.col])).map(c => c.label);

  const cost = pickFirst(row, ["Cost", "Costs", "Estimated cost", "Total cost", "Budget"]);
  const source = pickFirst(row, ["Source", "Sources", "Website", "URL", "Link", "Reference"]);

  return {
    name,
    city,
    country,
    status,
    types,
    challenges,
    cost: String(cost ?? "").trim(),
    source: String(source ?? "").trim()
  };
}


function pillHTML(items) {
  const list = (items ?? []).filter(Boolean);
  if (!list.length) return `<span class="pill">Not specified</span>`;
  return list.map(x => `<span class="pill">${escapeHtml(x)}</span>`).join("");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderFactCard(row) {
  const fact = buildFact(row);
  const locationLine = [fact.city, fact.country].filter(Boolean).join(", ") || fact.country || "—";

  const canAdd = state.overlay.compare.length < 3;
  const id = rowIdentity(row);

  // is already in compare?
  const inCompare = state.overlay.compare.some(r => rowIdentity(r) === id);

  const sourceHTML = /^https?:\/\//i.test(fact.source)
    ? `<a href="${escapeHtml(fact.source)}" target="_blank" rel="noopener noreferrer">Open source</a>`
    : escapeHtml(fact.source || "—");

  factTitle.textContent = fact.name;
  factSubtitle.textContent = locationLine;

  factCardHost.innerHTML = `
    <div class="factCard">
      <div class="factCard__head">
        <div>
          <h3 class="factCard__title">${escapeHtml(fact.name)}</h3>
          <p class="factCard__sub">${escapeHtml(locationLine)}</p>
        </div>
        <div class="factCard__btnRow">
          <button id="btnAddCompare" class="btn btn-sm btn-primary" ${(!canAdd || inCompare) ? "disabled" : ""}>
            ${inCompare ? "In compare" : "Compare (+)"}
          </button>
        </div>
      </div>

      <div class="factCard__body">
        <div class="factBlock">
          <div class="factBlock__label">Status</div>
          <div class="factBlock__value">${escapeHtml(fact.status)}</div>
        </div>

        <div class="factBlock">
          <div class="factBlock__label">NbS types</div>
          <div class="factBlock__value"><div class="pills">${pillHTML(fact.types)}</div></div>
        </div>

        <div class="factBlock">
          <div class="factBlock__label">Challenges addressed</div>
          <div class="factBlock__value"><div class="pills">${pillHTML(fact.challenges)}</div></div>
        </div>

        <div class="factBlock">
          <div class="factBlock__label">Cost</div>
          <div class="factBlock__value">${escapeHtml(fact.cost || "—")}</div>
        </div>

        <div class="factBlock">
          <div class="factBlock__label">Source</div>
          <div class="factBlock__value">${sourceHTML}</div>
        </div>
      </div>
    </div>
  `;

  const btn = document.getElementById("btnAddCompare");
  if (btn) {
    btn.addEventListener("click", () => {
      addToCompare(row);
      renderCompare();
      // re-render main card to update button state
      renderFactCard(row);
    });
  }
}

function openOverlayWithRows(rows) {
  state.overlay.activeRows = rows.slice();
  state.overlay.activeIndex = 0;

  // picker setup if multiple
  if (rows.length > 1) {
    factPickerRow.classList.remove("hidden");
    factPicker.innerHTML = "";
    rows.forEach((r, idx) => {
      const f = buildFact(r);
      const loc = [f.city, f.country].filter(Boolean).join(", ");
      const opt = document.createElement("option");
      opt.value = String(idx);
      opt.textContent = `${f.name}${loc ? " — " + loc : ""}`;
      factPicker.appendChild(opt);
    });
  } else {
    factPickerRow.classList.add("hidden");
    factPicker.innerHTML = "";
  }

  // show overlay
  state.overlay.isOpen = true;
  factOverlay.classList.remove("hidden");
  factOverlay.setAttribute("aria-hidden", "false");

  // render card
  renderFactCard(state.overlay.activeRows[state.overlay.activeIndex]);

  // compare summary
  renderCompare();
}

function closeOverlay() {
  state.overlay.isOpen = false;
  factOverlay.classList.add("hidden");
  factOverlay.setAttribute("aria-hidden", "true");
  compareArea.classList.add("hidden");
}

function addToCompare(row) {
  const id = rowIdentity(row);
  if (state.overlay.compare.some(r => rowIdentity(r) === id)) return;
  if (state.overlay.compare.length >= 3) return;
  state.overlay.compare.push(row);
}

function removeFromCompareById(id) {
  state.overlay.compare = state.overlay.compare.filter(r => rowIdentity(r) !== id);
}

function renderCompare() {
  compareCountEl.textContent = String(state.overlay.compare.length);

  // If compare area is toggled on, render it. Otherwise keep it hidden.
  if (!compareArea.classList.contains("hidden")) {
    compareCards.innerHTML = "";

    state.overlay.compare.forEach(r => {
      const id = rowIdentity(r);
      const f = buildFact(r);
      const loc = [f.city, f.country].filter(Boolean).join(", ") || f.country || "—";

      const sourceHTML = /^https?:\/\//i.test(f.source)
        ? `<a href="${escapeHtml(f.source)}" target="_blank" rel="noopener noreferrer">Open source</a>`
        : escapeHtml(f.source || "—");

      const card = document.createElement("div");
      card.className = "compareCard";
      card.innerHTML = `
        <div class="compareCard__head">
          <div>
            <h3 class="compareCard__title">${escapeHtml(f.name)}</h3>
            <p class="compareCard__sub">${escapeHtml(loc)}</p>
          </div>
          <button class="compareCard__remove" type="button" aria-label="Remove">✕</button>
        </div>
        <div class="compareCard__body">
          <div class="factBlock">
            <div class="factBlock__label">Status</div>
            <div class="factBlock__value">${escapeHtml(f.status)}</div>
          </div>

          <div class="factBlock">
            <div class="factBlock__label">NbS types</div>
            <div class="factBlock__value"><div class="pills">${pillHTML(f.types)}</div></div>
          </div>

          <div class="factBlock">
            <div class="factBlock__label">Challenges</div>
            <div class="factBlock__value"><div class="pills">${pillHTML(f.challenges)}</div></div>
          </div>

          <div class="factBlock">
            <div class="factBlock__label">Cost</div>
            <div class="factBlock__value">${escapeHtml(f.cost || "—")}</div>
          </div>

          <div class="factBlock">
            <div class="factBlock__label">Source</div>
            <div class="factBlock__value">${sourceHTML}</div>
          </div>
        </div>
      `;

      card.querySelector(".compareCard__remove").addEventListener("click", () => {
        removeFromCompareById(id);
        renderCompare();

        // also refresh main card if needed
        const active = state.overlay.activeRows[state.overlay.activeIndex];
        if (active) renderFactCard(active);
      });

      compareCards.appendChild(card);
    });
  }
}

// overlay events
btnCloseOverlay.addEventListener("click", closeOverlay);
factOverlayBackdrop.addEventListener("click", closeOverlay);

btnCompareView.addEventListener("click", () => {
  // toggle compare area visibility
  const isHidden = compareArea.classList.contains("hidden");
  if (isHidden) {
    compareArea.classList.remove("hidden");
  } else {
    compareArea.classList.add("hidden");
  }
  renderCompare();
});

btnLoadPicked.addEventListener("click", () => {
  const idx = parseInt(factPicker.value, 10);
  if (!Number.isFinite(idx)) return;
  if (idx < 0 || idx >= state.overlay.activeRows.length) return;
  state.overlay.activeIndex = idx;
  renderFactCard(state.overlay.activeRows[state.overlay.activeIndex]);
});

// ESC to close overlay
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.overlay.isOpen) closeOverlay();
});

// ========= Map utils =========
function featureNameAndContinent(f) {
  const p = f.properties || {};
  const name = p.ADMIN || p.NAME || p.name || "";
  const cont = p.CONTINENT || p.continent || "";
  return { name, cont };
}

// Zoom helper that matches your projection fit area [[10,10],[width-10,height-40]]
function zoomToBounds(capture, bounds, width, height, padding = 18, zoomFactor = 0.92) {
  const [[x0, y0], [x1, y1]] = bounds;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  const effectiveW = (width - 2 * padding);
  const effectiveH = ((height - 40) - 2 * padding);

  const scale = Math.max(
    1,
    Math.min(8, zoomFactor / Math.max(dx / effectiveW, dy / effectiveH))
  );

  const centerX = width / 2;
  const centerY = (10 + (height - 40)) / 2;

  const translate = [centerX - scale * cx, centerY - scale * cy];
  const t = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);

  state.mapTransform = t;

  if (mapZoom && capture) {
    capture.transition().duration(650).call(mapZoom.transform, t);
  }
}

function zoomToFeature(capture, path, feature, width, height) {
  zoomToBounds(capture, path.bounds(feature), width, height, 18, 0.92);
}

/**
 * Zoom to POINT bounds of projects in the selected continent.
 * Fixes Oceania centering and lets you control how zoomed-out it feels.
 */
function zoomToContinentPoints(capture, projection, width, height, continent, dataRows) {
  const pts = dataRows
    .filter(d => (countryToContinent.get(norm(d[COL_COUNTRY])) || "") === continent)
    .map(d => {
      const lat = +d[COL_LAT];
      const lon = +d[COL_LON];
      if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
      const bbox = CONTINENT_BBOX.get(continent);
      if (bbox && !inBBox(lon, lat, bbox, 0.5)) return null;
      const p = projection([lon, lat]);
      if (!p) return null;
      return p;
    })
    .filter(Boolean);

  if (!pts.length) return false;

  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const bounds = [[d3.min(xs), d3.min(ys)], [d3.max(xs), d3.max(ys)]];

  // More "zoomed out":
  zoomToBounds(capture, bounds, width, height, 70, 0.80);
  return true;
}

function zoomToContinent(capture, path, width, height, continent) {
  const feats = worldGeo.features.filter(f => featureNameAndContinent(f).cont === continent);
  if (!feats.length) return;
  const fc = { type: "FeatureCollection", features: feats };
  zoomToBounds(capture, path.bounds(fc), width, height, 18, 0.92);
}

function shouldShowBackButton() {
  const t = state.mapTransform || d3.zoomIdentity;
  const moved = Math.abs(t.x) > 0.5 || Math.abs(t.y) > 0.5;
  const zoomed = (t.k || 1) > 1.01;
  return !!state.selectedContinent || !!state.filters.country || moved || zoomed;
}

// ========= Render: Map =========
function renderMap() {
  const { svg, width, height } = setSvgToPanel("#svg-map", "vis-map");
  svg.selectAll("*").remove();

  const filtered = applyAllFilters();

  if (!worldGeo) {
    svg.append("text").attr("x", width/2).attr("y", height/2).text("Map loading...")
      .attr("text-anchor","middle").attr("fill","#64748b");
    return;
  }

  const projection = d3.geoMercator();
  const path = d3.geoPath(projection);
  projection.fitExtent([[10, 10], [width - 10, height - 40]], worldGeo);

  // Zoom capture layer
  const capture = svg.append("rect").attr("class", "zoom-capture")
    .attr("width", width).attr("height", height).attr("fill", "transparent").style("pointer-events", "all");

  const gBase = svg.append("g").attr("class", "map-base");
  const gUI = svg.append("g").attr("class", "map-ui");

  // Zoom Behavior (KEY: filter out clicks on dots so click works reliably)
  mapZoom = d3.zoom()
    .scaleExtent([1, 8])
    .filter((event) => {
      const t = event.target;
      // allow wheel always
      if (event.type === "wheel") return true;
      // block zoom start when clicking dots/bubbles
      if (t && t.closest && (t.closest(".project-dot") || t.closest(".semantic-zoom-group"))) {
        return false;
      }
      return true;
    })
    .on("zoom", e => {
      state.mapTransform = e.transform;
      const k = state.mapTransform.k;

      gBase.attr("transform", state.mapTransform);

      gBase.selectAll(".semantic-zoom-group")
        .attr("transform", d => `translate(${d.x}, ${d.y}) scale(${1/k})`);
    });

  svg.call(mapZoom)
     .call(mapZoom.transform, state.mapTransform || d3.zoomIdentity)
     .on("dblclick.zoom", null);

  // Draw Countries
  gBase.append("g").selectAll("path").data(worldGeo.features).join("path")
    .attr("d", path)
    .attr("fill", d => {
      // Highlight Selected Country
      if (state.filters.country) {
        const filterName = norm(state.filters.country);
        const targetFeat = countryFeatureByName.get(filterName);
        if (targetFeat === d) return "#1d4ed8";
      }
      return "#f8fafc";
    })
    .attr("stroke", "#cbd5e1")
    .attr("stroke-width", 0.6)
    .attr("vector-effect", "non-scaling-stroke");

  const isWorld = !state.selectedContinent;
  const isContinent = state.selectedContinent && !state.filters.country;
  const isCountry = !!state.filters.country;

  const currentK = state.mapTransform?.k || 1;

  // --- LEVEL 1 & 2: AGGREGATED BUBBLES FOR CONTINENT AND COUNTRY ---
  if (!isCountry) {
    let bubbleData = [];

    if (isWorld) {
      // Continent Level
      const contCounts = d3.rollups(filtered, v => v.length, d => countryToContinent.get(norm(d[COL_COUNTRY])) || "Unknown")
        .map(([c, v]) => ({ key: c, value: v })).filter(d => d.key !== "Unknown").sort((a,b)=>b.value-a.value);

      const anchors = new Map([
        ["Africa", [20, 5]], ["Europe", [15, 52]], ["Asia", [95, 40]],
        ["North America", [-100, 45]], ["South America", [-60, -15]], ["Oceania", [135, -25]]
      ]);

      bubbleData = contCounts.map(d => {
        const ll = anchors.get(d.key);
        if(!ll) return null;
        const [x, y] = projection(ll);
        return { ...d, x, y, type: 'continent' };
      }).filter(Boolean);

    } else {
      // Country Level
      const countryCounts = d3.rollups(filtered, v => v.length, d => d[COL_COUNTRY])
        .map(([c, v]) => ({ key: c, value: v })).sort((a,b)=>b.value-a.value);

      bubbleData = countryCounts.map(d => {
        const feat = countryFeatureByName.get(norm(d.key));
        if(!feat) return null;

        const c = getLargestPolygonCentroid(feat, path);
        return { ...d, x: c[0], y: c[1], type: 'country' };
      }).filter(Boolean);
    }

    const maxVal = d3.max(bubbleData, d => d.value) || 1;
    const rScale = d3.scaleSqrt().domain([0, maxVal]).range([8, 20]);

    const bubbles = gBase.append("g").selectAll("g")
      .data(bubbleData).join("g")
      .attr("class", "semantic-zoom-group")
      .attr("transform", d => `translate(${d.x}, ${d.y}) scale(${1 / currentK})`)
      .style("cursor", "pointer")
      .on("click", (e, d) => {
        e.stopPropagation();
        if (d.type === 'continent') {
          state.selectedContinent = d.key;
        } else {
          state.filters.country = d.key;
          elCountry.value = d.key;
        }
        renderAll();
      });

    bubbles.append("circle")
      .attr("r", d => rScale(d.value))
      .attr("fill", "#ef4444").attr("stroke", "#fff").attr("stroke-width", 1.5).attr("opacity", 0.9);

    bubbles.append("text")
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("fill", "white").attr("font-weight", "bold").attr("font-size", 11)
      .text(d => d.value);

    // Label below bubble
    bubbles.append("text")
      .attr("y", d => rScale(d.value) + 12)
      .attr("text-anchor", "middle").attr("fill", "#334155").attr("font-size", 11).attr("font-weight", "600")
      .style("text-shadow", "0 1px 2px white, 0 0 3px white")
      .text(d => d.key);
  }

  // --- LEVEL 3: PROJECT DOTS + FACT POPUP ---
  if (isCountry) {
    // group rows by lon/lat so we can open 1 or many in the popup
    const groups = d3.group(filtered, d => `${d[COL_LON]}::${d[COL_LAT]}`);

    const dotData = Array.from(groups, ([key, rows]) => {
      const [lonStr, latStr] = key.split("::");
      const lon = +lonStr, lat = +latStr;
      const p = projection([lon, lat]);
      if (!p) return null;
      return { x: p[0], y: p[1], count: rows.length, rows };
    }).filter(Boolean);

    const dots = gBase.append("g").selectAll("g")
      .data(dotData).join("g")
      .attr("class", "semantic-zoom-group project-dot")
      .attr("transform", d => `translate(${d.x}, ${d.y}) scale(${1 / currentK})`)
      .style("cursor", "pointer")
      .on("mousedown", (e) => e.stopPropagation())
      .on("click", (e, d) => {
        e.stopPropagation();
        openOverlayWithRows(d.rows);
      });

    dots.append("circle")
      .attr("r", d => d.count > 1 ? 7 : 4)
      .attr("fill", "#ef4444")
      .attr("stroke", "white")
      .attr("stroke-width", 1.5);

    dots.filter(d => d.count > 1).append("text")
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("fill", "white").attr("font-size", 10).attr("font-weight", "bold")
      .text(d => d.count);

    dots.append("title").text(d => `${d.count} Project(s) here`);
  }

  // --- AUTO-ZOOM ---
  if (isCountry) {
    const f = countryFeatureByName.get(norm(state.filters.country));
    if (f) zoomToFeature(capture, path, f, width, height);
  } else if (isContinent) {
    const ok = zoomToContinentPoints(capture, projection, width, height, state.selectedContinent, filtered);
    if (!ok) zoomToContinent(capture, path, width, height, state.selectedContinent);
  } else {
    const t = state.mapTransform;
    if (Math.abs(t.x) > 0.5 || Math.abs(t.y) > 0.5 || t.k > 1.01) {
      state.mapTransform = d3.zoomIdentity;
      svg.transition().duration(750).call(mapZoom.transform, d3.zoomIdentity);
    }
  }

  // --- UI: BACK BUTTON ---
  if (shouldShowBackButton()) {
    const backG = gUI.append("g").style("cursor", "pointer")
      .on("click", () => {
        if (state.filters.country) {
          state.filters.country = "";
          elCountry.value = "";
        } else if (state.selectedContinent) {
          state.selectedContinent = "";
        } else {
          state.mapTransform = d3.zoomIdentity;
        }
        renderAll();
      });

    backG.append("rect").attr("x", 12).attr("y", 12).attr("rx", 6).attr("width", 80).attr("height", 30)
      .attr("fill", "white").attr("stroke", "#cbd5e1");
    backG.append("text").attr("x", 52).attr("y", 28).attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("fill", "#334155").attr("font-size", 12).attr("font-weight", "600").text("← Back");
  }

  gUI.append("text").attr("x", width/2).attr("y", height - 12).attr("text-anchor", "middle").attr("fill", "#94a3b8").attr("font-size", 11)
    .text(`Filtered projects: ${filtered.length}`);
}

// ========= Render: Bar =========
function renderBar() {
  const { svg, width, height } = setSvgToPanel("#svg-bar", "vis-bar");
  svg.selectAll("*").remove();

  const filteredBase = applyAllFilters();

  const counts = TYPE_COLUMNS.map(t => ({
    type: t.label,
    value: filteredBase.filter(d => isYes(d[t.col])).length
  })).filter(d => d.value > 0);

  const margin = { top: 20, right: 20, bottom: 88, left: 50 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const x = d3.scaleBand()
    .domain(counts.map(d => d.type))
    .range([0, innerW])
    .padding(0.2);

  const y = d3.scaleLinear()
    .domain([0, d3.max(counts, d => d.value) || 1])
    .nice()
    .range([innerH, 0]);

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  g.selectAll("rect")
    .data(counts)
    .join("rect")
    .attr("x", d => x(d.type))
    .attr("y", d => y(d.value))
    .attr("width", x.bandwidth())
    .attr("height", d => innerH - y(d.value))
    .attr("fill", d => state.selectedType === d.type ? "#64748b" : "#cbd5e1")
    .style("cursor", "pointer")
    .on("click", (_, d) => {
      state.selectedType = (state.selectedType === d.type) ? "" : d.type;
      state.filters.typeLabel = "";
      elType.value = "";
      renderAll();
    });

  const xAxis = g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x));

  xAxis.selectAll("text")
    .style("font-size", "10px")
    .attr("text-anchor", "end")
    .attr("transform", "rotate(-30)")
    .each(function(d) {
      const [l1, l2] = splitTwoLines(d);
      const sel = d3.select(this);
      sel.text(null);

      sel.append("tspan").attr("x", 0).attr("dy", "0em").text(l1);
      if (l2) sel.append("tspan").attr("x", 0).attr("dy", "1.1em").text(l2);
    })
    .attr("dx", "-0.3em")
    .attr("dy", "0.35em");

  g.append("g")
    .call(d3.axisLeft(y).ticks(4))
    .selectAll("text")
    .style("font-size", "10px");
}

// ========= Donut: static colors + legend + click status =========
const STATUS_COLOR = new Map([
  // Completed → strong green
  ["Completed", "#1b9e3c"],
  // Ongoing → orange
  ["Ongoing", "#f59e0b"],
  // Planning → blue
  ["In planning stage", "#195ef4"],
  // Piloting → purple (clearly distinct from planning & ongoing)
  ["In piloting stage", "#703fc5"],
  // Cancelled → red
  ["Planned, but cancelled", "#dc2626"],
  // Archived / cancelled → dark maroon (still “red family” but distinct)
  ["Completed and archived or cancelled", "#7f1d1d"],
  // Envisioned → teal (future-oriented, distinct from blue)
  ["Envisioned", "#db2777"], // magenta
  // Neutral categories
  ["Unknown", "#d1d3d6"],   // light grey
  ["Other", "#686f7f"]      // darker grey
]);



function colorForStatus(s) {
  return STATUS_COLOR.get(s) || "#94a3b8";
}

function renderDonut() {
  const { svg, width, height } = setSvgToPanel("#svg-donut", "vis-donut");
  svg.selectAll("*").remove();

  const filtered = applyAllFilters();

  const grouped = d3.rollups(
    filtered,
    v => v.length,
    d => (d[COL_STATUS] ?? "Unknown").trim() || "Unknown"
  ).map(([status, value]) => ({ status, value }))
   .sort((a, b) => b.value - a.value);

  const r = Math.min(width, height) / 2 - 25;

  const cx = Math.max(140, (width / 2) - 70);  // shift donut left
  const cy = height / 2;

  const g = svg.append("g")
    .attr("transform", `translate(${cx},${cy})`);


  const pie = d3.pie().value(d => d.value);
  const arc = d3.arc().innerRadius(r * 0.55).outerRadius(r);

  g.selectAll("path")
    .data(pie(grouped))
    .join("path")
    .attr("d", arc)
    .attr("fill", d => colorForStatus(d.data.status))
    .attr("stroke", "#fff")
    .style("cursor", "pointer")
    .attr("opacity", d => {
      if (!state.selectedStatus) return 1;
      return (d.data.status === state.selectedStatus) ? 1 : 0.25;
    })
    .on("click", (_, d) => {
      state.selectedStatus = (state.selectedStatus === d.data.status) ? "" : d.data.status;
      state.filters.status = state.selectedStatus;
      elStatus.value = state.filters.status;
      renderAll();
    });

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "12px")
    .style("fill", "#334155")
    .text(state.selectedStatus || "All projects");

  const legendX = width - 210;
  const legendY = 20;

  const leg = svg.append("g").attr("transform", `translate(${legendX},${legendY})`);

  const rows = leg.selectAll("g")
    .data(grouped)
    .join("g")
    .attr("transform", (_, i) => `translate(0, ${i * 18})`)
    .style("cursor", "pointer")
    .on("click", (_, d) => {
      state.selectedStatus = (state.selectedStatus === d.status) ? "" : d.status;
      state.filters.status = state.selectedStatus;
      elStatus.value = state.filters.status;
      renderAll();
    });

  rows.append("rect")
    .attr("width", 10)
    .attr("height", 10)
    .attr("rx", 2)
    .attr("y", -8)
    .attr("fill", d => colorForStatus(d.status))
    .attr("opacity", d => (!state.selectedStatus || d.status === state.selectedStatus) ? 1 : 0.25);

  rows.append("text")
    .attr("x", 16)
    .attr("y", 0)
    .attr("dominant-baseline", "middle")
    .attr("fill", "#334155")
    .style("font-size", "11px")
    .attr("opacity", d => (!state.selectedStatus || d.status === state.selectedStatus) ? 1 : 0.35)
    .text(d => `${d.status} (${d.value})`);
}

// ========= Sankey: colored by challenge + click challenge node =========
function renderSankey() {
  const { svg, width, height } = setSvgToPanel("#svg-sankey", "vis-sankey");
  svg.selectAll("*").remove();

  const filtered = applyAllFilters();

  const flows = [];
  for (const ch of CHALLENGE_COLUMNS) {
    for (const t of TYPE_COLUMNS) {
      const v = filtered.filter(d => isYes(d[ch.col]) && isYes(d[t.col])).length;
      if (v > 0) flows.push({ source: ch.label, target: t.label, value: v });
    }
  }

  if (!flows.length) {
    svg.append("text")
      .attr("x", width / 2).attr("y", height / 2)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("fill", "#64748b").attr("font-size", 14)
      .text("No data for current filters");
    return;
  }

  const challengeLabels = CHALLENGE_COLUMNS.map(d => d.label);
  const typeLabels = TYPE_COLUMNS.map(d => d.label);

  const nodes = [
    ...challengeLabels.map(name => ({ name, group: "challenge" })),
    ...typeLabels.map(name => ({ name, group: "type" }))
  ];

  const nodeIndex = new Map(nodes.map((d, i) => [d.name, i]));
  const links = flows.map(f => ({
    source: nodeIndex.get(f.source),
    target: nodeIndex.get(f.target),
    value: f.value,
    ch: f.source
  }));

  const sankeyGen = d3.sankey()
    .nodeWidth(12)
    .nodePadding(12)
    .extent([[10, 10], [width - 10, height - 26]]);

  const graph = sankeyGen({
    nodes: nodes.map(d => ({ ...d })),
    links: links.map(d => ({ ...d }))
  });

  const chColor = d3.scaleOrdinal()
    .domain(challengeLabels)
    .range(d3.schemeSet2);

  svg.append("g")
    .attr("fill", "none")
    .selectAll("path")
    .data(graph.links)
    .join("path")
    .attr("d", d3.sankeyLinkHorizontal())
    .attr("stroke", d => chColor(d.ch))
    .attr("stroke-opacity", d => {
      if (!state.selectedChallenge) return 0.35;
      return (d.ch === state.selectedChallenge) ? 0.65 : 0.08;
    })
    .attr("stroke-width", d => Math.max(1, d.width))
    .style("mix-blend-mode", "multiply");

  const gNode = svg.append("g")
    .selectAll("g")
    .data(graph.nodes)
    .join("g");

  gNode.append("rect")
    .attr("x", d => d.x0)
    .attr("y", d => d.y0)
    .attr("height", d => d.y1 - d.y0)
    .attr("width", d => d.x1 - d.x0)
    .attr("fill", d => d.group === "challenge" ? chColor(d.name) : "#dbeafe")
    .attr("stroke", "#94a3b8")
    .style("cursor", d => d.group === "challenge" ? "pointer" : "default")
    .attr("opacity", d => {
      if (d.group !== "challenge") return 1;
      if (!state.selectedChallenge) return 1;
      return (d.name === state.selectedChallenge) ? 1 : 0.35;
    })
    .on("click", (_, d) => {
      if (d.group !== "challenge") return;
      state.selectedChallenge = (state.selectedChallenge === d.name) ? "" : d.name;
      renderAll();
    });

  gNode.append("text")
    .attr("x", d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
    .attr("y", d => (d.y0 + d.y1) / 2)
    .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
    .attr("dominant-baseline", "middle")
    .attr("font-size", 11)
    .attr("fill", "#334155")
    .text(d => d.name);

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height - 8)
    .attr("text-anchor", "middle")
    .attr("fill", "#94a3b8")
    .attr("font-size", 11)
    .text("Tip: click a Challenge (left) to filter all views");
}

// ========= Render All =========
function renderAll() {
  renderMap();

  // In expanded map mode, other panels may be collapsed -> avoid negative height warnings
  if (appEl.classList.contains("mode-map")) return;

  renderSankey();
  renderBar();
  renderDonut();
}

window.addEventListener("resize", renderAll);

// ========= Load data (CSV + TopoJSON) =========
function loadWorld() {
  return d3.json("data/world_countries_110m.topojson").then(topo => {
    if (!topo || typeof topojson === "undefined") {
      throw new Error("TopoJSON loaded but topojson-client not available (check script include)");
    }
    const objName = Object.keys(topo.objects)[0];
    return topojson.feature(topo, topo.objects[objName]);
  });
}

Promise.all([
  d3.csv("data/cleaned_data.csv"),
  loadWorld()
]).then(([csv, geo]) => {

  const locationLookUp = new Map();

  rawData = csv.map(d => {
    const city = norm(d[COL_CITY]);
    const country = norm(d[COL_COUNTRY]);
    const lat = parseFloat(d[COL_LAT]);
    const lon = parseFloat(d[COL_LON]);

    const key = `${city}::${country}`;

    // Reuse stored coordinates if available
    if (locationLookUp.has(key)) {
      const stored = locationLookUp.get(key);
      d[COL_LAT] = stored.lat;
      d[COL_LON] = stored.lon;
    }
    else if (isFiniteNumber(lat) && isFiniteNumber(lon)) {
      // First time seeing this city -> store as canonical
      locationLookUp.set(key, { lat, lon });
    }

    return d;
  });

  worldGeo = geo;

  countryToContinent = new Map();
  countryFeatureByName = new Map();

  worldGeo.features.forEach(f => {
    const { name, cont } = featureNameAndContinent(f);
    if (name) countryFeatureByName.set(norm(name), f);
    if (name && cont) countryToContinent.set(norm(name), cont);
  });

  // Helpful aliases (extend if needed)
  const alias = new Map([
    ["russia", "russian federation"],
    ["uk", "united kingdom"],
    ["usa", "united states of america"],
    ["united states", "united states of america"]
  ]);
  for (const [k, v] of alias.entries()) {
    const cont = countryToContinent.get(norm(v));
    const feat = countryFeatureByName.get(norm(v));
    if (cont) countryToContinent.set(norm(k), cont);
    if (feat) countryFeatureByName.set(norm(k), feat);
  }

  // Fix points outside polygons by snapping to centroid (teammate logic kept)
  rawData.forEach(d => {
    const lon = +d[COL_LON];
    const lat = +d[COL_LAT];
    const country = d[COL_COUNTRY];

    if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return;

    const feat = countryFeatureByName.get(norm(country));
    if (!feat) return;

    if (!d3.geoContains(feat, [lon, lat])) {
      const centroid = d3.geoCentroid(feat);
      d[COL_LON] = centroid[0];
      d[COL_LAT] = centroid[1];
    }
  });

  populateFiltersFromData();
  renderAll();

}).catch(err => {
  console.error("Data load failed:", err);
});
