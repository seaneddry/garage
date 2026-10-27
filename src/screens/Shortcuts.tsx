import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { ErrorNotice, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { getSettings, newShortcutToken } from '../api';
import { errorMessage, useQuery } from '../lib/useQuery';

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/garage-shortcut`;

function Copy({ label, value }: { label: string; value: string }) {
  const toast = useToast();
  return (
    <button
      className="copy-row"
      onClick={() =>
        void navigator.clipboard.writeText(value).then(
          () => toast(`${label} copied`),
          () => toast('Could not copy. Press and hold to select it.'),
        )
      }
    >
      <span className="row-label">
        {label}
        <span className="row-sub copy-value">{value}</span>
      </span>
      <span className="copy-chip">Copy</span>
    </button>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="howto-step">
      <span className="howto-n">{n}</span>
      <div>{children}</div>
    </li>
  );
}

function Request({ action, extra }: { action: string; extra?: ReactNode }) {
  return (
    <>
      Add <strong>Get Contents of URL</strong>. URL: the address above. Tap <strong>Show More</strong>: Method <strong>POST</strong>; Headers: add{' '}
      <code>x-garage-token</code> = your token; Request Body <strong>JSON</strong>: <code>action</code> = <code>{action}</code>
      {extra ? <>, {extra}</> : null}.
    </>
  );
}

export function Shortcuts() {
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useQuery(getSettings, []);
  const [confirm, setConfirm] = useState(false);
  const token = settings.data?.shortcut_token ?? null;

  async function regenerate() {
    setConfirm(false);
    try {
      await newShortcutToken();
      settings.reload();
      toast('New token made. Update it in your Shortcuts.');
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  const loc = (
    <>
      <code>lat</code> = Current Location › <strong>Latitude</strong>, <code>lng</code> = Current Location › <strong>Longitude</strong>
    </>
  );

  return (
    <Screen
      title="Shortcuts"
      compact
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          <Icon name="chevron-left" size={22} />
          Back
        </button>
      }
    >
      <main className="page stack">
        <div className="notice">
          A web app can't see your car's Bluetooth or run in the background, but the iPhone <strong>Shortcuts</strong> app can. These automations
          start and end trips when CarPlay connects, save where you parked, and let Siri tell you what's due.
        </div>

        {settings.error ? <ErrorNotice message={settings.error} onRetry={settings.reload} /> : null}
        {!settings.data && !settings.error ? <Loading /> : null}
        {settings.data ? (
          <section className="group">
            <div className="group-header">Your details for the Shortcuts</div>
            <div className="group-body">
              <Copy label="Address (URL)" value={ENDPOINT} />
              {token ? <Copy label="Token (keep it private)" value={token} /> : <div className="row">No token yet. Make one below.</div>}
            </div>
            <div className="group-footer">
              Anyone with the token can add trips, parking spots and odometer readings to your Garage, and see what's due. If it leaks, make a
              new one; the old one stops working at once.{' '}
              <button className="link-button" onClick={() => setConfirm(true)}>
                Make a new token
              </button>
            </div>
          </section>
        ) : null}

        <section className="group">
          <div className="group-header">1 · Start a trip when CarPlay connects</div>
          <ol className="howto">
            <Step n={1}>
              Open <strong>Shortcuts</strong> › <strong>Automation</strong> › <strong>+</strong> › <strong>CarPlay</strong> › <strong>Connects</strong>. Choose{' '}
              <strong>Run Immediately</strong>. (No CarPlay? Use <strong>Bluetooth</strong> and pick your car instead.)
            </Step>
            <Step n={2}>
              Add <strong>Get Current Location</strong>.
            </Step>
            <Step n={3}>
              <Request action="trip-start" extra={loc} />
            </Step>
          </ol>
        </section>

        <section className="group">
          <div className="group-header">2 · End the trip and save where you parked</div>
          <ol className="howto">
            <Step n={1}>
              New automation: <strong>CarPlay</strong> › <strong>Disconnects</strong> (or Bluetooth › Is Disconnected) › <strong>Run Immediately</strong>.
            </Step>
            <Step n={2}>
              Add <strong>Get Current Location</strong>.
            </Step>
            <Step n={3}>
              <Request action="trip-end" extra={loc} />
            </Step>
            <Step n={4}>
              Optional: add <strong>Show Notification</strong> with <strong>Contents of URL</strong> to see "Trip saved. Parking spot saved."
            </Step>
          </ol>
        </section>

        <section className="group">
          <div className="group-header">3 · "Hey Siri, what's due on my car?"</div>
          <ol className="howto">
            <Step n={1}>
              In <strong>Shortcuts</strong>, tap <strong>+</strong> for a new shortcut and name it <strong>What's due on my car</strong>.
            </Step>
            <Step n={2}>
              <Request action="next" />
            </Step>
            <Step n={3}>
              Add <strong>Speak Text</strong> (or <strong>Show Result</strong>) with <strong>Contents of URL</strong>. Add it to your Home Screen as a widget too.
            </Step>
          </ol>
        </section>

        <section className="group">
          <div className="group-header">4 · Log the odometer by voice</div>
          <ol className="howto">
            <Step n={1}>
              New shortcut named <strong>Log odometer</strong>. Add <strong>Ask for Input</strong>, type <strong>Number</strong>, prompt "Odometer in km".
            </Step>
            <Step n={2}>
              <Request
                action="odometer"
                extra={
                  <>
                    <code>km</code> = <strong>Provided Input</strong>
                  </>
                }
              />
            </Step>
            <Step n={3}>
              Add <strong>Show Result</strong>. Say "Hey Siri, log odometer" at the pump.
            </Step>
          </ol>
        </section>

        <div className="group-footer">
          Your location is only sent at the moment CarPlay connects or disconnects, never in between. Trips from CarPlay record the time and
          place; add the km in the trip (or both odometer readings) when you need it for a claim.
        </div>
      </main>
      {confirm ? (
        <ConfirmSheet
          title="Make a new token? Shortcuts using the old one stop working until you paste in the new one."
          confirmLabel="Make new token"
          danger
          onConfirm={() => void regenerate()}
          onCancel={() => setConfirm(false)}
        />
      ) : null}
    </Screen>
  );
}
