import { API_BASE } from './config.js';
import { map } from './map.js';
import { allPlaces, bucketList, userLocation } from './state.js';
import { createNumberedIcon } from './ui.js';

export const routeLayer = L.geoJSON([], {
  style: feature => {
    const seg = feature?.properties?.segment || 'route';
    const styles = {
      'walk-to-stop': { color: '#22c55e', weight: 4, dashArray: '6 6' },
      bus: { color: '#ef4444', weight: 5 },
      'walk-from-stop': { color: '#3b82f6', weight: 4, dashArray: '6 6' },
      route: { color: '#ef4444', weight: 4 },
    };
    return styles[seg] || styles['route'];
  },
}).addTo(map);

export const routeMarkersLayer = L.layerGroup().addTo(map);

// Temporary highlight for a selected leg
let highlightLayer = null;
let legSteps = [];

// Show direct route from user location to a specific place
export async function showDirectRouteToPlace(coords) {
  if (!userLocation) {
    alert('Эхлээд "Миний байршил" товчийг дарж байршлаа тогтооно уу');
    return;
  }
  
  // Clear existing route
  clearRoute();
  
  // coords is [lon, lat]
  const destination = { lng: coords[0], lat: coords[1] };
  
  try {
    await drawRoute(userLocation, destination);
    
    // Add markers for start and end
    routeMarkersLayer.clearLayers();
    
    // Start marker (user location)
    L.marker([userLocation.lat, userLocation.lng], {
      icon: createNumberedIcon('📍', '#3b82f6')
    }).addTo(routeMarkersLayer)
      .bindPopup('<b>Эхлэх цэг</b>: Миний байршил');
    
    // End marker (destination)
    L.marker([destination.lat, destination.lng], {
      icon: createNumberedIcon('🎯', '#ef4444')
    }).addTo(routeMarkersLayer)
      .bindPopup('<b>Очих цэг</b>');
    
    // Fit map to show the route
    const bounds = L.latLngBounds([
      [userLocation.lat, userLocation.lng],
      [destination.lat, destination.lng]
    ]);
    map.fitBounds(bounds, { padding: [50, 50] });
  } catch (error) {
    console.error('Route error:', error);
    alert('Замын мэдээлэл татахад алдаа гарлаа');
  }
}

// 🧩 Helper: Safe fetch to avoid crashes when backend missing
async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return await res.json();
  } catch (err) {
    console.warn('⚠️ Route API error:', err.message);
    return { type: 'FeatureCollection', features: [] };
  }
}

// 🧩 Helper: Normalize stop names
function formatStopsListForDisplay(summary) {
  if (!summary) return '';
  const pushNormalized = (arr, name) => {
    if (!name && name !== 0) return;
    let n = String(name).replace(/;/g, ' / ').replace(/\s+/g, ' ').trim();
    if (!n) return;
    const compact = n.toLowerCase().replace(/\W+/g, '');
    if (compact === 'busstop') return;
    if (arr.length === 0 || arr[arr.length - 1] !== n) arr.push(n);
  };
  const seq = [];
  pushNormalized(seq, summary.start_stop?.name);
  (summary.intermediate_stops || []).forEach(st => pushNormalized(st.name));
  pushNormalized(seq, summary.end_stop?.name);
  return seq.slice(1, -1).map(n => `• ${n}`).join('<br>');
}

// 🧩 Combine bus summaries into one numbered list
function buildCombinedStopsListNumbered(summaries) {
  if (!Array.isArray(summaries) || summaries.length === 0) {
    return { startStop: '-', endStop: '-', middleHtml: '—' };
  }
  const seq = [];
  const pushNormalized = name => {
    if (!name && name !== 0) return;
    let n = String(name).replace(/;/g, ' / ').replace(/\s+/g, ' ').trim();
    if (!n) return;
    const compact = n.toLowerCase().replace(/\W+/g, '');
    if (compact === 'busstop') return;
    if (seq.length === 0 || seq[seq.length - 1] !== n) seq.push(n);
  };
  pushNormalized(summaries[0].start_stop?.name);
  summaries.forEach(s => (s.intermediate_stops || []).forEach(st => pushNormalized(st.name)));
  pushNormalized(summaries[summaries.length - 1].end_stop?.name);
  const middleStops = seq.slice(1, -1);
  const html = middleStops.length
    ? '<ol style="margin:0; padding-left:20px;">' + middleStops.map(s => `<li>${s}</li>`).join('') + '</ol>'
    : '—';
  return { startStop: seq[0] || '-', endStop: seq[seq.length - 1] || '-', middleHtml: html };
}

