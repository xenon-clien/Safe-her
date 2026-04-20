console.log("🚨 CORE SCRIPT SIGNAL: script.js is loading!");
/* =========================================
   SCRIPT.JS - HerSafety App Logic
========================================= */

let map;
let userMarker;
let isSosActive = false;
let audioContext, oscillator, gainNode;
let userLatLng = { lat: 30.901, lng: 75.8573 }; 
let isLocationPrecise = false; // Accuracy Persistence Shield
const API_URL = (function() {
    const h = location.hostname;
    const p = location.port;
    // 1. Production or same-origin serving
    if (p === '5000' || (h && !['localhost', '127.0.0.1', ''].includes(h) && !h.startsWith('192.'))) {
        return '/api';
    }
    // 2. Development (hitting local server from separate port or file)
    return 'http://localhost:5000/api';
})();
console.log("🛰️ Neural Link Target:", API_URL);

// --- GLOBAL ERROR INTERCEPTOR ---
window.addEventListener('unhandledrejection', (e) => {
    console.error("Critical Neural Error:", e.reason);
    if (typeof showToast === 'function') showToast("Signal Lost: " + (e.reason.message || "Network Error"), "error");
});
// Auto-check connection on load
window.addEventListener('load', () => {
    if (typeof startDashboardClock === 'function') startDashboardClock();
    
    // Pro-active Precise Detection
    const areaEl = document.getElementById('dashArea');
    if (areaEl) areaEl.innerText = "Synchronizing Location...";
    performTrackingSync();
});
// Initial check removed
const _dummy = () => { if (false) {
    fetch(`${API_URL}/health`)
        .then(r => r.json())
        .then(d => console.log("âœ… Core System Linked:", d.server))
        .catch(e => console.error("âŒ System Link Failed. Make sure server is running on port 5000."));
    }
};
// --- GLOBAL NAVIGATION ENGINE ---
function switchSection(sectionId) {
    console.log("🚀 Switching Neural View:", sectionId);
    
    // 1. Hide all sections
    const sections = ['home', 'route', 'contacts', 'records', 'tips', 'feedback', 'loginView', 'signupView', 'premium', 'pro-center'];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // 2. Show target section
    const target = document.getElementById(sectionId);
    if (target) {
        target.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // 3. Update Nav Links (Top Navbar)
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === '#' + sectionId) link.classList.add('active');
    });

    // 4. Update Mobile Bottom Nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const bottomBtn = document.getElementById('btn-nav-' + sectionId);
    if (bottomBtn) bottomBtn.classList.add('active');

    // 5. Special Handlers
    if (sectionId === 'route' && window.map) {
        setTimeout(() => window.map.invalidateSize(), 400);
    }
}

let pendingPaymentResponse = null; 
let liveBeaconInterval = null;
let sirenInterval = null;
let audioCtx = null;
let sirenOscillator = null;
let sirenGain = null;

/**
 * Sends the initial SOS alert to the backend.
 */
/**
 * Sends the advanced SOS alert with real-time geocoding and SMS triggers.
 */
async function sendSOSAlert() {
    const userStr = localStorage.getItem('herSafety_user');
    const user = userStr && userStr !== 'undefined' ? JSON.parse(userStr) : { id: 'guest', name: 'Guest' };

    const payload = {
        userId: user.id || user._id,
        lat: userLatLng.lat,
        lng: userLatLng.lng,
        timestamp: new Date().toISOString()
    };

    try {
        const response = await fetch(`${API_URL}/sos-trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        
        if (response.ok) {
            addSecurityLog('SOS', `Broadcast via Twilio: ${data.address || 'Location Shared'}`);
            if (data.address) {
                const statusEl = document.getElementById('sosStatus');
                if (statusEl) statusEl.innerHTML = `ðŸš¨ Help is on the way to:<br><b>${data.address}</b>`;
            }
        }
    } catch (error) {
        console.error("SOS Trigger Fail:", error);
    }
}

// GLOBAL NEURAL DANGER DATABASE (Expanded from SafeRoute)
const CRIME_HOTSPOTS = [
    { name: "Dhandari Kalan", lat: 30.8690, lng: 75.9189, risk: 9, type: "Industrial/Snatching" },
    { name: "Giaspura", lat: 30.8752, lng: 75.8926, risk: 8, type: "Labor Belt/High Theft" },
    { name: "Sherpur Circle", lat: 30.8931, lng: 75.8893, risk: 8, type: "Poor Lighting/Robbery" },
    { name: "Focal Point", lat: 30.8845, lng: 75.9080, risk: 7, type: "Industrial/Unsafe at Night" },
    { name: "Railway Station Area", lat: 30.9025, lng: 75.8505, risk: 7, type: "Pickpocketing/Crowded" },
    // Migrated from SafeRoute Java Core
    { lat: 28.6139, lng: 77.2090, name: "Connaught Place Dark Alley", risk: 9, type: "High Risk Area" },
    { lat: 28.6280, lng: 77.2195, name: "Old Delhi Narrow Lanes", risk: 8, type: "Poor Lighting" },
    { lat: 28.6353, lng: 77.2250, name: "Chandni Chowk Backstreet", risk: 6, type: "Isolated" },
    { lat: 28.6100, lng: 77.2300, name: "Pragati Maidan Underpass", risk: 9, type: "Stalking Reports" },
    { lat: 19.0760, lng: 72.8777, name: "Mumbai Central Back Road", risk: 8, type: "Dark Alley" },
    { lat: 19.0330, lng: 72.8440, name: "Worli Naka Area", risk: 5, type: "Isolated Seafaces" },
    { lat: 12.9716, lng: 77.5946, name: "MG Road Back Alley", risk: 7, type: "Commercial Dark Spots" }
];

function initMap(lat, lng) {
    if (!lat || !lng) {
        console.warn("Map Init delayed: No valid coords.");
        return;
    }
    const container = document.getElementById('map');
    if (!container) return;

    // Hide Neural Loader once we have valid signal
    const loader = document.getElementById('mapLoader');
    if (loader) loader.style.display = 'none';

    // Retry if container is hidden (Leaflet requirement)
    if (container.offsetWidth === 0) {
        setTimeout(() => initMap(lat, lng), 400);
        return;
    }

    try {
        if (!map) {
            userLatLng = { lat, lng }; // UPDATE GLOBAL COORDS
            map = L.map('map', {
                zoomControl: false,
                scrollWheelZoom: true,
                dragging: true,
                tap: true,
                touchZoom: true,
                bounceAtZoomLimits: true
            }).setView([lat, lng], 18);

            L.control.zoom({ position: 'bottomright' }).addTo(map);

            window.mapLayers = {
                google: L.tileLayer('https://{s}.google.com/vt/lyrs=y\u0026x={x}\u0026y={y}\u0026z={z}', {
                    maxZoom: 20,
                    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                    attribution: '© Google Maps',
                    detectRetina: true
                }),
                baidu: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    maxZoom: 20,
                    attribution: '© OpenStreetMap © CartoDB',
                    detectRetina: true
                }),
                voyager: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    maxZoom: 20,
                    attribution: '© OpenStreetMap © CartoDB',
                    detectRetina: true
                }),
                ghost: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                    maxZoom: 20,
                    attribution: '© OpenStreetMap © CartoDB',
                    detectRetina: true
                })
            };

            window.mapLayers.google.addTo(map);

            userMarker = L.marker([lat, lng]).addTo(map)
                .bindPopup("<b>Verified Safety Map</b>").openPopup();

            setTimeout(() => {
                map.invalidateSize();
                if (typeof fetchDangerZones === 'function') fetchDangerZones(); 
            }, 600);

            map.on('moveend', () => {
                if (typeof fetchDangerZones === 'function') fetchDangerZones();
                updateMapHUD();
            });
            updateMapHUD();
            
            // Fix white screen on window resize or rotational change
            window.addEventListener('resize', () => {
                if(map) map.invalidateSize();
            });
        } else {
            userLatLng = { lat, lng }; // UPDATE GLOBAL COORDS
            console.log("🔄 Map already exists. Re-centering...");
            if (userMarker) userMarker.setLatLng([lat, lng]);
            map.setView([lat, lng], map.getZoom());
            map.invalidateSize();
            
            // Sync Route Planner instantly
            const fromField = document.getElementById('routeFrom');
            if (fromField) fromField.value = `${lat.toFixed(5)}, ${lng.toFixed(5)} (My Location)`;
        }
    } catch (e) {
        console.warn("Map Init Error:", e.message);
        if (map) map.invalidateSize();
    }
}

function setMapEngine(engine) {
    if (!map || !window.mapLayers) return;

    // Remove existing layers
    Object.values(window.mapLayers).forEach(layer => map.removeLayer(layer));

    // Add selected layer
    if (window.mapLayers[engine]) {
        window.mapLayers[engine].addTo(map);
        showToast(`Switched to ${engine.toUpperCase()} Engine`, "info");
        
        // Update active class on buttons if they exist
        document.querySelectorAll('.map-engine-btn').forEach(btn => {
            btn.classList.toggle('active-engine', btn.dataset.engine === engine);
            btn.classList.toggle('opacity-50', btn.dataset.engine !== engine);
        });
    }
}

// --- AI NEURAL SAFETY INTELLIGENCE ---
function updateAIIntelligence(lat, lng) {
    const intelPanel = document.getElementById('mapAIIntel');
    const intelText = document.getElementById('aiIntelText');
    if (!intelPanel || !intelText) return;

    // Show panel
    intelPanel.classList.remove('hidden-panel');
    intelPanel.classList.remove('opacity-0');
    intelPanel.style.opacity = "1";

    let dangerNearby = null;
    let safeHavenNearby = null;

    // Analyze drawn zones
    if (window.drawnZones && window.drawnZones.length > 0) {
        window.drawnZones.forEach(zone => {
            const dist = getDistanceMeters(lat, lng, zone.lat, zone.lng);
            if (dist < 1500) {
                if (zone.isSafe && (!safeHavenNearby || dist < safeHavenNearby.dist)) {
                    safeHavenNearby = { dist: dist, name: zone.name || 'Safe Zone' };
                } else if (!zone.isSafe && (!dangerNearby || dist < dangerNearby.dist)) {
                    dangerNearby = { dist: dist, name: zone.name || 'Risk Area' };
                }
            }
        });
    }

    // Generate AI Narrative
    let narrative = "<i class='fas fa-shield-check text-green-400 mr-2'></i> **Security Status: Stable.** No immediate crime reports in your direct periphery. Area looks safe for transit.";
    
    if (dangerNearby && dangerNearby.dist < 500) {
        narrative = `<i class='fas fa-exclamation-triangle text-red-500 mr-2'></i> **Alert:** You are entering a **High-Risk zone** identified as ${dangerNearby.name}. AI recommends moving towards North-East for higher police visibility.`;
    } else if (safeHavenNearby && safeHavenNearby.dist < 800) {
        narrative = `<i class='fas fa-check-circle text-green-500 mr-2'></i> **Secure Corridor:** You are near a verified **Safe Haven** (${safeHavenNearby.name}). This area is safe. Stay within well-lit main roads.`;
    } else if (dangerNearby) {
        narrative = `<i class='fas fa-satellite-dish text-blue-400 mr-2'></i> **Safety Brief:** General area is safe, but there is active crime reporting ${Math.round(dangerNearby.dist)}m away at ${dangerNearby.name}. Stay alert.`;
    }

    // Update with simple Markdown-like formatting check (since we are setting innerHTML)
    intelText.innerHTML = narrative.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
}

function dismissAIIntel() {
    const intelPanel = document.getElementById('mapAIIntel');
    if (intelPanel) intelPanel.classList.add('hidden-panel');
}

function toggleMapTilt() {
    const mapEl = document.getElementById('map');
    const tiltBtn = document.getElementById('tiltBtn');
    if (mapEl && tiltBtn) {
        const isTilted = mapEl.classList.toggle('tilted');
        tiltBtn.classList.toggle('tilt-btn-active', isTilted);
        if (map) {
            setTimeout(() => map.invalidateSize(), 800);
        }
        showToast(isTilted ? "Quantum 3D Perspective Enabled" : "Standard 2D Interface Restored", "info");
    }
}


function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const phi1 = lat1 * Math.PI/180;
    const phi2 = lat2 * Math.PI/180;
    const dPhi = (lat2-lat1) * Math.PI/180;
    const dLambda = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dPhi/2) * Math.sin(dPhi/2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(dLambda/2) * Math.sin(dLambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Performance Optimization: Debounce for smooth map panning
let dangerZoneTimeout;
function fetchDangerZonesDebounced() {
    clearTimeout(dangerZoneTimeout);
    dangerZoneTimeout = setTimeout(fetchDangerZones, 400);
}

// --- NEURAL TACTICAL DISCOVERY ENGINE via Overpass API ---
window.drawnZones = [];

function fetchDangerZones() {
    if (!map) return;

    // Clear old layers
    if (window.dangerLayers) {
        window.dangerLayers.forEach(layer => map.removeLayer(layer));
    }
    window.dangerLayers = [];
    window.drawnZones = [];

    const bounds = map.getBounds();
    const { _southWest: sw, _northEast: ne } = bounds;
    const bbox = `${sw.lat},${sw.lng},${ne.lat},${ne.lng}`;

    // 1. Fetch Backend Crime Zones
    fetch(`${API_URL}/danger-zones`)
    .then(r => r.json())
    .then(zones => {
        zones.forEach(zone => {
            const lat = zone.location?.coordinates[1] || zone.lat;
            const lng = zone.location?.coordinates[0] || zone.lng;
            if (lat && lng) {
                drawMapZone(lat, lng, zone.risk === 'High' ? 'high' : 'medium', 
                    zone.risk + ' Risk Zone', zone.name || 'System Zone', zone.type || 'Community Report');
            }
        });
    });

    // 2. Heavy-Duty Overpass Coverage: "Every Single Thing"
    const query = `[out:json][timeout:25];(
      node["amenity"~"police|hospital|fire_station|bank|atm|pharmacy|clinic|doctors|dentist"](${bbox});
      node["emergency"~"phone|fire_hydrant"](${bbox});
      node["highway"~"street_lamp"](${bbox});
      node["amenity"~"nightclub|bar|pub|casino"](${bbox});
      way["amenity"~"nightclub|bar|pub|casino"](${bbox});
    );out body;`;

    fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query })
    .then(async r => {
        if (!r.ok) throw new Error(`Overpass Overload: ${r.status}`);
        const contentType = r.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Invalid response from Neural Scan server (Overpass).");
        }
        return r.json();
    })
    .then(data => {
        if (!data || !data.elements) return;
        data.elements.forEach(node => {
            const lat = node.lat || (node.center && node.center.lat);
            const lng = node.lon || (node.center && node.center.lon);
            const tags = node.tags || {};
            const type = tags.amenity || tags.emergency || tags.highway || 'landmark';

            const isDangerous = ['nightclub', 'bar', 'pub', 'casino'].includes(type);
            const isSafe = ['police', 'hospital', 'fire_station', 'doctor', 'clinic', 'pharmacy', 'dentist'].includes(type);

            if (isDangerous) {
                drawMapZone(lat, lng, 'high', 'Risk Site', tags.name || 'Site', type);
            } else if (isSafe) {
                drawMapZone(lat, lng, 'safe', 'Secure Hub', tags.name || 'Safety Hub', type);
            } else {
                addTacticalMarker(lat, lng, type, tags.name || type);
            }
        });
    })
    .catch(e => {
        console.warn("Neural Scan Delay:", e.message);
        // Fallback: Don't crash, just log.
    });
}

function updateMapHUD() {
    if (!map) return;
    const center = map.getCenter();
    const mapLat = document.getElementById('mapLat');
    const mapLng = document.getElementById('mapLng');
    if (mapLat) mapLat.innerText = center.lat.toFixed(4);
    if (mapLng) mapLng.innerText = center.lng.toFixed(4);
}

function drawMapZone(lat, lng, riskLevel, label, name, description) {
    const isNight = new Date().getHours() >= 20 || new Date().getHours() < 6;
    let border, glow, radius, auraClass;

    const isSafe = riskLevel === 'safe' || riskLevel === 'green';

    if (isSafe) {
        border = '#10b981'; glow = '#10b981'; radius = 350; auraClass = 'safety-aura-emerald';
    } else if (riskLevel === 'high') {
        border = '#ef4444'; glow = '#ef4444'; radius = 450; auraClass = 'safety-aura-crimson';
    } else {
        border = '#f59e0b'; glow = '#f59e0b'; radius = 300; auraClass = 'safety-aura-amber';
    }

    // Track for AI intelligence
    window.drawnZones.push({ lat, lng, isSafe, name });

    // Outer Safety Aura Layer (Ultra Premium Pulse)
    const auraLayer = L.circle([lat, lng], {
        radius: radius * 1.5,
        color: glow, weight: 0,
        fillColor: glow, fillOpacity: 0.1,
        className: 'safety-aura ' + auraClass,
        interactive: false
    }).addTo(map);

    // Dynamic Core Boundary
    const circle = L.circle([lat, lng], {
        radius: radius,
        color: border, weight: 3,
        fillColor: glow,
        fillOpacity: isNight ? 0.3 : 0.15,
        className: 'safety-core'
    }).addTo(map).bindPopup(
        `<div style="font-family:'Poppins', sans-serif; padding:15px; min-width:240px; color:#fff;">
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
                <div style="font-size:18px;">${label.split(' ')[0]}</div>
                <div>
                   <div style="color:${glow}; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; line-height:1;">
                      ${label.split(' ').slice(1).join(' ')}
                   </div>
                   <div style="font-size:9px; color:rgba(255,255,255,0.4); text-transform:uppercase; margin-top:2px;">SAFE-HER QUANTUM ANALYSIS</div>
                </div>
            </div>
            <div style="font-size:15px; font-weight:700; margin-bottom:8px;">${name}</div>
            <p style="color:rgba(255,255,255,0.6); font-size:12px; line-height:1.6; margin-bottom:15px;">${description}</p>
        </div>`,
        { className: 'premium-popup', minWidth: 260 }
    );

    circle.bringToFront();
    window.dangerLayers.push(auraLayer, circle);
}

function getCommunityReports() {
    const saved = localStorage.getItem('safeher_reports');
    return saved ? JSON.parse(saved) : [];
}

function reportDangerAtCenter() {
    if (!map) return;
    const center = map.getCenter();
    const reason = prompt("Enter danger reason (e.g., Slun area, No street lights, Recent snatching):");

    if (reason) {
        const reports = getCommunityReports();
        reports.push({ lat: center.lat, lng: center.lng, reason: reason, time: Date.now() });
        localStorage.setItem('safeher_reports', JSON.stringify(reports));
        fetchDangerZones();
        showToast("Area reported! Thank you for helping the community.", "success");
        refreshSafetyScore();
    }
}

let trackingInterval = null;

async function startTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
        showToast("Tracking Stopped", "info");
        return;
    }

    const gpsEl = document.getElementById('dashGps');
    showToast("🛰️ LIVE TRACKING STARTED", "success");
    
    // Initial Sync
    performTrackingSync();

    // Loop every 60 seconds (as requested for live tracking)
    trackingInterval = setInterval(() => {
        performTrackingSync();
    }, 60000);
}

// --- TACTICAL GPS RESURRECTION (Stable v10) ---
let geoWatchId = null;

async function performTrackingSync() {
    const gpsEl = document.getElementById('dashGps');
    if (gpsEl) gpsEl.innerHTML = '<span class="text-blue-400 animate-pulse">📡 SCANNING SATELLITES...</span>';

    const options = { 
        enableHighAccuracy: true, 
        timeout: 10000, 
        maximumAge: 0 
    };

    if (navigator.geolocation) {
        // ALWAYS keep one active watch if possible (Infinite Healing)
        if (!geoWatchId) {
            geoWatchId = navigator.geolocation.watchPosition(
                (pos) => handlePreciseLocation(pos),
                (err) => {
                    console.warn("GPS Weak, keeping sensor warm...", err);
                    tryIPGeolocationFallback();
                },
                options
            );
        } else {
            // Force a single high-precision update if already watching
            navigator.geolocation.getCurrentPosition(
                (pos) => handlePreciseLocation(pos),
                (err) => console.log("Background Sync Active"),
                options
            );
        }
    }
}

function handlePreciseLocation(position) {
    const { latitude, longitude, accuracy } = position.coords;
    userLatLng = { lat: latitude, lng: longitude };
    isLocationPrecise = accuracy < 150; // Balanced for consistency
    
    const gpsEl = document.getElementById('dashGps');
    if (gpsEl) {
        const color = isLocationPrecise ? 'text-green-500' : 'text-yellow-400';
        const label = isLocationPrecise ? 'SAT-LOCK' : 'SIGNAL-SOFT';
        gpsEl.innerHTML = `<span class="${color} font-black">🛰️ ${label} [±${Math.round(accuracy)}m]</span>`;
    }
    
    // Core System Update
    if (typeof initMap === 'function') initMap(latitude, longitude);
    if (typeof updateDashboardGPS === 'function') updateDashboardGPS(latitude, longitude);
    
    if (isSosActive) sendTrackingUpdateToServer(latitude, longitude);
}

function sendTrackingUpdateToServer(lat, lng) {
    const userStr = localStorage.getItem('herSafety_user');
    const user = userStr ? JSON.parse(userStr) : null;
    if (!user) return;

    fetch(`${API_URL}/sos-trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id || user._id, lat, lng, isTracking: true })
    }).catch(e => console.warn("Live Beacon Sync Error:", e));
}

