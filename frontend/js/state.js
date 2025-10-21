// Shared application state and helpers

export let allPlaces = [];

const BUCKET_KEY = 'ubBucketList';
export let bucketList = JSON.parse(localStorage.getItem(BUCKET_KEY) || '[]');

export function setAllPlaces(features) {
  allPlaces = features || [];
}

export function addToBucketState(item) {
  if (bucketList.some(b => b.id === item.id)) return false;
  bucketList.push(item);
  localStorage.setItem(BUCKET_KEY, JSON.stringify(bucketList));
  return true;
}

export function removeFromBucketState(id) {
  const before = bucketList.length;
  bucketList = bucketList.filter(b => b.id !== id);
  localStorage.setItem(BUCKET_KEY, JSON.stringify(bucketList));
  return bucketList.length !== before;
}

// User location
export let userLocation = null;
export let userLocationMarker = null;
export function setUserLocation(latlng, marker) {
  userLocation = latlng;
  userLocationMarker = marker || userLocationMarker;
}
