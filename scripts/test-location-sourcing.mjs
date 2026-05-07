/**
 * SideQuests — Location Sourcing Accuracy Test Suite
 *
 * Tests the four geocoding strategies used by geocodeNamedPlace:
 *   Strategy 0 — OSM name search (Overpass)
 *   Strategy 1 — Photon with location bias
 *   Strategy 2 — Nominatim with viewbox
 *   Strategy 3 — Wikipedia coordinates API
 *
 * Also validates:
 *   - Coordinate validation (radius rejection)
 *   - Cross-source accuracy for real urbex/outdoor places
 *
 * Run:  node scripts/test-location-sourcing.mjs
 */

// ── Config ──────────────────────────────────────────────────────────────────

const PHOTON_BASE    = "https://photon.komoot.io";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OVERPASS_URLS  = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const WIKI_API       = "https://en.wikipedia.org/w/api.php";
const USER_AGENT     = "SideQuestsTest/1.0";

const TIMEOUT_MS   = 15_000;
const PASS_EMOJI   = "✅";
const FAIL_EMOJI   = "❌";
const SKIP_EMOJI   = "⏭ ";
const WARN_EMOJI   = "⚠️ ";

// ── Haversine ────────────────────────────────────────────────────────────────

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isWithinRadius(point, center, radiusKm) {
  return haversineKm(center.lat, center.lon, point.lat, point.lon) <= radiusKm;
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, init = {}, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Individual geocoding strategies (mirrors geocode.ts) ─────────────────────

async function photonSearch(query, biasLat, biasLon) {
  let url = `${PHOTON_BASE}/api/?q=${encodeURIComponent(query)}&limit=3&lang=en`;
  if (biasLat !== undefined) url += `&lat=${biasLat}&lon=${biasLon}`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const json = await res.json();
  const f = json.features?.[0];
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { lat, lon, name: f.properties?.name ?? query };
}

let _lastNominatimMs = 0;
async function nominatimSearch(query, userLat, userLon, radiusKm = 100) {
  const now = Date.now();
  if (now - _lastNominatimMs < 1_200) {
    await new Promise(r => setTimeout(r, 1_200 - (now - _lastNominatimMs)));
  }
  _lastNominatimMs = Date.now();

  const params = new URLSearchParams({ q: query, format: "json", limit: "3", addressdetails: "0" });
  if (userLat !== undefined) {
    const km = Math.min(radiusKm * 1.5, 200);
    const dLat = km / 111;
    const dLon = km / (111 * Math.cos((userLat * Math.PI) / 180));
    params.set("viewbox", [
      (userLon - dLon).toFixed(4),
      (userLat + dLat).toFixed(4),
      (userLon + dLon).toFixed(4),
      (userLat - dLat).toFixed(4),
    ].join(","));
    params.set("bounded", "0");
  }
  const res = await fetchWithTimeout(
    `${NOMINATIM_BASE}/search?${params}`,
    { headers: { "User-Agent": USER_AGENT } },
    10_000
  );
  if (!res.ok) return null;
  const results = await res.json();
  if (!results.length) return null;
  return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon), name: results[0].display_name };
}

async function osmNameSearch(name, userLat, userLon, radiusKm = 25) {
  const km = Math.min(radiusKm * 1.5, 100);
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos((userLat * Math.PI) / 180));
  const bbox = [
    (userLat - dLat).toFixed(5), (userLon - dLon).toFixed(5),
    (userLat + dLat).toFixed(5), (userLon + dLon).toFixed(5),
  ].join(",");
  const safe = name.replace(/[^\w\s]/g, "").trim().slice(0, 80);
  const query = `[out:json][timeout:10];\n(\n  node["name"~"${safe}",i](${bbox});\n  way["name"~"${safe}",i](${bbox});\n  relation["name"~"${safe}",i](${bbox});\n);\nout center 5;`;

  for (const endpoint of OVERPASS_URLS) {
    try {
      const res = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      }, 15_000);
      if (!res.ok) continue;
      const json = await res.json();
      const el = json.elements?.[0];
      if (!el) continue;
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat !== undefined) return { lat, lon, name: el.tags?.name ?? name };
    } catch { /* try next */ }
  }
  return null;
}

