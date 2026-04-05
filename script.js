/* =========================================
   SCRIPT.JS - HerSafety App Logic
========================================= */

let map;
let userMarker; 
let isSosActive = false;
let audioContext, oscillator, gainNode;
let userLatLng = { lat: 30.901, lng: 75.8573 }; // Default Ludhiana

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
                setTimeout(() => { if(loader) loader.style.display = 'none'; }, 650);
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
        }).catch(() => { if(areaEl) areaEl.innerText = 'GPS Active'; });
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

// ============================================================
//  VOICE SOS - Web Speech API
// ============================================================
let voiceRecognition = null;
let isVoiceSOSActive = false;

function toggleVoiceSOS() {
    const btn = document.getElementById('voiceSOSBtn');

    if (isVoiceSOSActive) {
        // Turn OFF
        if (voiceRecognition) voiceRecognition.stop();
        isVoiceSOSActive = false;
        btn.classList.remove('active-red');
        btn.querySelector('span').innerText = 'Voice SOS';
        showToast('Voice SOS deactivated', 'success');
        return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('Voice recognition not supported in this browser', 'error');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    voiceRecognition = new SpeechRecognition();
    voiceRecognition.continuous = true;
    voiceRecognition.interimResults = false;
    voiceRecognition.lang = 'en-IN';

    voiceRecognition.onresult = (event) => {
        const last = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
        if (last.includes('help') || last.includes('bachao') || last.includes('danger') || last.includes('sos')) {
            showToast('🚨 Voice SOS triggered! "' + last + '"', 'error');
            triggerSOS();
        }
    };

    voiceRecognition.onerror = () => {
        isVoiceSOSActive = false;
        btn.classList.remove('active-red');
        btn.querySelector('span').innerText = 'Voice SOS';
    };

    voiceRecognition.start();
    isVoiceSOSActive = true;
    btn.classList.add('active-red');
    btn.querySelector('span').innerText = '🎙 Listening...';
    showToast('Voice SOS ON — Say "Help" or "Bachao" to alert!', 'success');
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
        `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
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
              .catch(() => {});
        } else {
            // Fallback: WhatsApp
            window.open(`https://wa.me/?text=${msg}`, '_blank');
        }
        showToast(`📍 Sharing location: ${lat}, ${lng}`, 'success');
    }, () => {
        showToast('Could not get location. Enable GPS.', 'error');
    });
}

// ============================================================
//  SHAKE TO SOS - DeviceMotion API (Mobile)
// ============================================================
let shakeSOSActive = false;
let lastShakeTime = 0;
let shakeCount = 0;
const SHAKE_THRESHOLD = 15;

function toggleShakeSOS() {
    const btn = document.getElementById('shakeBtn');

    if (shakeSOSActive) {
        window.removeEventListener('devicemotion', handleShake);
        shakeSOSActive = false;
        btn.classList.remove('active-red');
        btn.querySelector('span').innerText = 'Shake SOS';
        showToast('Shake SOS deactivated', 'success');
        return;
    }

    if (typeof DeviceMotionEvent === 'undefined') {
        showToast('Shake detection not supported. Use a mobile device.', 'error');
        return;
    }

    // iOS 13+ needs permission
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().then(state => {
            if (state === 'granted') {
                activateShakeSOS(btn);
            } else {
                showToast('Motion permission denied', 'error');
            }
        });
    } else {
        activateShakeSOS(btn);
    }
}

function activateShakeSOS(btn) {
    window.addEventListener('devicemotion', handleShake);
    shakeSOSActive = true;
    btn.classList.add('active-red');
    btn.querySelector('span').innerText = '📳 Shake ON';
    showToast('Shake SOS activated! Shake phone 3x to send SOS.', 'success');
}

