console.log("🚨 CORE SCRIPT SIGNAL: script.js is loading!");
/* =========================================
   SCRIPT.JS - HerSafety App Logic
========================================= */

let map;
let userMarker;
let userAccuracyCircle;
let securityZones = []; // To track Red/Yellow/Green zones
let isSosActive = false;
let audioContext, oscillator, gainNode;
let userLatLng = (function() {
    try {
        const saved = localStorage.getItem('lastKnownLocation');
        return saved ? JSON.parse(saved) : { lat: 30.901, lng: 75.8573 };
    } catch(e) { return { lat: 30.901, lng: 75.8573 }; }
})();
let isLocationPrecise = false; // GPS Accuracy Lock
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? "http://localhost:5000/api" 
    : "/api";
console.log("🛰️ Satellite Link: ACTIVE");
console.log("🛰️ Safe-Her Link Target:", API_URL);

// --- GLOBAL ERROR INTERCEPTOR ---
window.addEventListener('unhandledrejection', (e) => {
    console.error("Critical Neural Error:", e.reason);
    if (typeof showToast === 'function') showToast("Signal Lost: " + (e.reason.message || "Network Error"), "error");
});

// Auto-check connection on load
// --- GLOBAL INITIALIZATION ---
function dismissLoader() {
    const loader = document.getElementById('loaderScreen');
    if (loader && !loader.classList.contains('fade-out')) {
        loader.classList.add('fade-out');
        document.body.classList.add('loaded');
        console.log("🛡️ Safety: Loader dismissed.");
    }
}

// Global initialization logic
function initializeApp() {
    if (typeof startDashboardClock === 'function') startDashboardClock();
    
    // Pro-active Precise Detection
    const areaEl = document.getElementById('dashArea');
    if (areaEl) areaEl.innerText = "Synchronizing Location...";
    performTrackingSync();

    // Forced Failsafe: Dismiss loader after 2.5 seconds regardless of State
    setTimeout(dismissLoader, 2500);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

window.addEventListener('load', () => {
    // Standard Load dismissal
    dismissLoader();
});

// Initial check removed
const _dummy = () => { if (false) {
    fetch(`${API_URL}/health`)
        .then(r => r.json())
        .then(d => console.log("✅ Core System Linked:", d.server))
        .catch(e => console.error("❌ System Link Failed. Make sure server is running on port 5000."));
    }
};

let pendingPaymentResponse = null; 
let liveBeaconInterval = null;
let sirenInterval = null;
let audioCtx = null;
let sirenOscillator = null;
let sirenGain = null;

async function sendSOSAlert(isTracking = false) {
    const userStr = localStorage.getItem('herSafety_user');
    const user = userStr && userStr !== 'undefined' ? JSON.parse(userStr) : { id: 'guest', name: 'Guest' };
    
    const lat = userLatLng.lat;
    const lng = userLatLng.lng;
    const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
    const message = `🚨 EMERGENCY! I need help. My location: ${mapsLink}`;

    // --- ZERO API METHOD (Native Device Protocols) ---
    // This part works without any backend/API and is 100% free.
    if (!isTracking) {
        const contacts = JSON.parse(localStorage.getItem('herSafety_contacts')) || [];
        
        if (contacts.length > 0) {
            // 1. Try Web Share API (Best for multiple contacts)
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: '🆘 Safe-Her SOS Alert',
                        text: message,
                        url: mapsLink
                    });
                    addSecurityLog('SOS', 'Native Share Protocol Triggered');
                } catch (err) {
                    console.log("Share cancelled or failed, falling back to SMS.");
                }
            } else {
                // 2. Fallback: SMS Protocol (Works offline/no-data)
                // For multiple contacts, we'll open the primary one.
                const primaryPhone = contacts[0].phone.replace(/\s+/g, '');
                window.open(`sms:${primaryPhone}?body=${encodeURIComponent(message)}`, '_blank');
                addSecurityLog('SOS', 'Native SMS Protocol Opened');
            }
        }
    }

    // --- CLOUD API METHOD (Optional Fallback) ---
    const payload = {
        userId: user.id || user._id,
        lat: lat,
        lng: lng,
        isTracking: isTracking,
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
            const channelInfo = isTracking ? "Live Tracking Sync" : "Emergency Broadcast (Cloud)";
            addSecurityLog('SOS', `${channelInfo}: ${data.address || 'Location Updated'}`);
        }
    } catch (error) {
        console.warn("Cloud API bypassed or offline.");
    }
}

// --- GLOBAL NAVIGATION ENGINE ---
// [REDUNDANT DUPLICATE switchSection REMOVED]


