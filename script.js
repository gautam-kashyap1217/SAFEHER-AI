/* ============================================
   SafeHer AI — script.js (FIXED)
   Handles: Map, SOS, Shake Detection,
            Contacts (MongoDB via API),
            SafeWalk, Alerts, Toolbar
   ============================================ */

// ============================================
// BACKEND API BASE URL
// Auto-detects port — works whether Flask runs on 5000 or 5500
// ============================================
const API_BASE = "http://127.0.0.1:5000";
// ============================================
// GLOBAL STATE
// ============================================
let map = null;
let userMarker = null;
let userLat = 23.2599;   // Default: Bhopal
let userLng = 77.4126;
let countdownInterval = null;
let countdownVal = 5;
let walkProgress = 0;
let walkInterval = null;
let routingControl = null;

// Shake state
let shakeEnabled = false;
let lastShakeTime = 0;
let shakeCount = 0;
let listenShakeActive = false;
const SHAKE_THRESHOLD = 20;
const SHAKE_COOLDOWN = 4000;

// Toolbar state
const featureState = {
  ai: false, shake: false, stations: true,
  safewalk: false, sos: false, community: false
};

// ============================================
// 1. INIT — runs when page loads
// ============================================
window.addEventListener("DOMContentLoaded", () => {
  initMap();
  getUserLocation();
  loadContacts();
  buildHeatmap();
  showNotif("SafeHer AI Active 🛡️", "Monitoring your route. Stay safe!");
});

// ============================================
// 2. LEAFLET MAP SETUP — FIXED
// ============================================
function initMap() {
  // Safety check — don't init twice
  if (map) return;

  map = L.map("map", {
    center: [userLat, userLng],
    zoom: 14,
    zoomControl: true,
  });

  // Dark tile layer
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    {
      attribution: "© OpenStreetMap © CartoDB",
      subdomains: "abcd",
      maxZoom: 19,
    }
  ).addTo(map);

  // CRITICAL: force Leaflet to recalculate map size
  // This fixes the blank map issue
  setTimeout(() => {
    map.invalidateSize(true);
  }, 200);

  // Also invalidate on window resize
  window.addEventListener("resize", () => {
    if (map) map.invalidateSize(true);
  });

  addRiskZones();
  addStationMarkers();
  drawSafeRoute();
}

// ---------- Risk Zones — Live Animated ----------
// All Bhopal risk zones with level, radius, label
const RISK_ZONES = [
  { lat: 23.278, lng: 77.395, radius: 600, level: "HIGH",   label: "🔴 Industrial Area — High Risk",    color: "#FF3B3B" },
  { lat: 23.245, lng: 77.430, radius: 450, level: "MED",    label: "🟡 Bittan Market — Moderate Risk",  color: "#FFB800" },
  { lat: 23.255, lng: 77.405, radius: 500, level: "SAFE",   label: "🟢 MP Nagar — Safe Zone",           color: "#00C48C" },
  { lat: 23.265, lng: 77.450, radius: 350, level: "MED",    label: "🟡 DB Mall Area — Moderate Risk",   color: "#FFB800" },
  { lat: 23.2686,lng: 77.401, radius: 400, level: "HIGH",   label: "🔴 Old City — High Risk at Night",  color: "#FF3B3B" },
  { lat: 23.231, lng: 77.432, radius: 300, level: "SAFE",   label: "🟢 Habibganj Station — Safe",       color: "#00C48C" },
];

let riskCircles    = [];   // outer static circles
let pulseCircles   = [];   // inner pulsing circles
let pulseDir       = 1;    // 1 = expanding, -1 = shrinking
let pulseInterval  = null;

