import { API_BASE } from './config.js';
import { map } from './map.js';
import { allPlaces, setAllPlaces } from './state.js';

export const selectedCategories = new Set();

function makePlaceMarker(feature, latlng) {
  const p = feature.properties || {};
  if (p.type === 'bus_stop') {
    const busIcon = L.divIcon({
      className: 'bus-stop-marker',
      html: '<div style="background-color: #10b981; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 12px;">🚌</div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    return L.marker(latlng, { icon: busIcon });
  }
  if (p.type === 'photo_spot') {
    const photoIcon = L.divIcon({
      className: 'photo-spot-marker',
      html: '<div style="background-color: #f59e0b; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px;">📸</div>',
      iconSize: [30, 30],
      iconAnchor: [16, 16],
    });
    return L.marker(latlng, { icon: photoIcon });
  }
  if (p.type === 'restaurant') {
    const restaurantIcon = L.divIcon({
      className: 'restaurant-marker',
      html: '<div style="background-color: #ef4444; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px;">🍽️</div>',
      iconSize: [30, 30],
      iconAnchor: [16, 16],
    });
    return L.marker(latlng, { icon: restaurantIcon });
  }
  if (p.type === 'hotel') {
    const hotelIcon = L.divIcon({
      className: 'hotel-marker',
      html: '<div style="background-color: #3b82f6; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px;">🏨</div>',
      iconSize: [30, 30],
      iconAnchor: [16, 16],
    });
    return L.marker(latlng, { icon: hotelIcon });
  }
  if (p.type === 'museum') {
    const museumIcon = L.divIcon({
      className: 'museum-marker',
      html: '<div style="background-color: #8b5cf6; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 16px;">🏛️</div>',
      iconSize: [30, 30],
      iconAnchor: [16, 16],
    });
    return L.marker(latlng, { icon: museumIcon });
  }
  return L.marker(latlng);
}

export const placesLayer = L.geoJSON([], {
  pointToLayer: makePlaceMarker,
}).addTo(map);

export async function loadCategories() {
  const res = await fetch(`${API_BASE}/categories`);
  const cats = await res.json();
  const wrap = document.getElementById('categoryChecks');
  if (!wrap) return;
  wrap.innerHTML = '';
  cats.forEach(c => {
    const id = `cat_${c}`;
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = id;
    cb.value = c;
    if (cb.id !== 'cat_bus_stop') {
      cb.checked = true;
      selectedCategories.add(c);
    }

    cb.addEventListener('change', () => {
      if (cb.checked) selectedCategories.add(c);
      else selectedCategories.delete(c);
      loadPlaces();
    });
    const span = document.createElement('span');
    span.textContent = c;
    label.appendChild(cb);
    label.appendChild(span);
    wrap.appendChild(label);
  });
}

export async function loadPlaces() {
  // Хэрэв ямар ч ангилал сонгоогүй бол юу ч үзүүлэхгүй
  if (selectedCategories.size === 0) {
    placesLayer.clearLayers();
    setAllPlaces([]);
    return;
  }

  const bounds = map.getBounds();
  const bbox = [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ].join(',');
  const url = new URL(`${API_BASE}/places`);
  url.searchParams.set('bbox', bbox);
  url.searchParams.set('types', Array.from(selectedCategories).join(','));

  const res = await fetch(url);
  const geojson = await res.json();
  setAllPlaces(geojson.features || []);
  placesLayer.clearLayers();
  placesLayer.addData(geojson);
}