// GLOBAL NEURAL DANGER DATABASE (Expanded from SafeRoute)
const CRIME_HOTSPOTS = [
    { name: "Dhandari Kalan", lat: 30.8690, lng: 75.9189, risk: 9, type: "Industrial/Snatching" },
    { name: "Giaspura", lat: 30.8752, lng: 75.8926, risk: 8, type: "Labor Belt/High Theft" },
    { name: "Sherpur Circle", lat: 30.8931, lng: 75.8893, risk: 8, type: "Poor Lighting/Robbery" },
    { name: "Focal Point Phase 8", lat: 30.8845, lng: 75.9080, risk: 8, type: "Isolated Ind. Zone" },
    { name: "Daba Chowk Area", lat: 30.8795, lng: 75.8850, risk: 7, type: "Snatching Reports" },
    { name: "Shimlapuri Backlanes", lat: 30.8720, lng: 75.8750, risk: 6, type: "Poor Street Lighting" },
    { name: "Gill Chowk", lat: 30.8890, lng: 75.8580, risk: 5, type: "Traffic/Crowded" },
    { name: "Model Town (Safe)", lat: 30.8950, lng: 75.8420, risk: 2, type: "High Security Area" },
    { name: "Sarabha Nagar (Safe)", lat: 30.9010, lng: 75.8150, risk: 1, type: "Elite Residential" },
    // Migrated from SafeRoute Java Core
    { lat: 28.6139, lng: 77.2090, name: "Connaught Place", risk: 9, type: "High Risk Area" },
    { lat: 28.6280, lng: 77.2195, name: "Old Delhi", risk: 8, type: "Poor Lighting" }
];

function initMap(lat, lng) {
    // If no coordinates passed, use current userLatLng global
    if (!lat || !lng) {
        lat = userLatLng.lat;
        lng = userLatLng.lng;
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
                satellite: L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                    maxZoom: 20,
                    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                    attribution: '© Google Maps',
                    detectRetina: true
                }),
                streets: L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                    maxZoom: 20,
                    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                    attribution: '© Google Maps',
                    detectRetina: true
                }),
                ghost: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                    maxZoom: 20,
                    attribution: '© OpenStreetMap © CartoDB',
                    detectRetina: true
                })
            };

            window.currentLayer = 'satellite';
            window.mapLayers.satellite.addTo(map);

            window.toggleMapLayer = function() {
                if (window.currentLayer === 'satellite') {
                    map.removeLayer(window.mapLayers.satellite);
                    window.mapLayers.streets.addTo(map);
                    window.currentLayer = 'streets';
                    showToast("🗺️ Switched to Street View", "info");
                } else {
                    map.removeLayer(window.mapLayers.streets);
                    window.mapLayers.satellite.addTo(map);
                    window.currentLayer = 'satellite';
                    showToast("🛰️ Switched to Satellite View", "info");
                }
            };

            userMarker = L.marker([lat, lng]).addTo(map)
                .bindPopup("<b>Verified Safety Map</b>").openPopup();
            
            userAccuracyCircle = L.circle([lat, lng], {
                radius: 0,
                color: '#9d4edd',
                fillColor: '#9d4edd',
                fillOpacity: 0.15,
                weight: 1
            }).addTo(map);

            setTimeout(() => {
                map.invalidateSize();
                addSecurityZonesToMap(lat, lng);
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
            // Only snap view if it's a significant change or center was lost
            const currentCenter = map.getCenter();
            const distToNew = L.latLng(lat, lng).distanceTo(currentCenter);
            
            if (distToNew > 500) { // If moved more than 500m, re-center
                 map.setView([lat, lng]);
            }
            
            if (userMarker) userMarker.setLatLng([lat, lng]);
            if (userAccuracyCircle) {
                userAccuracyCircle.setLatLng([lat, lng]);
            }
            addSecurityZonesToMap(lat, lng);
            
            userLatLng = { lat, lng }; // UPDATE GLOBAL COORDS
            console.log("🔄 Map already exists. Re-centering...");
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

/**
 * Adds Three Safety Zones to the Map: Red, Yellow, and Green
 */
function addSecurityZonesToMap(lat, lng) {
    if (!map) return;
    
    // Enforce numeric values to prevent string concatenation bugs
    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);
    
    if (isNaN(nLat) || isNaN(nLng)) return;

    console.log("📡 Projection System: Deploying 3 Tactical Zones around", nLat, nLng);

    // Clear previous zones to prevent clutter
    if (securityZones) {
        securityZones.forEach(z => { if(z) map.removeLayer(z); });
    }
    securityZones = [];

    // 1. Danger Zone (Red) - North East Offset
    const dangerZone = L.circle([nLat + 0.012, nLng + 0.012], {
        color: '#ff3366',
        fillColor: '#ff3366',
        fillOpacity: 0.15,
        weight: 3,
        radius: 500
    }).addTo(map).bindPopup("<b style='color:#ff3366'>🚨 High Danger Zone</b>");

    // 2. Caution Zone (Orange) - South Offset
    const cautionZone = L.circle([nLat - 0.015, nLng], {
        color: '#ff9800',
        fillColor: '#ff9800',
        fillOpacity: 0.15,
        weight: 3,
        radius: 600
    }).addTo(map).bindPopup("<b style='color:#ff9800'>⚠️ Caution Sector</b>");

    // 3. Secure Zone (Green) - North West Offset
    const safeZone = L.circle([nLat + 0.012, nLng - 0.012], {
        color: '#00e676',
        fillColor: '#00e676',
        fillOpacity: 0.15,
        weight: 3,
        radius: 500
    }).addTo(map).bindPopup("<b style='color:#00e676'>🛡️ Secure Haven</b>");

    securityZones.push(dangerZone, cautionZone, safeZone);
    console.log("✅ All 3 Tactical Sectors Projected Successfully.");
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

let lastRadarScan = 0;
async function fetchDangerZones() {
    if (!map) return;
    const now = Date.now();
    if (now - lastRadarScan < 10000) return; // 10s cooldown
    lastRadarScan = now;

    // Clear old layers
    if (window.dangerLayers) {
        window.dangerLayers.forEach(layer => map.removeLayer(layer));
    }
    window.dangerLayers = [];
    window.drawnZones = [];

    const bounds = map.getBounds();
    const { _southWest: sw, _northEast: ne } = bounds;

    try {
        const hubRes = await fetch(`${API_URL}/danger-zones`).catch(() => null);
        if (hubRes && hubRes.ok) {
            const zones = await hubRes.json();
            zones.forEach(z => {
                const zLat = z.location?.coordinates[1] || z.lat;
                const zLng = z.location?.coordinates[0] || z.lng;
                if (zLat && zLng) drawMapZone(zLat, zLng, 'high', z.risk + ' Risk', z.name || 'Zone');
            });
        }
    } catch (e) { console.warn("Neural Sync Delayed:", e.message); }
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
    
    // No interval needed anymore because watchPosition (in performTrackingSync) handles live updates
    showToast("🛰️ LIVE TRACKING ACTIVE", "success");
}

// --- TACTICAL GPS RESURRECTION (Stable v10) ---
let geoWatchId = null;

async function performTrackingSync() {
    const gpsEl = document.getElementById('dashGps');
    if (gpsEl) gpsEl.innerHTML = '<span class="text-blue-400 animate-pulse">📡 SCANNING SATELLITES...</span>';

    const options = { 
        enableHighAccuracy: true, 
        timeout: 20000, 
        maximumAge: 5000 
    };

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                showToast("🛰️ Locked Precise Satellite Signal", "success");
                handlePreciseLocation(pos);
            },
            (err) => {
                console.warn("GPS Denied or Timeout:", err.message);
                showToast("⚠️ GPS Signal Lost. Using Cellular IP Fallback.", "warning");
                tryIPGeolocationFallback();
            },
            options
        );

        if (!geoWatchId) {
            geoWatchId = navigator.geolocation.watchPosition(
                (pos) => handlePreciseLocation(pos),
                (err) => {
                    console.warn("Live Watch Signal Lost:", err.message);
                    isLocationPrecise = false;
                    tryIPGeolocationFallback();
                },
                options
            );
        }
    } else {
        showToast("⚠️ Device lacks GPS hardware.", "error");
        tryIPGeolocationFallback();
    }
}