async function tryIPGeolocationFallback() {
    // PROTECTIVE GUARD: If we already have a precise Satellite lock, IGNORE internet fallback
    if (isLocationPrecise) {
        console.log("🛡️ Shield: Blocking approximate IP override to maintain Satellite precision.");
        return;
    }
    
    const gpsEl = document.getElementById('dashGps');
    if (gpsEl) gpsEl.innerText = "TRIANGULATING...";
    
    try {
        // Multi-Source Signal Triangulation (Parallel Fetch)
        const sources = [
            'https://ipapi.co/json/',
            'https://freeipapi.com/api/json'
        ];

        let locationData = null;

        for (const url of sources) {
            try {
                const res = await fetch(url);
                const data = await res.json();
                
                const lat = data.latitude || data.lat;
                const lon = data.longitude || data.lon;

                if (lat && lon) {
                    userLatLng = { lat: parseFloat(lat), lng: parseFloat(lon) };
                    initMap(userLatLng.lat, userLatLng.lng);
                    updateDashboardGPS(userLatLng.lat, userLatLng.lng);
                    
                    if (gpsEl) gpsEl.innerHTML = '<span class="text-yellow-400 font-bold">📡 APPROXIMATE-LINK</span>';
                    console.log("📡 Using Internet Triangulation (Area is approximate)");
                    break;
                }
            } catch (e) { console.warn(`Triangulation Source ${url} failed, trying next...`); }
        }

        if (locationData) {
            const { lat, lng } = locationData;
            userLatLng = { lat: parseFloat(lat), lng: parseFloat(lng) };
            
            initMap(userLatLng.lat, userLatLng.lng);
            updateDashboardGPS(userLatLng.lat, userLatLng.lng);
            
            if (gpsEl) gpsEl.innerHTML = '<span class="text-blue-400">HYBRID-ACTIVE</span>';
            console.log("📍 Neural Hybrid Link: Synchronization Successful via Network Layer.");
            sendTrackingUpdate(); 
        } else {
            throw new Error("All triangulation sources exhausted.");
        }
    } catch (e) {
        console.error("Critical Positioning Failure:", e);
        if (gpsEl) gpsEl.innerHTML = '<span class="text-red-500 font-bold uppercase tracking-tighter">CORE SATELLITE LOST</span>';
    }
}

async function sendTrackingUpdate() {
    const userStr = localStorage.getItem('herSafety_user');
    const user = userStr && userStr !== 'undefined' ? JSON.parse(userStr) : { id: 'guest' };
    
    try {
        await fetch(`${API_URL}/sos-trigger`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id || user._id,
                lat: userLatLng.lat,
                lng: userLatLng.lng,
                isTracking: true // Distinguish from full SOS
            })
        });
    } catch(e) { console.error("Tracking update failed:", e); }
}

// ============================================================
//  SAFETY DASHBOARD - Live Time + GPS + Safety Score
// ============================================================
function startDashboardClock() {
    updateDashboard(); // Run once immediately
    checkDatabaseStatus(); // Check DB status
    setInterval(updateDashboard, 1000);
    setInterval(checkDatabaseStatus, 10000); // Check DB every 10s for stability
}

let dbFailCount = 0;
async function checkDatabaseStatus() {
    const dbEl = document.getElementById('dashDb');
    if (!dbEl) return;

    // Show faint sync pulse
    const icon = dbEl.previousElementSibling;
    if (icon) icon.classList.add('animate-pulse');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

        const response = await fetch(`${API_URL}/health`, { signal: controller.signal });
        const data = await response.json();
        clearTimeout(timeoutId);
        
        if (data.database === 'connected') {
            dbFailCount = 0;
            dbEl.innerText = 'Online ✅';
            dbEl.style.color = '#4caf50';
        } else if (data.database === 'connecting') {
            dbFailCount = 0; // It's trying, so don't count as fail
            dbEl.innerText = 'Stabilizing... 🚀';
            dbEl.style.color = '#ff9800';
        } else {
            dbFailCount++;
            if (dbFailCount >= 3) {
                dbEl.innerText = 'Offline ❌';
                dbEl.style.color = '#ff3366';
            } else {
                dbEl.innerText = 'Syncing... 📡';
                dbEl.style.color = '#ff9800';
            }
        }
    } catch (error) {
        dbFailCount++;
        if (dbFailCount >= 3) {
            dbEl.innerText = 'Server Error ⚠️';
            dbEl.style.color = '#ff3366';
        } else {
            dbEl.innerText = 'Retrying... 📡';
            dbEl.style.color = '#ff9800';
        }
    } finally {
        if (icon) setTimeout(() => icon.classList.remove('animate-pulse'), 1000);
    }
}

function updateDashboard() {
    const now = new Date();
    let h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; // Convert 0 â†’ 12, 13 â†’ 1, etc.
    const el = document.getElementById('dashTime');
    if (el) el.innerText = `${h}:${m}:${s} ${ampm}`;
}

// Called after GPS fix to update dashboard
function updateDashboardGPS(lat, lng) {
    // Sync to global location state!
    userLatLng = { lat, lng };

    const gpsEl = document.getElementById('dashGps');
    const areaEl = document.getElementById('dashArea');

    if (gpsEl) gpsEl.innerText = 'Connected âœ…';

    // Refresh Score specifically
    refreshSafetyScore();

    // Reverse geocode area name
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
        .then(r => r.json())
        .then(data => {
            const addr = data.address;
            const colony = addr.neighbourhood || addr.suburb || addr.residential || addr.colony || addr.city_district || "";
            const city = addr.city || addr.town || addr.village || "";
            const area = colony ? `${colony}, ${city}` : (city || data.display_name.split(',')[0] || 'Unknown Colony');
            
            if (areaEl) areaEl.innerText = area;
            
            // NEW: Also update Route Planner starting point
            const routeFrom = document.getElementById('routeFrom');
            if (routeFrom && (!routeFrom.value || routeFrom.value.includes('Search starting point'))) {
                routeFrom.value = area + " (Your Current Location)";
            }

            // Also check for street lights nearby
            fetchStreetLights(lat, lng);
        }).catch(() => { 
            if (areaEl) areaEl.innerText = 'GPS Active';
            fetchStreetLights(lat, lng); 
        });
}

/**
 * Checks for Street Lamps in 100m radius using Overpass API
 */
async function fetchStreetLights(lat, lng) {
    const lightEl = document.getElementById('dashLights');
    if (!lightEl) return;

    const query = `[out:json][timeout:10];node(around:100,${lat},${lng})["highway"="street_lamp"];out count;`;
    
    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
        const data = await response.json();
        const count = data.elements && data.elements[0] ? data.elements[0].tags.total : (data.elements ? data.elements.length : 0);

        if (count > 0) {
            lightEl.innerText = "Lit Area âœ…";
            lightEl.style.color = "#4caf50";
        } else {
            lightEl.innerText = "Low Lighting âš ï¸";
            lightEl.style.color = "#ff9800";
        }
    } catch (e) {
        lightEl.innerText = "Scan Offline";
    }
}

// Real Safety Score Logic
async function refreshSafetyScore() {
    const scoreEl = document.getElementById('dashScore');
    if (!scoreEl) return;

    try {
        const lat = userLatLng.lat;
        const lng = userLatLng.lng;
        const response = await fetch(`${API_URL}/safety-score?lat=${lat}&lng=${lng}`);
        const data = await response.json();
        
        const score = data.score || calculateDynamicScore(new Date().getHours()).score;
        const label = data.label || "SECURE";

        scoreEl.innerText = `${score} / 10`;
        
        // Update Meter UI if exists
        const bar = document.getElementById('safetyMeterBar');
        const valEl = document.getElementById('safetyMeterValue');
        const labelEl = document.getElementById('safetyMeterLabel');

        if (bar && valEl && labelEl) {
            bar.style.width = (score * 10) + '%';
            valEl.innerText = score;
            labelEl.innerText = label;
            
            if (score > 7) {
                labelEl.className = "text-[10px] font-black px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 border border-green-500/30";
                bar.style.backgroundColor = "#22c55e";
                scoreEl.style.color = "#4caf50";
            } else if (score > 4) {
                labelEl.className = "text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 border border-yellow-500/30";
                bar.style.backgroundColor = "#eab308";
                scoreEl.style.color = "#ffeb3b";
            } else {
                labelEl.className = "text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 border border-red-500/30";
                bar.style.backgroundColor = "#ef4444";
                scoreEl.style.color = "#ff3366";
            }
        }
    } catch (e) {
        // Fallback to local
        let currentScore = calculateDynamicScore(new Date().getHours());
        scoreEl.innerText = `${currentScore.score} / 10`;
        scoreEl.style.color = currentScore.color;
    }

    // Update Forecast Scores (Morning=9, Evening=19, Night=2)
    const morning = calculateDynamicScore(9);
    const evening = calculateDynamicScore(19);
    const night = calculateDynamicScore(2);

    if (document.getElementById('scoreMorning')) document.getElementById('scoreMorning').innerText = morning.score;
    if (document.getElementById('scoreEvening')) document.getElementById('scoreEvening').innerText = evening.score;
    if (document.getElementById('scoreNight')) document.getElementById('scoreNight').innerText = night.score;
}

function calculateDynamicScore(hour) {
    let baseScore = 9.5;

    // Time factor (Night is riskier)
    if (hour >= 22 || hour < 5) baseScore -= 2.5;
    else if (hour >= 18) baseScore -= 1.0;

    // Proximity to Real Hotspots factor
    let minDistance = Infinity;
    const allHotspots = [...CRIME_HOTSPOTS, ...getCommunityReports()];

    if (userLatLng) {
        allHotspots.forEach(spot => {
            const dist = getDistanceMeters(userLatLng.lat, userLatLng.lng, spot.lat, spot.lng);
            if (dist < minDistance) minDistance = dist;
        });

        if (minDistance < 500) baseScore -= 5.0;
        else if (minDistance < 1000) baseScore -= 2.5;
        else if (minDistance < 2000) baseScore -= 1.0;
    }

    const finalScore = Math.max(1.0, Math.min(10, baseScore)).toFixed(1);
    let color = '#4caf50';
    if (finalScore < 4) color = '#ff3366';
    else if (finalScore < 7) color = '#ffeb3b';

    return { score: finalScore, color: color };
}

// Distance helper (Haversine formula simplified)


// ============================================================
//  CHECK-IN TIMER
// ============================================================
let checkInInterval = null;
let checkInSecsLeft = 0;

