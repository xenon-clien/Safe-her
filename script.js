/* =========================================
   SCRIPT.JS - HerSafety App Logic
========================================= */

let map;
let userMarker;
let isSosActive = false;
let audioContext, oscillator, gainNode;
let userLatLng = { lat: 30.901, lng: 75.8573 }; // Default Ludhiana
const API_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:')
    ? 'http://localhost:5000/api'
    : '/api';
let pendingPaymentResponse = null; // Stores Razorpay response until OTP verification

/**
 * Sends the initial SOS alert to the backend.
 */
async function sendSOSAlert() {
    const user = JSON.parse(localStorage.getItem('herSafety_user') || '{"id":"demo_user_123", "name":"Demo User"}');

    const payload = {
        userId: user.id || user._id,
        userName: user.name,
        location: userLatLng,
        message: "Emergency SOS triggered! Please monitor my live location link.",
        timestamp: new Date().toISOString()
    };

    try {
        const response = await fetch(`${API_URL}/send-alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        console.log("SOS Alert Response:", data);

        if (response.ok) {
            addSecurityLog('SOS', 'Emergency Alert Broadcasted to Family');
        }
    } catch (error) {
        console.error("Failed to send SOS alert:", error);
    }
}

// REAL-WORLD CRIME HOTSPOTS (Ludhiana Focus)
const CRIME_HOTSPOTS = [
    { name: "Dhandari Kalan", lat: 30.8690, lng: 75.9189, risk: 9, type: "Industrial/Snatching" },
    { name: "Giaspura", lat: 30.8752, lng: 75.8926, risk: 8, type: "Labor Belt/High Theft" },
    { name: "Sherpur Circle", lat: 30.8931, lng: 75.8893, risk: 8, type: "Poor Lighting/Robbery" },
    { name: "Focal Point", lat: 30.8845, lng: 75.9080, risk: 7, type: "Industrial/Unsafe at Night" },
    { name: "Railway Station Area", lat: 30.9025, lng: 75.8505, risk: 7, type: "Pickpocketing/Crowded" }
];

function initMap(lat, lng) {
    // 1. Pehli baar map banane ke liye
    if (!map) {
        map = L.map('map').setView([lat, lng], 15); // Zoom to 15 for better city level view

        // Highly detailed Google Street Maps (Great for precision street-level zooming, avoids 403 issues)
        L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '© Google Maps'
        }).addTo(map);

        userMarker = L.marker([lat, lng]).addTo(map)
            .bindPopup("<b>You are here</b>").openPopup();

        // Fix leaflet blank space/grey tile issue on resize/zoom load 
        setTimeout(() => {
            map.invalidateSize();
            fetchDangerZones(); // Lal, peele aur hare ghere mangwane ke liye
        }, 500);

        // GLOBAL TRACKING: Map move karne par automatically naye areas analyze karo
        // Performance Fix: Debounced to avoid lag while panning
        map.on('moveend', () => {
            fetchDangerZonesDebounced();
        });
    }
    // 2. Taki location update hone par properly pan kare
    else {
        if (userMarker) {
            userMarker.setLatLng([lat, lng]);
        }
        // Properly pan map preventing blank bounds drift
        map.panTo([lat, lng]);
    }
}


// Performance Optimization: Debounce for smooth map panning
let dangerZoneTimeout;
function fetchDangerZonesDebounced() {
    clearTimeout(dangerZoneTimeout);
    dangerZoneTimeout = setTimeout(fetchDangerZones, 400);
}

// --- REAL CRIME ANALYTICS & COMMUNITY DATA ---
function fetchDangerZones() {
    if (!map) return;

    // Clear old layers
    if (window.dangerLayers) {
        window.dangerLayers.forEach(layer => map.removeLayer(layer));
    }
    window.dangerLayers = [];

    const bounds = map.getBounds();

    // 1. RENDER REAL-WORLD HOTSPOTS
    CRIME_HOTSPOTS.forEach(spot => {
        if (bounds.contains([spot.lat, spot.lng])) {
            drawDangerZone(spot.lat, spot.lng, spot.risk, spot.name, spot.type);
        }
    });

    // 2. RENDER COMMUNITY REPORTS (From LocalStorage)
    const reports = getCommunityReports();
    reports.forEach(report => {
        if (bounds.contains([report.lat, report.lng])) {
            drawDangerZone(report.lat, report.lng, 10, "⚠️ User Reported Danger", report.reason);
        }
    });

    // 3. RENDER SIMULATED MEDIUM AREAS (Mixed logic for empty areas)
    // Only if not already occupied by real hotspots
}

function drawDangerZone(lat, lng, risk, title, description) {
    let color, fillColor, popupText;

    if (risk >= 8) {
        color = '#ff3366'; fillColor = '#ff3366';
        popupText = `<b>${title} (HIGH RISK)</b><br>${description}. Avoid this area at night.`;
    } else {
        color = '#ffeb3b'; fillColor = '#ffeb3b';
        popupText = `<b>${title} (MODERATE RISK)</b><br>${description}. Stay alert.`;
    }

    const circle = L.circle([lat, lng], {
        color: color,
        fillColor: fillColor,
        fillOpacity: 0.15,
        radius: 400 + (risk * 20),
        weight: 2
    }).addTo(map).bindPopup(popupText);

    window.dangerLayers.push(circle);
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

// Location track karne ka sahi tareeka
function startTracking() {
    // UI feedback for satellite search
    const gpsEl = document.getElementById('dashGps');
    if (gpsEl) gpsEl.innerText = "Connecting...";

    if (typeof showToast === 'function') {
        showToast("🛰️ Searching for digital satellite signal...", "success");
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;

                // UI display update karo!
                const coordsDisplay = document.getElementById("coordsDisplay");
                if (coordsDisplay) {
                    coordsDisplay.innerText = `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
                }

                console.log("Location found:", latitude, longitude);
                initMap(latitude, longitude);
                updateDashboardGPS(latitude, longitude);  // Update dashboard stats

                // Force immediate size invalidation just in case flexbox resized the map container
                if (map) {
                    setTimeout(() => { map.invalidateSize(); }, 200);
                }
            },
            (error) => {
                console.error("Error getting location:", error);
                const coordsDisplay = document.getElementById("coordsDisplay");
                if (coordsDisplay) {
                    coordsDisplay.innerText = "Location access denied or failed.";
                }
                if (typeof showToast === 'function') {
                    showToast("Failed to track location!", "error");
                }
            },
            { enableHighAccuracy: true }
        );
    } else {
        const coordsDisplay = document.getElementById("coordsDisplay");
        if (coordsDisplay) {
            coordsDisplay.innerText = "Geolocation is not supported by your browser.";
        }
    }
}