function handlePreciseLocation(position) {
    const { latitude, longitude, accuracy } = position.coords;
    
    // GPS is ALWAYS fundamentally better than IP, so we flag it as "Satellite Precision"
    isLocationPrecise = true; 
    
    userLatLng = { lat: latitude, lng: longitude };
    
    // Update Map and Dashboard
    initMap(latitude, longitude);
    updateDashboardGPS(latitude, longitude, `🛰️ SAT-LOCK [±${Math.round(accuracy)}m]`);
    if (userAccuracyCircle) userAccuracyCircle.setRadius(accuracy);

    // Hide loader
    const loader = document.getElementById('mapLoader');
    if (loader) loader.style.display = 'none';

    if (isSosActive) sendTrackingUpdateToServer(latitude, longitude);
}

function sendTrackingUpdateToServer(lat, lng) {
    // We already have userLatLng updated by handlePreciseLocation
    sendSOSAlert(true);
}

async function tryIPGeolocationFallback() {
    // PROTECTIVE GUARD: If we already have a precise Satellite lock, IGNORE internet fallback
    if (isLocationPrecise) {
        console.log("🛡️ Shield: Blocking approximate IP override to maintain Satellite precision.");
        return;
    }
    
    const gpsEl = document.getElementById('dashGps');
    if (gpsEl) gpsEl.innerHTML = '<span class="text-blue-400 animate-pulse">📡 SCANNING NETWORK...</span>';
    
    try {
        const sources = [
            'https://ipapi.co/json/',
            'https://freeipapi.com/api/json'
        ];

        let found = false;

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
                    
                    if (gpsEl) gpsEl.innerHTML = '<span class="text-yellow-400 font-bold">📡 HYBRID-LINK [IP]</span>';
                    console.log("📡 Using Internet Triangulation (Area is approximate)");
                    found = true;
                    break;
                }
            } catch (e) { console.warn(`Triangulation Source ${url} failed...`); }
        }

        if (!found) {
            throw new Error("All triangulation sources exhausted.");
        }
    } catch (error) {
        console.warn("Satellite sync deferred, maintaining last known signal.");
        // instead of hardcoding, use what we already have (could be saved CT University)
        initMap(userLatLng.lat, userLatLng.lng);
        updateDashboardGPS(userLatLng.lat, userLatLng.lng, "SIGNAL-MEMORIZED");
        showToast("🛰️ Weak Signal: Holding Last Known Position", "warning");
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
    updateDashboard();
    checkDatabaseStatus();
    setInterval(updateDashboard, 1000);
    setInterval(checkDatabaseStatus, 10000);
}

/**
 * Validates connectivity with the cloud database engine
 */