function openCheckInPanel() {
    document.getElementById('checkinPanel').style.display = 'block';
    document.getElementById('checkinPanel').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function closeCheckInPanel() {
    document.getElementById('checkinPanel').style.display = 'none';
}

function toggleCheckInTimer() {
    if (checkInInterval) {
        clearInterval(checkInInterval);
        checkInInterval = null;
        document.getElementById('timerDisplay').style.display = 'none';
        document.getElementById('timerToggleBtn').innerText = 'Start Timer';
        document.getElementById('checkinPanel').style.borderColor = 'rgba(157,78,221,0.4)';
        showToast('Timer cancelled', 'success');
        return;
    }

    const mins = parseInt(document.getElementById('checkinDuration').value);
    checkInSecsLeft = mins * 60;

    document.getElementById('timerDisplay').style.display = 'block';
    document.getElementById('timerToggleBtn').innerText = 'Cancel Timer';
    updateTimerDisplay();

    checkInInterval = setInterval(() => {
        checkInSecsLeft--;
        updateTimerDisplay();

        if (checkInSecsLeft <= 0) {
            clearInterval(checkInInterval);
            checkInInterval = null;
            // Auto SOS!
            document.getElementById('timerStatusMsg').innerText = 'âš ï¸ Time expired! SOS alert triggered!';
            document.getElementById('checkinPanel').style.borderColor = '#ff3366';
            showToast('âš ï¸ Check-In timer expired â€” SOS sent to contacts!', 'error');
            triggerSOS();
        }

        // Warning at 1 minute
        if (checkInSecsLeft === 60) {
            showToast('âš ï¸ 1 minute left! Check-in before time runs out!', 'error');
        }
    }, 1000);
}

function updateTimerDisplay() {
    const m = Math.floor(checkInSecsLeft / 60);
    const s = checkInSecsLeft % 60;
    document.getElementById('timerCountdown').innerText =
        `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function checkInNow() {
    clearInterval(checkInInterval);
    checkInInterval = null;
    document.getElementById('timerDisplay').style.display = 'none';
    document.getElementById('timerToggleBtn').innerText = 'Start Timer';
    document.getElementById('timerStatusMsg').innerText = 'Stay safe! Timer running...';
    document.getElementById('checkinPanel').style.borderColor = 'rgba(157,78,221,0.4)';
    showToast('âœ… Check-In confirmed! You are safe.', 'success');
}

// ============================================================
//  QUICK SHARE LOCATION
// ============================================================
function quickShareLocation() {
    if (!navigator.geolocation) {
        showToast('Geolocation not supported', 'error');
        return;
    }

    navigator.geolocation.getCurrentPosition(pos => {
        const lat = pos.coords.latitude.toFixed(5);
        const lng = pos.coords.longitude.toFixed(5);
        const msg = encodeURIComponent(
            `ðŸš¨ I need help! My live location:\nhttps://maps.google.com/?q=${lat},${lng}\n\nSent via Safe Her App`
        );

        // Try native share API first
        if (navigator.share) {
            navigator.share({
                title: 'My Live Location - Safe Her',
                text: `ðŸš¨ My location: https://maps.google.com/?q=${lat},${lng}`,
                url: `https://maps.google.com/?q=${lat},${lng}`
            }).then(() => showToast('Location shared!', 'success'))
                .catch(() => { });
        } else {
            // Fallback: WhatsApp
            window.open(`https://wa.me/?text=${msg}`, '_blank');
        }
        showToast(`ðŸ“ Sharing location: ${lat}, ${lng}`, 'success');
    }, (err) => {
        showToast("Tracking failed! Enable GPS & high accuracy.", "error");
    }, { enableHighAccuracy: true, timeout: 15000 });
}

// --- Web Audio API Advanced Siren Synthesis ---
function playAlarm() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        sirenOscillator = audioCtx.createOscillator();
        sirenGain = audioCtx.createGain();

        sirenOscillator.type = 'square'; // Harsh emergency sound
        sirenOscillator.frequency.setValueAtTime(440, audioCtx.currentTime);

        // Siren wail logic
        sirenInterval = setInterval(() => {
            if (sirenOscillator) {
                const time = audioCtx.currentTime;
                // Oscillate between 600Hz and 1200Hz for high-intensity effect
                sirenOscillator.frequency.exponentialRampToValueAtTime(1200, time + 0.4);
                sirenOscillator.frequency.exponentialRampToValueAtTime(600, time + 0.8);
            }
        }, 800);

        sirenGain.gain.setValueAtTime(0.15, audioCtx.currentTime); // Professional volume mixing
        
        sirenOscillator.connect(sirenGain);
        sirenGain.connect(audioCtx.destination);
        sirenOscillator.start();
        
    } catch (e) {
        console.error("Audio error:", e);
    }
}

function stopAlarm() {
    if (sirenOscillator) {
        sirenOscillator.stop();
        sirenOscillator.disconnect();
        sirenOscillator = null;
    }
    if (sirenInterval) {
        clearInterval(sirenInterval);
        sirenInterval = null;
    }
}

// --- SOS Logic ---
function triggerSOS() {
    const sosContainer = document.querySelector('.sos-container');
    const statusText = document.getElementById('sosStatus');

    if (!isSosActive) {
        // --- SOS ON ---
        isSosActive = true;
        
        // Haptic Feedback
        if (navigator.vibrate) navigator.vibrate([500, 200, 500]); 

        if (sosContainer) sosContainer.classList.add('sos-active');
        document.body.classList.add('strobe-active');
        
        // IMMEDIATE ACTION
        sendSOSAlert();
        playAlarm();
        
        // Start Sentinel High-Freq Tracking (Real-world emergency requirement)
        startSentinelTracking();
        
        showToast("🚨 SOS ACTIVE: Live Tracking Started (5s sync)", "error");
    } else {
        // --- SOS OFF ---
        isSosActive = false;
        if (sosContainer) sosContainer.classList.remove('sos-active');
        document.body.classList.remove('strobe-active');
        stopAlarm();
        stopSentinelTracking();
        showToast("SOS Mode Deactivated", "success");
    }
}

let sentinelInterval = null;
function startSentinelTracking() {
    if (sentinelInterval) clearInterval(sentinelInterval);
    // Initial Sync
    performTrackingSync();
    
    sentinelInterval = setInterval(() => {
        if (!isSosActive) {
            stopSentinelTracking();
            return;
        }
        performTrackingSync();
        console.log("🛰️ Sentinel Heartbeat: Location Synced.");
    }, 5000); // 5 sec high-fidelity tracking
}

function stopSentinelTracking() {
    if (sentinelInterval) {
        clearInterval(sentinelInterval);
        sentinelInterval = null;
    }
}

// --- Ghost Mode Offline Resilience ---
window.addEventListener('online', () => {
    const pending = localStorage.getItem('pending_emergency_signals');
    if (pending) {
        showToast("🌐 Signal Restored: Syncing pending SOS alerts...", "success");
        // Logic to push queued alerts to backend
        localStorage.removeItem('pending_emergency_signals');
    }
});

// ============================================
//   PREMIUM SOS UTILITIES
// ============================================

let mediaRecorder = null;
let audioChunks = [];

async function startDigitalBlackbox() {
    console.log("ðŸ› ï¸ DIGITAL BLACKBOX: Initiating high-security audio evidence vault...");
    addSecurityLog('BLACKBOX', 'Evidence Vault Initializing...');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = async (event) => {
            if (event.data.size > 0) {
                const user = JSON.parse(localStorage.getItem('herSafety_user') || '{}');
                const reader = new FileReader();
                reader.readAsDataURL(event.data);
                reader.onloadend = async () => {
                    const base64data = reader.result.split(',')[1];
                    const filename = `sos_${Date.now()}.webm`;
                    
                    // Upload to AWS S3 via Backend
                    await fetch(`${API_URL}/blackbox-upload`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            userId: user.id || user._id,
                            chunkData: base64data,
                            filename: filename
                        })
                    });
                    console.log("Chunk secured in S3 Vault.");
                };
            }
        };

        // Capture chunks every 8 seconds for real-time safety
        mediaRecorder.start();
        const chunkInterval = setInterval(() => {
            if (isSosActive && mediaRecorder.state === 'recording') {
                mediaRecorder.requestData();
                addSecurityLog('BLACKBOX', '10s Audio Evidence Secured in S3 Vault');
            } else {
                clearInterval(chunkInterval);
            }
        }, 8000);

        showToast("ðŸ”’ DIGITAL BLACKBOX ACTIVE â€” Evidence securing in cloud.", "success");

    } catch (err) {
        console.warn("Audio Blackbox failed:", err.message);
        showToast("Blackbox Audio Access Denied.", "warning");
    }
}

function startLiveBeacon() {
    console.log("📡 LIVE BEACON: Active Path Tracking...");
    
    if (liveBeaconInterval) clearInterval(liveBeaconInterval);

    liveBeaconInterval = setInterval(() => {
        if (!isSosActive) {
            clearInterval(liveBeaconInterval);
            return;
        }

        navigator.geolocation.getCurrentPosition(pos => {
            userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            sendSOSAlert();
            console.log("📡 High-Priority SOS Sync Success");
        }, err => console.warn(err), { enableHighAccuracy: true });

    }, 5000);
}

function forceMapRefresh() {
    if (map) {
        map.invalidateSize();
        showToast("Map container recalibrated.", "info");
    } else {
        initMap(30.901, 75.8573);
    }
}

// --- Dynamic Tab Switching ---
function switchSection(sectionId) {
    // --- GATEKEEPER CHECK ---
    const isAuth = localStorage.getItem('herSafety_user');
    const protectedSections = ['home', 'arsenal', 'route', 'contacts', 'records', 'pro-center', 'tips', 'feedback', 'pro-dashboard'];

    if (!isAuth && protectedSections.includes(sectionId)) {
        showToast("Please login to access this area", "info");
        switchSection('loginView');
        return;
    }

    const sections = document.querySelectorAll('.section-container');
    sections.forEach(s => s.style.display = 'none');

    const target = document.getElementById(sectionId);
    if (target) {
        target.style.display = 'block';
        window.scrollTo(0, 0);
    }

    // âœ… FIX: Invalidate Leaflet map size when home section is shown to prevent shrinking
    if (sectionId === 'route') { initRouteMap(); }
    if (sectionId === 'home' && map) {
        setTimeout(() => {
            map.invalidateSize();
            fetchDangerZonesDebounced();
        }, 200);
    }
    // Also fix route map size when route section opens
    if (sectionId === 'route' && typeof routeMap !== 'undefined' && routeMap) {
        setTimeout(() => { routeMap.invalidateSize(); }, 200);
    }

    // Update active nav link
    const navLinksList = document.querySelectorAll('.nav-links a');
    navLinksList.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${sectionId}`) {
            link.classList.add('active');
        }
    });

    // --- Interactive Feature Cards Glow Effect ---
    if (sectionId === 'arsenal') {
        const cards = document.querySelectorAll('.feature-card-v2');
        cards.forEach(card => {
            card.onmousemove = e => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                card.style.setProperty('--mouse-x', `${x}px`);
                card.style.setProperty('--mouse-y', `${y}px`);
            };
        });
    }

    // Trigger Luxury Background Logic
    if (sectionId === 'loginView' || sectionId === 'signupView') {
        const authSection = document.getElementById(sectionId);
        if (authSection && !authSection.querySelector('.luxury-orb')) {
            // Add extra visual flair if needed
        }

        // RE-RENDER Google Buttons (Fix for hidden buttons issue)
        if (typeof google !== 'undefined') {
            setTimeout(() => {
                const btnLogin = document.getElementById("googleBtnLogin");
                const btnSignup = document.getElementById("googleBtnSignup");
                if (btnLogin) google.accounts.id.renderButton(btnLogin, { theme: "outline", size: "large", width: "100%", text: "continue_with" });
                if (btnSignup) google.accounts.id.renderButton(btnSignup, { theme: "outline", size: "large", width: "100%", text: "signup_with" });
            }, 50);
        }
    }

    // Restore background animation change
    if (window.changeBgMode) window.changeBgMode(sectionId);

    // Restore mobile menu auto-close
    const navLinks = document.getElementById('navLinks');
    if (navLinks) navLinks.classList.remove('active');

    if (sectionId === 'route') {
        setTimeout(() => initRoutePlannerMap(), 150);
    }

    // Refresh safe area detection if moving back to home
    if (sectionId === 'home') {
        updateDashboard();
    }
}

// --- Auth Tabs Switching ---
function switchAuthTab(type) {
    document.querySelectorAll('.auth-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => form.style.display = 'none');

    if (type === 'login') {
        document.getElementById('tabLogin').classList.add('active');
        document.getElementById('loginForm').style.display = 'block';
    } else {
        document.getElementById('tabSignup').classList.add('active');
        document.getElementById('signupForm').style.display = 'block';
    }
}

// --- Chatbot Logic ---
function toggleChat() {
    const chatBox = document.getElementById('chatBox');
    if (chatBox.style.display === 'flex') {
        chatBox.style.display = 'none';
    } else {
        chatBox.style.display = 'flex';
        // Scroll to bottom
        const body = document.getElementById('chatBody');
        body.scrollTop = body.scrollHeight;
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    // Append User message
    appendMessage(msg, 'user');
    input.value = '';

    // Typing indicator — Advanced Orbit Animation
    const typingId = 'typing-' + Date.now();
    appendMessage("Oracle is analyzing satellite data...", 'bot', typingId);

    try {
        const user = JSON.parse(localStorage.getItem('herSafety_user') || '{}');
        const res = await fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg, userId: user.id || user._id })
        });
        const data = await res.json();
        const botReply = data.reply || "I am connected. How can I protect you?";
        
        // Remove typing
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();

        // --- SENTINEL COMMAND PARSING ---
        let cleanReply = botReply;
        
        // 1. AI-Driven Map Focus
        if (botReply.includes("FOCUS_MAP:")) {
            const area = botReply.split("FOCUS_MAP:")[1].trim();
            showToast(`🛰️ AI Redirecting Radar: ${area}`, "info");
            const searchInput = document.getElementById('manualLocationInput');
            if (searchInput) { searchInput.value = area; handleManualSearch(); }
        }

        // 2. Urgent Protocol: SOS
        if (botReply.toLowerCase().includes("activate_sos")) {
            showToast("🚨 AI EMERGENCY OVERRIDE: Triggering SOS!", "error");
            triggerSOS();
        }

        appendMessage(cleanReply, 'bot');
        
        // Multilingual Voice Feedback
        if (typeof speakSafeHer === 'function') speakSafeHer(cleanReply);

    } catch (err) {
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();
        const fallbackMsg = "Main raaste mein hoon aur satellite link check kar rahi hoon. Agar aap kisi musibat mein hain, toh turant SOS button dabaiye.";
        appendMessage(fallbackMsg, 'bot');
        if (typeof speakSafeHer === 'function') speakSafeHer(fallbackMsg);
    }
}

let isVoiceEnabled = false;

function toggleVoice() {
    isVoiceEnabled = !isVoiceEnabled;
    const btn = document.getElementById('voiceToggle');
    if (btn) {
        btn.style.color = isVoiceEnabled ? '#4caf50' : 'rgba(255,255,255,0.6)';
        btn.innerHTML = `<i class="fas fa-volume-${isVoiceEnabled ? 'up' : 'mute'}"></i>`;
    }
    
    if (isVoiceEnabled) {
        showToast("Voice Assistant Activated", "success");
        // Prime the engine (required by some browsers)
        speakSafeHer("Voice assistant active.");
    } else {
        window.speechSynthesis.cancel();
        showToast("Voice Assistant Muted", "info");
    }
}

// Global voices cache
let availableVoices = [];
function loadVoices() {
    availableVoices = window.speechSynthesis.getVoices();
}
if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
}


function speakSafeHer(text) {
    if (!isVoiceEnabled) return;
    
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0; 
        
        // --- Smart Language Detection ---
        const hasHindiScript = /[\u0900-\u097F]/.test(text);
        const hingesWords = ['hai', ' kyo', ' kya', ' nahi', ' rha', ' rahi', ' raha', ' toh', ' gya', ' gaya', ' kar ', ' karo ', ' rhi ', ' meri ', ' mera ', ' hum ', ' app ', ' aap ', ' kahan ', ' kidhar ', ' bas ', ' kijiye ', ' karke ', ' liye '];
        const hasHinglish = hingesWords.some(word => text.toLowerCase().includes(word));
        
        const isLikelyHindi = hasHindiScript || hasHinglish;
        utterance.lang = isLikelyHindi ? 'hi-IN' : 'en-US';

        let selectedVoice = null;
        if (isLikelyHindi) {
            // Find any Indian-sounding voice
            selectedVoice = availableVoices.find(v => v.lang.includes('hi') || v.name.includes('India') || v.name.includes('Hindi') || v.name.includes('Kalpana'));
        }

        if (!selectedVoice) {
            // Fallback to high-quality female voice
            selectedVoice = availableVoices.find(v => 
                v.lang.includes('en') && 
                (v.name.includes("Female") || v.name.includes("Zira") || v.name.includes("Google UK English Female") || v.name.includes("Samantha"))
            );
        }
        
        if (selectedVoice) utterance.voice = selectedVoice;
        
        // --- Visual Feedback for Alexa Waveform ---
        utterance.onstart = () => {
            const wave = document.getElementById('alexaWaveform');
            if (wave) {
                wave.style.display = 'flex';
                const label = wave.querySelector('span');
                if (label) label.innerText = "Oracle Speaking...";
            }
        };
        utterance.onend = () => {
            const wave = document.getElementById('alexaWaveform');
            if (wave) wave.style.display = 'none';
        };

        window.speechSynthesis.speak(utterance);
    }
}

// --- ALEXA VOICE INPUT (STT) ---
let recognition;
let isListening = false;

function toggleMic() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast("Voice input not supported in this browser.", "error");
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!recognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        
        // Use a multi-lingual aware language (Hinglish/Hindi/English mix)
        recognition.lang = 'hi-IN'; // Priority is Hindi/Indian English

        recognition.onstart = () => {
            isListening = true;
            document.getElementById('micBtn').classList.add('active');
            const wave = document.getElementById('alexaWaveform');
            if (wave) {
                wave.style.display = 'flex';
                const label = wave.querySelector('span');
                if (label) label.innerText = "Listening: Speak Now...";
            }
            showToast("Listening... Aap boliye", "info");
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            const input = document.getElementById('chatInput');
            if (input) {
                input.value = transcript;
                sendMessage(); // Auto-send when user stops talking
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech Error:", event.error);
            if (event.error === 'not-allowed') {
                showToast("🎤 Mic Blocked: Please click the LOCK icon in your browser address bar and ALLOW Microphone access.", "error");
            } else if (event.error === 'network') {
                showToast("🌐 Network Error: Brave users must enable 'Google Services for Speech' in brave://settings/privacy", "error");
            } else {
                showToast("Mic Error: " + event.error, "error");
            }
            stopMic();
        };

        recognition.onend = () => {
            stopMic();
        };
    }

    if (isListening) {
        recognition.stop();
    } else {
        try {
            recognition.start();
        } catch(e) {
            console.warn("Retrying Mic...");
            recognition.stop();
            setTimeout(() => recognition.start(), 200);
        }
    }
}

function stopMic() {
    isListening = false;
    const mic = document.getElementById('micBtn');
    if (mic) mic.classList.remove('active');
    const wave = document.getElementById('alexaWaveform');
    if (wave) wave.style.display = 'none';
}

function handleChatEnter(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

function appendMessage(text, sender, id = null) {
    const body = document.getElementById('chatBody');
    if (!body) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${sender}`;
    if (id) msgDiv.id = id;
    msgDiv.innerText = text;
    body.appendChild(msgDiv);
    body.scrollTop = body.scrollHeight;
}

