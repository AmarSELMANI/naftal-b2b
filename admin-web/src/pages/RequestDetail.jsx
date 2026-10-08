import { useEffect, useState } from 'react';
import { api, fetchDocument } from '../api.js';
import { errText } from '../i18n.js';

const KINDS = ['id_card', 'proof_of_address', 'business_registration', 'tin', 'bank_statement'];

export default function RequestDetail({ t, lang, id, onBack, onDecided }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState('');
  const [viewing, setViewing] = useState(null); // { url, type, kind }

  useEffect(() => {
    let dead = false;
    api.request(id).then(
      (d) => !dead && setData(d),
      (e) => !dead && setErr(e),
    );
    return () => { dead = true; };
  }, [id]);

  // Blob URLs hold the document in memory; release on unmount or when swapping.
  useEffect(() => () => { if (viewing) URL.revokeObjectURL(viewing.url); }, [viewing]);

  async function view(doc) {
    setErr(null);
    try {
      if (viewing) URL.revokeObjectURL(viewing.url);
      const { url, type } = await fetchDocument(doc.downloadPath);
      setViewing({ url, type, kind: doc.kind });
    } catch (e) {
      setErr(e);
    }
  }

  async function decide(approve) {
    setBusy(true);
    setErr(null);
    try {
      if (approve) await api.approve(id);
      else await api.deny(id, reason);
      onDecided();
    } catch (e) {
      setErr(e);
      setBusy(false);
    }
  }

  const dateFmt = (d) =>
    d ? new Date(d).toLocaleString(lang === 'fr' ? 'fr-DZ' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }) : '—';

  if (err && !data) {
    return (
      <div className="wrap">
        <button className="back" onClick={onBack}>&larr; {t('detail.back')}</button>
        <div className="error">{errText(t, err)}</div>
      </div>
    );
  }
  if (!data) return <div className="wrap"><div className="spin">…</div></div>;

  const byKind = Object.fromEntries(data.documents.map((d) => [d.kind, d]));
  const c = data.company;
  const a = data.applicant;

  return (
    <div className="wrap">
      <button className="back" onClick={onBack}>&larr; {t('detail.back')}</button>

      {err && <div className="error">{errText(t, err)}</div>}

      <div className="card">
        <div className="row">
          <h3 className="grow" style={{ margin: 0 }}>{c.name}</h3>
          <span className={'badge ' + data.status}>{t('status.' + data.status)}</span>
        </div>
        {data.status !== 'pending' && (
          <div className="meta" style={{ marginTop: 8 }}>
            {t('detail.decided')} {dateFmt(data.decidedAt)}
            {data.decidedBy ? ` ${t('detail.by')} ${data.decidedBy}` : ''}
            {data.denialReason ? ` — ${t('detail.reason')}: ${data.denialReason}` : ''}
          </div>
        )}
      </div>

      <div className="card">
        <p className="section-title">{t('detail.company')}</p>
        <dl className="kv">
          <dt>{t('detail.name')}</dt><dd>{c.name}</dd>
          <dt>{t('detail.legalForm')}</dt><dd>{c.legalForm || '—'}</dd>
          <dt>{t('detail.rc')}</dt><dd>{c.tradeRegisterNo || '—'}</dd>
          <dt>{t('detail.tin')}</dt><dd>{c.tin || '—'}</dd>
          <dt>{t('detail.address')}</dt><dd>{c.address || '—'}</dd>
          <dt>{t('detail.phone')}</dt><dd>{c.phone || '—'}</dd>
          <dt>{t('detail.email')}</dt><dd>{c.email || '—'}</dd>
        </dl>
      </div>

      <div className="card">
        <p className="section-title">{t('detail.applicant')}</p>
        <dl className="kv">
          <dt>{t('detail.personName')}</dt><dd>{a.firstName} {a.lastName}</dd>
          <dt>{t('detail.username')}</dt><dd>{a.username}</dd>
          <dt>{t('detail.email')}</dt><dd>{a.email || '—'}</dd>
          <dt>{t('detail.phone')}</dt><dd>{a.phone || '—'}</dd>
          <dt>{t('detail.terms')}</dt><dd>{dateFmt(data.termsAcceptedAt)}</dd>
        </dl>
      </div>

      <div className="card">
        <p className="section-title">{t('detail.documents')}</p>
        <div className="docs">
          {KINDS.map((kind) => {
            const doc = byKind[kind];
            return (
              <div className={'doc' + (doc ? '' : ' missing')} key={kind}>
                <div className="name">
                  {t('doc.' + kind)}
                  <small>
                    {doc
                      ? `${doc.fileName} · ${Math.max(1, Math.round(doc.sizeBytes / 1024))} KB`
                      : t('detail.missing')}
                  </small>
                </div>
                {doc && <button onClick={() => view(doc)}>{t('queue.open')}</button>}
              </div>
            );
          })}
        </div>

        {viewing && (
          <div className="viewer">
            {viewing.type.startsWith('image/') ? (
              <img src={viewing.url} alt={t('doc.' + viewing.kind)} />
            ) : (
              <iframe src={viewing.url} title={t('doc.' + viewing.kind)} />
            )}
          </div>
        )}
      </div>

      {data.status === 'pending' && (
        <div className="card">
          <div className="note" style={{ marginBottom: 16 }}>{t('detail.creditNote')}</div>

          {!denying ? (
            <div className="actions">
              <button className="btn-approve" disabled={busy} onClick={() => decide(true)}>
                {t('detail.approve')}
              </button>
              <button className="btn-deny" disabled={busy} onClick={() => setDenying(true)}>
                {t('detail.deny')}
              </button>
            </div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="r">{t('detail.denyReason')}</label>
                <textarea
                  id="r"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('detail.denyPlaceholder')}
                  autoFocus
                />
              </div>
              <div className="actions">
                <button
                  className="btn-deny"
                  disabled={busy || reason.trim().length < 3}
                  onClick={() => decide(false)}
                >
                  {t('detail.denyConfirm')}
                </button>
                <button onClick={() => { setDenying(false); setReason(''); }} disabled={busy}>
                  {t('detail.cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
