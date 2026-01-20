// ========= Helpers =========
function getBoxSize(el) {
  const r = el.getBoundingClientRect();
  return { width: r.width, height: r.height };
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
    .replace(/[’']/g, "'"); // normalize apostrophes
}

function isYes(v) {
  return norm(v) === "yes" || norm(v) === "y" || norm(v) === "true" || norm(v) === "1";
}

// ========= Columns (from your CSV) =========
const COL_COUNTRY = "Country";
const COL_STATUS  = "Present stage of the intervention";

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
  filters: {
    country: "",
    typeLabel: "",
    status: ""
  },
  // coordinated selections (cross-view interactions)
  selectedType: "",        // bar-click selection (type label)
  selectedStatus: "",      // donut-click selection (status)
  selectedChallenge: "",   // sankey-click selection (challenge label)
  selectedContinent: ""    // map-click selection (continent)
};

// ========= Data =========
let rawData = [];
let worldGeo = null;

// Built from worldGeo properties
let countryToContinent = new Map(); // key: normalized country name => continent string

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
  // Countries
  const countries = Array.from(
    new Set(rawData.map(d => (d[COL_COUNTRY] ?? "").trim()).filter(Boolean))
  ).sort((a,b)=>a.localeCompare(b));

  elCountry.innerHTML = `<option value="">All</option>` +
    countries.map(c => `<option value="${c}">${c}</option>`).join("");

  // Types (labels)
  elType.innerHTML = `<option value="">All</option>` +
    TYPE_COLUMNS.map(t => `<option value="${t.label}">${t.label}</option>`).join("");

  // Statuses
  const statuses = Array.from(
    new Set(rawData.map(d => (d[COL_STATUS] ?? "").trim()).filter(Boolean))
  ).sort((a,b)=>a.localeCompare(b));

  elStatus.innerHTML = `<option value="">All</option>` +
    statuses.map(s => `<option value="${s}">${s}</option>`).join("");
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

  // if user uses dropdown "type", clear bar-click selection
  if (state.filters.typeLabel) state.selectedType = "";

  renderAll();
});

btnClearFilters.addEventListener("click", () => {
  // reset form UI
  filterForm.reset();

  // reset state
  state.filters = { country: "", typeLabel: "", status: "" };
  state.selectedType = "";
  state.selectedStatus = "";
  state.selectedChallenge = "";
  state.selectedContinent = "";

  renderAll();
});