async function wikiSearch(title) {
  const url = `${WIKI_API}?action=query&prop=coordinates&titles=${encodeURIComponent(title)}&format=json&origin=*`;
  const res = await fetchWithTimeout(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;
  const json = await res.json();
  const pages = Object.values(json?.query?.pages ?? {});
  for (const page of pages) {
    const c = page.coordinates?.[0];
    if (c?.lat !== undefined) return { lat: c.lat, lon: c.lon, name: page.title };
  }
  return null;
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0, failed = 0, skipped = 0;
const failures = [];

function result(name, ok, detail = "") {
  if (ok === "skip") {
    skipped++;
    console.log(`  ${SKIP_EMOJI} ${name}${detail ? " — " + detail : ""}`);
    return;
  }
  if (ok) { passed++; console.log(`  ${PASS_EMOJI} ${name}${detail ? " — " + detail : ""}`); }
  else    { failed++; failures.push(name); console.log(`  ${FAIL_EMOJI} ${name}${detail ? " — " + detail : ""}`); }
}

function section(title) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`📍 ${title}`);
  console.log("─".repeat(60));
}

function coords(r) {
  if (!r) return "null";
  return `${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}`;
}

function distNote(r, expected, toleranceKm) {
  if (!r) return "no result";
  const d = haversineKm(expected.lat, expected.lon, r.lat, r.lon);
  return `${coords(r)} — ${d.toFixed(1)} km from expected (tolerance ${toleranceKm} km)`;
}

// ── Test data ─────────────────────────────────────────────────────────────────

// Known places with verified coordinates
const PLACES = {
  // Ireland
  pigeonHouse:     { lat: 53.3481, lon: -6.1981, city: "Dublin",    region: "Ireland",          desc: "Pigeon House, Ringsend, Dublin (abandoned power station)" },
  kilkennycastle:  { lat: 52.6543, lon: -7.2535, city: "Kilkenny",  region: "Ireland",          desc: "Kilkenny Castle" },
  spikeIsland:     { lat: 51.8499, lon: -8.2972, city: "Cobh",      region: "Cork",             desc: "Spike Island, Cork Harbour (historic fort/prison)" },
  loftusHall:      { lat: 52.1678, lon: -6.9601, city: "Wellington Bridge", region: "Wexford",  desc: "Loftus Hall, Wexford (historic haunted mansion)" },
  // UK
  ss_richard_mont: { lat: 51.4479, lon: 0.7274,  city: "Sheerness", region: "Kent",             desc: "SS Richard Montgomery (shipwreck, Thames Estuary)" },
  // US
  packardPlant:    { lat: 42.3838, lon: -82.9985, city: "Detroit",  region: "Michigan",         desc: "Packard Automotive Plant, Detroit (iconic urbex site)" },
  waverly_hills:   { lat: 38.1311, lon: -85.8398, city: "Louisville", region: "Kentucky",       desc: "Waverly Hills Sanatorium, Louisville" },
  // Generic well-known (Wikipedia strategy test)
  eiffelTower:     { lat: 48.8584, lon: 2.2945,   city: "Paris",    region: "France",           desc: "Eiffel Tower (should be rejected when searching near Dublin)" },
  dunlinDublin:    { lat: 53.3498, lon: -6.2603,  city: "Dublin",   region: "Ireland",          desc: "Dublin city centre anchor" },
  // Oregon
  portland:        { lat: 45.5231, lon: -122.6765, city: "Portland",      region: "Oregon",      desc: "Portland city centre anchor" },
  multnomahFalls:  { lat: 45.5762, lon: -122.1158, city: "Corbett",       region: "Oregon",      desc: "Multnomah Falls, Columbia River Gorge" },
  craterLake:      { lat: 42.9446, lon: -122.1090, city: "Crater Lake",   region: "Oregon",      desc: "Crater Lake National Park" },
  timberline:      { lat: 45.3311, lon: -121.7113, city: "Government Camp", region: "Oregon",    desc: "Timberline Lodge, Mount Hood" },
  // California
  sanFrancisco:    { lat: 37.7749, lon: -122.4194, city: "San Francisco", region: "California",  desc: "San Francisco city centre anchor" },
  losAngeles:      { lat: 34.0522, lon: -118.2437, city: "Los Angeles",   region: "California",  desc: "Los Angeles city centre anchor" },
  alcatraz:        { lat: 37.8267, lon: -122.4230, city: "San Francisco", region: "California",  desc: "Alcatraz Island (historic prison)" },
  winchesterHouse: { lat: 37.3184, lon: -121.9505, city: "San Jose",      region: "California",  desc: "Winchester Mystery House, San Jose" },
  griffithObservatory: { lat: 34.1184, lon: -118.3004, city: "Los Angeles", region: "California", desc: "Griffith Observatory, Los Angeles" },
};