// 🧭 Show multi-destination route
export async function showBucketRoute() {
  if (!Array.isArray(bucketList) || bucketList.length < 1) {
    alert('Маршрут үүсгэхийн тулд 1-с дээш газар нэм');
    return;
  }
  if (!userLocation) {
    alert('Эхлээд "Миний байршил" товчийг дарж байршлаа тогтооно уу');
    return;
  }

  // ✅ Filter invalid or empty coords
  const validList = bucketList.filter(
    item => item && Array.isArray(item.coords) && item.coords.length === 2
  );
  if (validList.length === 0) {
    alert('Маршрут үүсгэхэд хүчинтэй газар олдсонгүй.');
    return;
  }

  const mode = document.getElementById('routeModeSelect').value;
  const busMode = mode === 'bus';

  routeLayer.clearLayers();
  routeMarkersLayer.clearLayers();
  legSteps = [];
  if (highlightLayer) {
    map.removeLayer(highlightLayer);
    highlightLayer = null;
  }

  const elSummary = document.getElementById('busSummary');
  if (elSummary) elSummary.innerHTML = '';

  // 🧩 Add first route: from user to first location
  let start = [userLocation.lng, userLocation.lat];
  let end = validList[0].coords;
  const firstUrl = new URL(`${API_BASE}${busMode ? '/route_bus' : '/route'}`);
  firstUrl.searchParams.set('start', `${start[0]},${start[1]}`);
  firstUrl.searchParams.set('end', `${end[0]},${end[1]}`);
  if (!busMode) firstUrl.searchParams.set('mode', mode);
  const firstGeo = await safeFetch(firstUrl);
  routeLayer.addData(firstGeo);

  const legSummaries = [];
  if (busMode && firstGeo.summary) legSummaries.push(firstGeo.summary);

  legSteps.push({
    idx: 0,
    fromLabel: 'Миний байршил',
    toLabel: validList[0].name,
    from: [start[0], start[1]],
    to: [end[0], end[1]],
    mode,
  });

  // 🧩 Add markers
  routeMarkersLayer.addLayer(
    L.marker([userLocation.lat, userLocation.lng], {
      icon: createNumberedIcon(0, '#3b82f6'),
    }).bindPopup('<b>Эхлэх цэг</b>: Миний байршил')
  );
  validList.forEach((item, idx) => {
    L.marker([item.coords[1], item.coords[0]], {
      icon: createNumberedIcon(idx + 1, '#ef4444'),
    })
      .bindPopup(`<b>${idx + 1}. ${item.name}</b>`)
      .addTo(routeMarkersLayer);
  });

  // 🧩 Add next legs
  for (let i = 0; i < validList.length - 1; i++) {
    const start = validList[i].coords;
    const end = validList[i + 1].coords;
    const u = new URL(`${API_BASE}${busMode ? '/route_bus' : '/route'}`);
    u.searchParams.set('start', `${start[0]},${start[1]}`);
    u.searchParams.set('end', `${end[0]},${end[1]}`);
    if (!busMode) u.searchParams.set('mode', mode);
    const legGeo = await safeFetch(u);
    routeLayer.addData(legGeo);
    if (busMode && legGeo.summary) legSummaries.push(legGeo.summary);

    legSteps.push({
      idx: i + 1,
      fromLabel: validList[i].name,
      toLabel: validList[i + 1].name,
      from: [start[0], start[1]],
      to: [end[0], end[1]],
      mode,
    });
  }

  // 🗺️ Fit map
  const allPoints = [
    [userLocation.lat, userLocation.lng],
    ...validList.map(item => [item.coords[1], item.coords[0]]),
  ];
  map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50] });

  // 🚌 Build bus summary (if mode=bus)
  if (busMode) {
    const el = document.getElementById('busSummary');
    if (el && legSummaries.length > 0) {
      const combined = buildCombinedStopsListNumbered(legSummaries);
      const stepDetailsHtml = legSummaries
        .map((s, idx) => {
          const from = s.start_stop?.name || '-';
          const to = s.end_stop?.name || '-';
          return `<div style="margin-bottom:4px;">
            <strong>Алхам ${idx + 1}:</strong>
            <span>Суух: ${from}</span> → <span>Буух: ${to}</span>
          </div>`;
        })
        .join('');
      el.innerHTML = `
        <div style="background:#ecfeff; border:1px solid #a5f3fc; padding:8px; border-radius:6px;">
          <div style="font-weight:600; margin-bottom:8px;">Автобусын чиглэл</div>
          <div style="margin-bottom:6px;">
            <div>Эхэнд суух зогсоол: <strong>${combined.startStop}</strong></div>
            <div>Эцэст буух зогсоол: <strong>${combined.endStop}</strong></div>
          </div>
          <div style="margin:6px 0; color:#075985; font-weight:500;">Дайрах зогсоолууд:</div>
          <div>${combined.middleHtml}</div>
          <div style="margin-top:8px; padding-top:8px; border-top:1px solid #bae6fd;">
            <div style="font-weight:500; margin-bottom:4px;">Алхам бүрийн суух/буух:</div>
            ${stepDetailsHtml}
          </div>
        </div>`;
    }
  }

  // ✅ Show clear button
  const clearBtn = document.getElementById('clearRouteBtn');
  if (clearBtn) clearBtn.style.display = 'block';
}

// 🧹 Clear all route layers
export function clearRoute() {
  routeLayer.clearLayers();
  routeMarkersLayer.clearLayers();
  if (highlightLayer) {
    map.removeLayer(highlightLayer);
    highlightLayer = null;
  }
  legSteps = [];
  const elItinerary = document.getElementById('itinerary');
  if (elItinerary) elItinerary.innerHTML = '';
  const elSummary = document.getElementById('busSummary');
  if (elSummary) elSummary.innerHTML = '';
  const clearBtn = document.getElementById('clearRouteBtn');
  if (clearBtn) clearBtn.style.display = 'none';
}
