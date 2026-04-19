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

            routeControl = L.Routing.control({
                waypoints: [L.latLng(fromLat, fromLng), L.latLng(destLat, destLng)],
                router: L.Routing.osrmv1({ serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1' }),
                createMarker: () => null,
                show: false,
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