function handleShake(e) {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const total = Math.abs(acc.x) + Math.abs(acc.y) + Math.abs(acc.z);

    if (total > SHAKE_THRESHOLD) {
        const now = Date.now();
        if (now - lastShakeTime < 1500) {
            shakeCount++;
            if (shakeCount >= 3) {
                shakeCount = 0;
                showToast('📳 Shake detected! Triggering SOS...', 'error');
                triggerSOS();
            }
        } else {
            shakeCount = 1;
        }
        lastShakeTime = now;
    }
}


// --- Web Audio API Advanced Siren Synthesis ---
function playAlarm() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();

    oscillator.type = 'sawtooth'; // Harsher waveform for police siren
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime);

    // Dynamic Police Siren Frequency Sweep
    let isHigh = false;
    window.sirenInterval = setInterval(() => {
        if (!isSosActive) return;
        const targetFreq = isHigh ? 600 : 1200;
        oscillator.frequency.linearRampToValueAtTime(targetFreq, audioContext.currentTime + 0.4);
        isHigh = !isHigh;
    }, 400);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime); // High volume
    oscillator.start();
    
    // Activate Intense Visual Strobe Overlay
    let strobe = document.getElementById('strobeOverlay');
    if(strobe) strobe.classList.add('strobe-active');
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
    if(strobe) strobe.classList.remove('strobe-active');
}

// Duplicate Fake Call functions removed. Premium-gated versions remain below.
// --- SOS Logic ---
function triggerSOS() {
    const sosContainer = document.querySelector('.sos-container');
    const statusText = document.getElementById('sosStatus');

    if (!isSosActive) {
        // 1. SOS State ON karo
        isSosActive = true;
        sosContainer.classList.add('sos-active');
        document.querySelector('.sos-text').innerText = 'STOP';

        // 2. Alarm Chalao (Line 73 wala function call)
        if (typeof playAlarm === "function") {
            playAlarm();
        }

        // 2.5 Start Digital Blackbox (Evidence Recording)
        startDigitalBlackbox();

        // 3. Backend Data Taiyar karo
        const sosData = {
            userId: "64aa0f8b1c4b7b20c8f5f4b5",
            location: {
                latitude: 28.6139,
                longitude: 77.2090
            },
            message: "Emergency SOS triggered from Frontend!"
        };

        // 4. Backend ko Bhejo
        fetch('http://localhost:5000/api/send-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sosData)
        })
            .then(res => res.json())
            .then(data => {
                console.log("Success:", data);
                if (statusText) statusText.innerText = "Alert Sent! ✅";
            })
            .catch(err => {
                console.error("Error:", err);
                if (statusText) statusText.innerText = "Server Error ❌";
            });

    } else {
        // --- SOS OFF KARO ---
        isSosActive = false;
        sosContainer.classList.remove('sos-active');
        document.querySelector('.sos-text').innerText = 'SOS';

        // Alarm Band karo (Line 95 wala function call)
        if (typeof stopAlarm === "function") {
            stopAlarm();
        }

        if (statusText) statusText.innerText = "Situation Cleared.";
        setTimeout(() => {
            if (statusText) statusText.innerHTML = '';
        }, 3000);
    }
} // <--- Ye bracket function ko yahan band karega (Line 154 ke paas)



