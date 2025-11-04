import { API_BASE } from './config.js';
import { map } from './map.js';
import {
  allPlaces,
  bucketList,
  userLocation,
  setLastDirectDestination,
  lastDirectDestination,
  setCurrentRouteType,
  currentRouteType,
} from './state.js';
import { createNumberedIcon } from './ui.js';

export const routeLayer = L.geoJSON([], {
  style: feature => {
    const p = feature && feature.properties ? feature.properties : {};
    const seg = p.segment;
    const mode = (p.mode || '').toString().toLowerCase();

    if (
      seg === 'walk-to-stop' ||
      seg === 'walk-from-stop' ||
      mode === 'foot' ||
      mode.includes('foot')
    ) {
      return { color: '#24d52dff', weight: 4, opacity: 0.95, dashArray: '6 8' };
    }

    if (seg === 'bus' || mode === 'bus' || mode.includes('bus')) {
      return { color: '#2563eb', weight: 5, opacity: 0.9 };
    }

    if (mode === 'straight-line') {
      return { color: '#94a3b8', weight: 3, opacity: 0.9, dashArray: '4 6' };
    }
    if (mode === 'car') {
      return { color: '#010defff', weight: 5, opacity: 0.85 };
    }

    return { color: '#2563eb', weight: 5, opacity: 0.85 };
  },
}).addTo(map);

const routeMarkersLayer = L.layerGroup().addTo(map);
let highlightLayer = null;
let legSteps = [];

function formatDuration(seconds) {
  if (seconds == null || isNaN(seconds)) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${Math.max(1, mins)} мин`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} ц ${m} мин` : `${h} ц`;
}

function formatClockRangeFromNow(totalSeconds) {
  try {
    const now = new Date();
    const end = new Date(now.getTime() + (Number(totalSeconds) || 0) * 1000);
    const opts = { hour: '2-digit', minute: '2-digit' };
    return `${now.toLocaleTimeString([], opts)} — ${end.toLocaleTimeString(
      [],
      opts
    )}`;
  } catch {
    return '';
  }
}