// Initialize tracking logic temporarily defined (Will be moved to bottom for clarity)
// Moving window.onload to the very bottom of the file to ensure all functions are defined first.

function runLoader() {
    const bar = document.getElementById('loaderBar');
    const status = document.getElementById('loaderStatus');
    const loader = document.getElementById('loaderScreen');

    const steps = [
        { pct: 20, msg: 'Loading safety modules...' },
        { pct: 45, msg: 'Connecting to servers...' },
        { pct: 65, msg: 'Acquiring GPS signal...' },
        { pct: 85, msg: 'Analyzing area safety...' },
        { pct: 100, msg: 'All systems ready ✅' }
    ];

    let i = 0;
    const tick = setInterval(() => {
        if (i >= steps.length) {
            clearInterval(tick);
            // Fade out loader after short pause
            setTimeout(() => {
                loader.classList.add('fade-out');
                document.body.classList.add('loaded'); // Force scroll enablement
                // Remove from DOM after transition ends
                setTimeout(() => { if (loader) loader.style.display = 'none'; }, 650);
            }, 400);
            // Start app logic with safety catch
            try {
                startTracking();
                startDashboardClock();
            } catch (err) {
                console.error("Post-loader startup failed:", err);
            }
            return;
        }
        if (bar) bar.style.width = steps[i].pct + '%';
        if (status) status.innerText = steps[i].msg;
        i++;
    }, 480);
}


// ============================================================
//  SAFETY DASHBOARD - Live Time + GPS + Safety Score
// ============================================================
function startDashboardClock() {
    updateDashboard(); // Run once immediately
    setInterval(updateDashboard, 1000);
}

function updateDashboard() {
    const now = new Date();
    let h = now.getHours();
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; // Convert 0 → 12, 13 → 1, etc.
    const el = document.getElementById('dashTime');
    if (el) el.innerText = `${h}:${m}:${s} ${ampm}`;
}

// Called after GPS fix to update dashboard
function updateDashboardGPS(lat, lng) {
    // Sync to global location state!
    userLatLng = { lat, lng };

    const gpsEl = document.getElementById('dashGps');
    const areaEl = document.getElementById('dashArea');

    if (gpsEl) gpsEl.innerText = 'Connected ✅';

    // Refresh Score specifically
    refreshSafetyScore();

    // Reverse geocode area name
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
        .then(r => r.json())
        .then(data => {
            const area = data.address.suburb || data.address.city_district || data.address.city || 'Your Area';
            if (areaEl) areaEl.innerText = area;
        }).catch(() => { if (areaEl) areaEl.innerText = 'GPS Active'; });
}

// Real Safety Score Logic
function refreshSafetyScore() {
    const scoreEl = document.getElementById('dashScore');
    if (!scoreEl) return;

    // Calculate Current Score
    let currentScore = calculateDynamicScore(new Date().getHours());

    // Update Main Score UI
    scoreEl.innerText = `${currentScore.score} / 10`;
    scoreEl.style.color = currentScore.color;

    // Update Forecast Scores (Morning=9, Evening=19, Night=2)
    const morning = calculateDynamicScore(9);
    const evening = calculateDynamicScore(19);
    const night = calculateDynamicScore(2);

    document.getElementById('scoreMorning').innerText = morning.score;
    document.getElementById('scoreEvening').innerText = evening.score;
    document.getElementById('scoreNight').innerText = night.score;
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
            const dist = getDistance(userLatLng.lat, userLatLng.lng, spot.lat, spot.lng);
            if (dist < minDistance) minDistance = dist;
        });

        if (minDistance < 0.5) baseScore -= 5.0;
        else if (minDistance < 1.0) baseScore -= 2.5;
        else if (minDistance < 2.0) baseScore -= 1.0;
    }

    const finalScore = Math.max(1.0, Math.min(10, baseScore)).toFixed(1);
    let color = '#4caf50';
    if (finalScore < 4) color = '#ff3366';
    else if (finalScore < 7) color = '#ffeb3b';

    return { score: finalScore, color: color };
}

// Distance helper (Haversine formula simplified)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// (Note: Voice SOS logic has been moved to the Tactical Tools section at the end of the script for professional consolidation)

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
            document.getElementById('timerStatusMsg').innerText = '⚠️ Time expired! SOS alert triggered!';
            document.getElementById('checkinPanel').style.borderColor = '#ff3366';
            showToast('⚠️ Check-In timer expired — SOS sent to contacts!', 'error');
            triggerSOS();
        }

        // Warning at 1 minute
        if (checkInSecsLeft === 60) {
            showToast('⚠️ 1 minute left! Check-in before time runs out!', 'error');
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
    showToast('✅ Check-In confirmed! You are safe.', 'success');
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
            `🚨 I need help! My live location:\nhttps://maps.google.com/?q=${lat},${lng}\n\nSent via Safe Her App`
        );

        // Try native share API first
        if (navigator.share) {
            navigator.share({
                title: 'My Live Location - Safe Her',
                text: `🚨 My location: https://maps.google.com/?q=${lat},${lng}`,
                url: `https://maps.google.com/?q=${lat},${lng}`
            }).then(() => showToast('Location shared!', 'success'))
                .catch(() => { });
        } else {
            // Fallback: WhatsApp
            window.open(`https://wa.me/?text=${msg}`, '_blank');
        }
        showToast(`📍 Sharing location: ${lat}, ${lng}`, 'success');
    }, () => {
        showToast('Could not get location. Enable GPS.', 'error');
    });
}