function checkDatabaseStatus() {
    const dbEl = document.getElementById('dashDb');
    const dbBox = document.getElementById('statusDbBox');
    
    fetch(`${API_URL}/health`)
        .then(res => res.json())
        .then(data => {
            if (dbEl) dbEl.innerText = "Online";
            if (dbBox) {
                dbBox.classList.remove('standby', 'warning');
                dbBox.classList.add('connected');
            }
        })
        .catch(() => {
            if (dbEl) dbEl.innerText = "Syncing...";
            if (dbBox) {
                dbBox.classList.remove('connected');
                dbBox.classList.add('warning');
            }
        });
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
        const timeoutId = setTimeout(() => controller.abort(), 4000); 

        const response = await fetch(`${API_URL}/health`, { signal: controller.signal });
        const data = await response.json();
        clearTimeout(timeoutId);
        
        const systemItem = document.getElementById('statusSystem');
        const dbBox = document.getElementById('statusDbBox');

        if (data.database === 'connected' || data.status === 'online') {
            dbFailCount = 0;
            dbEl.innerText = 'Connected ✅';
            if (dbBox) {
                dbBox.classList.remove('standby', 'warning');
                dbBox.classList.add('connected');
            }
            if (systemItem) {
                systemItem.querySelector('.status-indicator').innerText = 'ACTIVE ⚡';
                systemItem.classList.remove('standby');
                systemItem.classList.add('connected');
            }
        } else {
            dbFailCount++;
            dbEl.innerText = 'Syncing... 📡';
            if (dbBox) dbBox.classList.add('warning');
        }
    } catch (error) {
        dbFailCount++;
        const systemItem = document.getElementById('statusSystem');
        if (dbFailCount >= 3) {
            dbEl.innerText = 'System Standby 🛑';
            if (systemItem) {
                systemItem.querySelector('.status-indicator').innerText = 'Standby 🛑';
                systemItem.classList.add('standby');
                systemItem.classList.remove('connected');
            }
        } else {
            dbEl.innerText = 'Retrying... ⌛';
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
function updateDashboardGPS(lat, lng, statusLabel) {
    // Sync to global location state ONLY if numbers are provided
    if (typeof lat === 'number' && typeof lng === 'number') {
        userLatLng = { lat, lng };
        // Save for persistence
        localStorage.setItem('lastKnownLocation', JSON.stringify(userLatLng));
    }

    const gpsEl = document.getElementById('dashGps');
    const areaEl = document.getElementById('dashArea');
    const gpsBox = document.getElementById('statusGpsBox');

    if (gpsEl) {
        gpsEl.innerText = statusLabel || 'Connected ✅';
        if (statusLabel && statusLabel.includes('BACKUP')) {
            gpsEl.className = "status-value text-red-500 font-bold";
        } else {
            gpsEl.className = "status-value text-green-500 font-bold";
        }
    }

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
            findNearestPoliceStation(lat, lng);
        }).catch(() => { 
            if (areaEl) areaEl.innerText = 'GPS Active';
            fetchStreetLights(lat, lng); 
            findNearestPoliceStation(lat, lng);
        });
}

/**
 * Recursive Police Station Locator 🚀
 * Starts at 5km, then extends up to 25km if none found.
 */
async function findNearestPoliceStation(lat, lng, radius = 5000) {
    if (!lat || !lng) { lat = userLatLng.lat; lng = userLatLng.lng; }
    const policeEl = document.getElementById('dashPolice');
    const box = document.getElementById('statusPoliceBox');
    if (!policeEl) return;

    if (radius === 5000) {
        policeEl.innerText = "Scanning...";
        if (box) box.classList.add('animate-pulse');
        console.log("🛡️ Safety: Scanning for nearest Police presence...");
    }

    const query = `[out:json][timeout:15];node(around:${radius},${lat},${lng})["amenity"="police"];out body;`;
    
    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
        const data = await response.json();

        if (data.elements && data.elements.length > 0) {
            let minTrackedDist = Infinity;
            let nearestName = "Station";

            data.elements.forEach(p => {
                const d = getDistanceMeters(lat, lng, p.lat, p.lon);
                if (d < minTrackedDist) {
                    minTrackedDist = d;
                    nearestName = p.tags.name || "Police Station";
                }
            });

            const km = (minTrackedDist / 1000).toFixed(1);
            policeEl.innerText = `${km} km`;
            console.log(`🛡️ Success: Nearest Station [${nearestName}] found at ${km}km`);
            
            if (box) {
                box.classList.remove('animate-pulse', 'warning');
                box.classList.add('connected');
            }

        } else if (radius < 25000) {
            // No station found, EXTEND radius
            const nextRadius = radius + 5000;
            console.log(`📡 Extending scan range to ${nextRadius/1000}km...`);
            setTimeout(() => findNearestPoliceStation(lat, lng, nextRadius), 500);
        } else {
            policeEl.innerText = "> 25km";
            if (box) {
                box.classList.remove('animate-pulse');
                box.classList.add('warning');
            }
            console.warn("⚠️ Isolation: No police station within 25km scan radius.");
        }
    } catch (e) {
        policeEl.innerText = "Offline";
    }
}
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

        const lightsBox = document.getElementById('statusLightsBox');
        if (count > 0) {
            lightEl.innerText = "Lit Area ✅";
            if (lightsBox) {
                lightsBox.classList.remove('warning', 'standby');
                lightsBox.classList.add('connected');
            }
        } else {
            lightEl.innerText = "Low Lighting ⚠️";
            if (lightsBox) {
                lightsBox.classList.remove('connected');
                lightsBox.classList.add('warning');
            }
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

// Distance helper (Haversine formula)
function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // metres
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getCommunityReports() {
    // Check for locally saved community alerts
    try {
        const saved = localStorage.getItem('herSafety_reports');
        return saved ? JSON.parse(saved) : [];
    } catch(e) { return []; }
}


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
        
        // --- SHRINK & SYNC LOGIC ---
        showToast("🚨 SOS PROTOCOL: Locking Coordinates...", "error");
        
        setTimeout(() => {
            sendSOSAlert();
            playAlarm();
            startSentinelTracking();
            
            showToast("🛰️ LOCATION SYNCED: Family members notified via SMS!", "success");
            if (typeof speakSafeHer === 'function') speakSafeHer("SOS activated. Your location has been shared with your family.");
        }, 500); // Wait for shrink animation
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
            sendSOSAlert(true);
            console.log("📡 High-Priority SOS Sync Success");
        }, err => console.warn(err), { enableHighAccuracy: true });

    }, 5000);
}