function buildOptionCard({ title, totalSeconds, segments = [], note = '' }) {
  const totalLabel = formatDuration(totalSeconds);
  const timeRange = formatClockRangeFromNow(totalSeconds);
  const iconsRow = segments
    .map(s => s.icon || '')
    .join(' <span style="color:#9ca3af;">›</span> ');
  const segmentsHtml = segments
    .map(s => {
      const sec = s.seconds || 0;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed #e6f7fb;">
        <div style="display:flex;align-items:center;gap:8px;"><div style=\"font-size:18px;\">${
          s.icon || ''
        }</div><div style=\"color:#374151;\">${s.title}</div></div>
        <div style=\"color:#0f172a;font-weight:600;\">${formatDuration(
          sec
        )}</div>
      </div>`;
    })
    .join('');

  return `
    <div style="background:#ffffff;border:1px solid #bae6fd;border-radius:8px;padding:10px;margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div style="font-weight:700;color:#0f172a;">${title}</div>
        <div style="text-align:right;color:#075985;font-weight:700;">${totalLabel}<div style="font-size:12px;color:#6b7280;font-weight:500;">${timeRange}</div></div>
      </div>
      <div style="margin-bottom:8px;color:#6b7280;">${iconsRow}</div>
      <div>${segmentsHtml}</div>
      ${
        note
          ? `<div style="margin-top:8px;font-size:12px;color:#6b7280;">${note}</div>`
          : ''
      }
    </div>`;
}

function renderTimes(times) {
  if (!times) return '';
  const seg = times.segments || {};
  const dist = times.distances_m || {};
  const car = times.car_only || {};
  return `
    <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #bae6fd;">
      <div style="font-weight:600; margin-bottom:6px;">Цаг хугацааны тооцоо</div>
      <div style="display:grid; grid-template-columns: 1fr auto; gap:4px;">
        <div>1) Эхлэх → автобусны буудал (🚶 5км/ц)</div>
        <div><strong>${formatDuration(
          seg.walk_to_stop_s
        )}</strong> <span style="color:#6b7280">(~${Math.round(
    dist.walk_to_stop || 0
  )} м)</span></div>
        <div>2) Буудал → буудал (🚌 20км/ц)</div>
        <div><strong>${formatDuration(
          seg.bus_s
        )}</strong> <span style="color:#6b7280">(~${Math.round(
    dist.bus || 0
  )} м)</span></div>
        <div>3) Буудлаас → очих цэг (🚶 5км/ц)</div>
        <div><strong>${formatDuration(
          seg.walk_from_stop_s
        )}</strong> <span style="color:#6b7280">(~${Math.round(
    dist.walk_from_stop || 0
  )} м)</span></div>
        <div style="margin-top:6px; border-top:1px solid #e5e7eb; padding-top:6px;">Нийт хугацаа</div>
        <div style="margin-top:6px; border-top:1px solid #e5e7eb; padding-top:6px;"><strong>${formatDuration(
          times.total_time_s
        )}</strong></div>
      </div>
      <div style="margin-top:8px; font-size:13px; color:#374151;margin-bottom:16px;">
        💡 Зөвхөн машин (🚗 30км/ц): <strong>${formatDuration(
          car.duration_s
        )}</strong> <span style="color:#6b7280">(~${Math.round(
    car.distance_m || 0
  )} м)</span>
      </div>
    </div>
  `;
}

export async function showDirectRouteToPlace(coords) {
  if (!userLocation) {
    alert('Эхлээд "Миний байршил" товчийг дарж байршлаа тогтооно уу');
    return;
  }

  clearRoute();

  const destination = { lng: coords[0], lat: coords[1] };
  try {
    setLastDirectDestination([destination.lng, destination.lat]);
    setCurrentRouteType('direct');
  } catch {}

  try {
    const modeSelect = document.getElementById('routeModeSelect');
    const mode = modeSelect ? modeSelect.value : 'car';
    const busMode = mode === 'bus';

    // Fetch route from API
    const start = [userLocation.lng, userLocation.lat];
    const end = [coords[0], coords[1]];
    const url = new URL(`${API_BASE}${busMode ? '/route_bus' : '/route'}`);
    url.searchParams.set('start', `${start[0]},${start[1]}`);
    url.searchParams.set('end', `${end[0]},${end[1]}`);
    if (!busMode) url.searchParams.set('mode', mode);

    const routeGeo = await safeFetch(url);
    routeLayer.addData(routeGeo);

    // Add markers for start and end
    routeMarkersLayer.clearLayers();

    // Start marker (user location)
    L.marker([userLocation.lat, userLocation.lng], {
      icon: createNumberedIcon('📍', '#3b82f6'),
    })
      .addTo(routeMarkersLayer)
      .bindPopup('<b>Эхлэх цэг</b>: Миний байршил');

    // End marker (destination)
    L.marker([destination.lat, destination.lng], {
      icon: createNumberedIcon('🎯', '#ef4444'),
    })
      .addTo(routeMarkersLayer)
      .bindPopup('<b>Очих цэг</b>');

    // Fit map to show the route
    const bounds = L.latLngBounds([
      [userLocation.lat, userLocation.lng],
      [destination.lat, destination.lng],
    ]);
    map.fitBounds(bounds, { padding: [50, 50] });

    if (busMode && routeGeo.summary) {
      const elSummary = document.getElementById('busSummary');
      if (elSummary) {
        const startStop = routeGeo.summary.start_stop?.name || '-';
        const endStop = routeGeo.summary.end_stop?.name || '-';
        const stopsHtml = formatStopsListForDisplay(routeGeo.summary);
        const t = routeGeo.summary.times || {};
        const busSegments = [
          {
            icon: '🚶',
            title: 'Эхлэл → буудлууд',
            seconds: t.segments?.walk_to_stop_s || 0,
          },
          {
            icon: '🚌',
            title: 'Буудал ↔ буудал',
            seconds: t.segments?.bus_s || 0,
          },
          {
            icon: '🚶',
            title: 'Буудлаас → очих цэг',
            seconds: t.segments?.walk_from_stop_s || 0,
          },
        ];
        const carSegments = [
          {
            icon: '🚗',
            title: 'Шууд машин',
            seconds: t.car_only?.duration_s || 0,
          },
        ];
        const busCard = buildOptionCard({
          title: '🚌 Автобус (олон цэгийн нийлбэр)',
          totalSeconds: t.total_time_s || 0,
          segments: busSegments,
        });
        const carCard = buildOptionCard({
          title: '🚗 Машин (30 км/ц тогтмол хурд, нийлбэр)',
          totalSeconds: t.car_only?.duration_s || 0,
          segments: carSegments,
          note: 'Алтернатив: зөвхөн машинаар явбал',
        });

        elSummary.innerHTML = `
          <div>${busCard}${carCard}</div>
          <div style="margin-top:6px;color:#075985;">
            <div style="font-weight:600;margin-bottom:4px;">Зогсоолын тойм:</div>
            <div>Эхэнд суух: <strong>${startStop}</strong></div>
            <div>Эцэст буух: <strong>${endStop}</strong></div>
            ${
              stopsHtml
                ? `<div style="margin-top:6px;">Дайрах: ${stopsHtml}</div>`
                : ''
            }
          </div>`;
      }
    }

    const clearBtn = document.getElementById('clearRouteBtn');
    if (clearBtn) clearBtn.style.display = 'block';

    // Update the mode toggle minute badges
    try {
      await updateModeDurations();
    } catch {}
  } catch (error) {
    console.error('Route error:', error);
    alert('Замын мэдээлэл татахад алдаа гарлаа');
  }
}

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

function minutesText(seconds) {
  if (seconds == null || isNaN(seconds)) return '—';
  return `${Math.max(1, Math.round(seconds / 60))} мин`;
}

function setModeBadge(mode, seconds) {
  const el = document.querySelector(
    `#modeToggle .mode-btn[data-mode="${mode}"] .label`
  );
  if (el) el.textContent = minutesText(seconds);
}