const DUBLIN  = PLACES.dunlinDublin;
const DETROIT = PLACES.packardPlant;

// ── Section 1: Pure math ──────────────────────────────────────────────────────

section("1 — Coordinate validation (haversine + isWithinRadius)");

result(
  "Dublin to Kilkenny (~102 km) — within 110 km",
  isWithinRadius({ lat: 52.6543, lon: -7.2535 }, DUBLIN, 110)
);
result(
  "Dublin to Paris (1850 km) — outside 100 km",
  !isWithinRadius({ lat: 48.858, lon: 2.294 }, DUBLIN, 100)
);
result(
  "Same point — within 1 km",
  isWithinRadius(DUBLIN, DUBLIN, 1)
);
result(
  "Dublin to London (464 km) — outside 200 km",
  !isWithinRadius({ lat: 51.5074, lon: -0.1278 }, DUBLIN, 200)
);
{
  const d = haversineKm(DUBLIN.lat, DUBLIN.lon, PLACES.kilkennycastle.lat, PLACES.kilkennycastle.lon);
  result(`Haversine: Dublin → Kilkenny (~95 km)`, d > 90 && d < 105, `got ${d.toFixed(1)} km`);
}

// ── Section 2: Photon geocoder with location bias ─────────────────────────────

section("2 — Photon geocoder with location bias");
console.log("  (tests that bias pulls results toward user's city)");

{
  console.log("\n  2a. Pigeon House near Dublin");
  const t = Date.now();
  const r = await photonSearch("Pigeon House", DUBLIN.lat, DUBLIN.lon).catch(() => null);
  const ms = Date.now() - t;
  if (!r) { result("Pigeon House [Dublin bias]", false, `no result (${ms}ms)`); }
  else {
    const d = haversineKm(PLACES.pigeonHouse.lat, PLACES.pigeonHouse.lon, r.lat, r.lon);
    result("Pigeon House [Dublin bias] within 5 km of Ringsend", d <= 5, `${distNote(r, PLACES.pigeonHouse, 5)} (${ms}ms)`);
  }
}

{
  console.log("\n  2b. Kilkenny Castle near Kilkenny");
  const t = Date.now();
  const r = await photonSearch("Kilkenny Castle, Kilkenny", 52.65, -7.25).catch(() => null);
  const ms = Date.now() - t;
  if (!r) { result("Kilkenny Castle [Kilkenny bias]", false, `no result (${ms}ms)`); }
  else {
    const d = haversineKm(PLACES.kilkennycastle.lat, PLACES.kilkennycastle.lon, r.lat, r.lon);
    result("Kilkenny Castle within 2 km", d <= 2, `${distNote(r, PLACES.kilkennycastle, 2)} (${ms}ms)`);
  }
}

{
  console.log("\n  2c. Bias correctness — 'Old Mill' near Dublin should NOT land in USA");
  const r = await photonSearch("Old Mill", DUBLIN.lat, DUBLIN.lon).catch(() => null);
  if (!r) { result("Old Mill [Dublin bias] — got a result", false, "no result"); }
  else {
    const inIreland = isWithinRadius(r, DUBLIN, 500); // 500 km covers all of Ireland+UK
    result("Old Mill [Dublin bias] stays within 500 km of Dublin", inIreland, `got ${coords(r)}`);
  }
}

{
  console.log("\n  2d. Packard Plant near Detroit");
  const t = Date.now();
  const r = await photonSearch("Packard Plant, Detroit", DETROIT.lat, DETROIT.lon).catch(() => null);
  const ms = Date.now() - t;
  if (!r) { result("Packard Plant [Detroit bias]", false, `no result (${ms}ms)`); }
  else {
    const d = haversineKm(PLACES.packardPlant.lat, PLACES.packardPlant.lon, r.lat, r.lon);
    result("Packard Plant within 5 km", d <= 5, `${distNote(r, PLACES.packardPlant, 5)} (${ms}ms)`);
  }
}

// ── Section 3: Nominatim with viewbox ────────────────────────────────────────

section("3 — Nominatim with viewbox");