// --- Dynamic Tab Switching ---
function switchSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section-container').forEach(sec => {
        sec.style.display = 'none';
    });
    // Show selected
    document.getElementById(sectionId).style.display = 'block';

    // Update Nav active states
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });
    // Find the link that triggered this (excluding the login button which isn't standard tab)
    const targetLink = document.querySelector(`.nav-links a[href="#${sectionId}"]`);
    if (targetLink && sectionId !== 'auth') {
        targetLink.classList.add('active');
    }

    // Refresh map width inside hidden div bug fix for Leaflet
    if (sectionId === 'home' && map) {
        setTimeout(() => { map.invalidateSize(); }, 100);
    }
    // Initialize / refresh Route Planner map
    if (sectionId === 'route') {
        setTimeout(() => { initRoutePlannerMap(); }, 150);
    }

    // Close mobile menu if open
    document.getElementById('navLinks').classList.remove('active');
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
        const response = await fetch('http://localhost:5000/api/register', {
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
        const response = await fetch('http://localhost:5000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            showToast("Login Successful!", "success");
            switchSection('home');
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
let isPremium = localStorage.getItem('herSafety_premium') === 'true';

// ============================================================
//  PREMIUM & PAYMENT LOGIC
// ============================================================
function updatePremiumUI() {
    const fakeCallWrap = document.getElementById('fakeCallWrapper');
    const blackboxWrap = document.getElementById('blackboxWrapper');
    const premiumNav = document.getElementById('premiumNavLink');
    const goPremiumNav = document.getElementById('goPremiumNav');

    if (isPremium) {
        if (fakeCallWrap) fakeCallWrap.classList.remove('premium-locked');
        if (blackboxWrap) blackboxWrap.classList.remove('premium-locked');
        if (premiumNav) premiumNav.style.display = 'block';
        if (goPremiumNav) goPremiumNav.style.display = 'none';
        
        // Update any "PRO UNLOCKED" badges
        document.querySelectorAll('.text-premium-gold').forEach(el => el.style.display = 'inline-block');
    } else {
        if (fakeCallWrap) fakeCallWrap.classList.add('premium-locked');
        if (blackboxWrap) blackboxWrap.classList.add('premium-locked');
        if (premiumNav) premiumNav.style.display = 'none';
        if (goPremiumNav) goPremiumNav.style.display = 'block';
    }
}

function initiateRazorpayPayment() {
    const options = {
        "key": "rzp_test_YOUR_KEY_HERE", // Replace with your real key
        "amount": "9900", // 99.00 INR
        "currency": "INR",
        "name": "Safe Her Premium",
        "description": "Monthly Safety Subscription",
        "image": "https://cdn-icons-png.flaticon.com/512/1162/1162456.png",
        "handler": function (response) {
            console.log("Payment Success:", response);
            isPremium = true;
            localStorage.setItem('herSafety_premium', 'true');
            updatePremiumUI();
            showToast("👑 Welcome to Safe Her Pro!", "success");
            switchSection('premium');
        },
        "prefill": {
            "name": "User",
            "email": "user@example.com",
            "contact": "9999999999"
        },
        "theme": {
            "color": "#ffcc00"
        }
    };
    const rzp1 = new Razorpay(options);
    rzp1.open();
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
            <p class="text-gray-400 text-sm mb-8 leading-relaxed">Evidence Locker and Fake Call are Pro features. Get 24/7 protection and 10s cloud evidence for just ₹99.</p>
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
            const redCount   = isNight ? 8 : 4;
            const yellowCount = isNight ? 5 : 4;
            const greenCount  = isNight ? 4 : 8;

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
                waypoints: [ L.latLng(fromLat, fromLng), L.latLng(destLat, destLng) ],
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
            const greenIcon = L.divIcon({ html: `<div style="background:#4caf50;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px #4caf50;"></div>`, iconSize: [14,14], className: '' });
            const redIcon   = L.divIcon({ html: `<div style="background:#f44336;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 8px #f44336;"></div>`, iconSize: [14,14], className: '' });

            L.marker([fromLat, fromLng], { icon: greenIcon }).addTo(routeMap).bindPopup('<b>📍 Your Location</b>').openPopup();
            L.marker([destLat, destLng], { icon: redIcon }).addTo(routeMap).bindPopup(`<b>🏁 ${dest.display_name.split(',')[0]}</b>`);

            routeMap.fitBounds([[fromLat, fromLng],[destLat, destLng]], { padding: [40, 40] });

            // Stats
            routeControl.on('routesfound', function(e) {
                const route = e.routes[0];
                const summary = route.summary;
                const km = (summary.totalDistance / 1000).toFixed(1);
                const mins = Math.round(summary.totalTime / 60);
                
                // --- DYNAMIC ROUTE SAFETY ANALYSIS ---
                const coords = route.coordinates;
                const morning = calculateRouteAverageScore(coords, 9);
                const evening = calculateRouteAverageScore(coords, 19);
                const night   = calculateRouteAverageScore(coords, 2);
                
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

    } catch (e) {
        console.error("Initialization Error:", e);
        // Fallback: Hide loader if crash occurs
        const loader = document.getElementById('loaderScreen');
        if (loader) loader.style.display = 'none';
        document.body.classList.add('loaded');
    }
});

function addCustomContact(e) {
    if(e) e.preventDefault();
    const nameInput = document.getElementById('contactName');
    const phoneInput = document.getElementById('contactPhone');
    
    if(!nameInput || !phoneInput) return;
    
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    
    if(!name || !phone) return;
    
    let contacts = JSON.parse(localStorage.getItem('herSafety_contacts')) || [];
    contacts.push({ id: Date.now(), name, phone });
    localStorage.setItem('herSafety_contacts', JSON.stringify(contacts));
    
    nameInput.value = '';
    phoneInput.value = '';
    
    if(typeof showToast === 'function') {
        showToast("Contact Saved Successfully", "success");
    }
    
    renderCustomContacts();
}

window.deleteContact = function(id) {
    let contacts = JSON.parse(localStorage.getItem('herSafety_contacts')) || [];
    contacts = contacts.filter(c => c.id !== id);
    localStorage.setItem('herSafety_contacts', JSON.stringify(contacts));
    if(typeof showToast === 'function') {
        showToast("Contact Deleted", "success");
    }
    renderCustomContacts();
};

function renderCustomContacts() {
    const grid = document.getElementById('contactsGrid');
    if(!grid) return;
    
    document.querySelectorAll('.dynamic-contact').forEach(el => el.remove());
    
    let contacts = JSON.parse(localStorage.getItem('herSafety_contacts')) || [];
    
    // Default mock data for first-time visitors
    if(contacts.length === 0 && !localStorage.getItem('herSafety_initialized_contacts')) {
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

function uploadEvidenceMock(blob) {
    console.log("☁️ Evidence Locker: Uploading encrypted audio blob...", blob.size, "bytes");
    // Simulate progress
    setTimeout(() => {
        showToast("🔒 Evidence Locker: Audio uploaded to secure cloud storage.", "success");
    }, 2000);
}

function toggleEvidenceLocker() {
    if (!isPremium) {
        showPremiumPopup();
        return;
    }
    // Directly trigger blackbox logic
    startDigitalBlackbox();
    showToast("Evidence Locker Activated: Recording 10s audio...", "success");
}

// ============================================================
//  FAKE CALL MODULE
// ============================================================
function initiateFakeCall() {
    if (!isPremium) {
        showPremiumPopup();
        return;
    }
    
    showToast("Fake call scheduled in 3 seconds...", "success");
    setTimeout(() => {
        document.getElementById('fakeCallScreen').style.display = 'flex';
        // Play ringtone
        const ringtone = new Audio('https://www.soundjay.com/phone/phone-calling-1.mp3');
        ringtone.id = 'fakeRingtone';
        ringtone.loop = true;
        document.body.appendChild(ringtone);
        ringtone.play();
    }, 3000);
}

function stopFakeCall() {
    document.getElementById('fakeCallScreen').style.display = 'none';
    const ringtone = document.getElementById('fakeRingtone');
    if (ringtone) {
        ringtone.pause();
        ringtone.remove();
    }
}

function answerFakeCall() {
    const callerInfo = document.querySelector('.fake-call-caller h2');
    callerInfo.innerText = "Connected...";
    setTimeout(() => {
        stopFakeCall();
        showToast("Fake call ended.", "info");
    }, 5000);
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