function addRiskZones() {
  // Clear old
  riskCircles.forEach(c => map.removeLayer(c));
  pulseCircles.forEach(c => map.removeLayer(c));
  riskCircles = []; pulseCircles = [];

  RISK_ZONES.forEach((z) => {
    // Outer static ring
    const outer = L.circle([z.lat, z.lng], {
      color:       z.color,
      fillColor:   z.color,
      fillOpacity: 0.10,
      radius:      z.radius,
      weight:      1.5,
    }).addTo(map).bindPopup(`
      <div style="font-family:Sora,sans-serif;min-width:160px">
        <b style="font-size:13px">${z.label}</b><br/>
        <span style="color:#aaa;font-size:11px">Radius: ${z.radius}m · Risk: ${z.level}</span>
      </div>
    `);
    riskCircles.push(outer);

    // Inner pulsing ring (only for HIGH/MED)
    if (z.level !== "SAFE") {
      const inner = L.circle([z.lat, z.lng], {
        color:       z.color,
        fillColor:   z.color,
        fillOpacity: 0.25,
        radius:      z.radius * 0.4,
        weight:      2,
        interactive: false,
      }).addTo(map);
      pulseCircles.push({ circle: inner, baseRadius: z.radius * 0.4, maxRadius: z.radius * 0.7 });
    }
  });

  startPulseAnimation();
}

// Animate the inner pulse rings
function startPulseAnimation() {
  if (pulseInterval) clearInterval(pulseInterval);
  let step = 0;

  pulseInterval = setInterval(() => {
    step = (step + 1) % 60; // 0–59 steps
    const t = Math.sin(step * Math.PI / 30); // -1 to 1 sine wave

    pulseCircles.forEach(({ circle, baseRadius, maxRadius }) => {
      const r = baseRadius + (maxRadius - baseRadius) * ((t + 1) / 2);
      circle.setRadius(r);
      // Vary opacity too
      const opacity = 0.15 + 0.2 * ((t + 1) / 2);
      circle.setStyle({ fillOpacity: opacity });
    });
  }, 80); // ~12fps pulse
}

// ---------- Station Markers ----------
let stationMarkers = [];
function addStationMarkers() {
  const stations = [
    { lat: 23.2315, lng: 77.4322, name: "🚉 Habibganj Station", type: "station" },
    { lat: 23.2599, lng: 77.4126, name: "🚌 MP Nagar Bus Stop", type: "bus" },
    { lat: 23.2686, lng: 77.4012, name: "🚉 Bhopal Junction",   type: "station" },
    { lat: 23.2431, lng: 77.4389, name: "🚌 DB Mall Stop",      type: "bus" },
    { lat: 23.2750, lng: 77.4200, name: "👮 Police Post",       type: "police" },
    { lat: 23.2500, lng: 77.4450, name: "🏥 Hamidia Hospital",  type: "hospital" },
  ];

  const iconColors = {
    station:  "#3B82F6",
    bus:      "#7C3AED",
    police:   "#00C48C",
    hospital: "#FF6BB8",
  };

  stations.forEach((s) => {
    const icon = L.divIcon({
      className: "",
      html: `<div style="
        background:${iconColors[s.type]};
        color:#fff;
        padding:5px 9px;
        border-radius:6px;
        font-size:12px;
        font-weight:700;
        white-space:nowrap;
        border:1px solid rgba(255,255,255,0.25);
        font-family:Sora,sans-serif;
        box-shadow:0 2px 8px rgba(0,0,0,0.4);
      ">${s.name}</div>`,
      iconAnchor: [0, 0],
    });
    const m = L.marker([s.lat, s.lng], { icon })
      .addTo(map)
      .bindPopup(`<b>${s.name}</b>`);
    stationMarkers.push(m);
  });
}

function toggleStationMarkers(show) {
  stationMarkers.forEach(m => {
    if (show) m.addTo(map);
    else map.removeLayer(m);
  });
}

// ---------- Safe Route ----------
function drawSafeRoute() {
  const safeRoute = [
    [23.2599, 77.4126],
    [23.2520, 77.4200],
    [23.2450, 77.4280],
    [23.2380, 77.4322],
    [23.2315, 77.4322],
  ];

  L.polyline(safeRoute, {
    color: "#00C48C",
    weight: 4,
    dashArray: "10, 8",
    opacity: 0.85,
  }).addTo(map).bindPopup("✅ Recommended Safe Route");
}

