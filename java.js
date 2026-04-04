// ============================================================
// SafeRoute - Women Safety Route Checker with Google Maps API
// ============================================================

// ===== GLOBAL STATE =====
let map;
let googleLoaded = false;
let directionsService;
let directionsRenderers = [];
let placesService;
let startAutocomplete;
let destAutocomplete;
let userMarker;
let userLocation = null;
let watchId = null;
let unsafeZoneOverlays = [];
let reportedOverlays = [];
let showZones = true;
let trafficLayer = null;
let trafficVisible = false;
let selectedRoute = null;
let travelMode = 'DRIVING';
let isNight = false;
let sosTimerInterval = null;
let sosStartTime = null;
let reportClickListener = null;
let reportLatLng = null;
let selectedIssue = null;
let demoMode = false;

// ===== UNSAFE ZONES DATABASE =====
const unsafeZones = [
    { lat: 28.6139, lng: 77.2090, name: "Connaught Place Dark Alley", risk: "high", radius: 300, desc: "Poorly lit back lanes, multiple harassment incidents after 9 PM" },
    { lat: 28.6280, lng: 77.2195, name: "Old Delhi Narrow Lanes", risk: "high", radius: 400, desc: "Isolated narrow streets, no CCTV coverage, avoid at night" },
    { lat: 28.6353, lng: 77.2250, name: "Chandni Chowk Backstreet", risk: "medium", radius: 250, desc: "Moderate risk during late evening hours" },
    { lat: 28.6100, lng: 77.2300, name: "Pragati Maidan Underpass", risk: "high", radius: 200, desc: "Dark underpass area, reported stalking incidents" },
    { lat: 28.6508, lng: 77.2334, name: "Civil Lines Empty Stretch", risk: "medium", radius: 350, desc: "Low foot traffic after dark" },
    { lat: 28.5921, lng: 77.2490, name: "Nizamuddin Railway Area", risk: "high", radius: 300, desc: "Multiple harassment reports near railway tracks" },
    { lat: 28.6304, lng: 77.2177, name: "Kashmere Gate Construction", risk: "medium", radius: 250, desc: "Active construction, poor visibility at night" },
    { lat: 28.6200, lng: 77.2050, name: "Karol Bagh Back Lanes", risk: "high", radius: 300, desc: "Reported incidents of eve-teasing after 8 PM" },
    { lat: 28.6450, lng: 77.2100, name: "Model Town Flyover", risk: "medium", radius: 200, desc: "Deserted area under flyover, poor lighting" },
    { lat: 28.5800, lng: 77.2350, name: "Jangpura Extension", risk: "medium", radius: 250, desc: "Street lighting reported broken in multiple spots" },
    { lat: 28.5500, lng: 77.2500, name: "Nehru Place Parking", risk: "high", radius: 200, desc: "Isolated parking lots after office hours" },
    { lat: 28.5700, lng: 77.2150, name: "Hauz Khas Dark Path", risk: "medium", radius: 180, desc: "Park pathways poorly lit after sunset" },
    { lat: 19.0760, lng: 72.8777, name: "Mumbai Central Back Road", risk: "high", radius: 300, desc: "Dark alleys behind station, avoid after dark" },
    { lat: 19.0330, lng: 72.8440, name: "Worli Naka Area", risk: "medium", radius: 250, desc: "Isolated seaface stretch at night" },
    { lat: 19.0178, lng: 72.8560, name: "Dadar East Lanes", risk: "high", radius: 280, desc: "Narrow lanes with very poor street lighting" },
    { lat: 19.0590, lng: 72.8360, name: "Bandra Linking Road", risk: "medium", radius: 200, desc: "Late night safety concerns reported" },
    { lat: 19.0896, lng: 72.8656, name: "Andheri Station Underpass", risk: "high", radius: 350, desc: "Dark underpass, crowded but unsafe" },
    { lat: 12.9716, lng: 77.5946, name: "MG Road Back Alley", risk: "medium", radius: 200, desc: "Poorly lit areas behind commercial buildings" },
    { lat: 12.9500, lng: 77.5850, name: "Lalbagh West Gate", risk: "medium", radius: 250, desc: "Isolated area near park after dark" },
    { lat: 12.9800, lng: 77.6000, name: "Shivajinagar Area", risk: "high", radius: 300, desc: "Narrow crowded lanes, reported incidents" },
];

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    // Check for saved API key
    const savedKey = localStorage.getItem('gmaps_api_key');
    if (savedKey) {
        document.getElementById('apiKeyModal').classList.add('hidden');
        loadGoogleMapsScript(savedKey);
    }

    // Hide splash after animation
    setTimeout(() => {
        document.getElementById('splashScreen').classList.add('hide');
    }, 3000);

    checkNightMode();
    setInterval(checkNightMode, 60000);
    startLocationTracking();
});

