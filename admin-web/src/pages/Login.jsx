import { useState } from 'react';
import { api, saveSession, ApiError } from '../api.js';
import { errText } from '../i18n.js';

export default function Login({ t, onDone }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const session = await api.login(username, password);
      // The console is for Naftal staff. A customer with valid credentials gets
      // a clear refusal rather than an empty console they cannot use.
      if (session.user.role !== 'agent' && session.user.role !== 'admin') {
        setErr(new ApiError('FORBIDDEN', 'not staff', 403));
        return;
      }
      saveSession(session);
      onDone(session);
    } catch (e2) {
      setErr(e2);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <h2>{t('login.title')}</h2>
        <div className="brand">NAFTAL &middot; {t('app.title')}</div>

        {err && <div className="error">{errText(t, err)}</div>}

        <div className="field">
          <label htmlFor="u">{t('login.username')}</label>
          <input
            id="u"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </div>

        <div className="field">
          <label htmlFor="p">{t('login.password')}</label>
          <input
            id="p"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button className="btn-primary" disabled={busy || !username || !password}>
          {busy ? t('login.pending') : t('login.submit')}
        </button>
      </form>
    </div>
  );
}