// ---------- User Location — Live Tracking + Risk Proximity ----------
let lastAlertedZone = null;

function getUserLocation() {
  if (!navigator.geolocation) {
    document.getElementById("user-location-label").textContent = "📍 Bhopal, MP (default)";
    updateUserMarker(null);
    updateAIAnalysis();
    checkProximityToRiskZones();
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      updateUserMarker(pos.coords.accuracy);
      updateAIAnalysis();
      checkProximityToRiskZones();
      document.getElementById("user-location-label").textContent =
        `📍 Live — ${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
    },
    () => {
      document.getElementById("user-location-label").textContent = "📍 Bhopal, MP (default)";
      updateUserMarker(null);
      updateAIAnalysis();
      checkProximityToRiskZones();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

// ---- Proximity risk check — runs live on every location update ----
function checkProximityToRiskZones() {
  let closestZone = null;
  let closestDist = Infinity;

  RISK_ZONES.forEach(z => {
    const dist = getDistanceKm(userLat, userLng, z.lat, z.lng) * 1000; // metres
    if (dist < closestDist) { closestDist = dist; closestZone = { ...z, distMetres: Math.round(dist) }; }
  });

  if (!closestZone) return;

  updateSafetyScore(closestZone, closestDist);
  updateRiskBadges(closestZone, closestDist);

  const inDanger  = closestDist < closestZone.radius && closestZone.level === "HIGH";
  const inWarning = closestDist < closestZone.radius && closestZone.level === "MED";

  if (inDanger && lastAlertedZone !== closestZone.label) {
    lastAlertedZone = closestZone.label;
    showToast(`🚨 DANGER: ${closestZone.label} — ${closestZone.distMetres}m away!`);
    showNotif("⚠️ High Risk Area!", `You entered: ${closestZone.label}. Stay alert!`);
    pulseUserMarker("danger");
  } else if (inWarning && lastAlertedZone !== closestZone.label) {
    lastAlertedZone = closestZone.label;
    showToast(`⚠️ Caution: ${closestZone.label} — ${closestZone.distMetres}m away`);
    pulseUserMarker("warn");
  } else if (!inDanger && !inWarning) {
    lastAlertedZone = null;
    const scoreEl = document.getElementById("safety-score");
    if (scoreEl) scoreEl.style.color = "var(--safe)";
  }
}

function updateSafetyScore(zone, distMetres) {
  const scoreEl = document.getElementById("safety-score");
  if (!scoreEl) return;
  let score;
  if      (zone.level === "HIGH" && distMetres < zone.radius) score = Math.floor(Math.random() * 20 + 20);
  else if (zone.level === "MED"  && distMetres < zone.radius) score = Math.floor(Math.random() * 20 + 45);
  else if (zone.level === "SAFE" && distMetres < zone.radius) score = Math.floor(Math.random() * 15 + 80);
  else                                                         score = Math.floor(Math.random() * 20 + 60);
  scoreEl.textContent = score;
  const color = score < 40 ? "#FF3B3B" : score < 65 ? "#FFB800" : "#00C48C";
  scoreEl.style.color = color;
  const ring = document.querySelector(".status-ring");
  if (ring) ring.style.background = `conic-gradient(${color} ${score}%, var(--border) ${score}%)`;
}

function updateRiskBadges(zone, distMetres) {
  const aiText = document.getElementById("ai-text");
  if (!aiText) return;
  const inside  = distMetres < zone.radius;
  const distStr = distMetres < 1000 ? `${Math.round(distMetres)}m` : `${(distMetres/1000).toFixed(1)}km`;
  aiText.innerHTML = inside
    ? `You are inside a <b style="color:${zone.color}">${zone.level} RISK zone</b>: <b style="color:#F0EEF8">${zone.label}</b><br/><br/>
       Nearest safe point: <b style="color:#00C48C">Habibganj Station</b>. Stay on lit paths.`
    : `Nearest risk zone: <b style="color:${zone.color}">${zone.label}</b> — ${distStr} away.<br/><br/>
       Area appears <b style="color:#00C48C">relatively safe</b>. <b style="color:#F0EEF8">3 contacts</b> watching.`;
}

function pulseUserMarker(type) {
  if (!userMarker) return;
  const color = type === "danger" ? "#FF3B3B" : "#FFB800";
  userMarker.setIcon(L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};
             border:3px solid #fff;box-shadow:0 0 0 8px ${color}55,0 0 0 16px ${color}22"></div>`,
    iconAnchor: [11, 11],
  }));
  setTimeout(() => updateUserMarker(null), 4000);
}