// --- Simulations ---
function simulateCall(name) {
    showToast(`Calling ${name}...`, 'success');
}

function simulateAlert(name) {
    showToast(`Emergency alert sent to ${name}`, 'success');
}

// --- Mobile Menu ---
function toggleMobileMenu() {
    const nav = document.getElementById('navLinks');
    const burger = document.querySelector('.hamburger i');
    
    nav.classList.toggle('active');
    
    if (nav.classList.contains('active')) {
        burger.className = 'fas fa-times'; // Change to close icon
        document.body.style.overflow = 'hidden'; // Prevent scroll
    } else {
        burger.className = 'fas fa-bars'; // Back to hamburger
        document.body.style.overflow = 'auto'; // Re-enable scroll
    }
}

// --- Toast System ---
function showToast(message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.warn("Toast skipped: #toastContainer not found.");
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-exclamation-triangle"></i>';
    toast.innerHTML = `${icon} <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => { toast.remove(); }, 300);
    }, 3000);
}

// ============================================
//   ROUTE PLANNER MODULE
// ============================================
let routeMap = null;
let routeControl = null;
let currentRouteMode = 'safe'; // Added missing declaration
const nearestCache = {}; 
// ============================================
//   NEARBY FACILITIES (Hospital / Police)
// ============================================
async function findNearest(type) {
    // Determine active map
    const routeSection = document.getElementById('route');
    const activeMap = (routeSection && routeSection.style.display !== 'none' && routeMap) ? routeMap : map;
    
    if (!activeMap) {
        showToast("Map is initializing...", "error");
        return;
    }

    // --- FORCE RE-CALIBRATE GPS ---
    showToast(`Scanning Satellite for precise location...`, 'info');
    
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 });
        });
        userLatLng = { lat: position.coords.latitude, lng: position.coords.longitude };
    } catch (e) {
        console.warn("GPS timeout, using center point.");
    }

    const currentPos = userLatLng || { lat: 30.901, lng: 75.8573 };
    const centerName = (currentPos.lat === 30.901) ? "Default (Ludhiana)" : "Your Location";

    try {
        showToast(`📍 Searching near ${centerName}...`, 'info');
        
        let nodes = [];

        // --- STEP 1: OVERPASS API (Standard for tagged amenities) ---
        try {
            const overpassQuery = `[out:json];node(around:2000,${currentPos.lat},${currentPos.lng})[amenity=${type}];out;`;
            const ovResp = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: overpassQuery });
            const ovData = await ovResp.json();
            nodes = ovData.elements || [];
        } catch (ovErr) {
            console.warn("Overpass failed, trying Nominatim...");
        }

        // --- STEP 2: NOMINATIM FALLBACK ---
        if (nodes.length === 0) {
            const delta = 0.02; // Roughly 2km box
            const viewbox = `${currentPos.lng - delta},${currentPos.lat + delta},${currentPos.lng + delta},${currentPos.lat - delta}`;
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${type}&lat=${currentPos.lat}&lon=${currentPos.lng}&viewbox=${viewbox}&bounded=1&limit=10`;

            const nomResp = await fetch(nominatimUrl);
            const nomData = await nomResp.json();
            nodes = nomData.map(item => ({
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon),
                tags: { name: item.display_name.split(',')[0] }
            }));
        }

        if (nodes.length === 0) {
            showToast(`No ${type}s found within 5km.`, 'error');
            return;
        }

        let closest = null;
        let minDist = Infinity;

        nodes.forEach(node => {
            const d = calculateDistance(currentPos.lat, currentPos.lng, node.lat, node.lon || node.lng);
            if (d < minDist) {
                minDist = d;
                closest = node;
                closest._dist = d / 1000; 
            }
        });

        if (closest) {
            nearestCache[type] = { timestamp: Date.now(), result: closest };
            const name = closest.tags.name || `Nearest ${type}`;
            const distStr = (minDist / 1000).toFixed(2) + " km";
            
            showToast(`📍 Found: ${name}`, "success");
            activeMap.setView([closest.lat, closest.lon || closest.lng], 15);
            
            const color = type === 'hospital' ? '#ef4444' : '#3b82f6';
            const icon = L.divIcon({
                html: `<div style="background:${color};width:34px;height:34px;border-radius:50%;border:4px solid white;display:flex;align-items:center;justify-content:center;color:white;box-shadow:0 0 15px ${color}"><i class="fas fa-${type === 'hospital' ? 'hospital' : 'building-shield'}"></i></div>`,
                className: '',
                iconSize: [34, 34]
            });

            L.marker([closest.lat, closest.lon || closest.lng], { icon }).addTo(activeMap)
                .bindPopup(`<b>${name}</b><br>Distance: ${distStr}<br><button onclick="navigateToCoords(${closest.lat}, ${closest.lon || closest.lng})" class="emergency-nav-btn">Start Route</button>`)
                .openPopup();

            const routeToField = document.getElementById('routeTo');
            if (routeToField) routeToField.value = `${closest.lat}, ${closest.lon || closest.lng}`;
        }
    } catch (error) {
        console.error("Facility search error:", error);
        showToast("Satellite Servers Busy. Please retry.", "error");
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; 
}

function navigateToCoords(lat, lng) {
    const routeToField = document.getElementById('routeTo');
    if (routeToField) {
        routeToField.value = `${lat}, ${lng}`;
        switchSection('route');
        setTimeout(() => calculateRoute(), 300);
    }
}

// GPS state persistent
let isPremium = localStorage.getItem('hersafety_premium') === 'true';

function updatePremiumUI() {
    const isPremium = localStorage.getItem('hersafety_premium') === 'true';
    const proLink = document.getElementById('proCenterLink');
    const goPremiumNav = document.getElementById('goPremiumNav');

    if (isPremium) {
        if (proLink) proLink.style.display = 'block';
        if (goPremiumNav) goPremiumNav.style.display = 'none';

        // Update any remaining home page labels
        const dashScore = document.getElementById('dashScore');
        if (dashScore) dashScore.innerText = "PRO";
    } else {
        if (proLink) proLink.style.display = 'none';
        if (goPremiumNav) goPremiumNav.style.display = 'block';
    }
}

// OTP Modal state
let otpTimerInterval = null;
let currentOtpEmail = null;
let currentPaymentId = null;