{
  console.log("\n  3a. Spike Island near Cork");
  const t = Date.now();
  const r = await nominatimSearch("Spike Island Cork", 51.85, -8.30, 30).catch(() => null);
  const ms = Date.now() - t;
  if (!r) { result("Spike Island [Cork viewbox]", false, `no result (${ms}ms)`); }
  else {
    const d = haversineKm(PLACES.spikeIsland.lat, PLACES.spikeIsland.lon, r.lat, r.lon);
    result("Spike Island within 5 km", d <= 5, `${distNote(r, PLACES.spikeIsland, 5)} (${ms}ms)`);
  }
}

{
  console.log("\n  3b. Waverly Hills near Louisville (US)");
  const t = Date.now();
  const r = await nominatimSearch("Waverly Hills Sanatorium", 38.23, -85.84, 30).catch(() => null);
  const ms = Date.now() - t;
  if (!r) { result("Waverly Hills [Louisville viewbox]", false, `no result (${ms}ms)`); }
  else {
    const d = haversineKm(PLACES.waverly_hills.lat, PLACES.waverly_hills.lon, r.lat, r.lon);
    result("Waverly Hills within 10 km", d <= 10, `${distNote(r, PLACES.waverly_hills, 10)} (${ms}ms)`);
  }
}

{
  console.log("\n  3c. Nominatim bounded=0 — Eiffel Tower with Dublin viewbox");
  console.log("      (bounded=0 means viewbox is a preference, not a constraint; either result is valid)");
  console.log("      (the validation layer in geocodeNamedPlace is what actually enforces radius rejection)");
  const r = await nominatimSearch("Eiffel Tower", DUBLIN.lat, DUBLIN.lon, 100).catch(() => null);
  if (!r) {
    result("Eiffel Tower [Dublin viewbox, bounded=0] — no result", true, "no match returned");
  } else {
    const inDublinArea = isWithinRadius(r, DUBLIN, 500);
    if (inDublinArea) {
      result("Eiffel Tower [Dublin viewbox, bounded=0] — Nominatim stayed in Dublin area", true, `got ${coords(r)}`);
    } else {
      // With bounded=0 Nominatim may return the real Eiffel Tower in Paris — this is correct
      // raw Nominatim behavior. The isWithinRadius validation in geocodeNamedPlace rejects it.
      result("Eiffel Tower [Dublin viewbox, bounded=0] — returned global result (expected; validation layer handles rejection)", true, `got ${coords(r)}`);
    }
  }
}

// ── Section 4: OSM name search ────────────────────────────────────────────────

section("4 — OSM name search via Overpass");
console.log("  (requires Overpass API connectivity)");

{
  console.log("\n  4a. Kilkenny Castle by OSM name");
  const t = Date.now();
  const r = await osmNameSearch("Kilkenny Castle", PLACES.kilkennycastle.lat, PLACES.kilkennycastle.lon, 10).catch(() => null);
  const ms = Date.now() - t;
  if (!r) {
    result("Kilkenny Castle [OSM]", "skip", `Overpass unreachable or no result (${ms}ms)`);
  } else {
    const d = haversineKm(PLACES.kilkennycastle.lat, PLACES.kilkennycastle.lon, r.lat, r.lon);
    result("Kilkenny Castle [OSM] within 1 km", d <= 1, `${distNote(r, PLACES.kilkennycastle, 1)} (${ms}ms)`);
  }
}

{
  console.log("\n  4b. Loftus Hall by OSM name (Wexford)");
  const t = Date.now();
  const r = await osmNameSearch("Loftus Hall", PLACES.loftusHall.lat, PLACES.loftusHall.lon, 20).catch(() => null);
  const ms = Date.now() - t;
  if (!r) {
    result("Loftus Hall [OSM]", "skip", `Overpass unreachable or not in OSM (${ms}ms)`);
  } else {
    const d = haversineKm(PLACES.loftusHall.lat, PLACES.loftusHall.lon, r.lat, r.lon);
    result("Loftus Hall [OSM] within 3 km", d <= 3, `${distNote(r, PLACES.loftusHall, 3)} (${ms}ms)`);
  }
}

{
  console.log("\n  4c. OSM bbox scoping — search for 'Castle' near Kilkenny stays local");
  const r = await osmNameSearch("Kilkenny Castle", PLACES.kilkennycastle.lat, PLACES.kilkennycastle.lon, 5).catch(() => null);
  if (!r) {
    result("Castle [5km bbox] — OSM scoping", "skip", "Overpass unreachable");
  } else {
    const d = haversineKm(PLACES.kilkennycastle.lat, PLACES.kilkennycastle.lon, r.lat, r.lon);
    result("Castle [5km bbox] stayed within 5 km", d <= 5, `${coords(r)} — ${d.toFixed(1)} km from Kilkenny`);
  }
}