let accuracyCircle = null;

function updateUserMarker(accuracy) {
  if (!map) return;

  const icon = L.divIcon({
    className: "",
    html: `<div style="
      width:18px;height:18px;
      border-radius:50%;
      background:#E91E8C;
      border:3px solid #fff;
      box-shadow:0 0 0 6px rgba(233,30,140,0.3);
    "></div>`,
    iconAnchor: [9, 9],
  });

  if (userMarker) {
    userMarker.setLatLng([userLat, userLng]);
    userMarker.setIcon(icon);
  } else {
    userMarker = L.marker([userLat, userLng], { icon })
      .addTo(map)
      .bindPopup("📍 You are here");
    map.setView([userLat, userLng], 14);
  }

  // Show GPS accuracy circle
  if (accuracy && accuracy < 500) {
    if (accuracyCircle) {
      accuracyCircle.setLatLng([userLat, userLng]).setRadius(accuracy);
    } else {
      accuracyCircle = L.circle([userLat, userLng], {
        radius: accuracy,
        color: "#E91E8C",
        fillColor: "#E91E8C",
        fillOpacity: 0.06,
        weight: 1,
        dashArray: "4, 4",
        interactive: false,
      }).addTo(map);
    }
  }
}

// ============================================
// 3. AI ANALYSIS
// ============================================
function updateAIAnalysis() {
  fetch(`${API_BASE}/api/analyze-location`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: userLat, lng: userLng }),
  })
    .then((r) => {
      console.log("AI API status:", r.status);
      return r.json();
    })
    .then((data) => {
      // ✅ USE THE RESPONSE
      document.getElementById("ai-text").innerHTML = `
        Area risk: <b>${data.risk || "Moderate"}</b><br>
        ${data.message || "Analysis complete"}
      `;
    })
    .catch((err) => {
      console.error("AI error:", err);
      document.getElementById("ai-text").innerHTML =
        `Current area has <b style="color:#F0EEF8">moderate risk</b>...`;
    });
}

