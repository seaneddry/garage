import type { Vehicle } from '../types';
import { km } from './reminders';

/** Digits only, in international form for wa.me: 012-345 6789 → 60123456789. */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `6${d}`;
  return d.length >= 9 ? d : null;
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

export function telLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/[^\d+]/g, '');
  return d ? `tel:${d}` : null;
}

export function mapsLinks(name: string, address: string | null) {
  const q = encodeURIComponent([name, address].filter(Boolean).join(', '));
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
    apple: `https://maps.apple.com/?q=${q}`,
  };
}

export type Lang = 'en' | 'ms';

/** The WhatsApp message asking a workshop for a price with labour and a slot. */
export function bookingMessage(vehicle: Vehicle, jobs: string[], odometer: number | null, lang: Lang, when: string): string {
  const car = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  const plate = vehicle.plate ? ` (${vehicle.plate})` : '';
  const list = jobs.map((j) => `- ${j}`).join('\n');
  const odo = odometer !== null ? km(odometer) : null;

  if (lang === 'ms') {
    return [
      'Salam, saya nak buat appointment servis untuk kereta saya:',
      `${car}${plate}${odo ? `, odometer ${odo} km` : ''}.`,
      '',
      'Kerja yang perlu dibuat:',
      list,
      '',
      'Boleh bagi harga termasuk upah, dan slot paling awal yang ada?' + (when ? ` Saya prefer ${when}.` : ''),
      'Terima kasih!',
    ].join('\n');
  }
  return [
    "Hi, I'd like to book my car in for a service:",
    `${car}${plate}${odo ? `, ${odo} km on the odometer` : ''}.`,
    '',
    'Jobs needed:',
    list,
    '',
    'Could you give me a price including labour, and your earliest slot?' + (when ? ` ${when} would suit me best.` : ''),
    'Thank you!',
  ].join('\n');
}
