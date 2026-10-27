import { Link, useNavigate } from 'react-router-dom';
import { Screen } from '../components/Screen';
import { Icon } from '../components/Icon';
import { Empty, ErrorNotice, Loading } from '../components/States';
import { listWorkshops } from '../api';
import { useQuery } from '../lib/useQuery';
import { mapsLinks, telLink, waLink } from '../lib/booking';

export function Workshops() {
  const navigate = useNavigate();
  const workshops = useQuery(listWorkshops, []);

  return (
    <Screen
      title="Workshops"
      compact
      left={
        <button className="nav-button" onClick={() => navigate(-1)}>
          <Icon name="chevron-left" size={22} />
          Back
        </button>
      }
      right={
        <Link to="/workshops/new" className="nav-button" aria-label="Add workshop">
          <Icon name="plus" size={22} />
        </Link>
      }
    >
      <main className="page stack">
        {workshops.error ? <ErrorNotice message={workshops.error} onRetry={workshops.reload} /> : null}
        {!workshops.data && !workshops.error ? <Loading /> : null}
        {workshops.data && workshops.data.length === 0 ? (
          <Empty
            icon="wrench"
            title="No workshops yet"
            text="Save your mechanic, tyre shop and battery hotline so you can call, WhatsApp or book them in one tap."
            action={
              <Link to="/workshops/new" className="button button-primary">
                Add workshop
              </Link>
            }
          />
        ) : null}

        {(workshops.data ?? []).length > 0 ? (
          <div className="group-body">
            {workshops.data!.map((w) => {
              const maps = mapsLinks(w.name, w.address);
              const tel = telLink(w.phone);
              const wa = waLink(w.phone, '');
              return (
                <div className="workshop-row" key={w.id}>
                  <Link to={`/workshops/${w.id}`} className="workshop-main">
                    <span className="tx-title">
                      {w.favourite ? <span className="star" aria-label="Favourite">★</span> : null}
                      {w.name}
                    </span>
                    <span className="tx-sub">{[w.phone, w.address].filter(Boolean).join(' · ') || 'Add phone and address'}</span>
                  </Link>
                  <div className="workshop-actions">
                    {tel ? (
                      <a className="action-chip" href={tel}>
                        Call
                      </a>
                    ) : null}
                    {wa ? (
                      <a className="action-chip" href={wa} target="_blank" rel="noreferrer">
                        WhatsApp
                      </a>
                    ) : null}
                    <a className="action-chip" href={maps.waze} target="_blank" rel="noreferrer">
                      Waze
                    </a>
                    <a className="action-chip" href={maps.google} target="_blank" rel="noreferrer">
                      Maps
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </main>
    </Screen>
  );
}