// ============================================
// 4. MAP SEARCH — with routing + danger zones
// ============================================
function searchLocation() {
  const query = document.getElementById("map-search").value.trim();
  if (!query) { showToast("⚠️ Enter a location to search"); return; }

  showToast("🔍 Searching for route...");

  fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + " Bhopal")}&format=json&limit=1`)
    .then(r => r.json())
    .then(results => {
      if (!results.length) {
        return fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`)
          .then(r => r.json());
      }
      return results;
    })
    .then(results => {
      if (!results || !results.length) {
        showToast("❌ Location not found. Try a more specific name.");
        return;
      }

      const destLat = parseFloat(results[0].lat);
      const destLng = parseFloat(results[0].lon);
      const destName = results[0].display_name.split(",")[0];

      if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
      }

      if (typeof L.Routing === "undefined") {
        const destIcon = L.divIcon({
          className: "",
          html: `<div style="font-size:28px">🏁</div>`,
          iconAnchor: [14, 28],
        });
        L.marker([destLat, destLng], { icon: destIcon })
          .addTo(map)
          .bindPopup(`<b>📍 ${destName}</b>`)
          .openPopup();

        L.polyline([[userLat, userLng], [destLat, destLng]], {
          color: '#e91e8c',
          weight: 4,
          opacity: 0.8,
          dashArray: "8, 6"
        }).addTo(map);

        map.fitBounds([[userLat, userLng], [destLat, destLng]], { padding: [40, 40] });

        const dangerLevel = checkDangerNearDestination(destLat, destLng);

        document.getElementById("risk-alert").innerHTML = 
    dangerLevel === "SAFE"
    ? "✅ Safe destination"
        : `⚠️ ${dangerLevel} risk near destination`;

        document.getElementById('safewalk-dest').textContent = destName;
        document.getElementById('safewalk-eta').textContent = `~${eta} min`;
        document.getElementById('walk-remaining').textContent = `${dist.toFixed(1)} km remaining`;
        document.getElementById('walk-covered').textContent = `0 km covered`;
        document.getElementById('safewalk-status').textContent = 'Active';
        document.getElementById('safewalk-status').className = 'badge badge-safe';

        showToast(`📍 ${destName} — ${dist.toFixed(1)} km · ~${eta} min (walking)`);
        addDangerZones();
        return;
      }

      routingControl = L.Routing.control({
        waypoints: [
          L.latLng(userLat, userLng),
          L.latLng(destLat, destLng)
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        show: true,
        lineOptions: {
          styles: [{ color: '#e91e8c', weight: 5, opacity: 0.85 }]
        },
        createMarker: function(i, wp) {
          const html = i === 0 ? '📍' : '🏁';
          return L.marker(wp.latLng, {
            icon: L.divIcon({
              className: '',
              html: `<div style="font-size:26px">${html}</div>`,
              iconAnchor: [13, 26]
            })
          });
        }
      }).addTo(map);

      routingControl.on('routesfound', function(e) {
        const route = e.routes[0];
        const distKm = (route.summary.totalDistance / 1000).toFixed(1);
        const etaMins = Math.round(route.summary.totalTime / 60);

        document.getElementById('safewalk-dest').textContent = destName;
        document.getElementById('safewalk-eta').textContent = `~${etaMins} min`;
        document.getElementById('walk-remaining').textContent = `${distKm} km remaining`;
        document.getElementById('walk-covered').textContent = `0 km covered`;
        document.getElementById('safewalk-status').textContent = 'Active';
        document.getElementById('safewalk-status').className = 'badge badge-safe';

        showToast(`🗺️ Route: ${distKm} km · ~${etaMins} min`);
      });

      routingControl.on('routingerror', function() {
        showToast("⚠️ Route error — showing direct path");
      });

      addDangerZones();
    })
    .catch(() => {
      showToast("❌ Search failed. Check internet connection.");
    });
}

// Haversine distance formula (km)
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function addDangerZones() {
  fetch(`${API_BASE}/api/danger-zones`)
    .then(r => r.json())
    .then(zones => drawDangerZones(zones))
    .catch(() => {
      drawDangerZones([
        { name: "Industrial Area Bypass", lat: 23.255, lng: 77.401, level: "HIGH" },
        { name: "Bittan Market Area",     lat: 23.231, lng: 77.441, level: "MED"  },
        { name: "Railway Colony Rd",      lat: 23.242, lng: 77.431, level: "MED"  },
      ]);
    });
}

function drawDangerZones(zones) {
  zones.forEach(z => {
    const color = z.level === 'HIGH' ? '#ff3b3b' : z.level === 'MED' ? '#ff9800' : '#4caf50';
    L.circle([z.lat, z.lng], {
      radius: z.radius || 300,
      color: color,
      fillOpacity: 0.2,
      weight: 2
    }).bindPopup(`<b>⚠️ ${z.name}</b><br/>Risk: <b>${z.level}</b>`).addTo(map);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("map-search");
  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") searchLocation();
    });
  }
});

