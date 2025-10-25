import { bucketList, userLocation } from './state.js';

export function createNumberedIcon(n, color = '#ef4444') {
  return L.divIcon({
    className: 'numbered-marker',
    html: `<div style="background:${color}; color:#fff; width:26px; height:26px; border-radius:50%; border:2px solid #fff;
      display:flex; align-items:center; justify-content:center; box-shadow:0 2px 6px rgba(0,0,0,0.3); font-weight:700;">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

let sortableInstance = null;

export function updateBucketUI() {
  const countEl = document.getElementById('bucketCount');
  const container = document.getElementById('bucketList');
  if (!countEl || !container) return;

  countEl.textContent = bucketList.length;
  container.innerHTML = '';

  // --- Хоосон жагсаалт ---
  if (bucketList.length === 0 && !userLocation) {
    container.innerHTML = '<p style="color:#9ca3af;">Одоогоор хоосон байна</p>';
    return;
  }

  // --- Миний байршил ---
  if (userLocation) {
    const myLoc = document.createElement('div');
    myLoc.className = 'bucket-item';
    myLoc.innerHTML = `
      <div>
        <strong>Миний байршил</strong>
        <small style="color:#6b7280;">Эхлэх цэг</small>
      </div>
      <span style="font-size:12px; color:#9ca3af;">✓</span>
    `;
    container.appendChild(myLoc);
  }

  // --- Очих газрууд ---
  bucketList.forEach(item => {
    if (!item || !item.id) return; // хамгаалалт
    const div = document.createElement('div');
    div.className = 'bucket-item';
    div.dataset.id = item.id;
    div.innerHTML = `
      <div>
        <strong>${item.name}</strong>
        <small style="color:#6b7280;">${item.type || ''}</small>
      </div>
      <button data-remove-id="${item.id}">Устгах</button>
    `;
    container.appendChild(div);
  });

  // --- Sortable-г дахин идэвхжүүлэх ---
  if (window.Sortable) {
    if (sortableInstance) {
      try {
        sortableInstance.destroy();
      } catch (e) {
        console.warn('Old Sortable destroy failed:', e);
      }
    }

    sortableInstance = new Sortable(container, {
      animation: 150,
      handle: '.bucket-item',
      ghostClass: 'drag-ghost',
      onEnd: evt => {
        const newOrder = [];
        container.querySelectorAll('.bucket-item[data-id]').forEach(div => {
          const idStr = div.dataset.id;
          if (!idStr) return; // хамгаалалт
          const id = Number(idStr);
          const found = bucketList.find(p => p && p.id === id);
          if (found) newOrder.push(found);
        });

        if (newOrder.length > 0) {
          bucketList.splice(0, bucketList.length, ...newOrder);
          localStorage.setItem('ubBucketList', JSON.stringify(bucketList));
          console.log('🔁 Шинэ дараалал:', bucketList.map(p => p.name).join(' → '));
        }
      },
    });
  }
}
