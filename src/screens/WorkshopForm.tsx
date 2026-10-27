import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { deleteWorkshop, getWorkshop, saveWorkshop } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { waNumber } from '../lib/booking';

export function WorkshopForm() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const existing = useQuery(() => (isNew ? Promise.resolve(null) : getWorkshop(id!)), [id]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    const w = existing.data;
    if (!w || loaded.current) return;
    loaded.current = true;
    setName(w.name);
    setPhone(w.phone ?? '');
    setAddress(w.address ?? '');
    setNotes(w.notes ?? '');
    setFavourite(w.favourite);
  }, [existing.data]);

  const valid = name.trim() !== '';
  const phoneWarn = phone.trim() !== '' && !waNumber(phone);

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await saveWorkshop(isNew ? null : id!, {
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        favourite,
      });
      bump();
      toast('Saved');
      navigate(-1);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (isNew) return;
    setBusy(true);
    try {
      await deleteWorkshop(id!);
      bump();
      toast('Deleted');
      navigate('/workshops', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      setConfirm(false);
    }
  }

  const waiting = !isNew && !existing.data && !existing.error;

  return (
    <Screen
      title={isNew ? 'New workshop' : 'Edit workshop'}
      compact
      className="screen-form"
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          Cancel
        </button>
      }
      right={
        <button className="nav-button nav-button-strong" disabled={!valid || busy} onClick={save}>
          Save
        </button>
      }
    >
      <main className="page stack">
        {existing.error ? <ErrorNotice message={existing.error} onRetry={existing.reload} /> : null}
        {waiting ? <Loading /> : null}
        {!waiting ? (
          <>
            <div className="group">
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">Name</span>
                  <input placeholder="e.g. Bengkel Ah Seng" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="row-input">
                  <span className="row-label">Phone</span>
                  <input type="tel" inputMode="tel" placeholder="012-345 6789" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </label>
                <label className="row-input row-input-multiline">
                  <span className="row-label">Address</span>
                  <textarea rows={2} placeholder="Optional, for Waze and Maps" value={address} onChange={(e) => setAddress(e.target.value)} />
                </label>
                <label className="row">
                  <span className="row-label">Favourite</span>
                  <span className="switch">
                    <input type="checkbox" checked={favourite} onChange={(e) => setFavourite(e.target.checked)} />
                    <span className="switch-track" />
                  </span>
                </label>
                <label className="row-input row-input-multiline">
                  <span className="row-label">Notes</span>
                  <textarea rows={2} placeholder="e.g. Ask for Ah Seng, closed Sundays" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </label>
              </div>
              {phoneWarn ? <div className="group-footer">This doesn't look like a full phone number, so WhatsApp won't work with it.</div> : null}
            </div>

            {error ? (
              <div className="notice notice-error" role="alert">
                {error}
              </div>
            ) : null}

            <div className="sticky-save">
              <button className="button button-primary button-block" disabled={!valid || busy} onClick={save}>
                {busy ? 'Saving…' : 'Save workshop'}
              </button>
            </div>
            {!isNew ? (
              <button className="button button-danger button-block" disabled={busy} onClick={() => setConfirm(true)}>
                Delete workshop
              </button>
            ) : null}
          </>
        ) : null}
      </main>
      {confirm ? (
        <ConfirmSheet title="Delete this workshop? Past records keep its name." confirmLabel="Delete workshop" danger onConfirm={remove} onCancel={() => setConfirm(false)} />
      ) : null}
    </Screen>
  );
}
