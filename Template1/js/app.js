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

// ========= Columns (from your CSV) =========
const COL_COUNTRY = "Country";
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
  mapTransform: d3.zoomIdentity
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

// ========= Map utils =========
function featureNameAndContinent(f) {
  const p = f.properties || {};
  const name = p.ADMIN || p.NAME || p.name || "";
  const cont = p.CONTINENT || p.continent || "";
  return { name, cont };
}

function pointInBounds(pt, bounds) {
  if (!bounds) return true;
  const [[x0, y0], [x1, y1]] = bounds;
  const [x, y] = pt;
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function continentProjectedBounds(path, continent) {
  if (!worldGeo || !continent) return null;
  const feats = worldGeo.features.filter(f => featureNameAndContinent(f).cont === continent);
  if (!feats.length) return null;
  const fc = { type: "FeatureCollection", features: feats };
  return path.bounds(fc);
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
      const p = projection([lon, lat]);
      if (!p) return null;
      return p;
    })
    .filter(Boolean);

  if (!pts.length) return false;

  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  const bounds = [[d3.min(xs), d3.min(ys)], [d3.max(xs), d3.max(ys)]];

  // More "zoomed out" than before:
  // - higher padding
  // - slightly smaller zoomFactor (=> less zoom-in)
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
    svg.append("text")
      .attr("x", width / 2).attr("y", height / 2)
      .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
      .attr("fill", "#64748b").attr("font-size", 14)
      .text("Map loading...");
    return;
  }

  // Projection + path
  const projection = d3.geoMercator();
  const path = d3.geoPath(projection);
  projection.fitExtent([[10, 10], [width - 10, height - 40]], worldGeo);

  // Zoom capture layer
  const capture = svg.append("rect")
    .attr("class", "zoom-capture")
    .attr("x", 0).attr("y", 0)
    .attr("width", width).attr("height", height)
    .attr("fill", "transparent")
    .style("pointer-events", "all");

  // Base group (transformed)
  const gBase = svg.append("g").attr("class", "map-base");
  // UI overlay (not transformed)
  const gUI = svg.append("g").attr("class", "map-ui");

  // Zoom behavior
  mapZoom = d3.zoom()
    .scaleExtent([1, 8])
    .on("zoom", (event) => {
      state.mapTransform = event.transform;
      gBase.attr("transform", state.mapTransform);
    });

  capture.call(mapZoom);
  capture.call(mapZoom.transform, state.mapTransform || d3.zoomIdentity);

  // Draw countries
  gBase.append("g")
    .selectAll("path")
    .data(worldGeo.features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#f8fafc")
    .attr("stroke", "#cbd5e1")
    .attr("stroke-width", 0.6);

  // ---- Dots (continent hard-cut using bbox, no clipping) ----
  const showDots =
    !!state.filters.country ||
    !!state.selectedContinent ||
    appEl.classList.contains("mode-map");

  let dots = [];

  if (showDots) {
    // Determine continent bbox (only when continent drilldown is active)
    const bbox =
      state.filters.country
        ? null
        : (state.selectedContinent ? CONTINENT_BBOX.get(state.selectedContinent) : null);

    dots = filtered
      .map(row => {
        const lat = +row[COL_LAT];
        const lon = +row[COL_LON];
        if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;

        // Hide out-of-continent points (for continent drilldown only)
        if (bbox && !inBBox(lon, lat, bbox, 0.5)) return null;

        const p = projection([lon, lat]);
        if (!p) return null;

        return { x: p[0], y: p[1], row };
      })
      .filter(Boolean);

    const gDots = gBase.append("g")
      .attr("class", "map-dots");

    gDots.selectAll("circle")
      .data(dots)
      .join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 3.4)
      .attr("fill", "#ef4444")
      .attr("opacity", 0.85)
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 0.8)
      .style("cursor", "pointer")
      .on("click", (_, d) => {
        console.log("Clicked project row:", d.row);
      });

    // Optional debug (only when Europe is selected)
    if (state.selectedContinent === "Europe") {
      const bad = dots
        .filter(d => {
          const lon = +d.row[COL_LON];
          const lat = +d.row[COL_LAT];
          const inEuropeBox = (lon >= -25 && lon <= 45 && lat >= 34 && lat <= 72);
          return !inEuropeBox;
        })
        .slice(0, 20)
        .map(d => ({
          Country: d.row[COL_COUNTRY],
          lat: d.row[COL_LAT],
          lon: d.row[COL_LON],
          Status: d.row[COL_STATUS]
        }));
      console.log("Europe rows with out-of-Europe coords (sample 20):", bad);
    }
  }

  // ---- Continent bubbles (ONLY when no drilldown) ----
  const inDrilldown = !!state.selectedContinent || !!state.filters.country;
  const showBubbles = !inDrilldown;

  if (showBubbles) {
    const contCounts = d3.rollups(
      filtered,
      v => v.length,
      d => countryToContinent.get(norm(d[COL_COUNTRY])) || "Unknown"
    )
      .map(([continent, value]) => ({ continent, value }))
      .filter(d => d.continent !== "Unknown")
      .sort((a, b) => b.value - a.value);

    const anchors = new Map([
      ["Africa", [20, 5]],
      ["Europe", [15, 52]],
      ["Asia", [95, 40]],
      ["North America", [-100, 45]],
      ["South America", [-60, -15]],
      ["Oceania", [135, -25]]
    ]);

    const gBubbles = gBase.append("g").attr("class", "continent-bubbles");

    const bubble = gBubbles.selectAll("g.bubble")
      .data(contCounts)
      .join("g")
      .attr("class", "bubble")
      .style("cursor", "pointer")
      .style("pointer-events", "all")
      .each(function(d) {
        const ll = anchors.get(d.continent);
        if (!ll) return;
        const [x, y] = projection(ll);
        d.__x = x;
        d.__y = y;
      })
      .attr("transform", d => `translate(${d.__x || 0},${d.__y || 0})`)
      .on("click", (_, d) => {
        state.selectedContinent = d.continent;
        state.filters.country = "";
        elCountry.value = "";
        renderAll();
      });

    bubble.append("circle")
      .attr("r", 16)
      .attr("fill", "#ef4444")
      .attr("opacity", 0.92);

    bubble.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#ffffff")
      .attr("font-size", 11)
      .attr("font-weight", 700)
      .text(d => String(d.value));

    gBubbles.raise();
  }

  // ---- Back button ----
  if (shouldShowBackButton()) {
    const backG = gUI.append("g")
      .attr("class", "map-back")
      .style("cursor", "pointer")
      .on("click", () => {
        state.selectedContinent = "";
        state.filters.country = "";
        elCountry.value = "";

        state.mapTransform = d3.zoomIdentity;
        renderAll();
      });

    backG.append("rect")
      .attr("x", 12)
      .attr("y", 12)
      .attr("rx", 8)
      .attr("width", 88)
      .attr("height", 30)
      .attr("fill", "#ffffff")
      .attr("stroke", "#cbd5e1");

    backG.append("text")
      .attr("x", 56)
      .attr("y", 27)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#334155")
      .attr("font-size", 12)
      .attr("font-weight", 600)
      .text("Back");
  }

  // Hint
  gUI.append("text")
    .attr("x", width / 2)
    .attr("y", height - 12)
    .attr("text-anchor", "middle")
    .attr("fill", "#94a3b8")
    .attr("font-size", 11)
    .text(`Filtered projects: ${filtered.length}`);

  // ---- Auto-zoom logic ----
  if (state.filters.country) {
    const f = countryFeatureByName.get(norm(state.filters.country));
    if (f) zoomToFeature(capture, path, f, width, height);
  } else if (state.selectedContinent) {
    const ok = zoomToContinentPoints(capture, projection, width, height, state.selectedContinent, filtered);
    if (!ok) zoomToContinent(capture, path, width, height, state.selectedContinent);
  } else {
    const t = state.mapTransform || d3.zoomIdentity;
    const moved = Math.abs(t.x) > 0.5 || Math.abs(t.y) > 0.5 || (t.k || 1) > 1.01;
    if (moved) {
      state.mapTransform = d3.zoomIdentity;
      capture.transition().duration(500).call(mapZoom.transform, state.mapTransform);
    }
  }
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
  ["Completed", "#1f77b4"],
  ["Ongoing", "#f1c40f"],
  ["In planning stage", "#2ecc71"],
  ["In piloting stage", "#e74c3c"],
  ["Planned, but cancelled", "#9b59b6"],
  ["Completed and archived or cancelled", "#7f8c8d"],
  ["Envisioned", "#ff7f0e"],
  ["Other", "#95a5a6"],
  ["Unknown", "#bdc3c7"]
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

  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

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
  // Requires topojson-client in index.html:
  // <script src="https://unpkg.com/topojson-client@3"></script>
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
  rawData = csv;
  worldGeo = geo;

  // Build lookups
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

  populateFiltersFromData();
  renderAll();
}).catch(err => {
  console.error("Data load failed:", err);
});