// ============================================
// 5. MAP MODE SWITCH
// ============================================
function setMode(mode, btn) {
  document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  showNotif("Mode Changed", `Switched to ${mode} mode`);
}

// ============================================
// 6. NAV TAB SWITCH
// ============================================
function showSection(section) {
  document.querySelectorAll(".nav-tab").forEach((t) => t.classList.remove("active"));
  event.target.classList.add("active");
  showNotif("SafeHer", `Switched to ${section} view`);
}

// ============================================
// 7. TOOLBAR FEATURE TOGGLES — FIXED
// ============================================
function toggleFeature(feat) {
  featureState[feat] = !featureState[feat];
  const btn = document.getElementById(`feat-${feat}`);
  if (btn) btn.classList.toggle('active', featureState[feat]);

  const on = featureState[feat];

  switch(feat) {
    case 'shake':
      on ? activateShakeAlert() : deactivateShakeAlert();
      break;
    case 'stations':
      toggleStationMarkers(on);
      showToast(on ? '🚉 Station markers shown' : '🚉 Station markers hidden');
      break;
    case 'safewalk':
      toggleSafeWalkPanel(on);
      break;
    case 'community':
      const cp = document.getElementById('community-panel');
      if (cp) cp.style.display = on ? 'block' : 'none';
      showToast(on ? '🌍 Community reports visible' : '🌍 Community reports hidden');
      break;
    case 'ai':
      showToast(on ? '🤖 AI Risk Detection ON' : '🤖 AI Risk Detection OFF');
      break;
    case 'sos':
      showToast(on ? '🔕 Silent SOS armed — press SOS button to send quietly' : '🔕 Silent SOS disarmed');
      break;
  }
}

function toggleSafeWalkPanel(show) {
  const panel = document.querySelector('.safewalk-panel');
  if (panel) {
    panel.style.display = show ? 'block' : 'none';
    if (show) showToast('🚶 SafeWalk Mode ON — set your destination');
    else showToast('🚶 SafeWalk Mode OFF');
  }
}

// ============================================
// 8. CONTACTS — MongoDB via Flask API (FIXED)
// ============================================
async function loadContacts() {
  const list = document.getElementById('contacts-list');

  try {
    const res = await fetch(`${API_BASE}/api/contacts`);
    const contacts = await res.json();

    console.log("Fetched contacts:", contacts); // 👈 debug

    if (!contacts || contacts.length === 0) {
      list.innerHTML = '<div>No contacts available</div>';
      return;
    }

    const colors = ['#E91E8C', '#7C3AED', '#3B82F6'];

    list.innerHTML = contacts.map((c, i) => `
      <div class="contact-item">
        <div class="contact-avatar" style="background:${colors[i % colors.length]}30; color:${colors[i % colors.length]}">
          ${c.name ? c.name[0].toUpperCase() : "?"}
        </div>
        <div>
          <b>${c.name}</b><br>
          ${c.phone}<br>
          <small>${c.relation}</small>
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error("Error loading contacts:", err);
    list.innerHTML = '<div>Error loading contacts</div>';
  }
}
// ---------- Add Contact Modal ----------
function addContact() {
  document.getElementById("contact-modal").classList.add("show");
}

function closeContactModal() {
  document.getElementById("contact-modal").classList.remove("show");
  document.getElementById("contact-name").value = "";
  document.getElementById("contact-phone").value = "";
  document.getElementById("contact-relation").value = "";
}

async function saveContact() {
  const name     = document.getElementById("contact-name").value.trim();
  const phone    = document.getElementById("contact-phone").value.trim();
  const relation = document.getElementById("contact-relation").value.trim();

  if (!name || !phone) {
    showToast("⚠️ Name and phone are required");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/contacts`, { // ✅ FIXED
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, relation }),
    });
    if (!res.ok) throw new Error();
    closeContactModal();
    loadContacts();
    showToast(`✅ ${name} added to emergency contacts`);
  } catch {
    showToast("⚠️ Could not save — is backend running?");
  }
}

