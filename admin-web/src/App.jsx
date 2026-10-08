import { useEffect, useState } from 'react';
import { loadSession, clearSession, setAuthLostHandler } from './api.js';
import { makeT } from './i18n.js';
import Login from './pages/Login.jsx';
import Queue from './pages/Queue.jsx';
import RequestDetail from './pages/RequestDetail.jsx';
import OrdersQueue from './pages/OrdersQueue.jsx';

export default function App() {
  const [session, setSession] = useState(loadSession);
  const [openId, setOpenId] = useState(null);
  const [section, setSection] = useState('requests'); // requests | orders
  // French first: Naftal's agents are francophone.
  const [lang, setLang] = useState(() => localStorage.getItem('naftal.lang') || 'fr');
  const [reloadKey, setReloadKey] = useState(0);

  const t = makeT(lang);

  useEffect(() => {
    localStorage.setItem('naftal.lang', lang);
    document.documentElement.lang = lang;
  }, [lang]);

  // A dead session anywhere in the app drops straight back to the login screen.
  useEffect(() => setAuthLostHandler(() => setSession(null)), []);

  if (!session) return <Login t={t} onDone={setSession} />;

  return (
    <>
      <header className="topbar">
        <div>
          <h1>NAFTAL</h1>
          <div className="sub">{t('app.subtitle')}</div>
        </div>
        <nav className="sections">
          {['requests', 'orders'].map((x) => (
            <button
              key={x}
              className={section === x ? 'on' : ''}
              onClick={() => { setSection(x); setOpenId(null); }}
            >
              {t('nav.' + x)}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <div className="lang">
          {['fr', 'en'].map((l) => (
            <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="sub">{session.user.username}</span>
        <button onClick={() => { clearSession(); setSession(null); }}>{t('nav.logout')}</button>
      </header>

      {section === 'orders' ? (
        <OrdersQueue t={t} lang={lang} />
      ) : openId ? (
        <RequestDetail
          t={t}
          lang={lang}
          id={openId}
          onBack={() => setOpenId(null)}
          onDecided={() => { setOpenId(null); setReloadKey((k) => k + 1); }}
        />
      ) : (
        <Queue key={reloadKey} t={t} lang={lang} onOpen={setOpenId} />
      )}
    </>
  );
}
