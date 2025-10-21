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
// Steps meta for legs (from->to) to support highlighting and zooming
let legSteps = [];

export async function drawRoute(a, b) {
  const start = `${a.lng},${a.lat}`;
  const end = `${b.lng},${b.lat}`;
  const mode = document.getElementById('routeModeSelect')?.value || 'car';
  const isBus = mode === 'bus';
  const path = isBus ? '/route_bus' : '/route';
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  if (!isBus) url.searchParams.set('mode', mode);
  const res = await fetch(url);
  const geo = await res.json();
  routeLayer.clearLayers();
  routeLayer.addData(geo);

  try {
    const addArrows = f => {
      if (f.type === 'Feature' && f.geometry?.type === 'LineString') {
        const coords = f.geometry.coordinates;
        for (let i = 10; i < coords.length; i += 20) {
          const [lon, lat] = coords[i];
          L.circleMarker([lat, lon], { radius: 2, color: '#111827' }).addTo(
            map
          );
        }
      }
    };
    if (geo.features) geo.features.forEach(addArrows);
    else addArrows(geo);
  } catch (e) {}

  if (isBus && geo.summary) {
    const s = geo.summary;
    const el = document.getElementById('busSummary');
    if (el) {
      const inter = (s.intermediate_stops || [])
        .map(st => `• ${st.name}`)
        .join('<br>');
      el.innerHTML = `
        <div style="background:#ecfeff; border:1px solid #a5f3fc; padding:8px; border-radius:6px;">
          <div style="font-weight:600; margin-bottom:4px;">Автобусын чиглэл (туршилт)</div>
          <div>Суух: <strong>${s.start_stop?.name || '-'}</strong></div>
          <div style="margin:4px 0; color:#075985;">Дайрах зогсоолууд:</div>
          <div>${inter || '—'}</div>
          <div style="margin-top:4px;">Буух: <strong>${
            s.end_stop?.name || '-'
          }</strong></div>
        </div>`;
    }
  }
}