// ===== GOOGLE MAPS API LOADER =====
function loadGoogleMaps() {
    const apiKey = document.getElementById('apiKeyInput').value.trim();
    if (!apiKey) {
        showToast('warning', 'API Key Required', 'Please enter your Google Maps API key');
        return;
    }

    localStorage.setItem('gmaps_api_key', apiKey);
    document.getElementById('apiKeyModal').classList.add('hidden');
    loadGoogleMapsScript(apiKey);
}

function loadGoogleMapsScript(apiKey) {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=initGoogleMap`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
        showToast('error', 'Failed to Load', 'Google Maps API failed to load. Check your API key.');
        localStorage.removeItem('gmaps_api_key');
        document.getElementById('apiKeyModal').classList.remove('hidden');
    };
    document.head.appendChild(script);
}

function skipApiKey() {
    demoMode = true;
    document.getElementById('apiKeyModal').classList.add('hidden');
    initDemoMap();
    showToast('info', 'Demo Mode', 'Running in demo mode with simulated routes');
}

// ===== GOOGLE MAP INITIALIZATION =====
function initGoogleMap() {
    googleLoaded = true;

    // Dark theme map styles
    const darkStyle = [
        { elementType: "geometry", stylers: [{ color: "#0f1629" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#0a0e17" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#555d75" }] },
        { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#1a2342" }] },
        { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
        { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#8b92a8" }] },
        { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#555d75" }] },
        { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#111d15" }] },
        { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#3a6b35" }] },
        { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#1a2342" }] },
        { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#111827" }] },
        { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
        { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#1e2a4a" }] },
        { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#161d35" }] },
        { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#8b92a8" }] },
        { featureType: "transit", elementType: "geometry", stylers: [{ color: "#161d35" }] },
        { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#555d75" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#070d1a" }] },
        { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#1a2342" }] },
    ];

    const center = userLocation || { lat: 28.6139, lng: 77.2090 };

    map = new google.maps.Map(document.getElementById('map'), {
        center: center,
        zoom: 12,
        styles: darkStyle,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_CENTER
        },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy'
    });

    // Initialize services
    directionsService = new google.maps.DirectionsService();
    placesService = new google.maps.places.PlacesService(map);

    // Traffic layer
    trafficLayer = new google.maps.TrafficLayer();

    // Setup autocomplete
    setupAutocomplete();

    // Plot unsafe zones
    plotUnsafeZones();

    // Place user marker
    if (userLocation) {
        placeUserMarker(userLocation);
    }

    showToast('success', 'Map Loaded', 'Google Maps API initialized successfully');
}

// ===== DEMO MAP (without API key) =====
function initDemoMap() {
    const mapDiv = document.getElementById('map');
    mapDiv.innerHTML = `
        <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#0f1629;flex-direction:column;gap:16px;">
            <div style="width:80px;height:80px;border-radius:50%;background:rgba(124,58,237,0.15);display:flex;align-items:center;justify-content:center;">
                <i class="fas fa-map-marked-alt" style="font-size:36px;color:#7c3aed;"></i>
            </div>
            <h3 style="color:#e6e8f0;font-size:20px;">Demo Mode Active</h3>
            <p style="color:#8b92a8;font-size:14px;text-align:center;max-width:400px;line-height:1.6;">
                Enter a Google Maps API key to enable full map functionality with real directions, places autocomplete, and street view.
            </p>
            <button onclick="document.getElementById('apiKeyModal').classList.remove('hidden')" 
                    style="padding:12px 24px;background:linear-gradient(135deg,#7c3aed,#5b21b6);border:none;border-radius:12px;color:white;font-size:14px;font-weight:700;cursor:pointer;font-family:Inter,sans-serif;">
                <i class="fas fa-key"></i> Enter API Key
            </button>
        </div>
    `;
}

// ===== AUTOCOMPLETE SETUP =====
function setupAutocomplete() {
    if (!googleLoaded) return;

    const startInput = document.getElementById('startLocation');
    const destInput = document.getElementById('destination');

    const options = {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'in' }
    };

    startAutocomplete = new google.maps.places.Autocomplete(startInput, options);
    destAutocomplete = new google.maps.places.Autocomplete(destInput, options);

    // Style the autocomplete dropdown for dark theme
    const observer = new MutationObserver(() => {
        const pacContainers = document.querySelectorAll('.pac-container');
        pacContainers.forEach(container => {
            container.style.background = '#1a2342';
            container.style.border = '1px solid rgba(255,255,255,0.08)';
            container.style.borderRadius = '12px';
            container.style.marginTop = '4px';
            container.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)';
            container.style.fontFamily = 'Inter, sans-serif';

            const items = container.querySelectorAll('.pac-item');
            items.forEach(item => {
                item.style.color = '#e6e8f0';
                item.style.borderColor = 'rgba(255,255,255,0.06)';
                item.style.padding = '10px 14px';
                item.style.cursor = 'pointer';
            });

            const queries = container.querySelectorAll('.pac-item-query');
            queries.forEach(q => { q.style.color = '#a78bfa'; });

            const matched = container.querySelectorAll('.pac-matched');
            matched.forEach(m => { m.style.color = '#7c3aed'; m.style.fontWeight = '700'; });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// ===== PLOT UNSAFE ZONES =====
function plotUnsafeZones() {
    if (!googleLoaded || !map) return;

    unsafeZones.forEach(zone => {
        const color = zone.risk === 'high' ? '#ef4444' : '#f59e0b';
        const fillOpacity = zone.risk === 'high' ? 0.12 : 0.08;

        // Circle overlay
        const circle = new google.maps.Circle({
            map: map,
            center: { lat: zone.lat, lng: zone.lng },
            radius: zone.radius,
            strokeColor: color,
            strokeWeight: 1.5,
            strokeOpacity: 0.6,
            fillColor: color,
            fillOpacity: fillOpacity,
            clickable: false
        });

        // Custom marker using SVG
        const markerIcon = {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: color,
            fillOpacity: 0.8,
            strokeColor: color,
            strokeWeight: 2,
            scale: 8
        };

        const marker = new google.maps.Marker({
            position: { lat: zone.lat, lng: zone.lng },
            map: map,
            icon: markerIcon,
            title: zone.name,
            zIndex: 10
        });

        // Info window
        const infoContent = `
            <div class="info-window">
                <div class="info-title unsafe">⚠️ ${zone.name}</div>
                <div class="info-desc">${zone.desc}</div>
                <div class="info-risk" style="color:${color};">Risk: ${zone.risk.toUpperCase()}</div>
            </div>
        `;

        const infoWindow = new google.maps.InfoWindow({ content: infoContent });
        marker.addListener('click', () => infoWindow.open(map, marker));

        unsafeZoneOverlays.push({ circle, marker, infoWindow });
    });
}

// ===== USER LOCATION =====
function startLocationTracking() {
    if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                if (googleLoaded && map) {
                    placeUserMarker(userLocation);
                    checkProximity();
                }
            },
            (err) => {
                console.warn('Geolocation error:', err.message);
                userLocation = { lat: 28.6139, lng: 77.2090 };
                if (googleLoaded && map) placeUserMarker(userLocation);
            },
            { enableHighAccuracy: true, maximumAge: 10000, timeout: 8000 }
        );
    } else {
        userLocation = { lat: 28.6139, lng: 77.2090 };
    }
}

function placeUserMarker(location) {
    if (!googleLoaded || !map) return;

    if (userMarker) {
        userMarker.setPosition(location);
    } else {
        userMarker = new google.maps.Marker({
            position: location,
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: '#7c3aed',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
                scale: 10
            },
            title: 'Your Location',
            zIndex: 1000
        });

        // Pulse effect circle
        new google.maps.Circle({
            map: map,
            center: location,
            radius: 50,
            strokeColor: '#7c3aed',
            strokeWeight: 0,
            fillColor: '#7c3aed',
            fillOpacity: 0.15,
            clickable: false
        });
    }
}

function centerOnUser() {
    if (userLocation && googleLoaded && map) {
        map.panTo(userLocation);
        map.setZoom(16);
        showToast('info', 'Centered', 'Map centered on your location');
    } else if (userLocation && demoMode) {
        showToast('info', 'Your Location', `Lat: ${userLocation.lat.toFixed(4)}, Lng: ${userLocation.lng.toFixed(4)}`);
    } else {
        showToast('warning', 'Unavailable', 'Unable to get your location');
    }
}

function useCurrentLocation() {
    if (userLocation) {
        if (googleLoaded) {
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: userLocation }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    document.getElementById('startLocation').value = results[0].formatted_address;
                } else {
                    document.getElementById('startLocation').value = `${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}`;
                }
            });
        } else {
            document.getElementById('startLocation').value = 'Current Location';
        }
        showToast('success', 'Location Set', 'Using your current location as start');
    } else {
        showToast('warning', 'Unavailable', 'Could not detect your location');
    }
}

// ===== PROXIMITY CHECK =====
function checkProximity() {
    if (!userLocation || !googleLoaded) return;

    const userLatLng = new google.maps.LatLng(userLocation.lat, userLocation.lng);

    for (const zone of unsafeZones) {
        const zoneLatLng = new google.maps.LatLng(zone.lat, zone.lng);
        const distance = google.maps.geometry.spherical.computeDistanceBetween(userLatLng, zoneLatLng);

        if (distance < zone.radius + 150) {
            showWarning(`⚠️ You are near "${zone.name}" — ${zone.desc}`);
            return;
        }
    }
}

function showWarning(text) {
    const banner = document.getElementById('warningBanner');
    document.getElementById('warningText').textContent = text;
    banner.classList.remove('hidden');

    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function dismissWarning() {
    document.getElementById('warningBanner').classList.add('hidden');
}

// ===== NIGHT MODE =====
function checkNightMode() {
    const hour = new Date().getHours();
    isNight = hour >= 20 || hour < 6;
    const ind = document.getElementById('nightIndicator');
    if (isNight) ind.classList.remove('hidden');
    else ind.classList.add('hidden');
}

// ===== TRAVEL MODE =====
function setTravelMode(btn, mode) {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    travelMode = mode;
}

// ===== SWAP & CLEAR =====
function swapLocations() {
    const s = document.getElementById('startLocation');
    const d = document.getElementById('destination');
    [s.value, d.value] = [d.value, s.value];
    showToast('info', 'Swapped', 'Start and destination locations swapped');
}

function clearDestination() {
    document.getElementById('destination').value = '';
}

// ===== QUICK LOCATIONS =====
function setQuickLocation(type, location) {
    if (type === 'start') document.getElementById('startLocation').value = location;
    else document.getElementById('destination').value = location;
}

// ===== FIND ROUTES =====
function findRoutes() {
    const startVal = document.getElementById('startLocation').value.trim();
    const destVal = document.getElementById('destination').value.trim();

    if (!startVal || !destVal) {
        showToast('warning', 'Missing Input', 'Please enter both start and destination');
        return;
    }

    if (!googleLoaded) {
        if (demoMode) {
            findDemoRoutes(startVal, destVal);
            return;
        }
        showToast('error', 'Map Not Loaded', 'Please enter your Google Maps API key first');
        return;
    }

    // Show loading state
    const btn = document.getElementById('findRouteBtn');
    btn.classList.add('loading');
    btn.innerHTML = '<i class="fas fa-spinner"></i><span>Searching...</span><div class="btn-shine"></div>';

    // Clear previous routes
    clearRoutes();

    // Use Directions Service with alternatives
    let origin = startVal;
    if (startVal.toLowerCase().includes('current location') && userLocation) {
        origin = userLocation;
    }

    const request = {
        origin: origin,
        destination: destVal,
        travelMode: google.maps.TravelMode[travelMode],
        provideRouteAlternatives: true,
        unitSystem: google.maps.UnitSystem.METRIC,
        avoidHighways: false,
        avoidTolls: false
    };

    directionsService.route(request, (result, status) => {
        btn.classList.remove('loading');
        btn.innerHTML = '<i class="fas fa-search-location"></i><span>Find Safest Route</span><div class="btn-shine"></div>';

        if (status === 'OK') {
            processRoutes(result);
        } else {
            showToast('error', 'Route Not Found', `Could not find route: ${status.replace(/_/g, ' ').toLowerCase()}`);
        }
    });
}

function clearRoutes() {
    directionsRenderers.forEach(r => r.setMap(null));
    directionsRenderers = [];
    selectedRoute = null;
}

// ===== PROCESS & DISPLAY ROUTES =====
function processRoutes(result) {
    const routes = [];
    const routeColors = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

    result.routes.forEach((route, index) => {
        const leg = route.legs[0];
        const path = route.overview_path;
        const safety = calculateRouteSafety(path, route);

        const routeData = {
            index: index,
            name: getRouteName(route, index),
            distance: leg.distance.text,
            distanceValue: leg.distance.value,
            duration: leg.duration.text,
            durationValue: leg.duration.value,
            summary: route.summary,
            path: path,
            ...safety,
            color: routeColors[index % routeColors.length],
            directionsResult: result
        };

        routes.push(routeData);
    });

    // Sort by safety score (highest first)
    routes.sort((a, b) => b.score - a.score);
    routes[0].recommended = true;

    // Override colors based on safety
    routes.forEach(r => {
        if (r.score >= 7) r.color = '#10b981';
        else if (r.score >= 4) r.color = '#f59e0b';
        else r.color = '#ef4444';
    });

    // Render routes on map
    renderRoutesOnMap(routes, result);

    // Display route cards
    displayRouteCards(routes);

    // Update stats for best route
    updateStats(routes[0]);

    // Fit bounds
    const bounds = new google.maps.LatLngBounds();
    routes[0].path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { padding: 60 });

    showToast('success', 'Routes Analyzed', `${routes.length} route${routes.length > 1 ? 's' : ''} analyzed for safety`);
}

function getRouteName(route, index) {
    if (route.summary) {
        const name = route.summary.substring(0, 30);
        return name + (route.summary.length > 30 ? '...' : '');
    }
    const names = ['Primary Route', 'Alternative Route', 'Scenic Route', 'Express Route'];
    return names[index] || `Route ${index + 1}`;
}

// ===== SAFETY CALCULATION =====
function calculateRouteSafety(path, route) {
    let score = 10;
    let unsafeCount = 0;
    const warnings = [];
    const nearbyZones = [];

    // Check each point on the route against unsafe zones
    const step = Math.max(1, Math.floor(path.length / 30)); // Sample 30 points max
    for (let i = 0; i < path.length; i += step) {
        const point = path[i];

        unsafeZones.forEach(zone => {
            const zonePos = new google.maps.LatLng(zone.lat, zone.lng);
            const dist = google.maps.geometry.spherical.computeDistanceBetween(point, zonePos);

            if (dist < zone.radius) {
                if (!nearbyZones.includes(zone.name)) {
                    nearbyZones.push(zone.name);
                    score -= zone.risk === 'high' ? 1.2 : 0.7;
                    unsafeCount++;
                }
            } else if (dist < zone.radius * 1.5) {
                if (!nearbyZones.includes(zone.name + '_near')) {
                    nearbyZones.push(zone.name + '_near');
                    score -= zone.risk === 'high' ? 0.4 : 0.2;
                }
            }
        });
    }

    // Night time penalty
    if (isNight) {
        score -= 1.5;
        warnings.push({ type: 'night', text: 'Night travel', icon: 'moon' });
    }

    // Road type analysis from route summary
    const summary = (route.summary || '').toLowerCase();
    if (summary.includes('highway') || summary.includes('expressway') || summary.includes('nh')) {
        score += 1.5;
        warnings.push({ type: 'safe', text: 'Highway route', icon: 'road' });
    } else if (summary.includes('inner') || summary.includes('lane') || summary.includes('gali')) {
        score -= 0.8;
        warnings.push({ type: 'warning', text: 'Inner roads', icon: 'exclamation-circle' });
    }

    // Travel mode adjustments
    if (travelMode === 'WALKING') {
        score -= 1;
        warnings.push({ type: 'warning', text: 'Walking', icon: 'walking' });
    } else if (travelMode === 'TRANSIT') {
        score += 0.5;
    }

    // Duration penalty for very long routes
    const leg = route.legs[0];
    if (leg.duration.value > 3600) {
        score -= 0.5;
    }

    if (unsafeCount > 0) {
        warnings.push({
            type: 'warning',
            text: `${unsafeCount} unsafe zone${unsafeCount > 1 ? 's' : ''}`,
            icon: 'exclamation-triangle'
        });
    }

    // Clamp score
    score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));

    let classification;
    if (score >= 7) classification = 'Safe';
    else if (score >= 4) classification = 'Medium';
    else classification = 'Unsafe';

    return { score, classification, unsafeCount, warnings };
}

// ===== RENDER ROUTES ON MAP =====
function renderRoutesOnMap(routes, directionsResult) {
    routes.forEach((routeData, displayIndex) => {
        const renderer = new google.maps.DirectionsRenderer({
            map: map,
            directions: directionsResult,
            routeIndex: routeData.index,
            suppressMarkers: false,
            preserveViewport: true,
            polylineOptions: {
                strokeColor: routeData.color,
                strokeWeight: routeData.recommended ? 6 : 4,
                strokeOpacity: routeData.recommended ? 0.9 : 0.45,
            },
            markerOptions: {
                visible: displayIndex === 0
            }
        });

        directionsRenderers.push({
            renderer: renderer,
            routeIndex: routeData.index,
            data: routeData
        });
    });
}

// ===== DISPLAY ROUTE CARDS =====
function displayRouteCards(routes) {
    const section = document.getElementById('routesSection');
    const list = document.getElementById('routesList');
    const count = document.getElementById('routeCount');

    section.classList.remove('hidden');
    list.innerHTML = '';
    count.textContent = routes.length;

    routes.forEach((route, idx) => {
        const classKey = route.classification.toLowerCase();
        const cardClass = classKey === 'safe' ? 'safe-card' : classKey === 'medium' ? 'medium-card' : 'unsafe-card';
        const pillClass = classKey === 'safe' ? 'safe' : classKey === 'medium' ? 'medium' : 'unsafe';

        const card = document.createElement('div');
        card.className = `route-card ${cardClass} ${route.recommended ? 'selected' : ''}`;
        card.innerHTML = `
            ${route.recommended ? `<div class="recommended-badge"><i class="fas fa-check"></i> SAFEST</div>` : ''}
            <div class="route-top">
                <span class="route-name">${route.name}</span>
                <span class="safety-pill ${pillClass}">${route.score}/10</span>
            </div>
            <div class="route-meta">
                <div class="route-meta-item">
                    <i class="fas fa-road"></i>
                    <span>${route.distance}</span>
                </div>
                <div class="route-meta-item">
                    <i class="fas fa-clock"></i>
                    <span>${route.duration}</span>
                </div>
                <div class="route-meta-item">
                    <i class="fas fa-shield-alt"></i>
                    <span>${route.classification}</span>
                </div>
            </div>
            ${route.summary ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">via ${route.summary}</div>` : ''}
            <div class="safety-bar">
                <div class="safety-fill ${pillClass}" style="width: ${route.score * 10}%"></div>
            </div>
            ${route.warnings.length > 0 ? `
                <div class="route-tags">
                    ${route.warnings.map(w => `
                        <span class="route-tag ${w.type === 'night' ? 'night-tag' : w.type === 'safe' ? 'safe-tag' : 'warning-tag'}">
                            <i class="fas fa-${w.icon}"></i> ${w.text}
                        </span>
                    `).join('')}
                </div>
            ` : ''}
        `;

        card.addEventListener('click', () => selectRoute(idx, routes, card));
        list.appendChild(card);
    });
}

function selectRoute(displayIndex, routes, cardElement) {
    // Update cards
    document.querySelectorAll('.route-card').forEach(c => c.classList.remove('selected'));
    cardElement.classList.add('selected');

    const selectedData = routes[displayIndex];

    // Update renderer styles
    directionsRenderers.forEach((item, idx) => {
        const isSelected = item.data.index === selectedData.index;
        item.renderer.setOptions({
            polylineOptions: {
                strokeColor: item.data.color,
                strokeWeight: isSelected ? 6 : 3,
                strokeOpacity: isSelected ? 0.9 : 0.3,
            }
        });
        // Re-render to apply styles
        item.renderer.setMap(null);
        item.renderer.setMap(map);
    });

    updateStats(selectedData);
    selectedRoute = displayIndex;
}

function updateStats(route) {
    document.getElementById('statDistance').textContent = route.distance || route.distanceText || '—';
    document.getElementById('statTime').textContent = route.duration || route.durationText || '—';

    const safetyEl = document.getElementById('statSafety');
    safetyEl.textContent = `${route.score}/10`;
    safetyEl.style.color = route.color;

    const zonesEl = document.getElementById('statZones');
    zonesEl.textContent = route.unsafeCount;
    zonesEl.style.color = route.unsafeCount > 0 ? '#ef4444' : '#10b981';
}

// ===== DEMO ROUTES (without API) =====
function findDemoRoutes(start, dest) {
    showToast('info', 'Demo Mode', 'Showing simulated route data. Add API key for real routes.');

    const routes = [
        {
            name: 'Main Highway Route',
            distance: '12.4 km',
            duration: '28 min',
            summary: 'via NH-44 Highway',
            score: 8.5,
            classification: 'Safe',
            unsafeCount: 0,
            color: '#10b981',
            recommended: true,
            warnings: [
                { type: 'safe', text: 'Highway route', icon: 'road' }
            ]
        },
        {
            name: 'City Center Route',
            distance: '10.8 km',
            duration: '35 min',
            summary: 'via Ring Road',
            score: 5.8,
            classification: 'Medium',
            unsafeCount: 2,
            color: '#f59e0b',
            warnings: [
                { type: 'warning', text: '2 unsafe zones', icon: 'exclamation-triangle' }
            ]
        },
        {
            name: 'Shortcut Route',
            distance: '8.2 km',
            duration: '22 min',
            summary: 'via Inner Roads',
            score: 3.2,
            classification: 'Unsafe',
            unsafeCount: 4,
            color: '#ef4444',
            warnings: [
                { type: 'warning', text: '4 unsafe zones', icon: 'exclamation-triangle' },
                { type: 'warning', text: 'Inner roads', icon: 'exclamation-circle' }
            ]
        }
    ];

    if (isNight) {
        routes.forEach(r => {
            r.score = Math.max(0, r.score - 1.5);
            r.warnings.push({ type: 'night', text: 'Night travel', icon: 'moon' });
            if (r.score < 4) r.classification = 'Unsafe';
            else if (r.score < 7) r.classification = 'Medium';
        });
    }

    // Display cards
    const section = document.getElementById('routesSection');
    const list = document.getElementById('routesList');
    const count = document.getElementById('routeCount');

    section.classList.remove('hidden');
    list.innerHTML = '';
    count.textContent = routes.length;

    routes.forEach((route, idx) => {
        const classKey = route.classification.toLowerCase();
        const cardClass = classKey === 'safe' ? 'safe-card' : classKey === 'medium' ? 'medium-card' : 'unsafe-card';
        const pillClass = classKey === 'safe' ? 'safe' : classKey === 'medium' ? 'medium' : 'unsafe';

        const card = document.createElement('div');
        card.className = `route-card ${cardClass} ${route.recommended ? 'selected' : ''}`;
        card.innerHTML = `
            ${route.recommended ? `<div class="recommended-badge"><i class="fas fa-check"></i> SAFEST</div>` : ''}
            <div class="route-top">
                <span class="route-name">${route.name}</span>
                <span class="safety-pill ${pillClass}">${route.score}/10</span>
            </div>
            <div class="route-meta">
                <div class="route-meta-item"><i class="fas fa-road"></i><span>${route.distance}</span></div>
                <div class="route-meta-item"><i class="fas fa-clock"></i><span>${route.duration}</span></div>
                <div class="route-meta-item"><i class="fas fa-shield-alt"></i><span>${route.classification}</span></div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;">${route.summary}</div>
            <div class="safety-bar">
                <div class="safety-fill ${pillClass}" style="width: ${route.score * 10}%"></div>
            </div>
            <div class="route-tags">
                ${route.warnings.map(w => `
                    <span class="route-tag ${w.type === 'night' ? 'night-tag' : w.type === 'safe' ? 'safe-tag' : 'warning-tag'}">
                        <i class="fas fa-${w.icon}"></i> ${w.text}
                    </span>
                `).join('')}
            </div>
        `;
        card.addEventListener('click', () => {
            document.querySelectorAll('.route-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            updateStats(route);
        });
        list.appendChild(card);
    });

    updateStats(routes[0]);
}

// ===== MAP CONTROLS =====
function toggleUnsafeZones() {
    showZones = !showZones;
    const btn = document.getElementById('toggleZonesBtn');

    unsafeZoneOverlays.forEach(item => {
        item.circle.setMap(showZones ? map : null);
        item.marker.setMap(showZones ? map : null);
    });

    reportedOverlays.forEach(item => {
        item.marker.setMap(showZones ? map : null);
        if (item.circle) item.circle.setMap(showZones ? map : null);
    });

    btn.classList.toggle('active', showZones);
    btn.innerHTML = showZones ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    showToast('info', showZones ? 'Zones Shown' : 'Zones Hidden', 'Unsafe zone visibility toggled');
}

function toggleTraffic() {
    if (!googleLoaded || !trafficLayer) {
        showToast('warning', 'Unavailable', 'Traffic layer requires Google Maps API');
        return;
    }

    trafficVisible = !trafficVisible;
    trafficLayer.setMap(trafficVisible ? map : null);

    const btn = document.getElementById('trafficBtn');
    btn.classList.toggle('active', trafficVisible);
    showToast('info', trafficVisible ? 'Traffic On' : 'Traffic Off', 'Real-time traffic layer toggled');
}

function toggleStreetView() {
    if (!googleLoaded || !map) {
        showToast('warning', 'Unavailable', 'Street view requires Google Maps API');
        return;
    }

    const sv = map.getStreetView();
    if (sv.getVisible()) {
        sv.setVisible(false);
    } else {
        const pos = userLocation || map.getCenter();
        sv.setPosition(pos);
        sv.setPov({ heading: 0, pitch: 0 });
        sv.setVisible(true);
    }
}

// ===== SOS FEATURE =====
function triggerSOS() {
    const modal = document.getElementById('sosModal');
    modal.classList.remove('hidden');

    // Update location
    if (userLocation) {
        if (googleLoaded) {
            const geocoder = new google.maps.Geocoder();
            geocoder.geocode({ location: userLocation }, (results, status) => {
                const text = (status === 'OK' && results[0])
                    ? results[0].formatted_address
                    : `${userLocation.lat.toFixed(6)}, ${userLocation.lng.toFixed(6)}`;
                document.getElementById('sosLocationText').textContent = text;
            });
        } else {
            document.getElementById('sosLocationText').textContent =
                `Lat: ${userLocation.lat.toFixed(6)}, Lng: ${userLocation.lng.toFixed(6)}`;
        }
    }

    // Start timer
    sosStartTime = Date.now();
    sosTimerInterval = setInterval(updateSOSTimer, 1000);

    // Vibrate
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500]);

    showToast('error', 'SOS ACTIVATED', 'Emergency contacts are being notified!');

    // Simulate sending notification
    setTimeout(() => {
        const sendingStatus = document.querySelector('.contact-status.sending');
        if (sendingStatus) {
            sendingStatus.classList.remove('sending');
            sendingStatus.classList.add('sent');
            sendingStatus.innerHTML = '<i class="fas fa-check-double"></i>';
        }
    }, 3000);
}

function updateSOSTimer() {
    if (!sosStartTime) return;
    const elapsed = Math.floor((Date.now() - sosStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    document.getElementById('sosTimer').textContent = `${mins}:${secs}`;
}

function cancelSOS() {
    document.getElementById('sosModal').classList.add('hidden');
    clearInterval(sosTimerInterval);
    sosStartTime = null;
    if (navigator.vibrate) navigator.vibrate(0);
    showToast('info', 'SOS Cancelled', 'Emergency alert has been deactivated');
}

function shareLocation() {
    if (userLocation) {
        const msg = encodeURIComponent(
            `🆘 EMERGENCY! I need help!\n\n📍 My Location:\nhttps://www.google.com/maps?q=${userLocation.lat},${userLocation.lng}\n\n⏰ Time: ${new Date().toLocaleString()}\n\n— Sent via SafeRoute App`
        );
        window.open(`https://wa.me/?text=${msg}`, '_blank');
    } else {
        showToast('warning', 'Location Unavailable', 'Could not determine your location');
    }
}

