/* app.js : draws the dashboard from whatever data.js provides.
   You should not need to edit this when switching to real data. */

// ---- Settings you may want to tune ----
const SETTINGS = {
  watchRatio: 1.10,      // current/predicted above this = "Watch"
  abnormalRatio: 1.25,   // above this = "Abnormal"
  chartAbnormalRatio: 1.12,
  lowOccupancy: 0.25,    // occupancy/capacity below this counts as "almost empty"
  targetMinPct: 15,
  targetMaxPct: 20,
  refreshMs: 0           // e.g. 60000 to refresh every minute; 0 = off
};

let DATA = null;
let filter = "All";
const $ = id => document.getElementById(id);
const sum = a => a.reduce((x, y) => x + y, 0);
const LABEL = { ok: "Normal", w: "Watch", b: "Abnormal" };

const status = r => {
  if (r.flagged) return "b";   // anomaly decided by the trained model
  const ratio = r.currentKw / r.predictedKw;
  return ratio > SETTINGS.abnormalRatio ? "b" : ratio > SETTINGS.watchRatio ? "w" : "ok";
};
const selected = () => DATA.rooms.filter(r => filter === "All" || r.type === filter);

function series(rs) {
  const now = DATA.nowHour;
  const pred = Array.from({ length: 24 }, (_, h) => sum(rs.map(r => r.predictedHourly[h] || 0)));
  const actual = Array.from({ length: now + 1 }, (_, h) => sum(rs.map(r => r.actualHourly[h] || 0)));
  return { pred, actual };
}

function renderTabs() {
  const types = ["All", ...new Set(DATA.rooms.map(r => r.type))];
  $("tabs").innerHTML = types.map(f => `<button aria-pressed="${f === filter}" data-f="${f}">${f}</button>`).join("");
  $("tabs").querySelectorAll("button").forEach(b => b.onclick = () => { filter = b.dataset.f; render(); });
}

function renderKpis(rs) {
  const { pred, actual } = series(rs);
  const now = DATA.nowHour;
  const used = sum(actual), expected = sum(pred.slice(0, now + 1));
  const diff = expected ? (used - expected) / expected * 100 : 0;
  const abnormal = rs.filter(r => status(r) === "b").length;
  const red = DATA.reductionPct;   // null until you have a pre-deployment baseline
  const redText = red == null ? "—" : red + "%";
  const redWidth = red == null ? 0 : Math.min(100, red / SETTINGS.targetMaxPct * 100);
  $("kpis").innerHTML =
    `<div class="card k"><small>Current load</small><b>${sum(rs.map(r => r.currentKw)).toFixed(1)} kW</b><div class="d">${rs.length} rooms reporting</div></div>
     <div class="card k"><small>Used today vs predicted</small><b>${used.toFixed(0)} kWh</b><div class="d ${diff > 3 ? "bad" : "good"}">${diff > 0 ? "+" : ""}${diff.toFixed(1)}% vs ${expected.toFixed(0)} kWh predicted</div></div>
     <div class="card k"><small>Abnormal rooms</small><b>${abnormal}</b><div class="d ${abnormal ? "bad" : "good"}">${abnormal ? "Needs a check" : "All within range"}</div></div>
     <div class="card k"><small>Reduction since deployment</small><b>${redText}</b><div class="bar"><i style="width:${redWidth}%"></i></div><div class="d" style="color:var(--mute)">Target: ${SETTINGS.targetMinPct}–${SETTINGS.targetMaxPct}% in six months</div></div>`;
}

function renderChart(rs) {
  const { pred, actual } = series(rs);
  const now = DATA.nowHour;
  const W = 640, H = 260, L = 36, B = 28, T = 10, R = 8;
  const max = Math.ceil(Math.max(...pred, ...actual) * 1.1 / 5) * 5 || 5;
  const x = i => L + i * (W - L - R) / 23, y = v => T + (H - T - B) * (1 - v / max);
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Actual versus predicted load by hour">`;
  for (let k = 0; k <= 4; k++) {
    const v = max * k / 4;
    s += `<line class="g" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${Math.round(v)}</text>`;
  }
  for (let i = 0; i < 24; i += 3) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${String(i).padStart(2, "0")}:00</text>`;
  let start = null;
  actual.forEach((v, i) => {
    const bad = v > pred[i] * SETTINGS.chartAbnormalRatio;
    if (bad && start === null) start = i;
    if ((!bad || i === actual.length - 1) && start !== null) {
      const end = bad ? i : i - 1;
      s += `<rect x="${x(start) - 6}" y="${T}" width="${x(end) - x(start) + 12}" height="${H - T - B}" fill="var(--bad)" opacity=".13" rx="4"/>`;
      start = null;
    }
  });
  const pts = arr => arr.map((v, i) => x(i) + "," + y(v)).join(" ");
  s += `<polyline fill="none" stroke="var(--pred)" stroke-width="2" stroke-dasharray="5 4" points="${pts(pred)}"/>`;
  s += `<polyline fill="none" stroke="var(--acc)" stroke-width="3" stroke-linejoin="round" points="${pts(actual)}"/>`;
  s += `<circle cx="${x(now)}" cy="${y(actual[now])}" r="5" fill="var(--acc)"/><text x="${x(now)}" y="${y(actual[now]) - 10}" text-anchor="middle">Now</text></svg>`;
  $("chart").innerHTML = s;
}

function renderLists(rs) {
  const flagged = rs.filter(r => status(r) !== "ok").sort((a, b) => b.currentKw / b.predictedKw - a.currentKw / a.predictedKw);
  $("alerts").innerHTML = flagged.length
    ? flagged.map(r => `<li class="${status(r) === "b" ? "r" : "w"}"><b>${r.name}</b><span>${r.currentKw} kW now, ${Math.round((r.currentKw / r.predictedKw - 1) * 100)}% above the predicted ${r.predictedKw} kW</span></li>`).join("")
    : `<li class="w"><b>No alerts</b><span>Every room is within its predicted range.</span></li>`;
  $("recs").innerHTML = flagged.length
    ? flagged.map(r => {
        const low = r.occupancy / r.capacity < SETTINGS.lowOccupancy;
        return `<li class="${low ? "r" : "w"}"><b>${r.name}</b><span>${low ? "Almost empty but drawing high power. Check the air-conditioning and lights are switched off." : "Usage is above normal while occupied. Review the air-conditioner temperature setting."}</span></li>`;
      }).join("")
    : `<li class="w"><b>Nothing to act on</b><span>Recommendations appear when a room goes above its prediction.</span></li>`;
}

function renderTable(rs) {
  $("rows").innerHTML = rs.map(r => {
    const s = status(r);
    return `<tr><td>${r.name}</td><td>${r.type}</td><td>${r.occupancy} / ${r.capacity}</td><td>${r.currentKw.toFixed(1)}</td><td>${r.predictedKw.toFixed(1)}</td><td><span class="pill s-${s}">${LABEL[s]}</span></td></tr>`;
  }).join("");
}

function render() {
  const rs = selected();
  $("source").textContent = "Campus energy monitoring, prediction and alerts" + (DATA.isSample ? " · sample data" : DATA.asOf ? " · data as of " + DATA.asOf : "");
  renderTabs(); renderKpis(rs); renderChart(rs); renderLists(rs); renderTable(rs);
}

async function refresh() {
  try {
    DATA = await loadDashboardData();
    render();
  } catch (err) {
    $("source").textContent = "Could not load data: " + err.message;
    console.error(err);
  }
}

refresh();
if (SETTINGS.refreshMs > 0) setInterval(refresh, SETTINGS.refreshMs);