function extractDurationFromRoute(fc, fallbackSpeedKmh) {
  try {
    const f = (fc?.features || [])[0];
    const p = f?.properties || {};
    if (typeof p.duration_s === 'number') return p.duration_s;
    if (typeof p.distance_m === 'number' && fallbackSpeedKmh) {
      return (p.distance_m / (fallbackSpeedKmh * 1000)) * 3600;
    }
  } catch {}
  return null;
}

async function fetchLegDuration(mode, start, end) {
  const url = new URL(`${API_BASE}/route`);
  url.searchParams.set('start', `${start[0]},${start[1]}`);
  url.searchParams.set('end', `${end[0]},${end[1]}`);
  url.searchParams.set('mode', mode);
  const fc = await safeFetch(url);
  const speed = mode === 'car' ? 30 : 5; // km/h fallback
  return extractDurationFromRoute(fc, speed) || 0;
}

async function fetchBusLegDuration(start, end) {
  const url = new URL(`${API_BASE}/route_bus`);
  url.searchParams.set('start', `${start[0]},${start[1]}`);
  url.searchParams.set('end', `${end[0]},${end[1]}`);
  const fc = await safeFetch(url);
  const total = fc?.summary?.times?.total_time_s;
  if (typeof total === 'number') return total;
  return fetchLegDuration('car', start, end); // fallback
}

export async function updateModeDurations() {
  try {
    let legs = [];
    if (
      currentRouteType === 'direct' &&
      Array.isArray(lastDirectDestination) &&
      lastDirectDestination.length === 2
    ) {
      const start = [userLocation?.lng, userLocation?.lat];
      const end = lastDirectDestination;
      if (start[0] != null && start[1] != null) legs.push([start, end]);
    } else if (Array.isArray(bucketList) && bucketList.length > 0) {
      const start = [userLocation?.lng, userLocation?.lat];
      if (start[0] != null && start[1] != null) {
        legs.push([start, bucketList[0].coords]);
      }
      for (let i = 0; i < bucketList.length - 1; i++) {
        legs.push([bucketList[i].coords, bucketList[i + 1].coords]);
      }
    } else if (
      Array.isArray(lastDirectDestination) &&
      lastDirectDestination.length === 2
    ) {
      const start = [userLocation?.lng, userLocation?.lat];
      const end = lastDirectDestination;
      if (start[0] != null && start[1] != null) legs.push([start, end]);
    } else {
      setModeBadge('car', null);
      setModeBadge('bus', null);
      setModeBadge('foot', null);
      return;
    }

    if (legs.length === 0) return;

    const sumDur = async fn => {
      const arr = await Promise.all(legs.map(([a, b]) => fn(a, b)));
      return arr.reduce((s, v) => s + (Number(v) || 0), 0);
    };

    const [carS, busS, footS] = await Promise.all([
      sumDur((a, b) => fetchLegDuration('car', a, b)),
      sumDur((a, b) => fetchBusLegDuration(a, b)),
      sumDur((a, b) => fetchLegDuration('foot', a, b)),
    ]);

    setModeBadge('car', carS);
    setModeBadge('bus', busS);
    setModeBadge('foot', footS);
  } catch (e) {
    console.warn('updateModeDurations failed:', e);
  }
}

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
  return seq
    .slice(1, -1)
    .map(n => `• ${n}`)
    .join('<br>');
}

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
  summaries.forEach(s =>
    (s.intermediate_stops || []).forEach(st => pushNormalized(st.name))
  );
  pushNormalized(summaries[summaries.length - 1].end_stop?.name);
  const middleStops = seq.slice(1, -1);
  const html = middleStops.length
    ? '<ol style="margin:0; padding-left:20px;">' +
      middleStops.map(s => `<li>${s}</li>`).join('') +
      '</ol>'
    : '—';
  return {
    startStop: seq[0] || '-',
    endStop: seq[seq.length - 1] || '-',
    middleHtml: html,
  };
}