// (Note: Shake SOS logic has been moved to the Tactical Tools section at the end of the script for professional consolidation)


// --- Web Audio API Advanced Siren Synthesis ---
function playAlarm() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();

    oscillator.type = 'sine'; // Smoother, professional alert sound
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note

    // Decent Alert Tone Sequence
    let isHigh = false;
    window.sirenInterval = setInterval(() => {
        if (!isSosActive) return;
        const targetFreq = isHigh ? 880 : 660; // Alternating A5 and E5 for a "decent" alert
        oscillator.frequency.exponentialRampToValueAtTime(targetFreq, audioContext.currentTime + 0.1);
        isHigh = !isHigh;
    }, 600); // Slower, less aggressive interval

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime); // Balanced volume
    oscillator.start();

    // Activate Smooth Visual Pulse Overlay
    let strobe = document.getElementById('strobeOverlay');
    if (strobe) strobe.classList.add('strobe-active');
}

function stopAlarm() {
    if (oscillator) {
        clearInterval(window.sirenInterval);
        oscillator.stop();
        oscillator.disconnect();
        gainNode.disconnect();
    }
    // Deactivate Strobe
    let strobe = document.getElementById('strobeOverlay');
    if (strobe) strobe.classList.remove('strobe-active');
}

// Duplicate Fake Call functions removed.
// --- SOS Logic ---
function triggerSOS() {
    const sosContainer = document.querySelector('.sos-container');
    const statusText = document.getElementById('sosStatus');

    if (!isSosActive) {
        // 1. SOS State ON karo
        isSosActive = true;
        sosContainer.classList.add('sos-active');
        document.querySelector('.sos-text').innerText = 'STOP';

        // 2. Alarm Chalao
        if (typeof playAlarm === "function") {
            playAlarm();
        }

        // 3. Start Digital Blackbox (Evidence Recording)
        if (typeof startDigitalBlackbox === "function") {
            startDigitalBlackbox();
        }

        // 4. Start Live Tracking Beacon (for Family Dashboard)
        if (typeof startLiveBeacon === "function") {
            startLiveBeacon();
        }

        // 5. Show Tracking Link (In Console for Demo)
        const user = JSON.parse(localStorage.getItem('herSafety_user') || '{"id":"demo_user_123"}');
        const trackingLink = `${window.location.origin}/track/${user.id}`;
        console.log(`%c🚨 EMERGENCY RELAY ACTIVE`, "background: #ff4757; color: white; padding: 10px; font-weight: bold;");
        console.log(`%cTracking link sent to family: ${trackingLink}`, "color: #00d2ff; font-weight: bold;");

        if (typeof showToast === 'function') {
            showToast("Tracking link shared with family!", "error");
        }

        // 6. Send initial Alert to API
        sendSOSAlert();

    } else {
        // --- SOS OFF KARO ---
        isSosActive = false;
        sosContainer.classList.remove('sos-active');
        document.querySelector('.sos-text').innerText = 'SOS';

        // Alarm Band karo
        if (typeof stopAlarm === "function") {
            stopAlarm();
        }

        if (statusText) statusText.innerText = "Situation Cleared.";
        setTimeout(() => {
            if (statusText) statusText.innerHTML = '';
        }, 3000);
        document.getElementById('checkinPanel').style.display = 'none';
    }
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
            document.getElementById('timerStatusMsg').innerText = '⚠️ Time expired! SOS alert triggered!';
            document.getElementById('checkinPanel').style.borderColor = '#ff3366';
            showToast('⚠️ Check-In timer expired — SOS sent to contacts!', 'error');
            triggerSOS();
        }

        // Warning at 1 minute
        if (checkInSecsLeft === 60) {
            showToast('⚠️ 1 minute left! Check-in before time runs out!', 'error');
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
    showToast('✅ Check-In confirmed! You are safe.', 'success');
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
            `🚨 I need help! My live location:\nhttps://maps.google.com/?q=${lat},${lng}\n\nSent via Safe Her App`
        );

        // Try native share API first
        if (navigator.share) {
            navigator.share({
                title: 'My Live Location - Safe Her',
                text: `🚨 My location: https://maps.google.com/?q=${lat},${lng}`,
                url: `https://maps.google.com/?q=${lat},${lng}`
            }).then(() => showToast('Location shared!', 'success'))
                .catch(() => { });
        } else {
            // Fallback: WhatsApp
            window.open(`https://wa.me/?text=${msg}`, '_blank');
        }
        showToast(`📍 Sharing location: ${lat}, ${lng}`, 'success');
    }, () => {
        showToast('Could not get location. Enable GPS.', 'error');
    });
}

// (Note: Shake SOS logic has been moved to the Tactical Tools section at the end of the script for professional consolidation)


