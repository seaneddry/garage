export interface Fix {
  lat: number;
  lng: number;
  accuracy: number;
  at: number;
}

/** Distance between two points in km (haversine). */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function locationError(e: GeolocationPositionError): Error {
  return new Error(
    e.code === e.PERMISSION_DENIED
      ? 'Location is off for Garage. Allow it in iPhone Settings → Privacy & Security → Location Services → Safari Websites.'
      : "Couldn't get your location. Try again in the open or near a window.",
  );
}

export function currentFix(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location is not available on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp }),
      (e) => reject(locationError(e)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  });
}

/**
 * Follows the phone's GPS while the app is open, adding up the distance between good fixes.
 * Jitter is ignored: fixes worse than 50 m, or moves shorter than the two fixes' accuracy.
 */
export function watchDistance(onUpdate: (km: number, last: Fix) => void, onError: (e: Error) => void): () => void {
  if (!('geolocation' in navigator)) {
    onError(new Error('Location is not available on this device.'));
    return () => {};
  }
  let total = 0;
  let prev: Fix | null = null;
  const id = navigator.geolocation.watchPosition(
    (p) => {
      const fix = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp };
      if (fix.accuracy > 50) return;
      if (prev) {
        const step = kmBetween(prev, fix);
        if (step * 1000 < Math.max(prev.accuracy, fix.accuracy, 15)) return;
        // Ignore jumps faster than 250 km/h: a bad fix, not driving.
        const hours = (fix.at - prev.at) / 3600000;
        if (hours > 0 && step / hours > 250) return;
        total += step;
      }
      prev = fix;
      onUpdate(total, fix);
    },
    (e) => onError(locationError(e)),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export function mapLinks(lat: number, lng: number, label = 'My car') {
  const q = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return {
    apple: `https://maps.apple.com/?ll=${q}&q=${encodeURIComponent(label)}`,
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: `https://waze.com/ul?ll=${q}&navigate=yes`,
  };
}

/** "2 h ago", "yesterday" */
export function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** "Tue 27 Oct, 5:14 pm" in Malaysia time */
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

export function minutesBetween(a: string, b: string | null): number | null {
  return b ? Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000)) : null;
}

/** YYYY-MM-DD of a timestamp, in Malaysia time. */
export function klDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
}