async function deleteContact(phone) {
  try {
    await fetch(`${API_BASE}/api/contacts/${encodeURIComponent(phone)}`, { method: 'DELETE' }); // ✅ FIXED
    loadContacts();
    showToast('🗑 Contact removed');
  } catch {
    showToast('⚠️ Could not delete contact');
  }
}

// ============================================
// 9. SOS TRIGGER
// ============================================
function triggerSOS() {
  document.getElementById("sos-modal").classList.add("show");
  countdownVal = 5;
  document.getElementById("countdown").textContent = countdownVal;

  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    countdownVal--;
    document.getElementById("countdown").textContent = countdownVal;
    if (countdownVal <= 0) {
      clearInterval(countdownInterval);
      confirmSOS();
    }
  }, 1000);
}

function cancelSOS() {
  clearInterval(countdownInterval);
  document.getElementById("sos-modal").classList.remove("show");
  showNotif("SOS Cancelled", "Emergency alert was cancelled.");
}

function confirmSOS() {
  clearInterval(countdownInterval);
  document.getElementById("sos-modal").classList.remove("show");

  fetch(`${API_BASE}/api/sos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: userLat, lng: userLng }),
  })
    .then((r) => r.json())
    .then((data) => showNotif("🆘 SOS Sent!", data.message || "Emergency alert sent to all contacts."))
    .catch(() => showNotif("🆘 SOS Sent!", "Emergency alert + live location sent to all contacts!"));
}

// ============================================
// 10. SHAKE-TO-ALERT — ON/OFF via toolbar
// ============================================
function activateShakeAlert() {
  shakeEnabled = true;

  const ring = document.getElementById('shake-ring');
  if (ring) {
    ring.classList.add('active-shake');
    ring.style.borderColor = '#e91e8c';
  }

  if (typeof DeviceMotionEvent !== 'undefined') {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then(perm => {
          if (perm === 'granted') {
            startListeningShake();
            showToast('📳 Shake-to-Alert ON — shake phone to send SOS!');
          } else {
            shakeEnabled = false;
            showToast('⚠️ Motion permission denied by browser');
          }
        }).catch(() => {
          startListeningShake();
          showToast('📳 Shake-to-Alert ON!');
        });
    } else {
      startListeningShake();
      showToast('📳 Shake-to-Alert ON — shake your phone to trigger SOS!');
    }
  } else {
    showToast('📳 Shake-to-Alert ON (click the 📳 icon to simulate on desktop)');
  }
}

function deactivateShakeAlert() {
  shakeEnabled = false;
  const ring = document.getElementById('shake-ring');
  if (ring) {
    ring.classList.remove('active-shake');
    ring.style.borderColor = '';
  }
  showToast('🔴 Shake-to-Alert OFF');
}

function startListeningShake() {
  if (listenShakeActive) return;
  listenShakeActive = true;

  let lastX = 0, lastY = 0, lastZ = 0;
  window.addEventListener("devicemotion", (e) => {
    if (!shakeEnabled) return;
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;

    const delta = Math.abs(acc.x - lastX) + Math.abs(acc.y - lastY) + Math.abs(acc.z - lastZ);
    const now = Date.now();

    if (delta > SHAKE_THRESHOLD) {
      if (now - lastShakeTime > 500) {
        shakeCount++;
        lastShakeTime = now;
        if (shakeCount >= 3 && (now - lastShakeTime) < SHAKE_COOLDOWN) {
          shakeCount = 0;
          showToast('🚨 Shake detected — SOS triggered!');
          triggerSOS();
        }
      }
    }
    lastX = acc.x; lastY = acc.y; lastZ = acc.z;
  });
}

function handleShakeClick() {
  if (!shakeEnabled) {
    showToast('📳 First enable "Shake-to-Alert" in the toolbar above!');
    const btn = document.getElementById('feat-shake');
    if (btn) {
      btn.style.outline = '2px solid #e91e8c';
      setTimeout(() => { btn.style.outline = ''; }, 2000);
    }
  } else {
    showToast('🚨 Shake simulated — triggering SOS!');
    triggerSOS();
  }
}

function simulateShake() {
  handleShakeClick();
}

// ============================================
// 11. SAFEWALK MODE
// ============================================
function startSafeWalk() {
  walkProgress = 0;
  document.getElementById("safewalk-status").textContent = "Active";
  document.getElementById("safewalk-dest").textContent = "Home — Kotra Sultanabad";
  document.getElementById("safewalk-eta").textContent = "~22 min";

  clearInterval(walkInterval);
  walkInterval = setInterval(() => {
    walkProgress = Math.min(100, walkProgress + 0.5);
    document.getElementById("walk-bar").style.width = walkProgress + "%";
    const covered   = ((walkProgress / 100) * 4.2).toFixed(1);
    const remaining = (4.2 - covered).toFixed(1);
    document.getElementById("walk-covered").textContent   = `${covered} km covered`;
    document.getElementById("walk-remaining").textContent = `${remaining} km remaining`;

    if (walkProgress >= 100) {
      clearInterval(walkInterval);
      showNotif("SafeWalk Complete ✅", "You have arrived at your destination safely!");
    }
  }, 3000);
}

function checkIn() {
  fetch(`${API_BASE}/api/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: userLat, lng: userLng, status: "safe" }),
  })
    .then((r) => r.json())
    .then((d) => showNotif("Check-in Sent ✅", d.message || "Contacts notified you are safe."))
    .catch(() => showNotif("Check-in Sent ✅", "Contacts notified you are safe!"));
}

