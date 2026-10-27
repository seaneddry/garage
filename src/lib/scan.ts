import { supabase } from '../supabase';
import type { ScanResult } from '../types';

const MAX_SIDE = 1600;
const MAX_PDF = 7 * 1024 * 1024;

export interface Prepared {
  mime: 'image/jpeg' | 'application/pdf';
  base64: string;
  blob: Blob;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(blob);
  });
}

/**
 * Shrinks a photo on the phone before it goes anywhere: about 1600 px on the long side,
 * JPEG. Smaller uploads scan faster, use less storage, and re-encoding drops the photo's
 * location data. PDFs are sent as they are.
 */
export async function prepareFile(file: File): Promise<Prepared> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF) throw new Error('That PDF is over 7 MB.');
    return { mime: 'application/pdf', base64: await toBase64(file), blob: file };
  }
  if (!file.type.startsWith('image/')) throw new Error('Use a photo or a PDF.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This photo format can't be read here. Take the photo again with the camera, or use a screenshot.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the photo.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the photo.'))), 'image/jpeg', 0.82),
  );
  return { mime: 'image/jpeg', base64: await toBase64(blob), blob };
}

export async function scanFile(p: Prepared, mode: 'receipt' | 'odometer'): Promise<ScanResult> {
  const { data, error } = await supabase.functions.invoke('garage-scan', {
    body: { mode, mime: p.mime, data: p.base64 },
  });
  if (error) {
    // The function's own message is in the response body.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = (await ctx.json().catch(() => null)) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw new Error(error.message);
  }
  const result = data as ScanResult & { error?: string };
  if (result?.error) throw new Error(result.error);
  return result;
}

/** Keeps the receipt with the record, in the private "garage" bucket. */
export async function uploadReceipt(p: Prepared): Promise<string> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) throw new Error('Signed out. Sign in again.');
  const ext = p.mime === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `${uid}/receipts/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('garage').upload(path, p.blob, { contentType: p.mime, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeReceiptFile(path: string): Promise<void> {
  await supabase.storage.from('garage').remove([path]);
}

const LABEL: Record<string, string> = {
  kind: 'type',
  date: 'date',
  place: 'place',
  odometer_km: 'odometer',
  litres: 'litres',
  price_per_litre: 'price per litre',
  fuel_grade: 'fuel grade',
  total: 'total',
  items: 'items',
};

export function foundText(found: string[]): string {
  const parts = found.filter((f) => LABEL[f]).map((f) => LABEL[f]);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function samePlate(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n(a) === n(b);
}
