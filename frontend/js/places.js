import { placesLayer, loadPlaces } from './data.js';
import { map } from './map.js';
import { allPlaces, bucketList } from './state.js';
import { updateBucketUI } from './ui.js';

function bindPopupHandlers(feature, layer) {
  const p = feature.properties || {};
  const inBucket = bucketList.some(item => item.id === p.id);
  const popupContent = `
    <b>${p.name || 'Place'}</b><br>
    ${p.type || ''}<br>
    ${p.description || ''}<br>
    <button class="detail-btn" data-id="${
      p.id
    }" style="margin-top:8px; padding:4px 8px; cursor:pointer;">Дэлгэрэнгүй үзэх</button>
    <button class="add-bucket-btn" data-id="${
      p.id
    }" style="margin-top:8px; padding:4px 8px; cursor:pointer; background:${
    inBucket ? '#9ca3af' : '#3b82f6'
  }; color:white; border:none; border-radius:4px;">
      ${inBucket ? 'Жагсаалтад байна ✓' : '+ Жагсаалт'}
    </button>
  `;
  layer.bindPopup(popupContent);
  layer.on('popupopen', e => {
    const container = e.popup.getElement();
    container
      .querySelector('.detail-btn')
      .addEventListener('click', () => showDetail(p.id));
    const addBtn = container.querySelector('.add-bucket-btn');
    addBtn.addEventListener('click', () => addToBucketQuick(p.id));
  });
}

// Reconfigure placesLayer to use onEachFeature
placesLayer.options.onEachFeature = bindPopupHandlers;

export function showDetail(placeId) {
  const feature = allPlaces.find(f => f.properties.id === placeId);
  if (!feature) return;
  const p = feature.properties;
  const coords = feature.geometry.coordinates; // [lon, lat]

  document.getElementById('detailName').textContent = p.name || 'Нэргүй';
  document.getElementById('detailType').textContent = p.type || '-';
  if (p.type === 'bus_stop') {
    document.getElementById('detailDesc').textContent = 'Автобусны буудал';
  } else {
    document.getElementById('detailDesc').textContent =
      p.description || 'Тайлбар байхгүй';
  }
  document.getElementById('detailCoords').textContent = `${coords[1].toFixed(
    5
  )}, ${coords[0].toFixed(5)}`;

  const imgContainer = document.getElementById('detailImageContainer');
  imgContainer.innerHTML = '';
  if (p.image_url) {
    const img = document.createElement('img');
    img.src = p.image_url;
    img.alt = p.name;
    imgContainer.appendChild(img);
  }

  const addBtn = document.getElementById('addToBucketBtn');
  if (bucketList.some(item => item.id === placeId)) {
    addBtn.textContent = 'Жагсаалтад байна ✓';
    addBtn.disabled = true;
    addBtn.style.background = '#9ca3af';
  } else {
    addBtn.textContent = 'Очих жагсаалтад нэмэх';
    addBtn.disabled = false;
    addBtn.style.background = '#3b82f6';
  }
  addBtn.dataset.placeId = String(placeId);

  document.getElementById('detailPanel').classList.add('open');
}

export function addToBucket(placeId) {
  const feature = allPlaces.find(f => f.properties.id === placeId);
  if (!feature) return;
  const p = feature.properties;
  const coords = feature.geometry.coordinates;
  if (bucketList.some(item => item.id === placeId)) return;
  bucketList.push({
    id: placeId,
    name: p.name || 'Нэргүй',
    type: p.type,
    coords,
  });
  localStorage.setItem('ubBucketList', JSON.stringify(bucketList));
  updateBucketUI();

  const addBtn = document.getElementById('addToBucketBtn');
  if (addBtn && addBtn.dataset.placeId === String(placeId)) {
    addBtn.textContent = 'Жагсаалтад байна ✓';
    addBtn.disabled = true;
    addBtn.style.background = '#9ca3af';
  }
}

export function addToBucketQuick(placeId) {
  addToBucket(placeId);
}

export function removeFromBucket(placeId) {
  const idx = bucketList.findIndex(item => item.id === placeId);
  if (idx === -1) return;
  bucketList.splice(idx, 1);
  localStorage.setItem('ubBucketList', JSON.stringify(bucketList));
  updateBucketUI();
  const addBtn = document.getElementById('addToBucketBtn');
  if (addBtn && addBtn.dataset.placeId === String(placeId)) {
    addBtn.textContent = 'Очих жагсаалтад нэмэх';
    addBtn.disabled = false;
    addBtn.style.background = '#3b82f6';
  }
}

// Wire detail panel buttons once
export function setupDetailPanel() {
  document.getElementById('closePanelBtn').addEventListener('click', () => {
    document.getElementById('detailPanel').classList.remove('open');
  });
  document.getElementById('addToBucketBtn').addEventListener('click', e => {
    const pid = Number(e.currentTarget.dataset.placeId);
    if (pid) addToBucket(pid);
  });
}

// Expose for popup inline handlers if any legacy HTML remains
window.showDetail = showDetail;
window.addToBucketQuick = addToBucketQuick;
window.removeFromBucket = removeFromBucket;