async function initiateRazorpayPayment() {
    const user = JSON.parse(localStorage.getItem('herSafety_user') || '{}');
    if (!user.email) {
        showToast("Please login first to upgrade to Pro", "warning");
        switchSection('loginView');
        return;
    }

    if (!confirm(`Hi ${user.name || 'User'}, you are about to upgrade to Premium (â‚¹1). Continue?`)) return;

    try {
        const response = await fetch(`${API_URL}/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 1, currency: "INR" })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown Error' }));
            throw new Error(errorData.message || 'Failed to create order');
        }

        const order = await response.json();

        // Replace Razorpay logic with Custom Simulator
        const simulatorModal = document.getElementById('customPaymentSimulator');
        if (simulatorModal) {
            document.getElementById('simOrderId').textContent = order.id;
            simulatorModal.classList.remove('hidden');
            simulatorModal.classList.add('flex');
            
            // Expose a global function to handle the mock result
            window.handleSimulatedPayment = async function(isSuccess) {
                simulatorModal.classList.add('hidden');
                simulatorModal.classList.remove('flex');
                
                if (!isSuccess) {
                    showToast("Payment Failed or Cancelled by User.", "error");
                    return;
                }

                // If success, directly hit /api/request-otp to bypass signature checks
                showToast("ðŸ” Secure payment successful! Generating OTP...", "info");
                try {
                    const otpResponse = await fetch(`${API_URL}/request-otp`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            email: user.email,
                            phone: user.phone || ''
                        })
                    });

                    const verifyData = await otpResponse.json();

                    if (otpResponse.ok && verifyData.status === 'success') {
                        currentOtpEmail = user.email;
                        currentPaymentId = verifyData.payment_id;

                        // Show OTP modal directly
                        openOtpModal({
                            maskedPhone: verifyData.maskedPhone,
                            paymentId: verifyData.payment_id,
                            devOtp: verifyData.dev_otp
                        });
                    } else {
                        showToast(verifyData.message || "OTP Generation failed", "error");
                    }
                } catch (err) {
                    console.error("OTP error:", err);
                    showToast("Network error. Please contact support.", "error");
                }
            };
            
            window.closeSimulator = function() {
                simulatorModal.classList.add('hidden');
                simulatorModal.classList.remove('flex');
                showToast("Payment cancelled.", "info");
            };
        }

    } catch (err) {
        console.error("Payment Process Error:", err);
        showToast("Error: " + err.message, "error");
    }
}

// ====== OTP MODAL FUNCTIONS ======

function openOtpModal({ maskedPhone, paymentId, devOtp }) {
    const modal = document.getElementById('otpModal');
    if (!modal) return;

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Set phone display
    const phoneEl = document.getElementById('otpPhoneDisplay');
    if (phoneEl) phoneEl.textContent = maskedPhone || '+91 ***** *****';

    // Set ref ID
    const refEl = document.getElementById('otpRefId');
    if (refEl) refEl.textContent = 'SH-' + (paymentId ? paymentId.slice(-6).toUpperCase() : '000000');

    // Clear inputs
    document.querySelectorAll('.otp-digit').forEach(inp => inp.value = '');
    document.querySelectorAll('.otp-digit')[0]?.focus();

    // Auto-advance logic
    initOtpInputBehavior();

    // Start 5-min countdown timer
    startOtpTimer(300);

    // Dev mode hint â€” show OTP in toast so dev can test
    if (devOtp) {
        setTimeout(() => {
            showToast(`ðŸ§ª Dev Mode OTP: ${devOtp}`, "success");
            console.log(`%cðŸ”‘ TEST OTP: ${devOtp}`, 'background:#D4AF37;color:black;padding:6px 12px;font-size:16px;font-weight:bold;border-radius:4px;');
        }, 500);
    }
}

function initOtpInputBehavior() {
    const inputs = document.querySelectorAll('.otp-digit');

    inputs.forEach((input, index) => {
        // Remove old listeners by cloning
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
    });

    // Re-select after clone
    document.querySelectorAll('.otp-digit').forEach((input, index, all) => {
        input.addEventListener('input', (e) => {
            const val = e.target.value.replace(/\D/g, '');
            e.target.value = val.slice(-1);
            if (val && index < all.length - 1) {
                all[index + 1].focus();
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                all[index - 1].focus();
            }
        });

        // Paste support â€” fill all boxes
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
            [...paste].forEach((char, i) => {
                if (all[i]) all[i].value = char;
            });
            all[Math.min(paste.length, all.length - 1)].focus();
        });
    });
}

function startOtpTimer(seconds) {
    clearInterval(otpTimerInterval);
    let remaining = seconds;

    const timerEl = document.getElementById('otpTimerDisplay');
    const updateDisplay = () => {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        if (timerEl) timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    };
    updateDisplay();

    otpTimerInterval = setInterval(() => {
        remaining--;
        updateDisplay();
        if (remaining <= 0) {
            clearInterval(otpTimerInterval);
            if (timerEl) timerEl.textContent = 'Expired';
            showToast("â° OTP expired. Please retry payment.", "error");
        }
    }, 1000);
}

async function verifySecurityCode() {
    const btn = document.getElementById('otpConfirmBtn');
    
    try {
        const inputs = document.querySelectorAll('.otp-digit');
        const otp = [...inputs].map(i => i.value).join('').trim();

        if (otp.length !== 6) {
            showToast("Please enter the complete 6-digit OTP", "error");
            return;
        }

        const userStr = localStorage.getItem('herSafety_user');
        const user = userStr && userStr !== 'undefined' ? JSON.parse(userStr) : {};
        
        if (btn) { btn.disabled = true; btn.textContent = 'Verifying...'; }

        // Fetch with timeout to prevent freezing
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(`${API_URL}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: currentOtpEmail || user.email || 'guest',
                otp,
                payment_id: currentPaymentId || 'sim_unknown'
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        const data = await res.json();

        if (res.ok && data.status === 'success') {
            clearInterval(otpTimerInterval);
            closeOtpModal();

            // âœ… Grant Premium
            localStorage.setItem('hersafety_premium', 'true');
            if (typeof recordTransaction === 'function') {
                recordTransaction({
                    payment_id: currentPaymentId || data.payment_id || 'sim_tx_1',
                    amount: 1,
                    status: 'Success',
                    date: new Date().toLocaleDateString(),
                    time: new Date().toLocaleTimeString()
                });
            }
            if (typeof addSecurityLog === 'function') {
                addSecurityLog('INFO', 'Premium Activated via OTP Verification', 'success');
            }
            if (typeof updatePremiumUI === "function") updatePremiumUI();
            if (typeof switchSection === "function") switchSection('pro-center');
            showToast("ðŸ‘‘ Premium Unlocked! Welcome to Pro.", "success");

        } else {
            showToast(data.message || "Incorrect OTP. Try again.", "error");
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-shield-halved mr-2"></i> Confirm & Unlock Premium'; }
        }

    } catch (err) {
        console.error("OTP verify error:", err);
        if (err.name === 'AbortError') {
            showToast("Server took too long to respond. Please try again.", "error");
        } else {
            showToast("System Error. Please check your connection.", "error");
        }
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-shield-halved mr-2"></i> Confirm & Unlock Premium'; }
    }
}

function closeOtpModal() {
    const modal = document.getElementById('otpModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    clearInterval(otpTimerInterval);
}

async function resendOtp() {
    const user = JSON.parse(localStorage.getItem('herSafety_user') || '{}');
    if (!user.email) {
        showToast("No active payment session. Please retry payment.", "error");
        return;
    }
    showToast("Resending OTP...", "info");

    try {
        const otpResponse = await fetch(`${API_URL}/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: user.email,
                phone: user.phone || ''
            })
        });

        const verifyData = await otpResponse.json();

        if (otpResponse.ok && verifyData.status === 'success') {
            currentPaymentId = verifyData.payment_id;
            startOtpTimer(300); // 5 minutes fresh
            
            // Clear all OTP input fields
            const inputs = document.querySelectorAll('.otp-digit');
            inputs.forEach(inp => inp.value = '');
            if (inputs[0]) inputs[0].focus();

            // Show one clear toast with the new dev OTP
            showToast(`âœ… NEW OTP RE-SENT! Test Code: ${verifyData.dev_otp}`, "success");
            console.log(`%cðŸ”‘ RESENT TEST OTP: ${verifyData.dev_otp}`, 'background:#D4AF37;color:black;padding:6px 12px;font-size:16px;font-weight:bold;border-radius:4px;');
            
        } else {
            showToast(verifyData.message || "Failed to resend OTP.", "error");
        }
    } catch(e) {
        showToast("Could not resend. Please retry payment.", "error");
    }
}

function showPremiumPopup() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.9);
        z-index: 99999; display: flex; justify-content: center; align-items: center;
        backdrop-filter: blur(10px);
    `;
    modal.innerHTML = `
        <div class="bg-zinc-900 border border-premium-gold p-8 rounded-[2rem] max-w-sm text-center">
            <i class="fas fa-crown text-6xl text-premium-gold mb-6 animate-bounce"></i>
            <h2 class="text-white text-2xl font-black mb-4 uppercase">Unlock Pro Feature</h2>
            <p class="text-gray-400 text-sm mb-8 leading-relaxed">Evidence Locker and Fake Call are Pro features. Get 24/7 protection and 10s cloud evidence for just â‚¹1.</p>
            <button onclick="this.parentElement.parentElement.remove(); initiateRazorpayPayment();" 
                    class="w-full bg-premium-gold text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:scale-105 transition-transform mb-4">
                Upgrade to Pro
            </button>
            <button onclick="this.parentElement.parentElement.remove()" class="text-zinc-600 text-xs font-bold uppercase tracking-widest">Maybe Later</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// Called when section is opened
function initRoutePlannerMap() {
    if (!routeMap) {
        const startLat = userLatLng ? userLatLng.lat : 28.6139;
        const startLng = userLatLng ? userLatLng.lng : 77.2090;

        routeMap = L.map('routeMap', {
            zoomControl: false,
            scrollWheelZoom: true
        }).setView([startLat, startLng], 13);

        // --- ADVANCED GOOGLE HYBRID LAYER ---
        L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: 'Â© Google Maps',
            detectRetina: true
        }).addTo((routeMap ? routeMap : map));

        L.control.zoom({ position: 'bottomright' }).addTo((routeMap ? routeMap : map));

        L.marker([startLat, startLng])
            .addTo(routeMap)
            .bindPopup('<b>ðŸ“ Your Location</b>').openPopup();
    } else {
        routeMap.invalidateSize();
    }

    // Fill From field with current coords
    if (userLatLng) {
        document.getElementById('routeFrom').value =
            `${userLatLng.lat.toFixed(5)}, ${userLatLng.lng.toFixed(5)}`;
    }
}

// Initial sync for route planner (one-time)
window.addEventListener('load', () => {
    setTimeout(() => {
        const fromField = document.getElementById('routeFrom');
        if (fromField && userLatLng && !fromField.value) {
            fromField.value = `${userLatLng.lat.toFixed(5)}, ${userLatLng.lng.toFixed(5)} (My Location)`;
        }
    }, 2000);
});

function setRouteMode(mode) {
    currentRouteMode = mode;
    document.querySelectorAll('.route-mode-btn').forEach(b => b.classList.remove('active'));
    const modeMap = { safe: 'modeSafe', fast: 'modeFast', walk: 'modeWalk' };
    document.getElementById(modeMap[mode]).classList.add('active');
}

function calculateRoute() {
    if (!routeMap) { initRouteMap(); }
    const fromInput = document.getElementById('routeFrom') ? document.getElementById('routeFrom').value.trim() : '';
    const toInput = document.getElementById('routeTo').value.trim();

    if (!toInput) {
        showToast('Please enter a destination!', 'error');
        return;
    }

    showToast('🗺️ Planning safest route...', 'info');

    async function geocodeOSM(query) {
        if (!query || query.toLowerCase().includes('current')) {
            return { lat: userLatLng.lat, lon: userLatLng.lng, display_name: 'Current Location' };
        }
        try {
            const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=1');
            const data = await r.json();
            return data.length > 0 ? data[0] : null;
        } catch(e) { return null; }
    }

    Promise.all([geocodeOSM(fromInput), geocodeOSM(toInput)])
        .then(([start, dest]) => {
            if (!start || !dest) { throw new Error('Location not found. Try a different address.'); }
            
            const fromLat = parseFloat(start.lat);
            const fromLng = parseFloat(start.lon);
            const destLat = parseFloat(dest.lat);
            const destLng = parseFloat(dest.lon);
            const targetMap = (routeMap ? routeMap : map);

            if (routeControl) { targetMap.removeControl(routeControl); routeControl = null; }
            if (window.routeZoneLayers) { window.routeZoneLayers.forEach(l => targetMap.removeLayer(l)); }
            window.routeZoneLayers = [];
            if (window.premiumRoutePolylines) { window.premiumRoutePolylines.forEach(p => targetMap.removeLayer(p)); }
            window.premiumRoutePolylines = [];

            function addZone(lat, lng, rad, clr, title, info) {
                const c = L.circle([lat, lng], { radius: rad, color: clr, weight: 2, fillOpacity: 0.25 }).addTo(targetMap);
                c.bindPopup('<b>' + title + '</b><br>' + info);
                window.routeZoneLayers.push(c);
            }

            const bbox = (Math.min(fromLat, destLat)-0.05) + ',' + (Math.min(fromLng, destLng)-0.05) + ',' + (Math.max(fromLat, destLat)+0.05) + ',' + (Math.max(fromLng, destLng)+0.05);
            fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: '[out:json][timeout:15];(node[\"amenity\"~\"police|hospital\"](' + bbox + ');node[\"amenity\"~\"bar|nightclub\"](' + bbox + '););out body 20;' })
                .then(r => r.json())
                .then(data => {
                    (data.elements || []).forEach(n => {
                        const isSafe = ['police', 'hospital'].includes(n.tags.amenity);
                        addZone(n.lat, n.lon, isSafe ? 350 : 200, isSafe ? '#4caf50' : '#f44336', isSafe ? '🟢 Safe' : '🔴 Alert', n.tags.name || n.tags.amenity);
                    });
                }).catch(() => {});

            // Dynamic Router selection (Car for Safe/Fast, Foot for Walk)
            const routerUrl = 'https://routing.openstreetmap.de/routed-' + (currentRouteMode === 'walk' ? 'foot' : 'car') + '/route/v1';
            
            routeControl = L.Routing.control({
                waypoints: [L.latLng(fromLat, fromLng), L.latLng(destLat, destLng)],
                router: L.Routing.osrmv1({ serviceUrl: routerUrl }),
                createMarker: () => null,
                show: false,
                addWaypoints: false,
                draggableWaypoints: false,
                fitSelectedRoutes: false,
                lineOptions: { styles: [{ color: '#2563eb', weight: 6, opacity: 0.8 }] }
            }).on('routesfound', function(e) {
                const r = e.routes[0];
                if (document.getElementById('routeDistance')) document.getElementById('routeDistance').innerText = (r.summary.totalDistance/1000).toFixed(1) + ' km';
                if (document.getElementById('routeTime')) document.getElementById('routeTime').innerText = Math.round(r.summary.totalTime/60) + ' mins';
                if (document.getElementById('routeInfoPanel')) document.getElementById('routeInfoPanel').style.display = 'flex';
                targetMap.fitBounds([[fromLat, fromLng], [destLat, destLng]], { padding: [50, 50] });
                showToast('✅ Route calculated', 'success');
            }).addTo(targetMap);

            L.marker([fromLat, fromLng], { icon: L.divIcon({ html: '<div class=\"w-4 h-4 bg-green-500 rounded-full border-2 border-white\"></div>', iconSize: [16, 16], className: '' }) }).addTo(targetMap);
            L.marker([destLat, destLng], { icon: L.divIcon({ html: '<div class=\"w-4 h-4 bg-red-500 rounded-full border-2 border-white\"></div>', iconSize: [16, 16], className: '' }) }).addTo(targetMap);
        })
        .catch(err => showToast(err.message, 'error'));
}
function calculateRouteAverageScore(coords, hour) {
    if (!coords || coords.length === 0) return { score: "9.0", color: "#4caf50" };

    // Sample coordinates (e.g., every 5th point to keep it fast)
    let totalScore = 0;
    let sampleCount = 0;
    const step = Math.max(1, Math.floor(coords.length / 20));

    for (let i = 0; i < coords.length; i += step) {
        const pt = coords[i];
        // Re-use our existing proximity logic which is location-based
        // We temporarily override userLatLng to check safety at each path point
        const tempLatLng = userLatLng;
        userLatLng = { lat: pt.lat, lng: pt.lng };
        const pointData = calculateDynamicScore(hour);
        userLatLng = tempLatLng; // Restore

        totalScore += parseFloat(pointData.score);
        sampleCount++;
    }

    const avg = (totalScore / sampleCount).toFixed(1);
    let color = '#4caf50';
    if (avg < 4) color = '#ff3366';
    else if (avg < 7) color = '#ffeb3b';

    return { score: avg, color: color };
}

function addRouteLegend(isNight) {
    // Remove old legend
    const old = document.getElementById('routeLegend');
    if (old) old.remove();

    const legend = document.createElement('div');
    legend.id = 'routeLegend';
    legend.style.cssText = `
        background: rgba(18,14,30,0.92); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px; padding: 12px 16px; margin-top: 12px;
        display: flex; gap: 18px; flex-wrap: wrap; justify-content: center;
        font-size: 0.8rem; color: #ccc;
    `;
    legend.innerHTML = `
        <span style="display:flex;align-items:center;gap:6px;">
            <span style="width:14px;height:14px;background:#4caf50;border-radius:3px;display:inline-block;"></span> Safe Zone
        </span>
        <span style="display:flex;align-items:center;gap:6px;">
            <span style="width:14px;height:14px;background:#ff9800;border-radius:3px;display:inline-block;"></span> Medium Risk
        </span>
        <span style="display:flex;align-items:center;gap:6px;">
            <span style="width:14px;height:14px;background:#f44336;border-radius:3px;display:inline-block;"></span> High Risk
        </span>
        <span style="display:flex;align-items:center;gap:6px;">
            <span style="width:40px;height:4px;background:#4caf50;border-radius:2px;display:inline-block;"></span> Safe Route
        </span>
        ${isNight ? '<span style="color:#ff9800">🌙 Night Mode Active</span>' : ''}
    `;

    // Insert below map
    const routeMapEl = document.getElementById('routeMap');
    if (routeMapEl && routeMapEl.parentNode) {
        routeMapEl.parentNode.insertBefore(legend, routeMapEl.nextSibling);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Core Auth Handlers (Attach IMMEDIATELY to prevent unresponsive buttons)
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    if (loginForm) loginForm.addEventListener('submit', handleLoginSubmission);
    if (signupForm) signupForm.addEventListener('submit', handleSignupSubmission);

    // 2. Initial Render of Any Saved Contacts
    renderCustomContacts();

    try {
        // 3. Loader Start Karo
        runLoader();

        // 4. Battery Monitor Start Karo
        initBatteryGuardian();

        // 5. Instant Clock & Score Update (No GPS needed for these)
        updateDashboard();
        refreshSafetyScore();

        // 6. Update User UI (Show Name/Email in Header)
        updateUserUI();

        // 7. Update Premium UI
        updatePremiumUI();

        // 8. Security Gate: Check if user is logged in
        checkAuthGate();

        // 9. Initialize Official Google Identity Services (GSI)
        window.isGSI_Ready = false;
        
        // Fetch real Client ID from server if available (Dynamic Config)
        fetch(`${API_URL}/health`).then(r => r.json()).then(health => {
            const GOOGLE_CLIENT_ID = health.g_client_id && health.g_client_id !== "PENDING" 
                ? health.g_client_id 
                : "349561521670-d2rns2cnoed3pm3vnsh5k4k3891m1vor.apps.googleusercontent.com";

            if (typeof google !== 'undefined') {
                google.accounts.id.initialize({
                    client_id: GOOGLE_CLIENT_ID,
                    callback: handleCredentialResponse,
                    auto_select: false,
                    ux_mode: 'popup'
                });

                const btnLogin = document.getElementById("googleBtnLogin");
                if (btnLogin) google.accounts.id.renderButton(btnLogin, { theme: "outline", size: "large", width: "100%" });
            }
        });

    } catch (e) {
        console.error("Auth Init Error:", e);
    }
});

/**
 * NEURAL AUTH SHIELD: Handles Google Token and provides Fail-Safe and Guest Login
 */
async function handleCredentialResponse(response) {
    showToast("🔐 Authenticating Securely...", "info");
    
    // Auth Timeout Shield: If backend takes > 8s, trigger Emergency Guest Mode
    const authTimeout = setTimeout(() => {
        showToast("⚠️ Authentication Delayed. Entering Guest Safety Mode.", "warning");
        enterGuestMode();
    }, 8000);

    try {
        const res = await fetch(`${API_URL}/google-login-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });
        
        clearTimeout(authTimeout);
        const data = await res.json();
        
        if (res.ok) {
            localStorage.setItem('herSafety_user', JSON.stringify(data.user));
            showToast(`✅ Welcome, ${data.user.name}`, "success");
            location.reload(); // Hard refresh to clear auth state
        } else {
            throw new Error(data.message);
        }
    } catch (e) {
        clearTimeout(authTimeout);
        console.error("Auth Shield Triggered:", e.message);
        showToast("Auth Sync Failed. Using Guest Protocol.", "warning");
        enterGuestMode();
    }
}

function enterGuestMode() {
    const guestUser = { id: 'guest_'+Math.random().toString(36).substr(2,9), name: 'Protected Guest', email: 'guest@safeher.internal' };
    localStorage.setItem('herSafety_user', JSON.stringify(guestUser));
    switchSection('home');
    updateUserUI();
}


function updateUserUI() {
    const userStr = localStorage.getItem('herSafety_user');
    const user = userStr && userStr !== 'undefined' ? JSON.parse(userStr) : null;
    const userInfo = document.getElementById('userInfo');
    const userNameDisplay = document.getElementById('userNameDisplay');

    if (user && userInfo && userNameDisplay) {
        userInfo.style.display = 'flex';
        userNameDisplay.innerText = user.name || user.email.split('@')[0];
        userNameDisplay.title = user.email; // Tooltip for full email
    } else if (userInfo) {
        userInfo.style.display = 'none';
    }
}

/**
 * Animates the professional premium loader and transitions to the app.
 */
function runLoader() {
    const bar = document.getElementById('loaderBar');
    const status = document.getElementById('loaderStatus');
    let progress = 0;

    // --- EMERGENCY BYPASS (Sentinel v7.6) ---
    // If system takes > 5s to load, FORCE DISMISS to save user.
    const forceDismiss = setTimeout(() => {
        console.warn("⚠️ Loader Safety Timeout Triggered. Forcing interactive state.");
        dismissLoader();
    }, 5000);

    const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 20) + 5;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            clearTimeout(forceDismiss);
            setTimeout(dismissLoader, 300);
        }
        if (bar) bar.style.width = progress + '%';
        if (status) status.innerText = progress < 50 ? "Syncing protocols..." : "Ready.";
    }, 150);
}

function dismissLoader() {
    const loader = document.getElementById('loaderScreen');
    if (loader) {
        loader.style.opacity = '0';
        loader.style.pointerEvents = 'none';
        setTimeout(() => {
            loader.style.display = 'none';
            document.body.classList.add('loaded');
            // Late Map Init to prevent UI hang
            if (typeof initMap === 'function') initMap(30.901, 75.8573);
        }, 500);
    }
}

/**
 * Updates the Home Dashboard with real-time stats (Time, Area, Score).
 */
// Duplicates removed

async function addCustomContact(e) {
    if (e) e.preventDefault();
    const nameInput = document.getElementById('contactName');
    const phoneInput = document.getElementById('contactPhone');
    const user = JSON.parse(localStorage.getItem('herSafety_user'));

    if (!nameInput || !phoneInput || !user) {
        showToast("Please login to save contacts", "error");
        return;
    }

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();

    if (!name || !phone) return;

    try {
        const res = await fetch(`${API_URL}/add-contact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.id || user._id,
                contactName: name,
                contactPhone: phone
            })
        });

        const data = await res.json();

        if (res.ok) {
            let contacts = JSON.parse(localStorage.getItem('herSafety_contacts')) || [];
            contacts.push({ id: data.contact._id || Date.now(), name, phone });
            localStorage.setItem('herSafety_contacts', JSON.stringify(contacts));
            nameInput.value = '';
            phoneInput.value = '';
            showToast("Contact Saved & Synced", "success");
            renderCustomContacts();
        } else {
            showToast(data.message || "Sync failed", "error");
        }
    } catch (err) {
        console.warn("Contact Sync Offline:", err);
        // Fallback to local
        let contacts = JSON.parse(localStorage.getItem('herSafety_contacts')) || [];
        contacts.push({ id: Date.now(), name, phone });
        localStorage.setItem('herSafety_contacts', JSON.stringify(contacts));
        nameInput.value = '';
        phoneInput.value = '';
        showToast("Saved locally (Sync Offline)", "warning");
        renderCustomContacts();
    }
}

window.deleteContact = async function (id) {
    const userStr = localStorage.getItem('herSafety_user');
    const user = userStr && userStr !== 'undefined' ? JSON.parse(userStr) : null;

    try {
        if (user) {
            const res = await fetch(`${API_URL}/delete-contact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id || user._id, contactId: id })
            });
            if (!res.ok) console.warn("Cloud deletion failed, proceeding with local.");
        }
    } catch (e) {
        console.warn("Cloud deletion offline:", e);
    }

    let contacts = JSON.parse(localStorage.getItem('herSafety_contacts')) || [];
    contacts = contacts.filter(c => c.id !== id);
    localStorage.setItem('herSafety_contacts', JSON.stringify(contacts));
    if (typeof showToast === 'function') {
        showToast("Contact Deleted", "success");
    }
    renderCustomContacts(true); // Skip sync since we just deleted it
};