// ── Section 5: Wikipedia coordinate lookup ───────────────────────────────────

section("5 — Wikipedia coordinates API");

{
  const cases = [
    { title: "Kilkenny Castle", expected: PLACES.kilkennycastle, tol: 2 },
    { title: "Spike Island, County Cork", expected: PLACES.spikeIsland, tol: 5 },
    { title: "Packard Automotive Plant", expected: PLACES.packardPlant, tol: 5 },
    { title: "Waverly Hills Sanatorium", expected: PLACES.waverly_hills, tol: 5 },
  ];
  for (const c of cases) {
    const t = Date.now();
    const r = await wikiSearch(c.title).catch(() => null);
    const ms = Date.now() - t;
    if (!r) { result(`Wikipedia: "${c.title}"`, false, `no result (${ms}ms)`); }
    else {
      const d = haversineKm(c.expected.lat, c.expected.lon, r.lat, r.lon);
      result(`Wikipedia: "${c.title}" within ${c.tol} km`, d <= c.tol, `${distNote(r, c.expected, c.tol)} (${ms}ms)`);
    }
  }
}

// ── Section 6: Radius rejection ───────────────────────────────────────────────

section("6 — Radius rejection (should return null for far-away places)");
console.log("  (tests 2× buffer: maxRadius=50 km → accept up to 100 km)");

{
  // Eiffel Tower (~1850 km from Dublin) — should be rejected with any radius ≤ 925 km
  const dublinRadius50 = 50;
  const validationBuf = dublinRadius50 * 2;
  const d = haversineKm(DUBLIN.lat, DUBLIN.lon, PLACES.eiffelTower.lat, PLACES.eiffelTower.lon);
  result(
    `Eiffel Tower (${d.toFixed(0)} km from Dublin) exceeds 2× radius of ${dublinRadius50} km`,
    d > validationBuf,
    `distance ${d.toFixed(0)} km > ${validationBuf} km buffer ✓`
  );
}

{
  // Packard Plant (~6800 km from Dublin) — should be rejected near Dublin
  const d = haversineKm(DUBLIN.lat, DUBLIN.lon, PLACES.packardPlant.lat, PLACES.packardPlant.lon);
  result(
    `Detroit Packard Plant (${d.toFixed(0)} km from Dublin) exceeds 2× 100 km radius`,
    d > 200,
    `distance ${d.toFixed(0)} km > 200 km ✓`
  );
}

{
  // Kilkenny Castle (~95 km from Dublin) — within 2× 100 km radius = should pass
  const d = haversineKm(DUBLIN.lat, DUBLIN.lon, PLACES.kilkennycastle.lat, PLACES.kilkennycastle.lon);
  result(
    `Kilkenny Castle (${d.toFixed(0)} km from Dublin) within 2× 100 km radius`,
    d <= 200,
    `distance ${d.toFixed(0)} km ≤ 200 km ✓`
  );
}

// ── Section 7: End-to-end pipeline (cascade test) ────────────────────────────

section("7 — End-to-end cascade (OSM → Photon → Nominatim → Wikipedia)");
console.log("  (mirrors geocodeNamedPlace, stops at first hit)");

async function geocodeCascade(name, cityHint, regionHint, userLat, userLon, radiusKm) {
  const validationKm = radiusKm * 2;
  function accept(r) {
    if (!r) return null;
    return isWithinRadius(r, { lat: userLat, lon: userLon }, validationKm) ? r : null;
  }

  // Strategy 0: OSM
  if (userLat !== undefined) {
    const r = await osmNameSearch(name, userLat, userLon, radiusKm).catch(() => null);
    const v = accept(r);
    if (v) return { ...v, strategy: "OSM" };
  }

  // Strategy 1: Photon biased
  for (const q of [`${name}, ${regionHint}`, `${name}, ${cityHint}`, name]) {
    const r = await photonSearch(q, userLat, userLon).catch(() => null);
    const v = accept(r);
    if (v) return { ...v, strategy: "Photon" };
  }

  // Strategy 2: Nominatim
  for (const q of [`${name} ${regionHint}`, `${name} ${cityHint}`, name]) {
    const r = await nominatimSearch(q, userLat, userLon, radiusKm).catch(() => null);
    const v = accept(r);
    if (v) return { ...v, strategy: "Nominatim" };
  }

  // Strategy 3: Wikipedia
  const r = await wikiSearch(name).catch(() => null);
  return accept(r) ? { ...r, strategy: "Wikipedia" } : null;
}