// ===== REPORT FEATURE =====
function openReportModal() {
    document.getElementById('reportModal').classList.remove('hidden');

    if (userLocation) {
        reportLatLng = { lat: userLocation.lat, lng: userLocation.lng };
        updateReportLocationDisplay();
    }

    // Allow clicking on map if Google Maps loaded
    if (googleLoaded && map) {
        reportClickListener = map.addListener('click', (e) => {
            reportLatLng = { lat: e.latLng.lat(), lng: e.latLng.lng() };
            updateReportLocationDisplay();
        });
    }
}

function updateReportLocationDisplay() {
    if (!reportLatLng) return;
    const display = document.getElementById('reportLocationDisplay');

    if (googleLoaded) {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: reportLatLng }, (results, status) => {
            if (status === 'OK' && results[0]) {
                display.innerHTML = `<i class="fas fa-map-pin"></i><span>${results[0].formatted_address}</span>`;
            } else {
                display.innerHTML = `<i class="fas fa-map-pin"></i><span>${reportLatLng.lat.toFixed(4)}, ${reportLatLng.lng.toFixed(4)}</span>`;
            }
        });
    } else {
        display.innerHTML = `<i class="fas fa-map-pin"></i><span>${reportLatLng.lat.toFixed(4)}, ${reportLatLng.lng.toFixed(4)}</span>`;
    }
}

