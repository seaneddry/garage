import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { listReadings, listReminders, listWorkshops } from '../api';
import { useQuery } from '../lib/useQuery';
import { useVehicle } from '../lib/vehicle';
import { latestReading } from '../lib/stats';
import { daysText, kmText, reminderStatus } from '../lib/reminders';
import { bookingMessage, telLink, waLink } from '../lib/booking';
import type { Lang } from '../lib/booking';

/** Set appointment: pick a workshop and the jobs, then send a ready-made WhatsApp message. */
export function Book() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const from = params.get('reminder');
  const { vehicle } = useVehicle();
  const vid = vehicle?.id ?? '';
  const reminders = useQuery(() => (vid ? listReminders(vid) : Promise.resolve([])), [vid]);
  const readings = useQuery(() => (vid ? listReadings(vid) : Promise.resolve([])), [vid]);
  const workshops = useQuery(listWorkshops, []);

  const current = latestReading(readings.data ?? [])?.km ?? null;
  const jobs = useMemo(
    () =>
      (reminders.data ?? [])
        .filter((r) => r.active)
        .map((r) => ({ r, s: reminderStatus(r, current, null) }))
        .sort((a, b) => (a.s.soonestDays ?? 99999) - (b.s.soonestDays ?? 99999)),
    [reminders.data, current],
  );

  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [extra, setExtra] = useState('');
  const [workshopId, setWorkshopId] = useState<string | null>(null);
  const [when, setWhen] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  const [edited, setEdited] = useState<string | null>(null);

  // Tick the job you came from plus anything due soon or overdue.
  useEffect(() => {
    if (picked || !reminders.data) return;
    const ids = jobs.filter(({ r, s }) => r.id === from || s.state === 'soon' || s.state === 'overdue').map(({ r }) => r.id);
    setPicked(new Set(ids));
  }, [jobs, reminders.data, from, picked]);

  useEffect(() => {
    if (!workshopId && workshops.data && workshops.data.length > 0) setWorkshopId(workshops.data[0].id);
  }, [workshops.data, workshopId]);

  const workshop = workshops.data?.find((w) => w.id === workshopId) ?? null;
  const names = [
    ...jobs.filter(({ r }) => picked?.has(r.id)).map(({ r }) => r.name),
    ...extra
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean),
  ];
  const generated = vehicle ? bookingMessage(vehicle, names, current, lang, when.trim()) : '';
  const message = edited ?? generated;
  const wa = waLink(workshop?.phone, message);
  const tel = telLink(workshop?.phone);

  function toggle(id: string) {
    const next = new Set(picked ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
    setEdited(null);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast('Message copied');
    } catch {
      toast('Could not copy. Select the text and copy it.');
    }
  }

  const loading = !reminders.data || !workshops.data;
  const error = reminders.error ?? workshops.error ?? readings.error;

  return (
    <Screen
      title="Set appointment"
      compact
      className="screen-form"
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          Cancel
        </button>
      }
    >
      <main className="page stack">
        {error ? <ErrorNotice message={error} /> : null}
        {loading && !error ? <Loading /> : null}
        {!loading ? (
          <>
            <div className="group">
              <div className="group-header">Workshop</div>
              {workshops.data!.length > 0 ? (
                <div className="chips" role="group" aria-label="Workshop">
                  {workshops.data!.map((w) => (
                    <button
                      key={w.id}
                      className={`chip ${w.id === workshopId ? 'chip-on' : ''}`}
                      onClick={() => setWorkshopId(w.id)}
                    >
                      {w.favourite ? '★ ' : ''}
                      {w.name}
                    </button>
                  ))}
                  <Link to="/workshops/new" className="chip">
                    <Icon name="plus" size={16} /> New
                  </Link>
                </div>
              ) : (
                <Link to="/workshops/new" className="notice link-clean">
                  No workshops saved yet. <strong>Add one with its phone number</strong> to send this on WhatsApp.
                </Link>
              )}
              {workshop && !wa ? <div className="group-footer">{workshop.name} has no WhatsApp number saved. Edit the workshop to add one.</div> : null}
            </div>

            <div className="group">
              <div className="group-header">Jobs</div>
              <div className="group-body">
                {jobs.map(({ r, s }) => (
                  <label className="row" key={r.id}>
                    <input type="checkbox" className="check" checked={picked?.has(r.id) ?? false} onChange={() => toggle(r.id)} />
                    <span className="row-label">
                      {r.name}
                      <span className="row-sub">
                        {s.state === 'unset' ? 'No interval set' : [s.kmLeft !== null ? kmText(s.kmLeft) : null, s.daysLeft !== null ? daysText(s.daysLeft) : null].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {s.state === 'overdue' ? <span className="badge badge-danger">Overdue</span> : s.state === 'soon' ? <span className="badge badge-warn">Due soon</span> : null}
                  </label>
                ))}
                <label className="row-input row-input-multiline">
                  <span className="row-label">Anything else</span>
                  <textarea
                    rows={2}
                    placeholder="e.g. Check aircond, squeak from front left"
                    value={extra}
                    onChange={(e) => {
                      setExtra(e.target.value);
                      setEdited(null);
                    }}
                  />
                </label>
                <label className="row-input">
                  <span className="row-label">Preferred time</span>
                  <input
                    placeholder="Optional, e.g. Saturday morning"
                    value={when}
                    onChange={(e) => {
                      setWhen(e.target.value);
                      setEdited(null);
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="group">
              <div className="group-header group-header-split">
                <span>Message</span>
                <span className="segmented segmented-2 segmented-small lang-switch" role="group" aria-label="Language">
                  <button aria-pressed={lang === 'en'} onClick={() => { setLang('en'); setEdited(null); }}>
                    English
                  </button>
                  <button aria-pressed={lang === 'ms'} onClick={() => { setLang('ms'); setEdited(null); }}>
                    BM
                  </button>
                </span>
              </div>
              <div className="group-body">
                <label className="row-input row-input-multiline">
                  <span className="sr-only">Message to the workshop</span>
                  <textarea className="message-box" rows={10} value={message} onChange={(e) => setEdited(e.target.value)} />
                </label>
              </div>
              <div className="group-footer">WhatsApp opens with this written. You check it and press send yourself.</div>
            </div>

            <div className="sticky-save book-actions">
              {wa && names.length > 0 ? (
                <a className="button button-whatsapp button-block" href={wa} target="_blank" rel="noreferrer">
                  Open in WhatsApp
                </a>
              ) : (
                <button className="button button-primary button-block" disabled>
                  {names.length === 0 ? 'Pick at least one job' : 'Open in WhatsApp'}
                </button>
              )}
              <div className="book-secondary">
                {tel ? (
                  <a className="button button-secondary" href={tel}>
                    Call
                  </a>
                ) : null}
                <button className="button button-secondary" onClick={copy} disabled={names.length === 0}>
                  Copy message
                </button>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </Screen>
  );
}