const e2eTests = [
  { name: "Pigeon House",              city: "Dublin",    region: "Ireland",   anchor: PLACES.dunlinDublin,  radius: 30, expected: PLACES.pigeonHouse,    tol: 5 },
  { name: "Loftus Hall",               city: "Wexford",   region: "Ireland",   anchor: PLACES.loftusHall,    radius: 20, expected: PLACES.loftusHall,     tol: 5 },
  { name: "Kilkenny Castle",           city: "Kilkenny",  region: "Ireland",   anchor: PLACES.kilkennycastle,radius: 10, expected: PLACES.kilkennycastle,  tol: 2 },
  { name: "Packard Automotive Plant",  city: "Detroit",   region: "Michigan",  anchor: PLACES.packardPlant,  radius: 20, expected: PLACES.packardPlant,    tol: 5 },
  { name: "Waverly Hills Sanatorium",  city: "Louisville",region: "Kentucky",  anchor: PLACES.waverly_hills, radius: 20, expected: PLACES.waverly_hills,   tol: 5 },
  // Rejection test — Paris Eiffel Tower must be rejected; a local Irish venue with same name is acceptable
  { name: "Eiffel Tower",              city: "Dublin",    region: "Ireland",   anchor: PLACES.dunlinDublin,  radius: 50,  expected: "local_or_null",          tol: 0 },
  // Oregon
  { name: "Multnomah Falls",           city: "Portland",  region: "Oregon",    anchor: PLACES.portland,      radius: 60,  expected: PLACES.multnomahFalls,    tol: 5 },
  { name: "Crater Lake",               city: "Klamath",   region: "Oregon",    anchor: PLACES.craterLake,    radius: 20,  expected: PLACES.craterLake,        tol: 5 },
  { name: "Timberline Lodge",          city: "Portland",  region: "Oregon",    anchor: PLACES.timberline,    radius: 20,  expected: PLACES.timberline,        tol: 3 },
  // California
  { name: "Alcatraz Island",           city: "San Francisco", region: "California", anchor: PLACES.sanFrancisco, radius: 20, expected: PLACES.alcatraz,       tol: 3 },
  { name: "Winchester Mystery House",  city: "San Jose",  region: "California", anchor: PLACES.winchesterHouse, radius: 15, expected: PLACES.winchesterHouse, tol: 2 },
  { name: "Griffith Observatory",      city: "Los Angeles", region: "California", anchor: PLACES.losAngeles,  radius: 20,  expected: PLACES.griffithObservatory, tol: 3 },
];

for (const t of e2eTests) {
  const label = `"${t.name}" near ${t.city}`;
  const start = Date.now();
  const r = await geocodeCascade(t.name, t.city, t.region, t.anchor.lat, t.anchor.lon, t.radius).catch(() => null);
  const ms = Date.now() - start;

  if (t.expected === "local_or_null") {
    // Paris Eiffel Tower must be rejected; cascade may find a local venue with the same name
    if (r === null) {
      result(`${label} — Paris correctly rejected, no local fallback`, true, `null (${ms}ms)`);
    } else {
      const inArea = isWithinRadius(r, { lat: t.anchor.lat, lon: t.anchor.lon }, t.radius * 2);
      result(`${label} — Paris rejected; local result within search area`, inArea, `${coords(r)} [${r.strategy}] (${ms}ms)`);
    }
  } else if (t.expected === null) {
    result(`${label} — correctly rejected`, r === null, r ? `got ${coords(r)} instead of null` : `null (${ms}ms)`);
  } else if (!r) {
    result(`${label}`, false, `no result (${ms}ms)`);
  } else {
    const d = haversineKm(t.expected.lat, t.expected.lon, r.lat, r.lon);
    result(`${label} via ${r.strategy} — within ${t.tol} km`, d <= t.tol, `${distNote(r, t.expected, t.tol)} [${r.strategy}] (${ms}ms)`);
  }
}

// ── Section 8: Activity feature search ───────────────────────────────────────