export async function showBucketRoute() {
  if (!Array.isArray(bucketList) || bucketList.length < 1) {
    alert('Маршрут үүсгэхийн тулд 1-с дээш газар нэм');
    return;
  }
  if (!userLocation) {
    alert('Эхлээд "Миний байршил" товчийг дарж байршлаа тогтооно уу');
    return;
  }

  try {
    setCurrentRouteType('bucket');
  } catch {}

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
      // Aggregate times if present
      const agg = legSummaries.reduce(
        (acc, s) => {
          const t = s?.times;
          if (!t) return acc;
          acc.dist.walk_to_stop += t.distances_m?.walk_to_stop || 0;
          acc.dist.bus += t.distances_m?.bus || 0;
          acc.dist.walk_from_stop += t.distances_m?.walk_from_stop || 0;
          acc.seg.walk_to_stop_s += t.segments?.walk_to_stop_s || 0;
          acc.seg.bus_s += t.segments?.bus_s || 0;
          acc.seg.walk_from_stop_s += t.segments?.walk_from_stop_s || 0;
          acc.total += t.total_time_s || 0;
          acc.car.distance_m += t.car_only?.distance_m || 0;
          acc.car.duration_s += t.car_only?.duration_s || 0;
          return acc;
        },
        {
          dist: { walk_to_stop: 0, bus: 0, walk_from_stop: 0 },
          seg: { walk_to_stop_s: 0, bus_s: 0, walk_from_stop_s: 0 },
          total: 0,
          car: { distance_m: 0, duration_s: 0 },
        }
      );
      const busCard = buildOptionCard({
        title: '🚌 Автобус (олон цэгийн нийлбэр)',
        totalSeconds: agg.total,
        segments: [
          {
            icon: '🚶',
            title: 'Эхлэл → буудлууд',
            seconds: agg.seg?.walk_to_stop_s || 0,
          },
          {
            icon: '🚌',
            title: 'Буудал ↔ буудал',
            seconds: agg.seg?.bus_s || 0,
          },
          {
            icon: '🚶',
            title: 'Буудлуудаас → цэгүүд',
            seconds: agg.seg?.walk_from_stop_s || 0,
          },
        ],
      });
      const carCard = buildOptionCard({
        title: '🚗 Машин (30 км/ц тогтмол хурд, нийлбэр)',
        totalSeconds: agg.car.duration_s,
        segments: [
          { icon: '🚗', title: 'Шууд машин', seconds: agg.car.duration_s },
        ],
        note: 'Алтернатив: зөвхөн машинаар явбал',
      });

      el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;color:#374151;">
          <div style="font-weight:600;">Leave now</div>
        </div>
        ${busCard}
        ${carCard}
        <div style="margin-top:8px;color:#075985;">
          <div style="font-weight:600;margin-bottom:4px;">Зогсоолын тойм:</div>
          <div><span style="font-weight:500;">Эхэнд суух:</span> ${
            combined.startStop
          }</div>

          <div style="margin-top:6px;">${
            combined.middleHtml !== '—' ? `Дайрах: ${combined.middleHtml}` : ''
          }</div>          
          <div><span style="font-weight:500;">Эцэст буух:</span> ${
            combined.endStop
          }</div>
        </div>
      `;
      ca.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;color:#374151;">
          <div style="font-weight:600;">Leave now</div>
        </div>
        ${carCard}

      `;
    }
  }
  const clearBtn = document.getElementById('clearRouteBtn');
  if (clearBtn) clearBtn.style.display = 'block';

  try {
    await updateModeDurations();
  } catch {}
}

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
  try {
    setCurrentRouteType('none');
  } catch {}
}
