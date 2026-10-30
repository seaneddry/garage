import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { PlacePicker } from '../components/PlacePicker';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { getSettings, saveSettings } from '../api';
import { errorMessage, useBump, useQuery } from '../lib/useQuery';
import { mapLinks } from '../lib/geo';
import { officeOf, type Place } from '../lib/places';

/** Where work trips are measured from. */
export function Office() {
  const navigate = useNavigate();
  const toast = useToast();
  const bump = useBump();
  const settings = useQuery(getSettings, []);
  const office = officeOf(settings.data);
  const [label, setLabel] = useState('');
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (settings.data) setLabel(settings.data.office_label ?? '');
  }, [settings.data]);

  async function save(input: { office_label: string | null; office_lat: number | null; office_lng: number | null }, msg: string) {
    try {
      await saveSettings(input);
      bump();
      settings.reload();
      toast(msg);
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  async function pick(p: Place) {
    setChanging(false);
    setLabel(p.label);
    await save({ office_label: p.label, office_lat: p.lat, office_lng: p.lng }, 'Office saved');
  }

  async function saveLabel() {
    const v = label.trim() || null;
    if (!office || v === (settings.data?.office_label ?? null)) return;
    await save({ office_label: v, office_lat: office.lat, office_lng: office.lng }, 'Name saved');
  }

  return (
    <Screen
      title="Office"
      compact
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          <Icon name="chevron-left" size={22} />
          Back
        </button>
      }
    >
      <main className="page stack">
        {settings.error ? <ErrorNotice message={settings.error} onRetry={settings.reload} /> : null}
        {!settings.data && !settings.error ? <Loading /> : null}

        {settings.data && office && !changing ? (
          <>
            <section className="group">
              <div className="group-body">
                <label className="row-input">
                  <span className="row-label">Name</span>
                  <input value={label} placeholder="Office" onChange={(e) => setLabel(e.target.value)} onBlur={() => void saveLabel()} />
                </label>
                <a className="row" href={mapLinks(office.lat, office.lng, office.label).google} target="_blank" rel="noreferrer">
                  <span className="row-label">
                    Show on map
                    <span className="row-sub num">
                      {office.lat.toFixed(5)}, {office.lng.toFixed(5)}
                    </span>
                  </span>
                  <Icon name="external" size={18} />
                </a>
                <button className="row" onClick={() => setChanging(true)}>
                  <span className="row-label">Change location</span>
                  <Icon name="chevron-right" size={18} />
                </button>
              </div>
              <div className="group-footer">
                Work trips claim the road distance between here and where you went, even on days you set off from home.
              </div>
            </section>
            <button
              className="button button-danger button-block"
              onClick={() => void save({ office_label: null, office_lat: null, office_lng: null }, 'Office removed')}
            >
              Remove office
            </button>
          </>
        ) : null}

        {settings.data && (!office || changing) ? (
          <section className="group">
            <div className="group-header">{office ? 'New office location' : 'Where is your office?'}</div>
            <PlacePicker near={office} placeholder="Search your office building or address" onPick={(p) => void pick(p)} />
            <div className="group-footer">
              Easiest: tap "Use my current location" next time you're at the office. Work trips are then measured from here.
            </div>
            {changing ? (
              <button className="button button-secondary button-block" onClick={() => setChanging(false)}>
                Cancel
              </button>
            ) : null}
          </section>
        ) : null}
      </main>
    </Screen>
  );
}