function closeReportModal() {
    document.getElementById('reportModal').classList.add('hidden');
    if (reportClickListener && googleLoaded) {
        google.maps.event.removeListener(reportClickListener);
        reportClickListener = null;
    }
    reportLatLng = null;
    selectedIssue = null;
    document.querySelectorAll('.issue-card').forEach(b => b.classList.remove('active'));
    document.getElementById('reportDesc').value = '';
}

function useCurrentForReport() {
    if (userLocation) {
        reportLatLng = { lat: userLocation.lat, lng: userLocation.lng };
        updateReportLocationDisplay();
        showToast('success', 'Location Set', 'Using your current location');
    } else {
        showToast('warning', 'Unavailable', 'Cannot determine your location');
    }
}

function selectIssue(btn, issue) {
    document.querySelectorAll('.issue-card').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedIssue = issue;
}

function selectTime(btn) {
    document.querySelectorAll('.time-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function submitReport() {
    if (!reportLatLng) {
        showToast('warning', 'No Location', 'Please select a location for your report');
        return;
    }

    if (!selectedIssue) {
        showToast('warning', 'No Issue', 'Please select the type of issue');
        return;
    }

    const desc = document.getElementById('reportDesc').value || 'User reported unsafe area';
    const severity = document.getElementById('severityRange').value;

    // Add to unsafe zones
    const newZone = {
        lat: reportLatLng.lat,
        lng: reportLatLng.lng,
        name: `User Report: ${selectedIssue.replace('-', ' ')}`,
        risk: severity >= 4 ? 'high' : 'medium',
        radius: 150,
        desc: desc
    };
    unsafeZones.push(newZone);

    // Add to map if Google Maps loaded
    if (googleLoaded && map) {
        const color = '#f97316';

        const marker = new google.maps.Marker({
            position: reportLatLng,
            map: map,
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: color,
                fillOpacity: 0.8,
                strokeColor: color,
                strokeWeight: 2,
                scale: 7
            },
            title: `Report: ${selectedIssue}`,
            zIndex: 15
        });

        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div class="info-window">
                    <div class="info-title reported">🚩 User Report</div>
                    <div class="info-desc"><strong>Issue:</strong> ${selectedIssue.replace('-', ' ')}</div>
                    <div class="info-desc">${desc}</div>
                    <div class="info-desc" style="margin-top:4px;font-size:10px;color:var(--text-muted);">
                        Reported: ${new Date().toLocaleString()}<br>
                        Severity: ${severity}/5
                    </div>
                </div>
            `
        });

        marker.addListener('click', () => infoWindow.open(map, marker));

        const circle = new google.maps.Circle({
            map: map,
            center: reportLatLng,
            radius: 150,
            strokeColor: color,
            strokeWeight: 1,
            strokeOpacity: 0.5,
            fillColor: color,
            fillOpacity: 0.08,
            clickable: false
        });

        reportedOverlays.push({ marker, circle });
    }

    closeReportModal();
    showToast('success', 'Report Submitted', 'Thank you for helping keep others safe!');
}

// ===== SIDEBAR TOGGLE =====
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('open');
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

// Close sidebar on mobile when clicking overlay
document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768 && sidebar.classList.contains('open')) {
        if (!sidebar.contains(e.target) && !e.target.closest('.menu-btn')) {
            sidebar.classList.remove('open');
        }
    }
});

// ===== TOAST SYSTEM =====
function showToast(type, title, message) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-check-circle',
        warning: 'fa-exclamation-triangle',
        error: 'fa-times-circle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${icons[type]}"></i></div>
        <div class="toast-text">
            <strong>${title}</strong>
            <span>${message}</span>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
    // Escape to close modals
    if (e.key === 'Escape') {
        document.getElementById('sosModal').classList.add('hidden');
        document.getElementById('reportModal').classList.add('hidden');
        if (sosTimerInterval) {
            clearInterval(sosTimerInterval);
            sosStartTime = null;
        }
    }

    // Enter to find routes
    if (e.key === 'Enter' && !e.target.closest('.modal')) {
        const active = document.activeElement;
        if (active.id === 'startLocation' || active.id === 'destination') {
            // Small delay to let autocomplete finish
            setTimeout(() => findRoutes(), 300);
        }
    }
});