// ========= Render: Map (continent counts + click continent) =========
function renderMap() {
  const { svg, width, height } = setSvgToPanel("#svg-map", "vis-map");
  svg.selectAll("*").remove();

  const filtered = applyAllFilters();

  // fallback if topo/geo not loaded yet
  if (!worldGeo) {
    svg.append("text")
      .attr("x", width/2).attr("y", height/2)
      .attr("text-anchor","middle").attr("dominant-baseline","middle")
      .attr("fill","#64748b").attr("font-size",14)
      .text("Map loading...");
    return;
  }

  // projection
  const projection = d3.geoMercator();
  const path = d3.geoPath(projection);

  projection.fitExtent([[10, 10], [width - 10, height - 40]], worldGeo);

  // draw countries
  svg.append("g")
    .selectAll("path")
    .data(worldGeo.features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#f8fafc")
    .attr("stroke", "#cbd5e1")
    .attr("stroke-width", 0.6);

  // count per continent from filtered rows
  const contCounts = d3.rollups(
    filtered,
    v => v.length,
    d => countryToContinent.get(norm(d[COL_COUNTRY])) || "Unknown"
  ).map(([continent, value]) => ({ continent, value }))
   .filter(d => d.continent !== "Unknown")
   .sort((a,b)=>b.value-a.value);

  // static label anchor points (lon/lat) – just for continent labels (NOT project lat/lon)
  const anchors = new Map([
    ["Africa", [20, 5]],
    ["Europe", [15, 52]],
    ["Asia", [95, 40]],
    ["North America", [-100, 45]],
    ["South America", [-60, -15]],
    ["Oceania", [135, -25]]
  ]);

  const gLabels = svg.append("g");

  contCounts.forEach(d => {
    const ll = anchors.get(d.continent);
    if (!ll) return;
    const [x, y] = projection(ll);

    const isSelected = state.selectedContinent === d.continent;

    gLabels.append("rect")
      .attr("x", x - 55)
      .attr("y", y - 18)
      .attr("rx", 6)
      .attr("width", 110)
      .attr("height", 28)
      .attr("fill", isSelected ? "#e2e8f0" : "#ffffff")
      .attr("stroke", isSelected ? "#64748b" : "#cbd5e1")
      .style("cursor", "pointer")
      .on("click", () => {
        state.selectedContinent = (state.selectedContinent === d.continent) ? "" : d.continent;
        renderAll();
      });

    gLabels.append("text")
      .attr("x", x)
      .attr("y", y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("fill", "#334155")
      .attr("font-size", 12)
      .style("cursor", "pointer")
      .text(`${d.continent} (${d.value})`)
      .on("click", () => {
        state.selectedContinent = (state.selectedContinent === d.continent) ? "" : d.continent;
        renderAll();
      });
  });

  svg.append("text")
    .attr("x", width/2)
    .attr("y", height - 12)
    .attr("text-anchor", "middle")
    .attr("fill", "#94a3b8")
    .attr("font-size", 11)
    .text(`Filtered projects: ${filtered.length}${state.selectedContinent ? ` • Continent: ${state.selectedContinent}` : ""}`);
}

// ========= Render: Bar (UNCHANGED behaviour) =========
function renderBar() {
  const { svg, width, height } = setSvgToPanel("#svg-bar", "vis-bar");
  svg.selectAll("*").remove();

  const filteredBase = applyAllFilters();

  const counts = TYPE_COLUMNS.map(t => ({
    type: t.label,
    value: filteredBase.filter(d => isYes(d[t.col])).length
  })).filter(d => d.value > 0);

  const margin = { top: 20, right: 20, bottom: 70, left: 50 };
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

  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("transform", "rotate(-30)")
    .style("text-anchor", "end")
    .style("font-size", "10px");

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
   .sort((a,b)=>b.value-a.value);

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
      .attr("x", width/2).attr("y", height/2)
      .attr("text-anchor","middle").attr("dominant-baseline","middle")
      .attr("fill","#64748b").attr("font-size",14)
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
  renderSankey();
  renderBar();
  renderDonut();
}

window.addEventListener("resize", renderAll);

// ========= Load data (CSV + TopoJSON) =========
Promise.all([
  d3.csv("data/cleaned_data.csv"),
  d3.json("data/world_countries_110m.topojson")
]).then(([csv, topo]) => {
  rawData = csv;

  // --- Convert TopoJSON -> GeoJSON (auto-detect object name)
  const objName = topo.objects?.ne_110m_admin_0_countries
    ? "ne_110m_admin_0_countries"
    : Object.keys(topo.objects || {})[0];

  if (!objName) throw new Error("TopoJSON has no objects. Check the exported file.");

  worldGeo = topojson.feature(topo, topo.objects[objName]);

  // --- Build country -> continent lookup from properties
  countryToContinent = new Map();
  worldGeo.features.forEach(f => {
    const p = f.properties || {};
    const name = p.ADMIN || p.NAME || p.name || p.NAME_EN || "";
    const cont = p.CONTINENT || p.continent || "";
    if (name && cont) countryToContinent.set(norm(name), cont);
  });

  // --- Common helpful aliases (extend if you spot mismatches)
  const alias = new Map([
    ["russia", "russian federation"],
    ["uk", "united kingdom"],
    ["usa", "united states of america"],
    ["united states", "united states of america"]
  ]);

  for (const [k, v] of alias.entries()) {
    const vv = norm(v);
    if (countryToContinent.has(vv)) {
      countryToContinent.set(norm(k), countryToContinent.get(vv));
    }
  }

  populateFiltersFromData();
  renderAll();
}).catch(err => {
  console.error("Data load failed:", err);
});
