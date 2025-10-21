import { bucketList, userLocation } from './state.js';

export function createNumberedIcon(n, color = '#ef4444') {
  return L.divIcon({
    className: 'numbered-marker',
    html: `<div style="background:${color}; color:#fff; width:26px; height:26px; border-radius:50%; border:2px solid #fff; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3); font-weight:700;">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export function updateBucketUI() {
  document.getElementById('bucketCount').textContent = bucketList.length;
  const container = document.getElementById('bucketList');
  container.innerHTML = '';

  if (bucketList.length === 0 && !userLocation) {
    container.innerHTML = '<p style="color:#9ca3af;">Одоогоор хоосон байна</p>';
    return;
  }

  if (userLocation) {
    const myLoc = document.createElement('div');
    myLoc.className = 'bucket-item';
    myLoc.innerHTML = `
      <div>
        <strong>Миний байршил</strong>
        <small style="color:#6b7280;">Эхлэх цэг</small>
      </div>
      <span style="font-size:12px; color:#9ca3af;">\u2713</span>
    `;
    container.appendChild(myLoc);
  }

  bucketList.forEach(item => {
    const div = document.createElement('div');
    div.className = 'bucket-item';
    div.innerHTML = `
      <div>
        <strong>${item.name}</strong>
        <small style="color:#6b7280;">${item.type || ''}</small>
      </div>
      <button data-remove-id="${item.id}">Устгах</button>
    `;
    container.appendChild(div);
  });
}