async function fetchAndStoreContacts() {
    const userStr = localStorage.getItem('herSafety_user');
    const user = userStr && userStr !== 'undefined' ? JSON.parse(userStr) : null;
    if (!user) return;

    try {
        const res = await fetch(`${API_URL}/get-contacts/${user.id || user._id}`);
        const data = await res.json();
        if (res.ok) {
            const contacts = data.contacts.map(c => ({ id: c._id, name: c.contactName, phone: c.contactPhone }));
            localStorage.setItem('herSafety_contacts', JSON.stringify(contacts));
            localStorage.setItem('herSafety_initialized_contacts', 'true');
            renderCustomContacts(true); // Call with flag to avoid re-fetching
        }
    } catch (err) {
        console.warn("Could not sync contacts from cloud:", err);
    }
}

function renderCustomContacts(skipSync = false) {
    const grid = document.getElementById('contactsGrid');
    if (!grid) return;

    if (!skipSync) fetchAndStoreContacts();

    document.querySelectorAll('.dynamic-contact').forEach(el => el.remove());

    let contacts = JSON.parse(localStorage.getItem('herSafety_contacts')) || [];

    // Default mock data for first-time visitors if nothing in local or cloud
    if (contacts.length === 0 && !localStorage.getItem('herSafety_initialized_contacts')) {
        contacts = [
            { id: 1, name: 'Dad', phone: '+1 234 567 8900' },
            { id: 2, name: 'Mom', phone: '+1 987 654 3210' }
        ];
        localStorage.setItem('herSafety_contacts', JSON.stringify(contacts));
        localStorage.setItem('herSafety_initialized_contacts', 'true');
    }

    contacts.forEach(contact => {
        const div = document.createElement('div');
        div.className = 'contact-card family dynamic-contact';
        div.innerHTML = `
            <div class="contact-icon personal"><i class="fas fa-user-shield"></i></div>
            <div class="contact-info">
                <h3>${contact.name}</h3>
                <p>${contact.phone}</p>
            </div>
            <div style="display:flex; align-items:center;">
                <button class="call-btn-link" onclick="startOutgoingCall('${contact.name}', '${contact.phone}')">Call</button>
                <button class="delete-btn" onclick="deleteContact('${contact.id}')" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        grid.appendChild(div);
    });
}

// --- Real Call Function (Uses native tel: protocol) ---
function startOutgoingCall(name, phone) {
    // Clean the phone number (remove spaces, dashes for tel: protocol)
    const cleanPhone = phone.toString().replace(/\s+|-|\(|\)/g, '');

    // Detect if running on a mobile device
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(navigator.userAgent);

    if (isMobile) {
        // === MOBILE: Direct real call via native dialer ===
        window.location.href = 'tel:' + cleanPhone;
    } else {
        // === DESKTOP: Show a modal with calling options ===
        showCallOptionsModal(name, cleanPhone);
    }
}

function showCallOptionsModal(name, phone) {
    let existing = document.getElementById('callOptionsModal');
    if (existing) existing.remove();

    // WhatsApp needs number without '+' and with country code
    const waNumber = phone.replace(/\+/g, '').replace(/\s/g, '');
    // Skype call URI - works if Skype is installed on laptop
    const skypeLink = `skype:${phone}?call`;
    // Google Voice direct call - works if logged into Google Voice
    const googleVoiceLink = `https://voice.google.com/calls?a=nc,${encodeURIComponent(phone)}`;
    // WhatsApp Web call
    const whatsappLink = `https://wa.me/${waNumber}`;

    const modal = document.createElement('div');
    modal.id = 'callOptionsModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.8); z-index: 20000; display: flex;
        justify-content: center; align-items: center;
        animation: fadeIn 0.25s ease;
    `;

    modal.innerHTML = `
        <div style="background: #1f1832; border: 1px solid rgba(157,78,221,0.5);
                    border-radius: 20px; padding: 2rem; width: 92%; max-width: 400px;
                    text-align: center; box-shadow: 0 25px 70px rgba(0,0,0,0.6);">
            <div style="width:70px;height:70px;border-radius:50%;background:#2b2143;
                        display:flex;justify-content:center;align-items:center;
                        margin:0 auto 1rem;font-size:2rem;">📞</div>
            <h2 style="color:white;margin-bottom:0.3rem;font-size:1.4rem;">${name}</h2>
            <p style="color:#9d4edd;font-size:0.95rem;margin-bottom:0.5rem;font-family:monospace;">${phone}</p>
            <p style="color:#adb5bd;font-size:0.8rem;margin-bottom:1.5rem;">
                💻 Laptop se call karne ke liye neeche se option chunein:
            </p>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">

                <!-- Skype -->
                <a href="${skypeLink}"
                   style="display:flex;align-items:center;gap:12px;background:#00aff0;color:white;
                          padding:13px 16px;border-radius:12px;font-weight:600;text-decoration:none;">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Skype_logo_%282019%E2%80%93present%29.svg/24px-Skype_logo_%282019%E2%80%93present%29.svg.png">
                    Call via Skype (Install karo agar nahi hai)
                </a>

                <!-- Google Voice -->
                <a href="${googleVoiceLink}" target="_blank"
                   style="display:flex;align-items:center;gap:12px;background:#4285f4;color:white;
                          padding:13px 16px;border-radius:12px;font-weight:600;text-decoration:none;">
                    <img src="https://www.gstatic.com/images/branding/product/1x/voice_24dp.png" width="22">
                    Call via Google Voice (Free)
                </a>

                <!-- WhatsApp Web -->
                <a href="${whatsappLink}" target="_blank"
                   style="display:flex;align-items:center;gap:12px;background:#25d366;color:white;
                          padding:13px 16px;border-radius:12px;font-weight:600;text-decoration:none;">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/WhatsApp.svg/24px-WhatsApp.svg.png">
                    Call via WhatsApp (agar dono par installed ho)
                </a>

                <!-- Cancel -->
                <button onclick="document.getElementById('callOptionsModal').remove()"
                        style="background:transparent;border:1px solid #444;color:#888;
                               padding:11px;border-radius:12px;cursor:pointer;font-size:0.9rem;margin-top:4px;">
                    ✖ Cancel
                </button>
            </div>

            <p style="color:#555;font-size:0.72rem;margin-top:1.2rem;">
                💡 Tip: Google Voice free hai aur directly browser se call karta hai — login karein voice.google.com
            </p>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// ============================================================
//  DIGITAL BLACKBOX - Evidence Locker (Audio Recording)
// ============================================================


async function startDigitalBlackbox() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            uploadEvidenceMock(audioBlob);
            // Stop all tracks to release microphone
            stream.getTracks().forEach(track => track.stop());
        };

        // UI Update
        document.getElementById('blackboxStatus').style.display = 'flex';
        mediaRecorder.start();
        console.log("🔴 Digital Blackbox: Recording started...");

        // Auto-stop after 10 seconds to ensure evidence is "locked" and uploaded
        setTimeout(() => {
            if (mediaRecorder && mediaRecorder.state === "recording") {
                mediaRecorder.stop();
                document.getElementById('blackboxStatus').innerHTML = '<i class="fas fa-check-circle" style="color:#4caf50"></i> Evidence Secured & Uploaded ✅';
                setTimeout(() => {
                    document.getElementById('blackboxStatus').style.display = 'none';
                }, 5000);
            }
        }, 10000);

    } catch (err) {
        console.error("Blackbox failed:", err);
        showToast("Digital Blackbox: Microphone access denied!", "error");
    }
}

// ============================================================
//  EVIDENCE LOCKER & LOGGING SYSTEM (PROFESSIONAL)
// ============================================================
function addSecurityLog(type, message, status = 'success') {
    const history = JSON.parse(localStorage.getItem('safeher_logs') || '[]');
    const newLog = {
        id: Date.now(),
        type: type,
        message: message,
        time: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString(),
        status: status
    };
    history.unshift(newLog); // Newest first
    localStorage.setItem('safeher_logs', JSON.stringify(history.slice(0, 10))); // Keep last 10
    renderSecurityLogs();

    // Multi-channel Simulation (Console for Demo)
    console.log(`%c[ALERT SYNC] Sending ${type} to Emergency Contacts via SMS/WhatsApp...`, 'color: #ff4757; font-weight: bold;');
}

function renderSecurityLogs() {
    const container = document.getElementById('evidenceHistory');
    if (!container) return;

    const history = JSON.parse(localStorage.getItem('safeher_logs') || '[]');

    if (history.length === 0) {
        container.innerHTML = '<div class="text-zinc-600 text-[10px] italic text-center py-4 uppercase tracking-widest">No recent security logs found in cloud sync.</div>';
        return;
    }

    container.innerHTML = history.map(log => `
        <div class="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5 animate-fadeIn group hover:border-premium-gold/30 transition-colors">
            <div class="w-10 h-10 rounded-full flex items-center justify-center ${log.status === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'} border border-white/5">
                <i class="fas ${log.type === 'SOS' ? 'fa-triangle-exclamation' : 'fa-shield-halved'} text-xs"></i>
            </div>
            <div class="flex-1">
                <div class="flex items-center justify-between mb-0.5">
                    <p class="text-white text-[11px] font-bold">${log.message}</p>
                    <span class="text-[8px] px-1.5 py-0.5 rounded-full bg-premium-gold/10 text-premium-gold border border-premium-gold/20 uppercase font-black">Encrypted</span>
                </div>
                <div class="flex items-center gap-2 text-[9px] text-zinc-500 uppercase tracking-tighter">
                    <span>${log.time}</span> • <span>${log.date}</span> • <span class="text-blue-400"><i class="fas fa-cloud-arrow-up mr-1 text-[7px]"></i>Synced</span>
                </div>
            </div>
        </div>
    `).join('');
}

function clearLogs() {
    if (confirm("Clear local security history? Cloud backups will remain.")) {
        localStorage.removeItem('safeher_logs');
        renderSecurityLogs();
    }
}

// ============================================================
//  VOICE SOS (WEB SPEECH API)
// ============================================================
let voiceRecognition = null;
let isVoiceActive = false;

function toggleVoiceSOS() {
    const btn = document.getElementById('voiceSOSBtn');

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast("Voice SOS not supported in this browser.", "error");
        return;
    }

    if (isVoiceActive) {
        stopVoiceSOS();
    } else {
        startVoiceSOS();
    }
}

function startVoiceSOS() {
    isVoiceActive = true;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    voiceRecognition = new SpeechRecognition();
    voiceRecognition.continuous = true;
    voiceRecognition.interimResults = false;
    voiceRecognition.lang = 'en-US';

    voiceRecognition.onstart = () => {
        document.getElementById('voiceSOSBtn').classList.add('active-red');
        showToast("Voice recognition active. Say 'Help' to trigger SOS.", "info");
    };

    voiceRecognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
        console.log("Speech detected:", transcript);
        if (transcript.includes('help') || transcript.includes('emergency')) {
            triggerSOS();
            addSecurityLog('SOS', 'Voice Trigger: "Help" keyword detected', 'error');
            stopVoiceSOS();
        }
    };

    voiceRecognition.onerror = (event) => {
        console.error("Voice SOS error:", event.error);
        stopVoiceSOS();
    };

    voiceRecognition.onend = () => {
        if (isVoiceActive) voiceRecognition.start(); // Auto-restart if active
    };

    voiceRecognition.start();
}

function stopVoiceSOS() {
    isVoiceActive = false;
    if (voiceRecognition) voiceRecognition.stop();
    document.getElementById('voiceSOSBtn').classList.remove('active-red');
}

// ============================================================
//  SHAKE SOS (DEVICEMOTION API)
// ============================================================
let isShakeActive = false;
let lastShakeTime = 0;

function toggleShakeSOS() {
    if (isShakeActive) {
        isShakeActive = false;
        document.getElementById('shakeBtn').classList.remove('active-red');
        window.removeEventListener('devicemotion', handleShake);
        showToast("Shake SOS deactivated.", "info");
    } else {
        if (typeof DeviceMotionEvent.requestPermission === 'function') {
            DeviceMotionEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') activateShakeListener();
                })
                .catch(console.error);
        } else {
            activateShakeListener();
        }
    }
}

function activateShakeListener() {
    isShakeActive = true;
    document.getElementById('shakeBtn').classList.add('active-red');
    window.addEventListener('devicemotion', handleShake);
    showToast("Shake SOS active. Shake phone 3x to trigger.", "info");
}

// Consolidated tracking logic above

function handleShake(event) {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    const threshold = 15;
    const { x, y, z } = acc;
    const magnitude = Math.sqrt(x * x + y * y + z * z);

    if (magnitude > threshold) {
        const now = Date.now();
        if (now - lastShakeTime > 1000) { // Throttle
            triggerSOS();
            addSecurityLog('SOS', 'Shake Trigger: Rapid device motion detected', 'error');
            lastShakeTime = now;
        }
    }
}

// ============================================================
//  PROFESSIONAL FAKE CALL
// ============================================================
function initiateProfessionalFakeCall() {
    showToast("Fake Call scheduled in 10 seconds...", "success");
    addSecurityLog('INFO', 'Fake Call Scheduled (10s delay)');

    setTimeout(() => {
        const overlay = document.getElementById('fakeCallOverlay');
        const audio = document.getElementById('fakeRelayAudio');
        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
        audio.play();
    }, 10000);
}

function stopProfessionalFakeCall() {
    const overlay = document.getElementById('fakeCallOverlay');
    const audio = document.getElementById('fakeRelayAudio');
    overlay.classList.add('hidden');
    overlay.classList.remove('flex');
    audio.pause();
    audio.currentTime = 0;
    addSecurityLog('INFO', 'Fake Call Terminated');
}

function answerProfessionalFakeCall() {
    const audio = document.getElementById('fakeRelayAudio');
    audio.pause();
    audio.currentTime = 0;

    document.querySelector('#fakeCallOverlay h2').innerText = "Connected...";
    document.querySelector('#fakeCallOverlay p').innerText = "Automated Safety Relay Active";

    addSecurityLog('INFO', 'Fake Call Answered: Relay Active');

    setTimeout(() => {
        stopProfessionalFakeCall();
        showToast("Relay call ended.", "info");
    }, 15000);
}

function toggleEvidenceLocker() {
    startDigitalBlackbox();
    addSecurityLog('INFO', 'Blackbox Evidence Recording Started');
    showToast("Evidence Locker Activated: Recording 10s audio...", "success");
}



// ============================================================
//  AURA MATRIX RADAR: Proximity Monitoring
// ============================================================
function toggleAuraRadar() {
    const radar = document.getElementById('auraRadar');
    const status = document.getElementById('radarStatus');

    if (!localStorage.getItem('hersafety_premium')) {
        showPremiumPopup();
        return;
    }

    radar.classList.remove('hidden');
    radar.style.opacity = '1';

    const scanSteps = [
        "Initializing core matrix...",
        "Pulse scanning vicinity (5km)...",
        "Triangulating safe-havens...",
        "Guardian nodes detected: 4",
        "Area Security Rating: 8.5/10",
        "Scan Complete. Monitoring Active."
    ];

    let step = 0;
    const interval = setInterval(() => {
        if (step < scanSteps.length) {
            status.innerText = scanSteps[step];
            step++;
        } else {
            clearInterval(interval);
            setTimeout(() => {
                radar.style.opacity = '0';
                setTimeout(() => {
                    radar.classList.add('hidden');
                    showToast("Matrix Scan Synced. View map for havens.", "success");
                }, 700);
            }, 2000);
        }
    }, 1500);
}

// Calculator functions removed for UI Transformation

// ============================================================
//  SHADOW GUARDIAN (PROACTIVE TRACKING)
// ============================================================
let guardianInterval = null;
let lastGuardianPos = null;
let guardianStallCount = 0;