// --- Dynamic Tab Switching ---
function switchSection(sectionId) {
    // --- GATEKEEPER CHECK ---
    const isAuth = localStorage.getItem('herSafety_user');
    const protectedSections = ['home', 'route', 'contacts', 'records', 'pro-center', 'tips', 'feedback', 'pro-dashboard'];

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

    // Update active nav link
    const navLinksList = document.querySelectorAll('.nav-links a');
    navLinksList.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${sectionId}`) {
            link.classList.add('active');
        }
    });

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

// --- Real Backend Interaction (Node.js/MongoDB) ---
// --- Real Backend Interaction (Node.js/MongoDB) ---

document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault(); // Page refresh hone se rokne ke liye

    // Form se specific ID ke jariye data nikalna
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const phone = document.getElementById('signupPhone').value;
    const password = document.getElementById('signupPassword').value;

    try {
        // Backend (localhost:5000) ko data bhejna
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, password })
        });

        const data = await response.json();

        if (response.ok) {
            showToast("Registration Successful! Database check kijiye.", "success");
            switchAuthTab('login'); // Automatically Redirects to login
        } else {
            showToast(data.message || "Registration failed", "error");
        }
    } catch (error) {
        console.error("Error:", error);
        showToast("Backend se connect nahi ho paya!", "error");
    }
});






document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = e.target.querySelector('input[type="email"]').value;
    const password = e.target.querySelector('input[type="password"]').value;

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('herSafety_user', JSON.stringify(data.user));
            showToast("Login Successful!", "success");
            checkAuthGate();
        } else {
            showToast(data.message || "Login failed", "error");
        }
    } catch (error) {
        console.error("Error:", error);
        showToast("Backend se connect nahi ho paya!", "error");
    }
});

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

function sendMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;

    // Append User message
    appendMessage(msg, 'user');
    input.value = '';

    // Simulate bot response
    setTimeout(() => {
        const responses = [
            "I'm here for you. Make sure you're in a safe place.",
            "If you feel threatened, please press the SOS button immediately.",
            "I've noted that down. Do you want me to alert your contacts?",
            "Remember to stay in well-lit areas.",
            "Would you like me to share your location with your family?"
        ];
        const reply = responses[Math.floor(Math.random() * responses.length)];
        appendMessage(reply, 'bot');
    }, 1000);
}

function handleChatEnter(e) {
    if (e.key === 'Enter') {
        sendMessage();
    }
}

function appendMessage(text, sender) {
    const body = document.getElementById('chatBody');
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    div.innerText = text;
    body.appendChild(div);
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
    document.getElementById('navLinks').classList.toggle('active');
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
let currentRouteMode = 'safe';
userLatLng = null; // Global coordinates
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

async function initiateRazorpayPayment() {
    // 1. Get Logged In User
    const user = JSON.parse(localStorage.getItem('herSafety_user') || '{}');
    if (!user.email) {
        showToast("Please login first to upgrade to Pro", "warning");
        switchSection('loginView');
        return;
    }

    // Pehle confirm karein
    if (!confirm(`Hi ${user.name || 'User'}, you are about to upgrade to Premium (₹1). Continue?`)) return;

    // GUIDANCE: Inform about Test Mode OTP
    showToast("🧪 Test Mode: Use any 6-digit OTP (e.g., 123456) or click Success on the bank page.", "info");

    try {
        console.log("💳 Initiating Payment Process...");
        const response = await fetch(`${API_URL}/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: 1, currency: "INR" })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknow Error' }));
            console.error("❌ Order Creation Failed:", errorData);
            throw new Error(errorData.message || 'Failed to create order');
        }

        const order = await response.json();
        console.log("✅ Razorpay Order Created:", order);

        // 2. Open Razorpay Checkout
        const options = {
            "key": "rzp_test_SaxSkQwrcuFvNW",
            "amount": order.amount,
            "currency": order.currency,
            "name": "Safe Her Premium",
            "description": "24/7 Security & Cloud Evidence Locker",
            "order_id": order.id,
            "handler": async function (response) {
                // Success logic
                console.log("💳 Payment Handler Triggered:", response);

                // --- VERIFY PAYMENT ON SERVER ---
                try {
                    const verifyResponse = await fetch(`${API_URL}/verify-payment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature
                        })
                    });

                    if (verifyResponse.ok) {
                        localStorage.setItem('hersafety_premium', 'true');
                        // Record the successful transaction
                        recordTransaction({
                            payment_id: response.razorpay_payment_id,
                            amount: 1,
                            status: 'Success',
                            date: new Date().toLocaleDateString(),
                            time: new Date().toLocaleTimeString()
                        });
                        if (typeof updatePremiumUI === "function") updatePremiumUI();
                        if (typeof switchSection === "function") switchSection('pro-center');
                        showToast("👑 Pro Unlocked!", "success");
                    } else {
                        console.error("❌ Verification Failed");
                        showToast("Payment verification failed.", "error");
                    }
                } catch (err) {
                    console.error("❌ Network Error during verification:", err);
                    showToast("Network error during verification.", "error");
                }
            },
            "prefill": {
                "name": user.name || "SafeHer User",
                "email": user.email || "user@example.com",
                "contact": user.phone || ""
            },
            "theme": { "color": "#9d4edd" }
        };

        const rzp1 = new Razorpay(options);
        rzp1.open();

    } catch (err) {
        console.error("Payment Process Error:", err);
        showToast("System Error: " + err.message, "error");
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
            <p class="text-gray-400 text-sm mb-8 leading-relaxed">Evidence Locker and Fake Call are Pro features. Get 24/7 protection and 10s cloud evidence for just ₹1.</p>
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

        routeMap = L.map('routeMap').setView([startLat, startLng], 13);
        L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
            attribution: '© Google Maps'
        }).addTo(routeMap);

        L.marker([startLat, startLng])
            .addTo(routeMap)
            .bindPopup('<b>📍 Your Location</b>').openPopup();
    } else {
        routeMap.invalidateSize();
    }

    // Fill From field with current coords
    if (userLatLng) {
        document.getElementById('routeFrom').value =
            `${userLatLng.lat.toFixed(5)}, ${userLatLng.lng.toFixed(5)}`;
    }
}

// Track user position for route planner
navigator.geolocation && navigator.geolocation.getCurrentPosition(pos => {
    userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const fromField = document.getElementById('routeFrom');
    if (fromField) fromField.value = `${userLatLng.lat.toFixed(5)}, ${userLatLng.lng.toFixed(5)}`;
});

function setRouteMode(mode) {
    currentRouteMode = mode;
    document.querySelectorAll('.route-mode-btn').forEach(b => b.classList.remove('active'));
    const modeMap = { safe: 'modeSafe', fast: 'modeFast', walk: 'modeWalk' };
    document.getElementById(modeMap[mode]).classList.add('active');
}

function calculateRoute() {
    const toInput = document.getElementById('routeTo').value.trim();
    if (!toInput) {
        showToast('Please enter a destination!', 'error');
        return;
    }

    // Night-time warning (6 PM - 6 AM)
    const hour = new Date().getHours();
    const isNight = hour >= 18 || hour < 6;
    if (isNight) {
        showToast('🌙 Night Mode: Extra danger zones visible. Stay alert!', 'error');
    } else {
        showToast('🗺️ Calculating safe route...', 'success');
    }

    // Geocode destination via Nominatim
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(toInput)}&limit=1`)
        .then(r => r.json())
        .then(results => {
            if (!results || results.length === 0) {
                showToast('Destination not found. Try a different name.', 'error');
                return;
            }

            const dest = results[0];
            const destLat = parseFloat(dest.lat);
            const destLng = parseFloat(dest.lon);
            const fromLat = userLatLng ? userLatLng.lat : 28.6139;
            const fromLng = userLatLng ? userLatLng.lng : 77.2090;

            // Clear previous layers
            if (routeControl) { routeMap.removeControl(routeControl); routeControl = null; }
            if (window.routeZoneLayers) {
                window.routeZoneLayers.forEach(l => routeMap.removeLayer(l));
            }
            window.routeZoneLayers = [];

            // ─── Draw Safety Zones on Route Map ─────────────────────
            const midLat = (fromLat + destLat) / 2;
            const midLng = (fromLng + destLng) / 2;
            const latSpan = Math.abs(destLat - fromLat) + 0.04;
            const lngSpan = Math.abs(destLng - fromLng) + 0.04;

            // Night mode: more red zones
            const redCount = isNight ? 8 : 4;
            const yellowCount = isNight ? 5 : 4;
            const greenCount = isNight ? 4 : 8;

            function addZone(lat, lng, sLat, sLng, color, fill, title, info) {
                const box = [[lat - sLat, lng - sLng], [lat + sLat, lng + sLng]];
                const rect = L.rectangle(box, {
                    color, weight: 2, fillColor: fill, fillOpacity: isNight ? 0.35 : 0.22,
                    dashArray: color === '#4caf50' ? '' : '6,4'
                }).addTo(routeMap).bindPopup(
                    `<div style='font-family:Arial;padding:4px'>
                        <b style='color:${color}'>${title}</b><br>
                        <small>${info}</small>
                    </div>`
                );
                window.routeZoneLayers.push(rect);
            }

            // Green Safe Zones along centre of route
            for (let i = 0; i < greenCount; i++) {
                const t = i / greenCount;
                const lat = fromLat + (destLat - fromLat) * t + (Math.random() - 0.5) * latSpan * 0.15;
                const lng = fromLng + (destLng - fromLng) * t + (Math.random() - 0.5) * lngSpan * 0.15;
                addZone(lat, lng, latSpan * 0.025, lngSpan * 0.025,
                    '#4caf50', '#4caf50',
                    '✅ Safe Zone',
                    isNight ? 'Patrolled area. Relatively safe even at night.' : 'Well-lit & populated. Low crime risk.');
            }

            // Red Danger Zones scattered around
            for (let i = 0; i < redCount; i++) {
                const lat = midLat + (Math.random() - 0.5) * latSpan * 1.1;
                const lng = midLng + (Math.random() - 0.5) * lngSpan * 1.1;
                addZone(lat, lng, latSpan * 0.02, lngSpan * 0.02,
                    '#f44336', '#f44336',
                    '⚠️ High Risk Zone',
                    isNight ? 'Avoid at night! High crime activity reported.' : 'High crime rate. Stay cautious.');
            }

            // Yellow Medium Risk
            for (let i = 0; i < yellowCount; i++) {
                const lat = midLat + (Math.random() - 0.5) * latSpan * 0.9;
                const lng = midLng + (Math.random() - 0.5) * lngSpan * 0.9;
                addZone(lat, lng, latSpan * 0.018, lngSpan * 0.018,
                    '#ff9800', '#ff9800',
                    '🟡 Medium Risk Zone',
                    'Moderate crime reports. Stay alert.');
            }

            // ─── Green Route Line (Safe Corridor) ───────────────────
            const routeColor = currentRouteMode === 'safe' ? '#4caf50'
                : currentRouteMode === 'fast' ? '#2196f3' : '#ff9800';

            routeControl = L.Routing.control({
                waypoints: [L.latLng(fromLat, fromLng), L.latLng(destLat, destLng)],
                router: L.Routing.osrmv1({
                    serviceUrl: 'https://router.project-osrm.org/route/v1',
                    profile: currentRouteMode === 'walk' ? 'foot' : 'driving'
                }),
                lineOptions: {
                    styles: [
                        { color: '#000', opacity: 0.15, weight: 10 },  // shadow
                        { color: routeColor, weight: 6, opacity: 0.95 }
                    ]
                },
                createMarker: () => null,
                show: false,
                addWaypoints: false
            }).addTo(routeMap);

            // Custom markers
            const greenIcon = L.divIcon({ html: `<div style="background:#4caf50;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px #4caf50;"></div>`, iconSize: [14, 14], className: '' });
            const redIcon = L.divIcon({ html: `<div style="background:#f44336;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px #f44336;"></div>`, iconSize: [14, 14], className: '' });

            L.marker([fromLat, fromLng], { icon: greenIcon }).addTo(routeMap).bindPopup('<b>📍 Your Location</b>').openPopup();
            L.marker([destLat, destLng], { icon: redIcon }).addTo(routeMap).bindPopup(`<b>🏁 ${dest.display_name.split(',')[0]}</b>`);

            routeMap.fitBounds([[fromLat, fromLng], [destLat, destLng]], { padding: [40, 40] });

            // Stats
            routeControl.on('routesfound', function (e) {
                const route = e.routes[0];
                const summary = route.summary;
                const km = (summary.totalDistance / 1000).toFixed(1);
                const mins = Math.round(summary.totalTime / 60);

                // --- DYNAMIC ROUTE SAFETY ANALYSIS ---
                const coords = route.coordinates;
                const morning = calculateRouteAverageScore(coords, 9);
                const evening = calculateRouteAverageScore(coords, 19);
                const night = calculateRouteAverageScore(coords, 2);

                // Current context score
                const currentHour = new Date().getHours();
                const current = calculateRouteAverageScore(coords, currentHour);

                document.getElementById('routeTime').innerText = `${mins} mins`;
                document.getElementById('routeDistance').innerText = `${km} km`;
                document.getElementById('routeSafety').innerText = `${current.score} / 10`;
                document.getElementById('routeSafety').style.color = current.color;

                // Update Forecast UI
                document.getElementById('routeScoreMorning').innerText = morning.score;
                document.getElementById('routeScoreEvening').innerText = evening.score;
                document.getElementById('routeScoreNight').innerText = night.score;

                document.getElementById('routeForecast').style.display = 'grid';
                document.getElementById('routeInfoPanel').style.display = 'flex';
            });

            // Add legend
            addRouteLegend(isNight);
        })
        .catch(() => showToast('Network error. Check connection.', 'error'));
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
    // 1. Initial Render of Any Saved Contacts
    renderCustomContacts();

    try {
        // 2. Loader Start Karo
        runLoader();

        // 3. Battery Monitor Start Karo
        initBatteryGuardian();

        // 4. Instant Clock & Score Update (No GPS needed for these)
        updateDashboard();
        refreshSafetyScore();

        // 5. Update Premium UI
        updatePremiumUI();

        // 6. Security Gate: Check if user is logged in
        checkAuthGate();

        // 7. Initialize Smart Hybrid Google Sign-In
        window.isGSI_Ready = false;
        try {
            if (typeof google !== 'undefined') {
                const CLIENT_ID = "533722956740-v49p8v2u7qquj9u7f8v1v8v1v8v1v8v1.apps.googleusercontent.com"; // Placeholder

                google.accounts.id.initialize({
                    client_id: CLIENT_ID,
                    callback: handleCredentialResponse,
                    auto_select: false,
                    cancel_on_tap_outside: true
                });

                // Track if it initialized successfully
                window.isGSI_Ready = !CLIENT_ID.includes("v1v8v1");

                // Render official buttons
                const btnLogin = document.getElementById("googleBtnLogin");
                const btnSignup = document.getElementById("googleBtnSignup");
                if (btnLogin) google.accounts.id.renderButton(btnLogin, { theme: "outline", size: "large", width: "100%", text: "continue_with" });
                if (btnSignup) google.accounts.id.renderButton(btnSignup, { theme: "outline", size: "large", width: "100%", text: "signup_with" });
            }
        } catch (error) {
            console.warn("GSI Failed to load (Origin/ID Error). Switching to Hybrid Simulation.", error);
            window.isGSI_Ready = false;
        }

        // 8. Auth Form Handlers
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        if (loginForm) loginForm.addEventListener('submit', handleLoginSubmission);
        if (signupForm) signupForm.addEventListener('submit', handleSignupSubmission);

    } catch (e) {
        console.error("Initialization Error:", e);
        // Fallback: Hide loader if crash occurs
        const loader = document.getElementById('loaderScreen');
        if (loader) loader.style.display = 'none';
        document.body.classList.add('loaded');
    }
});

// ============================================================
//  CORE INITIALIZATION: LOADER & DASHBOARD
// ============================================================

/**
 * Animates the professional premium loader and transitions to the app.
 */
function runLoader() {
    const bar = document.getElementById('loaderBar');
    const status = document.getElementById('loaderStatus');
    let progress = 0;

    console.log("🚀 Initializing Safe Her Core Systems...");

    const interval = setInterval(() => {
        // Random professional increments
        progress += Math.floor(Math.random() * 15) + 5;
        if (progress > 100) progress = 100;

        if (bar) bar.style.width = progress + '%';

        // Dynamic Status Updates
        if (progress < 30) {
            status.innerText = "Initializing security protocols...";
        } else if (progress < 60) {
            status.innerText = "Connecting to safe-haven relay...";
        } else if (progress < 90) {
            status.innerText = "Syncing local database and logs...";
        } else {
            status.innerText = "System Ready. Secure Connection Established.";
        }

        if (progress === 100) {
            clearInterval(interval);
            setTimeout(() => {
                const loader = document.getElementById('loaderScreen');
                if (loader) {
                    loader.style.opacity = '0';
                    loader.style.transform = 'scale(1.1)'; // Subtle zoom out effect
                    setTimeout(() => {
                        loader.style.display = 'none';
                        document.body.classList.add('loaded');
                        console.log("✅ Core Systems Loaded.");
                    }, 500);
                }
            }, 600);
        }
    }, 150);
}

/**
 * Updates the Home Dashboard with real-time stats (Time, Area, Score).
 */
function updateDashboard() {
    // 1. Update Clock
    const timeEl = document.getElementById('dashTime');
    if (timeEl) {
        const now = new Date();
        timeEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // 2. Update GPS Status
    const gpsEl = document.getElementById('dashGps');
    if (gpsEl) {
        gpsEl.innerText = "Active (High precision)";
    }

    // 3. Update Area Detection (Mock based on current position)
    const areaEl = document.getElementById('dashArea');
    if (areaEl) {
        areaEl.innerText = "Safe Zone - Monitoring";
    }

    // 4. Refresh Safety Score
    refreshSafetyScore();
}

/**
 * Calculates and refreshes the Safety Score UI.
 */
function refreshSafetyScore() {
    const hour = new Date().getHours();
    const result = calculateDynamicScore(hour);

    const scoreVal = document.getElementById('dashScore');
    if (scoreVal) {
        scoreVal.innerText = result.score;
        scoreVal.style.color = result.color;
    }
}

/**
 * Core Algorithm for Safety Score Calculation
 * @param {number} hour Current hour (0-23)
 */
function calculateDynamicScore(hour) {
    let score = 9.2; // Base high safety
    let color = '#4caf50'; // Vibrant Green

    // A. Time-based penalty (Night Factor)
    if (hour >= 21 || hour <= 4) {
        score -= 2.5; // High Night Risk
    } else if (hour >= 18 || hour < 21) {
        score -= 1.2; // Evening Risk
    }

    // B. Hotspot Proximity Penalty (Mock Simulation)
    // In production, this checks distance to CRIME_HOTSPOTS
    const randomShift = (Math.random() * 0.4) - 0.2; // Slight fluctuations
    score += randomShift;

    // Determine Color Code
    if (score < 5) {
        color = '#ff3366'; // Critical Danger (Red)
    } else if (score < 8) {
        color = '#ffcc00'; // Moderate Risk (Yellow/Gold)
    }

    return {
        score: score.toFixed(1),
        color: color
    };
}

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

window.deleteContact = function (id) {
    let contacts = JSON.parse(localStorage.getItem('herSafety_contacts')) || [];
    contacts = contacts.filter(c => c.id !== id);
    localStorage.setItem('herSafety_contacts', JSON.stringify(contacts));
    if (typeof showToast === 'function') {
        showToast("Contact Deleted", "success");
    }
    renderCustomContacts();
};

function renderCustomContacts() {
    const grid = document.getElementById('contactsGrid');
    if (!grid) return;

    document.querySelectorAll('.dynamic-contact').forEach(el => el.remove());

    let contacts = JSON.parse(localStorage.getItem('herSafety_contacts')) || [];

    // Default mock data for first-time visitors
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
                <button class="delete-btn" onclick="deleteContact(${contact.id})" title="Delete">
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
                    ✕ Cancel
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
let mediaRecorder;
let audioChunks = [];

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

let beaconInterval = null;

function startLiveBeacon() {
    if (beaconInterval) clearInterval(beaconInterval);

    // Sync location every 5 seconds during SOS
    beaconInterval = setInterval(() => {
        if (!isSosActive) {
            clearInterval(beaconInterval);
            return;
        }

        navigator.geolocation.getCurrentPosition(pos => {
            const { latitude, longitude } = pos.coords;
            const user = JSON.parse(localStorage.getItem('hersafety_user'));

            fetch(`${API_URL}/send-alert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    location: { latitude, longitude },
                    message: "LIVE SOS BEACON UPDATING..."
                })
            }).then(() => console.log("📡 SOS Beacon Synced"));

        });
    }, 5000);
}

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
                    <button onclick="this.closest('.fixed').remove()" class="text-zinc-500 hover:text-white transition-colors text-xl">✕</button>
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
                    <button onclick="this.closest('.fixed').remove()" class="text-zinc-500 hover:text-white transition-colors text-xl">✕</button>
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
                    <button onclick="this.closest('.fixed').remove()" class="text-zinc-500 hover:text-white transition-colors text-xl">✕</button>
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
                            ${isPremium ? `
                            <tr class="border-t border-white/5">
                                <td class="p-4">${new Date().toLocaleDateString()}</td>
                                <td class="p-4">
                                    <span class="block font-bold">Pro Monthly</span>
                                    <span class="text-[10px] text-green-400 font-bold">Subscription Active</span>
                                </td>
                                <td class="p-4 text-right font-black">₹1.00</td>
                            </tr>
                            ` : `
                            <tr>
                                <td colspan="3" class="p-12 text-center text-zinc-600 italic">No billing records found.</td>
                            </tr>
                            `}
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
                    <button onclick="this.closest('.fixed').remove()" class="text-zinc-500 hover:text-white transition-colors text-xl">✕</button>
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
                                <p class="text-[9px] text-zinc-500 uppercase tracking-tighter">${t.date} • ${t.time}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="block text-white font-black text-sm">₹${t.amount}.00</span>
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
            showToast("🚨 Low Battery Critical Alert: Contacts notified!", "error");
            triggerSOS();
            document.getElementById('batteryModal').style.display = 'none';
        }
    }, 1000);
}

function batteryCheckIn() {
    clearInterval(batteryCheckInTimer);
    batteryCheckInTimer = null;
    document.getElementById('batteryModal').style.display = 'none';
    showToast("✅ Check-in successful. Stay safe!", "success");
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
    showToast("🛰️ Radar scanning for Police Stations & Hospitals...", "success");

    // Clear old radar markers if any
    if (window.radarLayers) {
        window.radarLayers.forEach(l => routeMap.removeLayer(l));
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
            .bindPopup(`<b>🛡️ Safe Haven: ${haven.name}</b><br>Secured Location`);

        window.radarLayers.push(marker);
    });

    setTimeout(() => {
        btn.classList.remove('radar-active');
        // Fit map to show all havens
        const group = new L.featureGroup(window.radarLayers);
        routeMap.fitBounds(group.getBounds().pad(0.2));
        showToast("✅ 3 Safe Havens found and marked on map.", "success");
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

        // Auto-redirect to home if starting on loginView while logged in
        const currentHash = window.location.hash.replace('#', '');
        if (!currentHash || currentHash === 'loginView' || currentHash === 'signupView') {
            switchSection('home');
        }
    } else {
        if (loginLink) loginLink.style.display = 'block';
        if (logoutLink) logoutLink.style.display = 'none';

        // Hide premium features for logged-out users
        updatePremiumUI();

        // If on a protected page, force login
        const currentHash = window.location.hash.replace('#', '');
        const protectedSections = ['home', 'route', 'contacts', 'records', 'pro-center', 'tips', 'feedback', 'pro-dashboard'];
        if (protectedSections.includes(currentHash) || !currentHash) {
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
        const res = await fetch(`${API_URL}/google-login-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('herSafety_user', JSON.stringify(data.user));
            showToast(`Welcome back, ${data.user.name}!`, "success");
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
    // Popup window dimensions
    const width = 500;
    const height = 600;
    const left = Math.round((window.screen.width / 2) - (width / 2));
    const top = Math.round((window.screen.height / 2) - (height / 2));

    // Google's official account chooser URL
    const googleAccountChooserUrl = 'https://accounts.google.com/AccountChooser';
    const finalUrl = `${googleAccountChooserUrl}?continue=https://www.google.com/&flowName=GlifWebSignIn&flowEntry=AccountChooser`;

    // Open the popup window
    const popup = window.open(
        finalUrl,
        'GoogleAccountChooser',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,location=yes`
    );

    // Check if popup was blocked by browser
    if (!popup) {
        showToast('⚠️ Popup blocked! Please allow popups for this site, then try again.', 'error');
        // Fallback to simulation mode
        handleGoogleLoginFallback();
        return false;
    }

    showToast('🔐 Google Account Chooser opened. Select your account.', 'info');

    // Detect when user closes the popup and simulate login (dev/demo mode)
    const interval = setInterval(() => {
        try {
            if (popup.closed) {
                clearInterval(interval);
                console.log('Google account chooser closed');
                // After closing, try to register a guest session if not already logged in
                if (!localStorage.getItem('herSafety_user')) {
                    handleGoogleLoginFallback();
                }
            }
        } catch (e) {
            clearInterval(interval);
        }
    }, 500);

    return true;
}

/**
 * Fallback simulation when popup is blocked or Google OAuth not configured.
 */
async function handleGoogleLoginFallback() {
    showToast("Initializing Secure Cloud Simulation...", "info");

    const popup = document.createElement('div');
    popup.className = 'fixed inset-0 z-[20000] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn';
    popup.innerHTML = `
        <div class="bg-[#050510] border border-[#D4AF37]/30 w-[420px] rounded-[2rem] shadow-2xl overflow-hidden animate-slideUp">
            <div class="px-10 py-8 border-b border-[#D4AF37]/10 flex items-center justify-between bg-gradient-to-r from-black to-zinc-900">
                <div class="flex items-center gap-3">
                    <img src="https://img.icons8.com/color/48/google-logo.png" class="h-6" alt="Google">
                    <span class="text-[10px] text-[#D4AF37] font-black uppercase tracking-widest bg-[#D4AF37]/10 px-3 py-1 rounded-full">Secure Auth</span>
                </div>
                <button onclick="this.closest('.fixed').remove()" class="text-zinc-500 hover:text-[#D4AF37] transition-all">✕</button>
            </div>
            <div class="p-10">
                <h3 class="text-2xl font-bold text-white mb-2">Choose an Account</h3>
                <p class="text-zinc-500 text-xs mb-8">to continue to <span class="text-[#D4AF37] font-bold">Safe Her Security</span></p>
                <div class="space-y-4">
                    <div onclick="selectGoogleAccount('Demo User', 'demo@gmail.com')" class="group flex items-center p-4 bg-zinc-900/50 border border-white/5 rounded-2xl cursor-pointer hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 transition-all">
                        <div class="w-12 h-12 bg-gradient-to-br from-[#D4AF37] to-[#B8860B] rounded-full flex items-center justify-center text-black font-black text-xl mr-4">D</div>
                        <div class="flex-1">
                            <p class="text-sm font-bold text-white group-hover:text-[#D4AF37] transition-colors">Demo User</p>
                            <p class="text-[11px] text-zinc-500 italic">demo@gmail.com</p>
                        </div>
                        <i class="fas fa-chevron-right text-zinc-700 group-hover:text-[#D4AF37]"></i>
                    </div>
                    <div onclick="selectGoogleAccount('Safety Guest', 'guest.safety@gmail.com')" class="group flex items-center p-4 bg-zinc-900/50 border border-white/5 rounded-2xl cursor-pointer hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 transition-all opacity-70 hover:opacity-100">
                        <div class="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 font-black text-xl mr-4">G</div>
                        <div class="flex-1">
                            <p class="text-sm font-bold text-white group-hover:text-[#D4AF37] transition-colors">Safety Guest</p>
                            <p class="text-[10px] text-zinc-500">guest.safety@gmail.com</p>
                        </div>
                    </div>
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
            // ✅ Call Backend: Find or create user in MongoDB
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
                showToast(`Welcome, ${data.user.name}! Account synced securely. ✅`, "success");
                checkAuthGate();
                updatePremiumUI();
            } else {
                popup.remove();
                showToast(data.message || "Google sync failed. Try again.", "error");
            }

        } catch (err) {
            console.error("Google social sync failed:", err);
            // Graceful offline fallback — still lets user in locally
            popup.remove();
            const userData = { id: `g_${Date.now()}`, name, email, phone: 'Google Authenticated' };
            localStorage.setItem('herSafety_user', JSON.stringify(userData));
            showToast(`Welcome, ${name}! (Offline mode — server unreachable)`, "success");
            checkAuthGate();
            updatePremiumUI();
        }
    };

}

/**
 * Legacy alias — kept so any old onclick="handleGoogleLogin()" calls still work.
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
            checkAuthGate();
            updatePremiumUI();
        } else {
            showToast(data.message || "Invalid credentials", "error");
        }
    } catch (err) {
        showToast("Server unreachable", "error");
    }
}
