import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { errText } from '../i18n.js';

const TABS = [
  { key: 'awaitingPayment', query: '?awaitingPayment=true' },
  { key: 'overdue', query: '?overdue=true' },
  { key: 'allOrders', query: '' },
];

const URGENCY_CLASS = { ok: 'approved', soon: 'pending', overdue: 'denied' };

export default function OrdersQueue({ t, lang }) {
  const [tab, setTab] = useState('awaitingPayment');
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    setItems(null);
    try {
      const q = TABS.find((x) => x.key === tab).query;
      const res = await api.orders(q);
      setItems(res.items);
    } catch (e) {
      setErr(e);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const money = (n) =>
    `${Number(n ?? 0).toLocaleString(lang === 'fr' ? 'fr-DZ' : 'en-GB').replace(/,/g, ' ')} DA`;

  const dateFmt = (d) =>
    d ? new Date(d).toLocaleDateString(lang === 'fr' ? 'fr-DZ' : 'en-GB',
      { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  async function resolve(paymentId, confirm) {
    setBusyId(paymentId);
    setErr(null);
    try {
      if (confirm) await api.confirmPayment(paymentId);
      else await api.rejectPayment(paymentId);
      await load();
    } catch (e) {
      setErr(e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="wrap">
      <div className="tabs">
        {TABS.map((x) => (
          <button key={x.key} className={tab === x.key ? 'on' : ''} onClick={() => setTab(x.key)}>
            {t('orders.' + x.key)}
          </button>
        ))}
      </div>

      {err && <div className="error">{errText(t, err)}</div>}
      {!items && !err && <div className="spin">…</div>}
      {items?.length === 0 && <div className="empty">{t('orders.empty')}</div>}

      {items?.map((o) => {
        const declared = o.payments.filter((p) => p.status === 'declared');
        const open = expanded === o.id;

        return (
          <div className="card" key={o.id}>
            <div className="row">
              <div className="grow">
                <h3>{o.company.name}</h3>
                <div className="meta">
                  {o.orderNo} · {o.itemCount} {t(o.itemCount === 1 ? 'orders.line' : 'orders.lines')} · {dateFmt(o.createdAt)}
                </div>
                <div className="meta">
                  {t('orders.total')}: <strong>{money(o.total)}</strong>
                  {o.amountPaid > 0 && ` · ${t('orders.paid')}: ${money(o.amountPaid)}`}
                  {o.remaining > 0 && ` · ${t('orders.remaining')}: ${money(o.remaining)}`}
                </div>
                {o.paymentType === 'credit' && o.paymentState !== 'paid' && (
                  <div className="meta">
                    <span className={'badge ' + (URGENCY_CLASS[o.urgency] ?? 'pending')}>
                      {o.urgency === 'overdue'
                        ? t('orders.overdueLabel')
                        : `${t('orders.daysLeft')}: ${o.daysLeft}`}
                    </span>{' '}
                    {t('orders.due')} {dateFmt(o.dueDate)}
                  </div>
                )}
              </div>

              <span className={'badge ' + (o.paymentState === 'paid' ? 'approved' : 'pending')}>
                {t('paystate.' + o.paymentState)}
              </span>

              <button className="btn-review" onClick={() => setExpanded(open ? null : o.id)}>
                {open ? t('orders.hide') : t('orders.details')}
              </button>
            </div>

            {open && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                <p className="section-title">{t('orders.lines')}</p>
                {o.items.map((i, n) => (
                  <div className="meta" key={n}>
                    {i.quantity} × {i.name} — {money(i.lineTotal)}
                  </div>
                ))}
              </div>
            )}

            {declared.length > 0 && (
              <div className="paybox">
                <p className="section-title" style={{ marginBottom: 8 }}>
                  {t('orders.declaredPayments')}
                </p>
                {declared.map((p) => (
                  <div className="payrow" key={p.id}>
                    <div className="grow">
                      <strong>{money(p.amount)}</strong> · {t('method.' + p.method)}
                      {p.reference ? ` · ${p.reference}` : ''}
                      <small> — {dateFmt(p.declaredAt)}</small>
                    </div>
                    <button
                      className="btn-approve-sm"
                      disabled={busyId === p.id}
                      onClick={() => resolve(p.id, true)}
                    >
                      {t('orders.confirmReceipt')}
                    </button>
                    <button
                      className="btn-deny-sm"
                      disabled={busyId === p.id}
                      onClick={() => resolve(p.id, false)}
                    >
                      {t('orders.rejectPayment')}
                    </button>
                  </div>
                ))}
                <p className="paynote">{t('orders.confirmNote')}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