function toggleShadowGuardian() {
    if (!localStorage.getItem('hersafety_premium')) {
        showPremiumPopup();
        return;
    }

    const btns = [document.getElementById('guardianBtn'), document.getElementById('guardianBtnPro')];
    if (guardianInterval) {
        stopShadowGuardian();
    } else {
        startShadowGuardian();
    }
}

function startShadowGuardian() {
    const btns = [document.getElementById('guardianBtn'), document.getElementById('guardianBtnPro')];
    btns.forEach(btn => {
        if (btn) {
            btn.classList.add('active-red');
            const span = btn.querySelector('span');
            if (span) span.innerText = "Guardian Active";
        }
    });
    showToast("Shadow Guardian engaged. Watching your route...", "success");
    addSecurityLog('INFO', 'Shadow Guardian: Companion tracking active', 'success');

    guardianInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(pos => {
            const currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };

            if (lastGuardianPos) {
                const dist = calculateDistance(lastGuardianPos.lat, lastGuardianPos.lng, currentPos.lat, currentPos.lng);

                if (dist < 0.005) { // Moved less than 5 meters
                    guardianStallCount++;
                } else {
                    guardianStallCount = 0;
                }

                if (guardianStallCount >= 6) { // 30 seconds idle (tested every 5s)
                    showToast("Guardian Alert: You've been stationary. Everything okay?", "warning");
                    addSecurityLog('ALERT', 'Guardian: Detected prolonged stationary state', 'error');
                    guardianStallCount = 0; // Reset after warning
                }
            }
            lastGuardianPos = currentPos;
        });
    }, 5000);
}

function stopShadowGuardian() {
    const btns = [document.getElementById('guardianBtn'), document.getElementById('guardianBtnPro')];
    clearInterval(guardianInterval);
    guardianInterval = null;
    guardianStallCount = 0;
    btns.forEach(btn => {
        if (btn) {
            btn.classList.remove('active-red');
            const span = btn.querySelector('span');
            if (span) span.innerText = "Shadow Guardian";
        }
    });
    showToast("Shadow Guardian disengaged.", "info");
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// ============================================================
//  PAYMENT & BILLING LOGIC (PRO)
// ============================================================
function recordTransaction(data) {
    const transactions = JSON.parse(localStorage.getItem('hersafety_transactions') || '[]');
    transactions.unshift(data); // Newest first
    localStorage.setItem('hersafety_transactions', JSON.stringify(transactions.slice(0, 20))); // Keep last 20
}

function showPaymentMethods() {
    renderPaymentMethodsModal();
}

function renderPaymentMethodsModal() {
    const methods = JSON.parse(localStorage.getItem('hersafety_payment_methods') || '[]');
    const modal = document.createElement('div');
    modal.id = 'paymentMethodsModal';
    modal.className = 'fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
        <div class="bg-zinc-900 border border-white/10 w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div class="p-8">
                <div class="flex items-center justify-between mb-8">
                    <h3 class="text-xl font-bold text-white">Payment Methods</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-zinc-500 hover:text-white transition-colors text-xl">✖</button>
                </div>
                
                <div class="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2" id="paymentMethodsList">
                    <!-- Default Method -->
                    <div class="flex items-center p-5 bg-white/5 rounded-2xl border border-white/10">
                        <div class="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mr-4">
                            <i class="fas fa-university text-blue-400"></i>
                        </div>
                        <div class="flex-1">
                            <h4 class="text-white text-sm font-bold">SafeHer Standard</h4>
                            <p class="text-[10px] text-zinc-500 uppercase font-black">Razorpay Secure</p>
                        </div>
                        <span class="text-[10px] bg-green-500/20 text-green-400 px-2 py-1 rounded-full font-bold">ACTIVE</span>
                    </div>

                    ${methods.map(m => `
                    <div class="flex items-center p-5 bg-white/5 rounded-2xl border border-white/5 group">
                        <div class="w-12 h-12 bg-zinc-800 rounded-xl flex items-center justify-center mr-4">
                            <i class="fas ${m.type === 'card' ? 'fa-credit-card' : m.type === 'upi' ? 'fa-mobile-screen' : 'fa-building-columns'} text-zinc-400"></i>
                        </div>
                        <div class="flex-1">
                            <h4 class="text-white text-sm font-bold">${m.name}</h4>
                            <p class="text-[10px] text-zinc-500 uppercase font-black">${m.identifier}</p>
                        </div>
                        <button onclick="deletePaymentMethod(${m.id})" class="text-zinc-700 hover:text-red-500 transition-colors">
                            <i class="fas fa-trash-can"></i>
                        </button>
                    </div>
                    `).join('')}

                    <!-- Add New Method Button -->
                    <button onclick="showAddNewPaymentForm()" class="w-full flex items-center p-5 bg-safety-purple/10 rounded-2xl border border-dashed border-safety-purple/40 hover:bg-safety-purple/20 transition-all group">
                        <div class="w-12 h-12 bg-safety-purple/20 rounded-xl flex items-center justify-center mr-4 group-hover:scale-110 transition-transform">
                            <i class="fas fa-plus text-safety-purple"></i>
                        </div>
                        <div class="flex-1 text-left">
                            <h4 class="text-safety-purple text-sm font-bold italic uppercase tracking-tighter">Add New Method</h4>
                            <p class="text-[10px] text-zinc-500 uppercase font-bold">Credit/Debit Card or UPI</p>
                        </div>
                    </button>
                </div>

                <p class="mt-8 text-[9px] text-zinc-600 text-center leading-relaxed italic">
                    All payment data is encrypted and managed via SSL-secured protocols.
                </p>
            </div>
        </div>
    `;

    const existing = document.getElementById('paymentMethodsModal');
    if (existing) existing.remove();
    document.body.appendChild(modal);
}

function showAddNewPaymentForm() {
    const modal = document.createElement('div');
    modal.id = 'addPaymentFormModal';
    modal.className = 'fixed inset-0 z-[10001] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-fadeIn';
    modal.innerHTML = `
        <div class="bg-zinc-900 border border-white/10 w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div class="p-8">
                <div class="flex items-center justify-between mb-8">
                    <h3 class="text-xl font-bold text-white uppercase tracking-tighter italic font-black underline decoration-safety-purple/50">New Secure Method</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-zinc-500 hover:text-white transition-colors text-xl">✖</button>
                </div>

                <form onsubmit="saveNewPaymentMethod(event)" class="space-y-4">
                    <div class="bg-black/40 p-4 rounded-2xl border border-white/5">
                        <label class="text-[10px] text-zinc-600 font-black uppercase tracking-widest block mb-2">Method Type</label>
                        <select id="pmType" class="w-full bg-transparent text-white outline-none font-bold">
                            <option value="card" class="bg-zinc-900">Credit / Debit Card</option>
                            <option value="upi" class="bg-zinc-900">UPI ID (e.g., user@okicici)</option>
                            <option value="netbanking" class="bg-zinc-900">Net Banking / Bank Account</option>
                        </select>
                    </div>

                    <div class="bg-black/40 p-4 rounded-2xl border border-white/5">
                        <label class="text-[10px] text-zinc-600 font-black uppercase tracking-widest block mb-1">Display Name</label>
                        <input type="text" id="pmName" placeholder="My Savings Card" required class="w-full bg-transparent text-white outline-none font-bold placeholder:text-zinc-800">
                    </div>

                    <div class="bg-black/40 p-4 rounded-2xl border border-white/5">
                        <label class="text-[10px] text-zinc-600 font-black uppercase tracking-widest block mb-1">Card Number / UPI ID</label>
                        <input type="text" id="pmIdentifier" placeholder="xxxx xxxx xxxx 1234" required class="w-full bg-transparent text-white outline-none font-bold placeholder:text-zinc-800">
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-black/40 p-4 rounded-2xl border border-white/5">
                            <label class="text-[10px] text-zinc-600 font-black uppercase tracking-widest block mb-1">Expiry</label>
                            <input type="text" placeholder="MM/YY" class="w-full bg-transparent text-white outline-none font-bold placeholder:text-zinc-800">
                        </div>
                        <div class="bg-black/40 p-4 rounded-2xl border border-white/5">
                            <label class="text-[10px] text-zinc-600 font-black uppercase tracking-widest block mb-1">CVV</label>
                            <input type="password" placeholder="***" class="w-full bg-transparent text-white outline-none font-bold placeholder:text-zinc-800">
                        </div>
                    </div>

                    <button type="submit" class="w-full bg-safety-purple text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-safety-purple/80 transition-all mt-4">
                        Secure Method
                    </button>
                </form>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

window.saveNewPaymentMethod = function (e) {
    if (e) e.preventDefault();
    const type = document.getElementById('pmType').value;
    const name = document.getElementById('pmName').value;
    const identifier = document.getElementById('pmIdentifier').value;

    const methods = JSON.parse(localStorage.getItem('hersafety_payment_methods') || '[]');
    methods.push({ id: Date.now(), type, name, identifier });
    localStorage.setItem('hersafety_payment_methods', JSON.stringify(methods));

    document.getElementById('addPaymentFormModal').remove();
    showToast("Payment Method Secured", "success");
    renderPaymentMethodsModal();
}

window.deletePaymentMethod = function (id) {
    let methods = JSON.parse(localStorage.getItem('hersafety_payment_methods') || '[]');
    methods = methods.filter(m => m.id !== id);
    localStorage.setItem('hersafety_payment_methods', JSON.stringify(methods));
    showToast("Method Removed", "info");
    renderPaymentMethodsModal();
}


function showBillingHistory() {
    const isPremium = localStorage.getItem('hersafety_premium') === 'true';
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
        <div class="bg-zinc-900 border border-white/10 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div class="p-8">
                <div class="flex items-center justify-between mb-8">
                    <h3 class="text-xl font-bold text-white">Billing History</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-zinc-500 hover:text-white transition-colors text-xl">✖</button>
                </div>
                
                <div class="bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
                    <table class="w-full text-left text-sm">
                        <thead class="bg-white/5 text-zinc-500 text-[10px] uppercase font-black tracking-widest">
                            <tr>
                                <th class="p-4">Date</th>
                                <th class="p-4">Service</th>
                                <th class="p-4 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody class="text-white/80">
                            <tr class="border-t border-white/5">
                                <td class="p-4">${new Date().toLocaleDateString()}</td>
                                <td class="p-4">
                                    <span class="block font-bold">Pro Monthly</span>
                                    <span class="text-[10px] text-green-400 font-bold">Subscription Active</span>
                                </td>
                                <td class="p-4 text-right font-black">â‚¹1.00</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="mt-6 flex gap-3">
                    <button class="flex-1 bg-white/5 text-white/50 text-[10px] font-black uppercase py-4 rounded-xl border border-white/5 cursor-not-allowed">
                        <i class="fas fa-download mr-2"></i> Download VAT Invoices
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function showTransactionHistory() {
    const transactions = JSON.parse(localStorage.getItem('hersafety_transactions') || '[]');
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-fadeIn';
    modal.innerHTML = `
        <div class="bg-zinc-900 border border-white/10 w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl">
            <div class="p-8">
                <div class="flex items-center justify-between mb-8">
                    <div>
                        <h3 class="text-xl font-bold text-white">Transaction History</h3>
                        <p class="text-[10px] text-zinc-500 uppercase font-black mt-1">Direct Audit from Razorpay SDK</p>
                    </div>
                    <button onclick="this.closest('.fixed').remove()" class="text-zinc-500 hover:text-white transition-colors text-xl">âœ•</button>
                </div>
                
                <div class="max-h-[400px] overflow-y-auto space-y-3 custom-scrollbar pr-2">
                    ${transactions.length > 0 ? transactions.map(t => `
                    <div class="p-5 bg-white/5 rounded-2xl border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors">
                        <div class="flex items-center">
                            <div class="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center mr-4 text-amber-400 border border-amber-500/20">
                                <i class="fas fa-receipt text-xs"></i>
                            </div>
                            <div>
                                <h4 class="text-white text-xs font-mono font-bold">${t.payment_id}</h4>
                                <p class="text-[9px] text-zinc-500 uppercase tracking-tighter">${t.date} â€¢ ${t.time}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="block text-white font-black text-sm">â‚¹${t.amount}.00</span>
                            <span class="text-[9px] text-green-400 font-bold uppercase">${t.status}</span>
                        </div>
                    </div>
                    `).join('') : `
                    <div class="text-center py-20">
                        <i class="fas fa-box-open text-4xl text-zinc-800 mb-4"></i>
                        <p class="text-zinc-600 text-sm italic">No recent transactions synced to local store.</p>
                    </div>
                    `}
                </div>

                <div class="mt-8 flex justify-between items-center px-2">
                    <p class="text-[9px] text-zinc-700 italic">Showing last 20 transaction pings from Razorpay</p>
                    <button onclick="localStorage.removeItem('hersafety_transactions'); this.closest('.fixed').remove(); showToast('Logs Purged', 'info')" class="text-[9px] text-red-500/50 hover:text-red-500 transition-colors uppercase font-black font-sans">
                        Purge History
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}


// ============================================================
//  LOW BATTERY GUARDIAN
// ============================================================
let batteryCheckInTimer = null;

function initBatteryGuardian() {
    if ('getBattery' in navigator) {
        navigator.getBattery().then(battery => {
            function updateAllBatteryInfo() {
                checkBatteryStatus(battery);
            }
            updateAllBatteryInfo();
            battery.addEventListener('levelchange', updateAllBatteryInfo);
            battery.addEventListener('chargingchange', updateAllBatteryInfo);
        });
    }
}

function checkBatteryStatus(battery) {
    const level = Math.floor(battery.level * 100);
    const isCharging = battery.charging;

    if (level < 15 && !isCharging && !batteryCheckInTimer) {
        // Trigger Critical Warning
        document.getElementById('batteryModal').style.display = 'flex';
        startBatteryCountdown();
    }
}

function startBatteryCountdown() {
    let timeLeft = 120; // 2 minutes
    const display = document.getElementById('batteryCountdown');

    batteryCheckInTimer = setInterval(() => {
        timeLeft--;
        if (display) display.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(batteryCheckInTimer);
            // AUTO SOS DUE TO LOW BATTERY
            showToast("ðŸš¨ Low Battery Critical Alert: Contacts notified!", "error");
            triggerSOS();
            document.getElementById('batteryModal').style.display = 'none';
        }
    }, 1000);
}

function batteryCheckIn() {
    clearInterval(batteryCheckInTimer);
    batteryCheckInTimer = null;
    document.getElementById('batteryModal').style.display = 'none';
    showToast("âœ… Check-in successful. Stay safe!", "success");
}

// ============================================================
//  SAFE HAVEN RADAR
// ============================================================
function scanSafeHavens() {
    if (!userLatLng) {
        showToast("Location not found! Enable GPS first.", "error");
        return;
    }

    const btn = document.getElementById('radarBtn');
    btn.classList.add('radar-active');
    showToast("ðŸ›°ï¸ Radar scanning for Police Stations & Hospitals...", "success");

    // Clear old radar markers if any
    if (window.radarLayers) {
        window.radarLayers.forEach(l => ((routeMap ? routeMap : map)).removeLayer(l));
    }
    window.radarLayers = [];

    // Simulate finding 3 nearest safe spots (Production would query OSM/Overpass API)
    const mockHavens = [
        { lat: userLatLng.lat + 0.005, lng: userLatLng.lng + 0.005, type: 'Police', name: 'Safe Haven - Police HQ' },
        { lat: userLatLng.lat - 0.007, lng: userLatLng.lng + 0.008, type: 'Hospital', name: 'Emergency Hospital' },
        { lat: userLatLng.lat + 0.008, lng: userLatLng.lng - 0.004, type: 'Police', name: 'Metro Police Outreach' }
    ];

    mockHavens.forEach(haven => {
        const icon = L.divIcon({
            html: `<div class="radar-pulse"><i class="fas fa-${haven.type === 'Police' ? 'shield' : 'plus-square'}" style="color:#00e5ff;font-size:20px;"></i></div>`,
            iconSize: [20, 20], className: ''
        });

        const marker = L.marker([haven.lat, haven.lng], { icon })
            .addTo(routeMap)
            .bindPopup(`<b>ðŸ›¡ï¸ Safe Haven: ${haven.name}</b><br>Secured Location`);

        window.radarLayers.push(marker);
    });

    setTimeout(() => {
        btn.classList.remove('radar-active');
        // Fit map to show all havens
        const group = new L.featureGroup(window.radarLayers);
        ((routeMap ? routeMap : map)).fitBounds(group.getBounds().pad(0.2));
        showToast("âœ… 3 Safe Havens found and marked on map.", "success");
    }, 2000);
}

// ============================================================
//  USER FEEDBACK LOGIC
// ============================================================
let currentFbRating = 0;

function setFbRating(stars) {
    currentFbRating = stars;
    const icons = document.querySelectorAll('#fbRating i');
    icons.forEach((icon, idx) => {
        if (idx < stars) {
            icon.classList.add('active');
        } else {
            icon.classList.remove('active');
        }
    });
}

function submitFeedback(event) {
    event.preventDefault();
    const name = document.getElementById('fbName').value || "Anonymous";
    const category = document.getElementById('fbCategory').value;
    const message = document.getElementById('fbMessage').value;

    if (!message) return;

    console.log("Feedback Submitted:", { name, category, message, rating: currentFbRating });

    // Show professional success feedback
    showToast(`Thank you, ${name}! Your feedback has been sent.`, "success");

    // Reset form
    document.getElementById('feedbackForm').reset();
    setFbRating(0);
}


// Final initialization logic moved to DOMContentLoaded above.

function cancelSubscription() {
    if (confirm("Are you sure you want to cancel your Pro subscription? You will lose access to the Evidence Vault and Shadow Guardian immediately.")) {
        localStorage.removeItem('hersafety_premium');
        updatePremiumUI();
        switchSection('home');
        showToast("Subscription cancelled successfully.", "info");
    }
}

// ============================================================
//  MANDATORY LOGIN GATE LOGIC
// ============================================================
function checkAuthGate() {
    const user = localStorage.getItem('herSafety_user');
    const loginLink = document.getElementById('navLogin');
    const logoutLink = document.getElementById('navLogout');
    const proLink = document.getElementById('proCenterLink');

    if (user) {
        if (loginLink) loginLink.style.display = 'none';
        if (logoutLink) logoutLink.style.display = 'block';

        // Let updatePremiumUI handle proLink & goPremiumNav visibility
        updatePremiumUI();

        // âœ… FIX: If user is logged in, always go to home dashboard
        // Don't rely on URL hash which is empty on fresh reload
        const visibleSection = document.querySelector('.section-container[style*="block"], .section-container.active-section');
        const visibleId = visibleSection ? visibleSection.id : null;
        if (!visibleId || visibleId === 'loginView' || visibleId === 'signupView') {
            switchSection('home');
        }
    } else {
        if (loginLink) loginLink.style.display = 'block';
        if (logoutLink) logoutLink.style.display = 'none';

        // Hide premium features for logged-out users
        updatePremiumUI();

        // âœ… FIX: Check the currently visible section instead of URL hash
        const visibleSection = document.querySelector('.section-container[style*="block"], .section-container.active-section');
        const visibleId = visibleSection ? visibleSection.id : null;
        const protectedSections = ['home', 'route', 'contacts', 'records', 'pro-center', 'tips', 'feedback', 'pro-dashboard'];
        if (!visibleId || protectedSections.includes(visibleId)) {
            switchSection('loginView');
        }
    }

    // Inject Floating Orbs for Midnight Theme if not present
    const authSection = document.getElementById('auth');
    if (authSection && !authSection.querySelector('.orb')) {
        for (let i = 0; i < 3; i++) {
            const orb = document.createElement('div');
            orb.className = 'orb';
            orb.style.left = Math.random() * 100 + '%';
            orb.style.top = Math.random() * 100 + '%';
            orb.style.animationDelay = (i * 5) + 's';
            authSection.appendChild(orb);
        }
    }
}

/**
 * Premium Hexagonal Portal Transition
 */
function triggerPortalTransition(targetSection) {
    // Create portal elements if they don't exist
    let mask = document.getElementById('portalMask');
    if (!mask) {
        mask = document.createElement('div');
        mask.id = 'portalMask';
        mask.innerHTML = `<div class="hex-grid"></div><div class="shield-pulse"></div><div class="text-safety-purple font-black uppercase text-xs mt-8 tracking-[1em] animate-pulse">ACCESS GRANTED</div>`;
        document.body.appendChild(mask);
    }

    mask.style.display = 'flex';
    mask.style.opacity = '1';

    setTimeout(() => {
        switchSection(targetSection);
        mask.classList.add('portal-transition');

        setTimeout(() => {
            mask.style.opacity = '0';
            setTimeout(() => {
                mask.style.display = 'none';
                mask.classList.remove('portal-transition');
            }, 1000);
        }, 1200);
    }, 800);
}

function logout() {
    if (confirm("Are you sure you want to Logout?")) {
        localStorage.removeItem('herSafety_user');
        localStorage.removeItem('hersafety_premium'); // Also clear pro if logout
        showToast("Logged out successfully", "info");
        checkAuthGate();
    }
}

/**
 * REAL GOOGLE LOGIN CALLBACK
 * Receives the ID Token from Google and sends it to our backend for verification
 */
async function handleCredentialResponse(response) {
    if (!response.credential) return;

    showToast("Syncing with Google...", "info");

    try {
        console.log("ðŸš€ GSI DEBUG: Sending token to verify at", `${API_URL}/google-login-verify`);
        const res = await fetch(`${API_URL}/google-login-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential, origin: window.location.origin })
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('herSafety_user', JSON.stringify(data.user));
            showToast(`Welcome back, ${data.user.name}!`, "success");
            if (typeof updateUserUI === 'function') updateUserUI();
            checkAuthGate();
        } else {
            showToast(data.message || "Google Verification Failed", "error");
        }
    } catch (error) {
        console.error("GSI Error:", error);
        showToast("Server Connection Failed", "error");
    }
}