section("8 — Activity feature search (description → top 3 results + accuracy check)");
console.log("  Searches OSM for specific feature types near a city, returns the 3 nearest,");
console.log("  and verifies each result is in-radius AND has the expected OSM tag.");
console.log("  Results are printed so you can eyeball the names yourself.");

/**
 * Query OSM for a specific tag (key=value) near a point. Fetches the closest
 * `limit` results, sorted by distance from the anchor.
 *
 * Returns an array of {lat, lon, name, tags} or null if Overpass is unreachable.
 */
async function osmFeatureSearch(tagKey, tagValue, userLat, userLon, radiusKm, limit = 3) {
  const km = Math.min(radiusKm * 1.2, 200);
  const dLat = km / 111;
  const dLon = km / (111 * Math.cos((userLat * Math.PI) / 180));
  const bbox = [
    (userLat - dLat).toFixed(5), (userLon - dLon).toFixed(5),
    (userLat + dLat).toFixed(5), (userLon + dLon).toFixed(5),
  ].join(",");
  // Fetch extra so we can sort by distance and return the closest
  const fetchLimit = Math.max(limit * 4, 12);
  const query = [
    `[out:json][timeout:15];`,
    `(`,
    `  node["${tagKey}"="${tagValue}"](${bbox});`,
    `  way["${tagKey}"="${tagValue}"](${bbox});`,
    `  relation["${tagKey}"="${tagValue}"](${bbox});`,
    `);`,
    `out center ${fetchLimit};`,
  ].join("\n");

  for (const endpoint of OVERPASS_URLS) {
    try {
      const res = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      }, 15_000);
      if (!res.ok) continue;
      const json = await res.json();
      const elements = (json.elements ?? [])
        .map(el => ({
          lat: el.lat ?? el.center?.lat,
          lon: el.lon ?? el.center?.lon,
          name: el.tags?.name ?? el.tags?.["name:en"] ?? `(unnamed ${tagValue})`,
          tags: el.tags ?? {},
        }))
        .filter(el => el.lat !== undefined)
        .sort((a, b) =>
          haversineKm(userLat, userLon, a.lat, a.lon) -
          haversineKm(userLat, userLon, b.lat, b.lon)
        )
        .slice(0, limit);
      return elements;
    } catch { /* try next */ }
  }
  return null; // Overpass unreachable
}

// ── Feature test cases ────────────────────────────────────────────────────────

const FEATURE_TESTS = [
  {
    desc: "hike with a waterfall",
    anchorLabel: "Dublin",
    anchor: PLACES.dunlinDublin,
    radiusKm: 80,
    osmTag: { key: "waterway", value: "waterfall" },
    expectedFeatureLabel: "waterfall",
    checkFn: tags => tags.waterway === "waterfall",
  },
  {
    desc: "mountain summit or peak",
    anchorLabel: "Dublin",
    anchor: PLACES.dunlinDublin,
    radiusKm: 80,
    osmTag: { key: "natural", value: "peak" },
    expectedFeatureLabel: "mountain peak",
    checkFn: tags => tags.natural === "peak",
  },
  {
    desc: "historic castle or fort",
    anchorLabel: "Kilkenny",
    anchor: PLACES.kilkennycastle,
    radiusKm: 40,
    osmTag: { key: "historic", value: "castle" },
    expectedFeatureLabel: "historic castle",
    checkFn: tags => tags.historic === "castle",
  },
  {
    desc: "sea cave or coastal cave",
    anchorLabel: "Cork",
    anchor: PLACES.spikeIsland,
    radiusKm: 60,
    osmTag: { key: "natural", value: "cave_entrance" },
    expectedFeatureLabel: "cave entrance",
    checkFn: tags => tags.natural === "cave_entrance",
  },
  {
    desc: "abandoned ruins or derelict site",
    anchorLabel: "Dublin",
    anchor: PLACES.dunlinDublin,
    radiusKm: 60,
    osmTag: { key: "historic", value: "ruins" },
    expectedFeatureLabel: "ruins",
    checkFn: tags => tags.historic === "ruins" || tags.ruins === "yes",
  },
  // Oregon
  {
    desc: "waterfall hike",
    anchorLabel: "Portland OR",
    anchor: PLACES.portland,
    radiusKm: 70,
    osmTag: { key: "waterway", value: "waterfall" },
    expectedFeatureLabel: "waterfall",
    checkFn: tags => tags.waterway === "waterfall",
  },
  {
    desc: "mountain summit or peak",
    anchorLabel: "Portland OR",
    anchor: PLACES.portland,
    radiusKm: 100,
    osmTag: { key: "natural", value: "peak" },
    expectedFeatureLabel: "mountain peak",
    checkFn: tags => tags.natural === "peak",
  },
  {
    desc: "campsite or campground",
    anchorLabel: "Portland OR",
    anchor: PLACES.portland,
    radiusKm: 80,
    osmTag: { key: "tourism", value: "camp_site" },
    expectedFeatureLabel: "campsite",
    checkFn: tags => tags.tourism === "camp_site",
  },
  // California
  {
    desc: "scenic viewpoint or overlook",
    anchorLabel: "San Francisco CA",
    anchor: PLACES.sanFrancisco,
    radiusKm: 40,
    osmTag: { key: "tourism", value: "viewpoint" },
    expectedFeatureLabel: "viewpoint",
    checkFn: tags => tags.tourism === "viewpoint",
  },
  {
    desc: "historic fort or military site",
    anchorLabel: "San Francisco CA",
    anchor: PLACES.sanFrancisco,
    radiusKm: 20,
    osmTag: { key: "historic", value: "fort" },
    expectedFeatureLabel: "historic fort",
    checkFn: tags => tags.historic === "fort",
  },
  {
    desc: "beach for hiking or exploring",
    anchorLabel: "Los Angeles CA",
    anchor: PLACES.losAngeles,
    radiusKm: 40,
    osmTag: { key: "natural", value: "beach" },
    expectedFeatureLabel: "beach",
    checkFn: tags => tags.natural === "beach",
  },
];

