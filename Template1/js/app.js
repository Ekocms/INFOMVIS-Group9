// ========= Helpers =========
function getBoxSize(el) {
  const r = el.getBoundingClientRect();
  return { width: r.width, height: r.height };
}

function setSvgToPanel(svgSelector, panelId) {
  const svg = d3.select(svgSelector);
  const panel = document.getElementById(panelId);
  const { width, height } = getBoxSize(panel);

  // set viewBox so D3 drawings scale properly
  svg.attr("viewBox", `0 0 ${width} ${height}`)
     .attr("preserveAspectRatio", "xMidYMid meet");

  return { svg, width, height };
}

// ========= App State =========
const state = {
  filters: {
    country: "",
    type: "",
    status: ""
  },
  selectedType: "" // clicked bar type (for coordinated views)
};

// ========= DOM =========
const appEl = document.getElementById("app");
const btnMapExpand = document.getElementById("btnMapExpand");
const btnClearFilters = document.getElementById("btnClearFilters");
const filterForm = document.getElementById("filterForm");

// ========= Mode Toggle (Dashboard <-> Map Expanded) =========
btnMapExpand.addEventListener("click", () => {
  const isMapMode = appEl.classList.contains("mode-map");
  appEl.classList.toggle("mode-map", !isMapMode);
  appEl.classList.toggle("mode-dashboard", isMapMode);

  btnMapExpand.textContent = !isMapMode ? "Back to dashboard" : "Expand map";

  // re-render sizing when layout changes
  renderAll();
});

// ========= Filters =========
filterForm.addEventListener("change", () => {
  const formData = new FormData(filterForm);
  const filters = Object.fromEntries(formData.entries());

  state.filters.country = filters.country ?? "";
  state.filters.type = filters.type ?? "";
  state.filters.status = filters.status ?? "";

  // If user uses the Type dropdown filter, clear bar-click selection
  if (state.filters.type) {
    state.selectedType = "";
  }

  renderAll();
});

btnClearFilters.addEventListener("click", () => {
  filterForm.reset();
  state.filters = { country: "", type: "", status: "" };
  state.selectedType = "";
  renderAll();
});

// ========= Render Stubs (placeholders for now) =========
function renderMap() {
  const { svg, width, height } = setSvgToPanel("#svg-map", "vis-map");
  svg.selectAll("*").remove();

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height / 2)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("fill", "#64748b")
    .attr("font-size", 14)
    .text("Map (continent counts)");
}

function renderSankey() {
  const { svg, width, height } = setSvgToPanel("#svg-sankey", "vis-sankey");
  svg.selectAll("*").remove();

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height / 2)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("fill", "#64748b")
    .attr("font-size", 14)
    .text("Sankey");
}

function renderBar() {
  const { svg, width, height } = setSvgToPanel("#svg-bar", "vis-bar");
  svg.selectAll("*").remove();

  // Placeholder "bars" that you can click NOW to test coordination
  const types = ["Type 1", "Type 2", "Type 3", "Type 4"];
  const values = [30, 18, 25, 12];

  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const x = d3.scaleBand()
    .domain(types)
    .range([0, innerW])
    .padding(0.2);

  const y = d3.scaleLinear()
    .domain([0, d3.max(values)])
    .nice()
    .range([innerH, 0]);

  const g = svg.append("g")
    .attr("transform", `translate(${padding.left},${padding.top})`);

  // Bars
  g.selectAll("rect")
    .data(types.map((t, i) => ({ type: t, value: values[i] })))
    .join("rect")
    .attr("x", d => x(d.type))
    .attr("y", d => y(d.value))
    .attr("width", x.bandwidth())
    .attr("height", d => innerH - y(d.value))
    .attr("fill", d => (state.selectedType === d.type ? "#94a3b8" : "#cbd5e1"))
    .style("cursor", "pointer")
    .on("click", (event, d) => {
      // Toggle selection
      state.selectedType = (state.selectedType === d.type) ? "" : d.type;

      // Clear the dropdown type filter if bar selection is used
      if (state.selectedType) {
        state.filters.type = "";
        document.getElementById("f-type").value = "";
      }

      renderAll();
    });

  // X axis (minimal)
  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x))
    .selectAll("text")
    .attr("font-size", 10);

  // Y axis (minimal)
  g.append("g")
    .call(d3.axisLeft(y).ticks(4))
    .selectAll("text")
    .attr("font-size", 10);
}

function renderDonut() {
  const { svg, width, height } = setSvgToPanel("#svg-donut", "vis-donut");
  svg.selectAll("*").remove();

  // Placeholder that reacts to selectedType to prove coordination works
  const label = state.selectedType
    ? `Donut (filtered to ${state.selectedType})`
    : "Donut chart";

  svg.append("text")
    .attr("x", width / 2)
    .attr("y", height / 2)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "middle")
    .attr("fill", "#64748b")
    .attr("font-size", 14)
    .text(label);
}

// ========= Render All =========
function renderAll() {
  renderMap();
  renderSankey();
  renderBar();
  renderDonut();

  // Debug so you can see coordination state in console
  console.log("STATE:", JSON.parse(JSON.stringify(state)));
}

// Re-render on resize (keeps charts fitting panels)
window.addEventListener("resize", renderAll);

// Initial render
renderAll();