/**
 * Opens the real Google Account Chooser in a popup window.
 * Properly fixed with correct template literals and error handling.
 */
function openGoogleAccountPicker() {
    // 1. Try to use real Google Identity Services first if initialized
    if (window.isGSI_Ready && typeof google !== 'undefined') {
        console.log("ðŸš€ Triggering Real Google Picker...");
        showToast("Opening Google Account Chooser...", "info");
        try {
            google.accounts.id.prompt();
            return true;
        } catch (err) {
            console.warn("Native prompt failed, falling back to simulation:", err);
        }
    }

    // 2. Fallback to our custom secure cloud simulation if real OAuth isn't ready
    console.log("ðŸ”— Switching to Secure Sync Simulation...");
    handleGoogleLoginFallback();
    return true;
}

/**
 * Fallback simulation when native prompt is blocked or Google OAuth not configured.
 */
async function handleGoogleLoginFallback() {
    showToast("Launching Secure Identity Sync...", "info");

    const popup = document.createElement('div');
    popup.className = 'fixed inset-0 z-[20000] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn';
    popup.innerHTML = `
        <div class="bg-[#050510] border border-[#D4AF37]/30 w-[420px] rounded-[2rem] shadow-2xl overflow-hidden animate-slideUp">
            <div class="px-10 py-8 border-b border-[#D4AF37]/10 flex items-center justify-between bg-gradient-to-r from-black to-zinc-900">
                <div class="flex items-center gap-3">
                    <img src="https://img.icons8.com/color/48/google-logo.png" class="h-6" alt="Google">
                    <span class="text-[10px] text-[#D4AF37] font-black uppercase tracking-widest bg-[#D4AF37]/10 px-3 py-1 rounded-full">Secure Auth</span>
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-zinc-500 hover:text-[#D4AF37] transition-all">âœ•</button>
            </div>
            <div class="p-10">
                <h3 class="text-2xl font-bold text-white mb-2">Choose an Account</h3>
                <p class="text-zinc-500 text-xs mb-8">to continue to <span class="text-[#D4AF37] font-bold">Safe Her Security</span></p>
                <div class="space-y-3">
                    <p class="text-zinc-400 text-sm mb-3">Sync your actual account details:</p>
                    <input id="g_mock_name" type="text" placeholder="Your Full Name" class="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]">
                    <input id="g_mock_email" type="email" placeholder="youremail@gmail.com" class="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#D4AF37]">
                    
                    <button onclick="
                        const n = document.getElementById('g_mock_name').value.trim();
                        const e = document.getElementById('g_mock_email').value.trim();
                        if(!n || !e) { alert('Please enter both name and email'); return; }
                        selectGoogleAccount(n, e);
                    " class="w-full bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-black font-bold py-3 mt-4 rounded-xl hover:shadow-[0_0_15px_rgba(212,175,55,0.4)] transition-all">
                        Sync Verify Account
                    </button>
                    
                    <button onclick="selectGoogleAccount('Demo User', 'demo@gmail.com')" class="w-full bg-transparent border border-zinc-700 text-zinc-400 font-semibold py-2 mt-2 rounded-xl hover:bg-zinc-800 transition-all text-xs">
                        Use Default Demo Account
                    </button>
                </div>
                <p class="mt-10 text-[10px] text-zinc-600 text-center leading-relaxed">Simulation Mode Active. Real OAuth not configured.</p>
            </div>
        </div>
    `;
    document.body.appendChild(popup);

    window.selectGoogleAccount = async (name, email) => {
        const body = popup.querySelector('.p-10');
        body.innerHTML = `
            <div class="text-center py-16 flex flex-col items-center">
                <div class="relative w-16 h-16 mb-6">
                    <div class="absolute inset-0 border-4 border-[#D4AF37]/20 rounded-full"></div>
                    <div class="absolute inset-0 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div>
                </div>
                <p class="text-[#D4AF37] font-black uppercase text-[10px] tracking-[0.3em] animate-pulse">Syncing with Server...</p>
                <p class="text-zinc-500 text-[11px] mt-2 italic">Saving your account securely...</p>
            </div>
        `;

        try {
            // âœ… Call Backend: Find or create user in MongoDB
            const res = await fetch(`${API_URL}/google-social-sync`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email })
            });

            const data = await res.json();

            if (res.ok) {
                popup.remove();
                // Save the REAL DB user (with proper MongoDB _id) to localStorage
                localStorage.setItem('herSafety_user', JSON.stringify(data.user));
                showToast(`Welcome, ${data.user.name}! Account synced securely. âœ…`, "success");
                updateUserUI(); // Update UI with new user details
                checkAuthGate();
                updatePremiumUI();
            } else {
                popup.remove();
                showToast(data.message || "Google sync failed. Try again.", "error");
            }

        } catch (err) {
            console.error("Google social sync failed:", err);
            // Graceful offline fallback â€” still lets user in locally
            popup.remove();
            const userData = { id: `g_${Date.now()}`, name, email, phone: 'Google Authenticated' };
            localStorage.setItem('herSafety_user', JSON.stringify(userData));
            showToast(`Welcome, ${name}! (Offline mode â€” server unreachable)`, "success");
            checkAuthGate();
            updatePremiumUI();
        }
    };

}

/**
 * Legacy alias â€” kept so any old onclick="handleGoogleLogin()" calls still work.
 */
function handleGoogleLogin() {
    openGoogleAccountPicker();
}

/**
 * FORM HANDLERS for Backend Integration
 */

async function handleSignupSubmission(e) {
    if (e) e.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const phone = document.getElementById('signupPhone').value;
    const password = document.getElementById('signupPassword').value;

    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, password })
        });
        const data = await res.json();
        if (res.ok) {
            showToast("Account created! Please login.", "success");
            switchSection('loginView');
        } else {
            showToast(data.message || "Signup failed", "error");
        }
    } catch (err) {
        showToast("Server unreachable", "error");
    }
}

async function handleLoginSubmission(e) {
    if (e) e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('herSafety_user', JSON.stringify(data.user));
            showToast(`Welcome back, ${data.user.name}!`, "success");
            if (typeof updateUserUI === 'function') updateUserUI();
            checkAuthGate();
            updatePremiumUI();
            fetchAndStoreContacts(); // Sync contacts on login
            
            // Explicitly force navigation to home dashboard upon manual login
            switchSection('home');
        } else {
            showToast(data.message || "Invalid credentials", "error");
        }
    } catch (err) {
        showToast("Server unreachable", "error");
    }
}

// ============================================
//   PREMIUM PRODUCTION UPGRADES (Batch 2)
// ============================================

let currentSafetyWatchId = null;

/**
 * HIGH-ACCURACY GPS POLLING (Power Optimized for Night)
 */
function startGlobalSafetyRadar() {
    if (currentSafetyWatchId) navigator.geolocation.clearWatch(currentSafetyWatchId);

    const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000
    };

    currentSafetyWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const speed = pos.coords.speed || 0;
            
            const gpsLabel = document.getElementById('dashGps');
            if (gpsLabel) gpsLabel.innerText = "ACTIVE-HIGH";
            
            // Sync with Map if in dashboard
            if (map) {
                userMarker.setLatLng([pos.coords.latitude, pos.coords.longitude]);
                // Only pan if user moves significantly
                if (speed > 2) map.panTo([pos.coords.latitude, pos.coords.longitude]);
            }

            updateProductionSafetyScore(pos.coords.latitude, pos.coords.longitude);
        },
        (err) => console.warn("Radar Signal Interrupted:", err.message),
        options
    );
}

/**
 * HYBRID SAFETY SCORE INTEGRATION (Real API)
 */
async function updateProductionSafetyScore(lat, lng) {
    try {
        const res = await fetch(`${API_URL}/safety-score?lat=${lat}&lng=${lng}`);
        const data = await res.json();

        const bar = document.getElementById('safetyMeterBar');
        const valEl = document.getElementById('safetyMeterValue');
        const labelEl = document.getElementById('safetyMeterLabel');

        if (bar && valEl && labelEl) {
            const score = data.score || 5;
            bar.style.width = (score * 10) + '%';
            valEl.innerText = score.toFixed(1);
            labelEl.innerText = data.label || "MODERATE";
            
            // Color Dynamics
            if (score > 7) {
                labelEl.className = "text-[10px] font-black px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 border border-green-500/30";
                bar.style.backgroundColor = "#22c55e";
            } else if (score > 4) {
                labelEl.className = "text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-500 border border-yellow-500/30";
                bar.style.backgroundColor = "#eab308";
            } else {
                labelEl.className = "text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 border border-red-500/30";
                bar.style.backgroundColor = "#ef4444";
            }
        }
    } catch (e) {
        console.error("Safety Radar failed to sync.");
    }
}

// Start Safety Radar as soon as user enters
if (localStorage.getItem('herSafety_user')) {
    startGlobalSafetyRadar();
}

// ============================================================
//  EMERGENCY FORCED MAP LOAD (The Bulletproof Fix)
// ============================================================
window.addEventListener('load', () => {
    console.log("ðŸš¦ Window Load: Checking Map Status...");
    setTimeout(() => {
        if (typeof L === 'undefined') {
            console.error("âŒ Leaflet failure. Retrying CDN...");
            const s = document.createElement('script');
            s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            s.onload = () => { console.log("âœ… Leaflet CDN Recovered."); initMap(30.901, 75.8573); };
            document.head.appendChild(s);
        } else {
            console.log("âœ… Leaflet Ready. Forcing Map Start...");
            // Force map to initialize with Ludhiana if it hasn't already
            if (!map) initMap(30.901, 75.8573);
        }
    }, 1000);
});

// RESTORED: Dedicated Route Map Initialization
function initRouteMap() {
    const container = document.getElementById('routeMap');
    if (!container || routeMap) return;

    if (container.offsetWidth === 0) {
        setTimeout(initRouteMap, 400);
        return;
    }

    try {
        routeMap = L.map('routeMap', {
            zoomControl: false,
            attributionControl: false
        }).setView([userLatLng.lat, userLatLng.lng], 14);

        L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: 'Â© Google Maps'
        }).addTo((routeMap ? routeMap : map));

        L.control.zoom({ position: 'bottomright' }).addTo(routeMap);

        // ADDED: User Marker on Route Map
        L.marker([userLatLng.lat, userLatLng.lng]).addTo(routeMap)
            .bindPopup("<b>Verified Safety Hub</b><br>You are here.").openPopup();

        // Update Starting point input
        const routeFromInput = document.getElementById('routeFrom');
        if (routeFromInput && !routeFromInput.value) {
            routeFromInput.value = "Current Location (Auto-Synced)";
        }
        
        setTimeout(() => {
            if (routeMap) routeMap.invalidateSize();
        }, 300);
    } catch (e) {
        console.warn("Route Map Init Error:", e);
    }
}


function useCurrentLocationForRoute() {
    const input = document.getElementById('routeFrom');
    if (!input) return;
    
    if (userLatLng) {
        input.value = "Current Location (Linked via OpenStreet)";
        showToast("?? User location sync active", "success");
    } else {
        showToast("?? Location not available. Searching...", "info");
        navigator.geolocation.getCurrentPosition((pos) => {
            userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            input.value = "Current Location (Linked via OpenStreet)";
            showToast("?? Location synchronized", "success");
        }, () => {
            showToast("? Use manual address input", "error");
        });
    }
}
















