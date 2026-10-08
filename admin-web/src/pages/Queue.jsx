import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { errText } from '../i18n.js';

const TABS = ['pending', 'approved', 'denied', 'all'];

export default function Queue({ t, lang, onOpen }) {
  const [tab, setTab] = useState('pending');
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    setItems(null);
    try {
      const res = await api.requests(tab === 'all' ? undefined : tab);
      setItems(res.items);
    } catch (e) {
      setErr(e);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  // The queue is the one screen an agent leaves open, so it refreshes itself.
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const dateFmt = (d) =>
    new Date(d).toLocaleString(lang === 'fr' ? 'fr-DZ' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="wrap">
      <div className="tabs">
        {TABS.map((x) => (
          <button key={x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
            {t('queue.' + x)}
          </button>
        ))}
      </div>

      {err && <div className="error">{errText(t, err)}</div>}
      {!items && !err && <div className="spin">…</div>}
      {items?.length === 0 && <div className="empty">{t('queue.empty')}</div>}

      {items?.map((r) => (
        <div className="card" key={r.id}>
          <div className="row">
            <div className="grow">
              <h3>{r.company.name}</h3>
              <div className="meta">
                {r.company.legalForm ? r.company.legalForm + ' · ' : ''}
                {r.applicant.firstName} {r.applicant.lastName}
                {r.applicant.phone ? ' · ' + r.applicant.phone : ''}
              </div>
              <div className="meta">
                {t('queue.submitted')} {dateFmt(r.submittedAt)} ·{' '}
                {r.documentCount}/5 {t('queue.documents')}
              </div>
            </div>
            <span className={'badge ' + r.status}>{t('status.' + r.status)}</span>
            <button className="btn-review" onClick={() => onOpen(r.id)}>
              {t('queue.open')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
