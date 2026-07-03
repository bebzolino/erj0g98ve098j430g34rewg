import { FormEvent, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Lock } from 'lucide-react';

export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok || data.error) {
      setError(data.error || 'Login failed');
      return;
    }
    await router.replace('/');
  };

  return (
    <>
      <Head>
        <title>Login | Managing Panel</title>
      </Head>
      <main className="login-shell">
        <form className="login-panel" onSubmit={submit}>
          <div className="login-icon"><Lock size={24} /></div>
          <h1>Managing Panel</h1>
          <p>Enter the dashboard password.</p>
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
          />
          {error && <div className="login-error">{error}</div>}
          <button type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
        </form>
      </main>
      <style jsx>{`
        .login-shell {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          background: #1a1a1c;
          color: #f5f5f5;
        }
        .login-panel {
          width: min(100%, 390px);
          display: grid;
          gap: 14px;
          border: 1px solid #2b2b31;
          border-radius: 8px;
          padding: 28px;
          background: #222227;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.2);
        }
        .login-icon {
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border-radius: 8px;
          color: #fff;
          background: #ff5a5a;
        }
        h1 { margin: 4px 0 0; font-size: 26px; }
        p { margin: 0; color: #a1a1aa; font-size: 14px; }
        input {
          margin-top: 8px;
          border: 1px solid #2b2b31;
          border-radius: 8px;
          outline: none;
          color: #f5f5f5;
          background: #1a1a1c;
          padding: 13px 14px;
        }
        button {
          min-height: 42px;
          border: 0;
          border-radius: 8px;
          color: #fff;
          background: #ff5a5a;
          font-weight: 800;
          cursor: pointer;
        }
        button:disabled { opacity: 0.7; cursor: wait; }
        .login-error {
          border-radius: 8px;
          padding: 10px 12px;
          color: #ff5a5a;
          background: rgba(255, 90, 90, 0.12);
          font-size: 13px;
          font-weight: 700;
        }
      `}</style>
    </>
  );
}
