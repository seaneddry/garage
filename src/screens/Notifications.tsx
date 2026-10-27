import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth';
import { disablePush, enablePush, getPushState, sendTestPush } from '../lib/push';
import type { PushState } from '../lib/push';
import { errorMessage } from '../lib/useQuery';

export function Notifications() {
  const { session } = useAuth();
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getPushState().then(setState);
  }, []);

  async function run(fn: () => Promise<void>, done?: string) {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setState(await getPushState());
      setBusy(false);
    }
  }

  const userId = session?.user.id;

  return (
    <Screen
      title="Notifications"
      sub="Phone alerts for car jobs"
      left={
        <Link to="/settings" viewTransition className="nav-button">
          <Icon name="chevron-left" size={22} /> Settings
        </Link>
      }
    >
      <main className="page stack">
        {!state ? <Loading /> : null}

        {state?.kind === 'needs-install' ? (
          <div className="notice">
            <strong>Add the app to your Home Screen first.</strong>
            <br />
            iPhone only allows notifications for apps on the Home Screen. In Safari tap <strong>Share</strong>, then{' '}
            <strong>Add to Home Screen</strong>, open the new icon, and come back to this page.
          </div>
        ) : null}

        {state?.kind === 'unsupported' ? (
          <div className="notice">This browser does not support push notifications. On iPhone, use Safari 16.4 or newer.</div>
        ) : null}

        {state?.kind === 'blocked' ? (
          <div className="notice notice-error">
            Notifications are blocked for this app. On iPhone open <strong>Settings → Notifications → Garage</strong> and
            allow them, then return here.
          </div>
        ) : null}

        {state?.kind === 'off' ? (
          <>
            <div className="notice">
              Get a notification when a reminder is due soon (by date or km) and again if it becomes overdue. Tap it to
              book the workshop on WhatsApp.
            </div>
            <button
              className="button button-primary button-block"
              disabled={busy || !userId}
              onClick={() => void run(() => enablePush(userId ?? ''), 'Notifications turned on')}
            >
              {busy ? 'Turning on…' : 'Turn on notifications'}
            </button>
          </>
        ) : null}

        {state?.kind === 'on' ? (
          <>
            <div className="group">
              <div className="group-body">
                <div className="row">
                  <span className="row-icon">
                    <Icon name="bell" size={18} />
                  </span>
                  <span className="row-label">This device</span>
                  <span className="row-value row-value-strong">On</span>
                </div>
              </div>
              <div className="group-footer">
                Checked every day around 9:05 AM Malaysia time. Each job alerts once when it is due soon and once if it
                becomes overdue. Logging the service resets it. Turned on per device, separately from the Expense Tracker.
              </div>
            </div>
            <button
              className="button button-secondary button-block"
              disabled={busy}
              onClick={() => void run(sendTestPush, 'Test sent')}
            >
              Send a test notification
            </button>
            <button className="button button-danger button-block" disabled={busy} onClick={() => void run(disablePush, 'Notifications turned off')}>
              Turn off on this device
            </button>
          </>
        ) : null}
      </main>
    </Screen>
  );
}