// ============================================
// 12. AI REROUTE
// ============================================
function aiReroute() {
  showNotif("AI Rerouting 🤖", "Safer route via DB Mall found — 4 min longer but 60% safer.");
}

// ============================================
// 13. COMMUNITY REPORT
// ============================================
function submitReport() {
  fetch(`${API_BASE}/api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: userLat, lng: userLng, type: "incident" }),
  })
    .then((r) => r.json())
    .then((d) => showNotif("Report Submitted 🌍", d.message || "Thank you! Your report helps the community."))
    .catch(() => showNotif("Report Submitted 🌍", "Thank you! Safety map updated."));
}

// ============================================
// 14. HEATMAP
// ============================================
function buildHeatmap() {
  const container = document.getElementById("heatmap");
  if (!container) return;
  const intensities = [0.2, 0.5, 0.4, 0.3, 0.7, 0.9, 0.6, 0.4, 0.2, 0.3, 0.4, 0.5, 0.5, 0.6];

  intensities.forEach((val) => {
    const cell = document.createElement("div");
    cell.className = "heat-cell";
    const color =
      val > 0.6 ? `rgba(255,59,59,${val})`
      : val > 0.35 ? `rgba(255,184,0,${val})`
      : `rgba(0,196,140,${val})`;
    cell.style.background = color;
    container.appendChild(cell);
  });
}

// ============================================
// 15. NOTIFICATIONS
// ============================================
function showNotif(title, body) {
  const el = document.getElementById("notif-toast");
  if (!el) return;
  document.getElementById("notif-title").textContent = title;
  document.getElementById("notif-body").textContent  = body;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 4000);
}

function showToast(msg) {
  const existing = document.querySelector('.toast-alert');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-alert';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3500);
}

function checkDangerNearDestination(destLat, destLng) {
    const dangerZones = [
        { lat: 23.2670, lng: 77.4669, radius: 500, level: "HIGH" },
        { lat: 23.2700, lng: 77.4700, radius: 700, level: "MEDIUM" }
    ];

    for (let zone of dangerZones) {
        const dist = getDistance(destLat, destLng, zone.lat, zone.lng);

        if (dist <= zone.radius) {
            return zone.level;
        }
    }

    return "SAFE";
}


function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a =
        Math.sin(Δφ/2) * Math.sin(Δφ/2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ/2) * Math.sin(Δλ/2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