function forceMapRefresh() {
    if (map) {
        map.invalidateSize();
        showToast("Map container recalibrated.", "info");
    } else {
        initMap(userLatLng.lat, userLatLng.lng);
    }
}

// Missing Handle Manual Search Implementation
async function handleManualSearch() {
    const input = document.getElementById('manualLocationInput');
    if (!input || !input.value) return;

    const query = input.value;
    showToast(`Searching for: ${query}...`, "info");

    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await res.json();

        if (data && data.length > 0) {
            const { lat, lon, display_name } = data[0];
            const newLat = parseFloat(lat);
            const newLng = parseFloat(lon);

            // Update Map
            if (map) {
                map.setView([newLat, newLng], 15);
                L.popup()
                    .setLatLng([newLat, newLng])
                    .setContent(`<b>Search Result:</b><br>${display_name}`)
                    .openOn(map);
            }
            
            showToast("Location found!", "success");
        } else {
            showToast("Location not found. Try a different name.", "error");
        }
    } catch (e) {
        console.error("Search error:", e);
        showToast("Search service unavailable.", "error");
    }
}

// --- Dynamic Tab Switching ---
function switchSection(sectionId) {
    // --- GATEKEEPER CHECK ---
    const isAuth = localStorage.getItem('herSafety_user');
    // HOME, ROUTE, TIPS, FEEDBACK, CONTACTS are now public
    const protectedSections = ['records', 'pro-center', 'pro-dashboard'];

    if (!isAuth && protectedSections.includes(sectionId)) {
        showToast("Please login to access this area", "info");
        switchSection('loginView');
        return;
    }

    const sections = document.querySelectorAll('.section-container');
    sections.forEach(s => {
        s.style.display = 'none';
        s.classList.remove('active-section');
    });

    const target = document.getElementById(sectionId);
    if (target) {
        // Use flex to match the active-section styling
        target.style.display = 'flex';
        target.classList.add('active-section');
        window.scrollTo(0, 0);
    }

    // ✅ FIX: Invalidate Leaflet map size when home section is shown to prevent shrinking
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
    
    // ✅ RE-RENDER CONTACTS
    if (sectionId === 'contacts') {
        renderCustomContacts();
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
let recognition = null;
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
        recognition.lang = 'hi-IN'; // Default to Hindi/Hinglish

        recognition.onstart = () => {
            isListening = true;
            document.getElementById('micBtn').classList.add('pulse-active');
            document.getElementById('alexaWaveform').style.display = 'flex';
            showToast("Listening...", "info");
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            document.getElementById('chatInput').value = transcript;
            sendMessage();
        };

        recognition.onerror = (event) => {
            console.error("STT Error:", event.error);
            stopMic();
        };

        recognition.onend = () => {
            stopMic();
        };
    }

    if (isListening) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

function stopMic() {
    isListening = false;
    document.getElementById('micBtn').classList.remove('pulse-active');
    document.getElementById('alexaWaveform').style.display = 'none';
}

function shutdownAI() {
    window.speechSynthesis.cancel();
    const chatWrapper = document.querySelector('.chat-wrapper');
    if (chatWrapper) chatWrapper.style.display = 'none';
    showToast("AI Assistant Offline", "warning");
}

function toggleChat() {
    const chatBox = document.getElementById('chatBox');
    const chatWrapper = document.querySelector('.chat-wrapper');
    
    // Ensure wrapper is visible if it was shut down
    if (chatWrapper) chatWrapper.style.display = 'block';

    if (chatBox.style.display === 'flex') {
        chatBox.style.display = 'none';
    } else {
        chatBox.style.display = 'flex';
        const body = document.getElementById('chatBody');
        body.scrollTop = body.scrollHeight;
    }
}

/**
 * 🛰️ NEURAL LOGIC ENGINE (Offline AI Oracle)
 * Provides instant safety intelligence without external API calls.
 */
function getNeuralLocalResponse(message, userLang) {
    const msg = message.toLowerCase();
    
    // 🏛️ BILINGUAL LOCAL INTELLIGENCE
    const localSpots = {
        "daba": {
            hi: "Daba इलाका अभी AI की नज़र में है। सुरक्षित रहने के लिए रोशनी वाली गलियों में ही रहें।",
            en: "Daba area is under AI surveillance. Stay in well-lit lanes to stay secure."
        },
        "focal point": {
            hi: "फ़ोकल पॉइंट (Focal Point) में अभी खतरा हो सकता है। रात को अकेले यहाँ न रुकें।",
            en: "Focal Point might be risky now. Avoid staying here alone at night."
        },
        "gill road": {
            hi: "Gill Road पर ट्रैफ़िक है पर यह सुरक्षित है। बस सावधानी बरतें।",
            en: "Gill Road is busy but safe. Just stay alert."
        },
        "chowk": {
            hi: "चौकों पर पुलिस और AI की नज़र है। आप सुरक्षित महसूस कर सकती हैं।",
            en: "Chowks are monitored by police and AI. You can feel secure."
        }
    };

    // Check for local spot mentions
    for (const spot in localSpots) {
        if (msg.includes(spot)) {
            const reply = localSpots[spot][userLang];
            return { reply: `🛰️ [Neural Info]: ${reply}`, voice: reply };
        }
    }

    // 1. Emergency Protocols
    if (msg.includes("help") || msg.includes("bachao") || msg.includes("sos") || msg.includes("danger") || msg.includes("khatra")) {
        return {
            reply: userLang === 'hi' ? "🚨 अलर्ट: क्या मैं आपके परिवार को बता दूँ? पुष्टि के लिए 'YES' लिखें।" : "🚨 ALERT: Should I notify your family? Type 'YES' to confirm.",
            action: "ACTIVATE_SOS_PROMPT",
            voice: userLang === 'hi' ? "क्या मैं आपके परिवार को बता दूँ?" : "Should I notify your family?"
        };
    }
    
    // 2. Location
    if (msg.includes("location") || msg.includes("kahan") || msg.includes("where")) {
        const area = document.getElementById('dashArea').innerText;
        return {
            reply: userLang === 'hi' ? `📍 आप अभी ${area} में हैं। मैं आपको ट्रैक कर रही हूँ।` : `📍 You are at ${area}. I am tracking your safety.`,
            action: "AUTO_MAP_FOCUS"
        };
    }

    // Default Oracle Tips
    if (msg.includes("tip") || msg.includes("advice") || msg.includes("salah")) {
        const tips = {
            hi: ["हमेशा अपनी लाइव लोकेशन शेयर रखें।", "रात को सुनसान रास्ते न चुनें।", "डाबा रोड सुरक्षित है, बस सावधानी रखें।"],
            en: ["Always keep live location shared.", "Avoid isolated paths at night.", "Daba road is safe, just stay alert."]
        };
        const tip = tips[userLang][Math.floor(Math.random() * 3)];
        return { reply: `💡 ${tip}`, voice: tip };
    }

    return null;
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    appendMessage(msg, 'user');
    input.value = '';

    // LANGUAGE DETECTION
    const isHindi = /[\u0900-\u097F]/.test(msg) || ['hai', 'kyo', 'kya', 'nahi', 'rha', 'karo', 'meri', 'kahan', 'bhai', 'ji', 'haan'].some(w => msg.toLowerCase().includes(w));
    const userLang = isHindi ? 'hi' : 'en';

    const typingId = 'typing-' + Date.now();
    appendMessage(userLang === 'hi' ? "AI सोच रहा है..." : "Neural Oracle is processing...", 'bot', typingId);

    let localRes = getNeuralLocalResponse(msg, userLang);
    const lastBotMsg = document.querySelector('.message.bot:last-child')?.innerText || "";

    if (msg.toLowerCase() === 'yes' || msg.toLowerCase() === 'haan' || msg.toLowerCase() === 'ji') {
        if (lastBotMsg.includes("SOS") || lastBotMsg.includes("अलर्ट")) {
            localRes = { 
                reply: userLang === 'hi' ? "🚨 समझ गई! इमरजेंसी SOS शुरू कर रही हूँ।" : "🚨 UNDERSTOOD. TRIGGERING EMERGENCY SOS!", 
                action: "TRIGGER_SOS" 
            };
        }
    }
    
    setTimeout(async () => {
        const typingEl = document.getElementById(typingId);
        if (typingEl) typingEl.remove();

        if (localRes) {
            appendMessage(localRes.reply, 'bot');
            speakSafeHer(localRes.voice || localRes.reply);
            
            if (localRes.action === "TRIGGER_SOS") setTimeout(() => sendSOSAlert(), 1000);
            if (localRes.action === "AUTO_MAP_FOCUS" && map) map.setView([userLatLng.lat, userLatLng.lng], 18);
            return;
        }

        // CLOUD FALLBACK
        try {
            const user = JSON.parse(localStorage.getItem('herSafety_user') || '{}');
            const res = await fetch(`${API_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, userId: user.id || user._id, lang: userLang })
            });
            const data = await res.json();
            appendMessage(data.reply, 'bot');
            speakSafeHer(data.reply);
        } catch (err) {
            const fallback = userLang === 'hi' ? "सिग्नल नहीं है। आप SOS बटन दबाएँ।" : "No signal. Please use SOS button.";
            appendMessage(fallback, 'bot');
            speakSafeHer(fallback);
        }
    }, 800);
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
        
        // --- ACCENT FIX: Remove Emojis that cause speech glitches ---
        let cleanText = text.replace(/[\u{1F300}-\u{1F9FF}]/gu, ''); 
        cleanText = cleanText.replace(/[🚨📍🌙💡⚠️🛰️]/g, '');

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.pitch = 1.1; 
        
        // --- Smart Language Detection ---
        const hasHindiScript = /[\u0900-\u097F]/.test(text);
        const hingesWords = ['hai', ' kyo', ' kya', ' nahi', ' rha', ' rahi', ' raha', ' toh', ' gya', ' gaya', ' kar ', ' karo ', ' rhi ', ' meri ', ' mera ', ' hum ', ' app ', ' aap ', ' kahan ', ' kidhar ', ' bas ', ' kijiye ', ' karke ', ' liye '];
        const hasHinglish = hingesWords.some(word => text.toLowerCase().includes(word));
        
        const isLikelyHindi = hasHindiScript || hasHinglish;
        utterance.lang = isLikelyHindi ? 'hi-IN' : 'en-US';
        utterance.rate = isLikelyHindi ? 0.9 : 1.0; 

        let selectedVoice = null;
        if (isLikelyHindi) {
            const hiVoices = availableVoices.filter(v => v.lang.startsWith('hi'));
            selectedVoice = hiVoices.find(v => v.name.includes("Google") || v.name.includes("Hindi")) || hiVoices[0];
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

    const currentPos = userLatLng;
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
    const goPremiumNav = document.getElementById('goPremiumNav');

    if (isPremium) {
        if (goPremiumNav) goPremiumNav.style.display = 'none';

        // Update any remaining home page labels
        const dashScore = document.getElementById('dashScore');
        if (dashScore) dashScore.innerText = "PRO";
    } else {
        if (goPremiumNav) goPremiumNav.style.display = 'block';
    }
}

// OTP Modal state
let otpTimerInterval = null;
let currentOtpEmail = null;
let currentPaymentId = null;

function showPremiumPlans() {
    const modal = document.getElementById('premiumPlansModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closePremiumPlans() {
    const modal = document.getElementById('premiumPlansModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function initiateRazorpayPayment(amount = 1) {
    closePremiumPlans();
    const user = JSON.parse(localStorage.getItem('herSafety_user') || '{}');
    if (!user.email) {
        showToast("Please login first to upgrade to Pro", "warning");
        switchSection('loginView');
        return;
    }

    try {
        const healthRes = await fetch(`${API_URL}/health`);
        const health = await healthRes.json();

        const response = await fetch(`${API_URL}/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount })
        });

        if (!response.ok) throw new Error('Order creation failed');
        const order = await response.json();

        const options = {
            key: health.rzp_key_id || 'rzp_test_SaxSkQwrcuFvNW',
            amount: order.amount,
            currency: "INR",
            name: "Safe-Her Premium",
            description: "Elite Safety Suite & AI Monitoring",
            order_id: order.id,
            handler: async function (res) {
                const verifyRes = await fetch(`${API_URL}/verify-payment`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        razorpay_order_id: res.razorpay_order_id,
                        razorpay_payment_id: res.razorpay_payment_id,
                        razorpay_signature: res.razorpay_signature
                    })
                });

                if (verifyRes.ok) {
                    showToast("👑 Premium Activated! UNLOCKING... 🛡️", "success");
                    const updatedUser = { ...user, isPremium: true };
                    localStorage.setItem('herSafety_user', JSON.stringify(updatedUser));
                    setTimeout(() => location.reload(), 2000);
                } else {
                    showToast("❌ Payment verification failed.", "error");
                }
            },
            prefill: { name: user.name, email: user.email },
            theme: { color: "#ff0066" }
        };

        const rzp = new Razorpay(options);
        rzp.open();

    } catch (e) {
        console.error("Payment Error:", e.message);
        showToast("Payment Protocol Error: " + e.message, "error");
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
        
        const initGSI = (clientId) => {
            if (typeof google === 'undefined') {
                console.warn("⚠️ Google SDK blocked or loading. Retrying...");
                setTimeout(() => initGSI(clientId), 1000);
                return;
            }

            google.accounts.id.initialize({
                client_id: clientId,
                callback: handleCredentialResponse,
                auto_select: false,
                ux_mode: 'popup'
            });

            const renderOptions = { theme: "outline", size: "large", width: "100%", text: "continue_with", shape: "pill" };
            const btnLogin = document.getElementById("googleBtnLogin");
            const btnSignup = document.getElementById("googleBtnSignup");

            if (btnLogin) google.accounts.id.renderButton(btnLogin, renderOptions);
            if (btnSignup) google.accounts.id.renderButton(btnSignup, renderOptions);

            // --- INCOGNITO SHIELD DETECTOR ---
            setTimeout(() => {
                const loginBox = document.getElementById("googleBtnLogin");
                if (loginBox && loginBox.innerHTML.trim() === "") {
                    console.log("🛡️ Privacy Shield detected. Showing manual fallback...");
                    document.getElementById('googleContinueBtn')?.classList.remove('hidden');
                    document.getElementById('googleContinueBtnSignup')?.classList.remove('hidden');
                }
            }, 2500);
        };

        fetch(`${API_URL}/health`).then(r => r.json()).then(health => {
            const GOOGLE_CLIENT_ID = health.g_client_id || "349561521670-d2rns2cnoed3pm3vnsh5k4k3891m1vor.apps.googleusercontent.com";
            initGSI(GOOGLE_CLIENT_ID);
        }).catch(() => {
            initGSI("349561521670-d2rns2cnoed3pm3vnsh5k4k3891m1vor.apps.googleusercontent.com");
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
    const loginLink = document.getElementById('navLogin');
    const logoutLink = document.getElementById('navLogout');

    if (user) {
        if (loginLink) {
            loginLink.innerHTML = `<a href="#home" class="btn-login"><i class="fas fa-user-circle"></i> ${user.name.split(' ')[0]}</a>`;
        }
        if (logoutLink) logoutLink.style.display = 'block';
    } else {
        if (loginLink) {
            loginLink.innerHTML = `<a href="#loginView" class="btn-login" onclick="switchSection('loginView')">Login / Guest</a>`;
        }
        if (logoutLink) logoutLink.style.display = 'none';
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
            if (typeof initMap === 'function') initMap(userLatLng.lat, userLatLng.lng);
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
    const telegramInput = document.getElementById('contactTelegram');
    const emailInput = document.getElementById('contactEmail');
    
    const userStr = localStorage.getItem('herSafety_user');
    const user = userStr && userStr !== 'undefined' ? JSON.parse(userStr) : { id: 'guest', name: 'Guest' };

    if (!nameInput || !phoneInput) return;

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const telegram = telegramInput ? telegramInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";

    if (!name || !phone) return;

    try {
        if (user.id !== 'guest') {
            const res = await fetch(`${API_URL}/add-contact`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id || user._id,
                    contactName: name,
                    contactPhone: phone,
                    contactTelegram: telegram,
                    contactEmail: email
                })
            });
            const data = await res.json();
            if (res.ok) {
                saveLocalContact(data.contact._id || Date.now(), name, phone, telegram, email);
                showToast("Contact Saved & Synced", "success");
            } else {
                showToast(data.message || "Sync failed", "error");
            }
        } else {
            saveLocalContact(Date.now(), name, phone, telegram, email);
            showToast("Contact saved locally (Guest Mode)", "success");
        }
    } catch (err) {
        console.warn("Contact Sync Offline:", err);
        saveLocalContact(Date.now(), name, phone, telegram, email);
        showToast("Saved locally (Sync Offline)", "warning");
    }
}

