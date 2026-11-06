import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, MapPin, ShieldCheck, Upload } from 'lucide-react';
import { CAMPUS_LOCATIONS } from '../data/networkLocations';
import { reportsClient } from '../services/api/reportsClient';
import { Button } from '../components/ui/Button';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

async function sanitizePhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP photo.');
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not prepare the photo.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error('The prepared photo is too large. Choose a smaller image.');
  return blob;
}

export const CommunityReportPage: React.FC = () => {
  const [description, setDescription] = useState('');
  const [locationId, setLocationId] = useState(CAMPUS_LOCATIONS[0]?.id ?? '');
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const handlePhoto = async (file?: File) => {
    setError(null);
    if (!file) return;
    try {
      const clean = await sanitizePhoto(file);
      if (preview) URL.revokeObjectURL(preview);
      setPhoto(clean);
      setPhotoName(file.name);
      setPreview(URL.createObjectURL(clean));
    } catch (reason) {
      setPhoto(null);
      setPhotoName('');
      setPreview(null);
      setError(reason instanceof Error ? reason.message : 'The photo could not be prepared.');
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!photo) return setError('Add a clear photo of the access issue.');
    const cleanDescription = description.trim();
    if (cleanDescription.length < 10) return setError('Describe the issue in at least 10 characters.');
    const location = CAMPUS_LOCATIONS.find(item => item.id === locationId);
    if (!location) return setError('Choose an SRM campus location.');
    setSubmitting(true);
    try {
      const result = await reportsClient.submit(photo, {
        description: cleanDescription,
        locationId: location.id,
      });
      setReceipt(result.reportId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The report could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  if (receipt) return <main className="product-page">
    <section className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm" aria-live="polite">
      <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-700" aria-hidden="true" />
      <h1 className="product-title">Report sent for review.</h1>
      <p className="product-description mx-auto">An SRM operator must verify this evidence before it can be treated as a confirmed access issue.</p>
      <p className="mt-5 text-xs text-slate-500">Receipt: <span className="font-mono text-slate-700">{receipt}</span></p>
    </section>
  </main>;

  return <main className="product-page">
    <div className="mb-8 max-w-2xl">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800"><MapPin size={15} aria-hidden="true" /> SRM Kattankulathur campus</p>
      <h1 className="product-title">Report an accessibility issue.</h1>
      <p className="product-description">Share a photo, a short description, and the nearest campus location. Reports remain pending until an operator reviews them.</p>
    </div>
    <form onSubmit={submit} className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-2 md:p-8" noValidate>
      <div className="space-y-5">
        <div>
          <label htmlFor="report-location" className="mb-2 block text-sm font-semibold text-slate-800">Where did it happen?</label>
          <select id="report-location" value={locationId} onChange={event => setLocationId(event.target.value)} className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200" required>
            {CAMPUS_LOCATIONS.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="report-description" className="mb-2 block text-sm font-semibold text-slate-800">What is the issue?</label>
          <textarea id="report-description" value={description} onChange={event => setDescription(event.target.value)} maxLength={500} rows={6} placeholder="For example: The lift beside the library entrance is not responding." className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-200" aria-describedby="description-help" required />
          <div id="description-help" className="mt-1 flex justify-between text-xs text-slate-500"><span>Do not include names or personal details.</span><span>{description.length}/500</span></div>
        </div>
      </div>
      <div className="space-y-5">
        <div>
          <span className="mb-2 block text-sm font-semibold text-slate-800">Add a photo</span>
          <label className="flex min-h-52 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center hover:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-200">
            {preview ? <img src={preview} alt="Selected evidence preview" className="h-48 w-full rounded-lg object-cover" /> : <><Camera className="mb-3 h-8 w-8 text-emerald-800" aria-hidden="true" /><span className="text-sm font-semibold text-slate-800">Choose a photo</span><span className="mt-1 text-xs text-slate-500">JPEG, PNG, or WebP · up to 5 MB after processing</span></>}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event => handlePhoto(event.target.files?.[0])} />
          </label>
          {photoName && <p className="mt-2 truncate text-xs text-slate-500">Selected: {photoName}</p>}
        </div>
        <div className="flex gap-3 rounded-lg bg-emerald-50 p-3 text-xs leading-5 text-emerald-950"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>The photo is re-encoded before upload to remove embedded metadata. Evidence is stored privately and expires automatically.</span></div>
      </div>
      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 md:col-span-2">{error}</div>}
      <div className="flex justify-end border-t border-slate-200 pt-5 md:col-span-2">
        <Button type="submit" variant="operator" isLoading={submitting} disabled={submitting}><Upload size={16} aria-hidden="true" /> Send for operator review</Button>
      </div>
    </form>
  </main>;
};