export async function showBucketRoute() {
  if (bucketList.length < 1) {
    alert('Маршрут үүсгэхийн тулд 1-с дээш газар нэм');
    return;
  }
  if (!userLocation) {
    alert('Эхлээд "Миний байршил" товчийг дарж байршлаа тогтооно уу');
    return;
  }

  const mode = document.getElementById('routeModeSelect').value;
  routeLayer.clearLayers();
  routeMarkersLayer.clearLayers();
  const elSummary = document.getElementById('busSummary');
  if (elSummary) elSummary.innerHTML = '';
  // reset steps and highlight
  legSteps = [];
  if (highlightLayer) {
    map.removeLayer(highlightLayer);
    highlightLayer = null;
  }

  let start = [userLocation.lng, userLocation.lat];
  let end = bucketList[0].coords;
  const busMode = mode === 'bus';
  let firstLegSummary = null;
  let url = new URL(`${API_BASE}${busMode ? '/route_bus' : '/route'}`);
  url.searchParams.set('start', `${start[0]},${start[1]}`);
  url.searchParams.set('end', `${end[0]},${end[1]}`);
  if (!busMode) url.searchParams.set('mode', mode);

  let res = await fetch(url);
  let geo = await res.json();
  routeLayer.addData(geo);
  if (busMode && geo.summary) firstLegSummary = geo.summary;

  // register first leg meta (0 -> 1)
  legSteps.push({
    idx: 0,
    fromLabel: 'Миний байршил',
    toLabel: bucketList[0].name,
    from: [start[0], start[1]],
    to: [end[0], end[1]],
    mode,
  });

  routeMarkersLayer.addLayer(
    L.marker([userLocation.lat, userLocation.lng], {
      icon: createNumberedIcon(0, '#3b82f6'),
    }).bindPopup('<b>Эхлэх цэг</b>: Миний байршил')
  );
  bucketList.forEach((item, idx) => {
    const marker = L.marker([item.coords[1], item.coords[0]], {
      icon: createNumberedIcon(idx + 1, '#ef4444'),
    }).bindPopup(`<b>${idx + 1}. ${item.name}</b>`);
    routeMarkersLayer.addLayer(marker);
  });

  for (let i = 0; i < bucketList.length - 1; i++) {
    start = bucketList[i].coords;
    end = bucketList[i + 1].coords;
    url = new URL(`${API_BASE}${busMode ? '/route_bus' : '/route'}`);
    url.searchParams.set('start', `${start[0]},${start[1]}`);
    url.searchParams.set('end', `${end[0]},${end[1]}`);
    if (!busMode) url.searchParams.set('mode', mode);
    res = await fetch(url);
    geo = await res.json();
    routeLayer.addData(geo);

    // register leg meta (i+0 -> i+1)
    legSteps.push({
      idx: i + 1,
      fromLabel: bucketList[i].name,
      toLabel: bucketList[i + 1].name,
      from: [start[0], start[1]],
      to: [end[0], end[1]],
      mode,
    });
  }

  const allPoints = [
    [userLocation.lat, userLocation.lng],
    ...bucketList.map(item => [item.coords[1], item.coords[0]]),
  ];
  const bounds = L.latLngBounds(allPoints);
  map.fitBounds(bounds, { padding: [50, 50] });

  if (busMode) {
    const el = document.getElementById('busSummary');
    if (el) {
      const s = firstLegSummary || geo.summary;
      if (s) {
        const inter = (s.intermediate_stops || [])
          .map(st => `• ${st.name}`)
          .join('<br>');
        el.innerHTML = `
          <div style="background:#ecfeff; border:1px solid #a5f3fc; padding:8px; border-radius:6px;">
            <div style="font-weight:600; margin-bottom:4px;">Автобусын чиглэл (туршилт)</div>
            <div>Суух: <strong>${s.start_stop?.name || '-'}</strong></div>
            <div style=\"margin:4px 0; color:#075985;\">Дайрах зогсоолууд:</div>
            <div>${inter || '—'}</div>
            <div style="margin-top:4px;">Буух: <strong>${
              s.end_stop?.name || '-'
            }</strong></div>
            <div style="margin-top:8px; font-size:12px; color:#334155;">Эхлэх цэг: Миний байршил → 1-р газар</div>
          </div>`;
      } else {
        el.textContent = '';
      }
    }
  }

  const itin = document.getElementById('itinerary');
  if (itin) {
    // Render clearer step-by-step legs: 0→1, 1→2, ... with clickable zoom/highlight
    const stepsHtml = [
      '<div style="background:#f8fafc; border:1px solid #e2e8f0; padding:8px; border-radius:6px;">',
      '<div style="font-weight:600; margin-bottom:6px;">Очих дараалал (Алхам)</div>',
      '<ol style="margin:0; padding-left:18px; line-height:1.6;">',
      ...legSteps.map(
        (s, i) =>
          `<li>
           <span style="display:inline-block; min-width:46px; font-weight:600;">${i}→${
            i + 1
          }</span>
           <span>${s.fromLabel} → ${s.toLabel}</span>
           <button class="zoom-leg" data-leg-index="${i}" style="margin-left:6px; padding:2px 6px; font-size:12px;">Дэлгэрэнгүй</button>
         </li>`
      ),
      '</ol>',
      '<div style="margin-top:6px; color:#64748b; font-size:12px;">0 = Миний байршил; 1..N = Очих дарааллын газрууд</div>',
      '</div>',
    ].join('');
    itin.innerHTML = stepsHtml;

    // Delegate click for highlighting a leg
    itin.addEventListener('click', async e => {
      const btn = e.target.closest('.zoom-leg');
      if (!btn) return;
      const idx = Number(btn.getAttribute('data-leg-index'));
      const step = legSteps[idx];
      if (!step) return;
      try {
        // Remove last highlight
        if (highlightLayer) {
          map.removeLayer(highlightLayer);
          highlightLayer = null;
        }
        // Try to fetch exact leg route for highlight
        const u = new URL(
          `${API_BASE}${step.mode === 'bus' ? '/route_bus' : '/route'}`
        );
        u.searchParams.set('start', `${step.from[0]},${step.from[1]}`);
        u.searchParams.set('end', `${step.to[0]},${step.to[1]}`);
        if (step.mode !== 'bus') u.searchParams.set('mode', step.mode);
        const r = await fetch(u);
        const g = await r.json();
        highlightLayer = L.geoJSON(g, {
          style: { color: '#0ea5e9', weight: 7, opacity: 0.85 },
        }).addTo(map);
        // Fit bounds to highlight
        try {
          const coords =
            g.features?.[0]?.geometry?.coordinates || g.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length) {
            const latlngs = coords.map(([lon, lat]) => [lat, lon]);
            map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40] });
          } else {
            map.fitBounds(
              L.latLngBounds([
                [step.from[1], step.from[0]],
                [step.to[1], step.to[0]],
              ]),
              { padding: [40, 40] }
            );
          }
        } catch {}
      } catch (err) {
        // Fallback: simple straight line highlight
        try {
          if (highlightLayer) {
            map.removeLayer(highlightLayer);
            highlightLayer = null;
          }
          highlightLayer = L.polyline(
            [
              [step.from[1], step.from[0]],
              [step.to[1], step.to[0]],
            ],
            { color: '#0ea5e9', weight: 7, opacity: 0.8 }
          ).addTo(map);
          map.fitBounds(
            L.latLngBounds([
              [step.from[1], step.from[0]],
              [step.to[1], step.to[0]],
            ]),
            { padding: [40, 40] }
          );
        } catch {}
      }
    });
  }
}