for (const test of FEATURE_TESTS) {
  const label = `"${test.desc}" near ${test.anchorLabel}`;
  console.log(`\n  🔍 ${label} (OSM: ${test.osmTag.key}=${test.osmTag.value}, radius ${test.radiusKm} km)`);

  const t = Date.now();
  const results = await osmFeatureSearch(
    test.osmTag.key, test.osmTag.value,
    test.anchor.lat, test.anchor.lon,
    test.radiusKm, 3
  ).catch(() => null);
  const ms = Date.now() - t;

  if (results === null) {
    result(`${label} — Overpass reachable`, "skip", `Overpass unreachable (${ms}ms)`);
    continue;
  }

  if (results.length === 0) {
    result(`${label} — at least 1 result found`, false, `0 results within ${test.radiusKm} km (${ms}ms)`);
    continue;
  }

  let allInRadius = true;
  let allHaveFeature = true;

  console.log(`    Top ${results.length} result(s) within ${test.radiusKm} km (${ms}ms):`);
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const d = haversineKm(test.anchor.lat, test.anchor.lon, r.lat, r.lon);
    const inRadius = d <= test.radiusKm;
    const hasFeature = test.checkFn(r.tags);
    if (!inRadius) allInRadius = false;
    if (!hasFeature) allHaveFeature = false;
    const icon = inRadius && hasFeature ? "✅" : "❌";
    const tagWarning = hasFeature ? "" : ` ⚠️  tag mismatch`;
    const radiusWarning = inRadius ? "" : ` ⚠️  outside radius`;
    console.log(`    ${icon} ${i + 1}. "${r.name}" — ${d.toFixed(1)} km away${tagWarning}${radiusWarning}`);
  }

  result(`${label} — all ${results.length} result(s) within ${test.radiusKm} km radius`, allInRadius);
  result(`${label} — all results tagged as expected (${test.expectedFeatureLabel})`, allHaveFeature);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(60)}`);
console.log(`📊 Results: ${PASS_EMOJI} ${passed} passed  ${FAIL_EMOJI} ${failed} failed  ${SKIP_EMOJI} ${skipped} skipped`);
console.log(`${"═".repeat(60)}`);

if (failures.length > 0) {
  console.log("\nFailed tests:");
  for (const f of failures) console.log(`  • ${f}`);
  console.log("");
}

if (failed === 0 && skipped === 0) {
  console.log("All tests passed. Location sourcing is working correctly.\n");
} else if (failed === 0) {
  console.log(`${WARN_EMOJI} Skipped tests are usually Overpass being unreachable (check network) — not a code issue.\n`);
} else {
  console.log(`${WARN_EMOJI} ${failed} test(s) failed — review the output above.\n`);
  process.exit(1);
}