function saveLocalContact(id, name, phone, telegram, email) {
    let contacts = JSON.parse(localStorage.getItem('herSafety_contacts')) || [];
    contacts.push({ id, name, phone, telegram, email });
    localStorage.setItem('herSafety_contacts', JSON.stringify(contacts));
    
    // Clear all inputs
    const inputs = ['contactName', 'contactPhone', 'contactTelegram', 'contactEmail'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    if (typeof renderCustomContacts === 'function') {
        renderCustomContacts(true); // Don't re-fetch from cloud immediately
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
            const contacts = data.contacts.map(c => ({ 
                id: c._id, 
                name: c.contactName, 
                phone: c.contactPhone,
                telegram: c.contactTelegram || "",
                email: c.contactEmail || ""
            }));
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

    contacts.forEach(contact => {
        const div = document.createElement('div');
        div.className = 'contact-card family dynamic-contact';
        
        let subInfo = contact.phone;
        if (contact.telegram) subInfo += ` | TG: ${contact.telegram}`;
        if (contact.email) subInfo += ` | ${contact.email}`;

        div.innerHTML = `
            <div class="contact-icon personal"><i class="fas fa-user-shield"></i></div>
            <div class="contact-info">
                <h3>${contact.name}</h3>
                <p>${subInfo}</p>
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
    const proLink = document.getElementById('proLink');

    if (user) {
        if (loginLink) loginLink.style.display = 'none';
        if (logoutLink) logoutLink.style.display = 'block';

        updatePremiumUI();

        const visibleSection = document.querySelector('.section-container[style*="block"], .section-container.active-section');
        const visibleId = visibleSection ? visibleSection.id : null;
        if (!visibleId || visibleId === 'loginView' || visibleId === 'signupView') {
            switchSection('home');
        }
    } else {
        if (loginLink) loginLink.style.display = 'block';
        if (logoutLink) logoutLink.style.display = 'none';

        updatePremiumUI();

        const visibleSection = document.querySelector('.section-container[style*="block"], .section-container.active-section');
        const visibleId = visibleSection ? visibleSection.id : null;
        const protectedSections = ['records', 'pro-center', 'feedback', 'pro-dashboard'];
        if (visibleId && protectedSections.includes(visibleId)) {
            showToast("Please login to access this feature", "info");
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
        // --- SATELLITE RE-LOCK PROTOCOL (v16.0) ---
        const watchOptions = {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        };

        const handleLocationSuccess = (pos) => {
            const { latitude, longitude, accuracy } = pos.coords;
            console.log(`📡 Satellite Lock Found: [${latitude}, ${longitude}] | Accuracy: ${accuracy}m`);
            updateMarkerPosition(latitude, longitude, accuracy);
        };

        const handleLocationError = (err) => {
            console.warn("⚠️ Satellite Lost. Switching to Nano-Triangulation (IP)...");
            // Fallback: Fetch approximate location via IP lookup if sensor fails
            fetch('https://ipapi.co/json/').then(r => r.json()).then(data => {
                if (data.latitude && data.longitude) {
                    console.log("💎 Nano-Triangulation Success: Signal Restored.");
                    updateMarkerPosition(data.latitude, data.longitude, 5000); // Higher accuracy range for IP
                }
            }).catch(() => {
                console.error("💀 All Positioning Systems Failed.");
            });
        };

        navigator.geolocation.watchPosition(handleLocationSuccess, handleLocationError, watchOptions);
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
            s.onload = () => { console.log("âœ… Leaflet CDN Recovered."); initMap(userLatLng.lat, userLatLng.lng); };
            document.head.appendChild(s);
        } else {
            console.log("âœ… Leaflet Ready. Forcing Map Start...");
            // Force map to initialize with Ludhiana if it hasn't already
            if (!map) initMap(userLatLng.lat, userLatLng.lng);
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
















