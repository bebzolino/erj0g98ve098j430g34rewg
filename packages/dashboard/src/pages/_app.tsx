import type { AppProps } from 'next/app';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <style jsx global>{`
        :root {
          --font-sans: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        [data-theme="dark"] {
          --bg-primary: #0f1117;
          --bg-secondary: #1a1d2e;
          --bg-card: rgba(26, 29, 46, 0.8);
          --bg-card-hover: rgba(30, 34, 52, 0.9);
          --bg-input: rgba(0, 0, 0, 0.25);
          --bg-badge: rgba(255, 255, 255, 0.05);
          --border: rgba(255, 255, 255, 0.08);
          --border-focus: rgba(99, 102, 241, 0.5);
          --shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
          --shadow-hover: 0 8px 32px rgba(0, 0, 0, 0.4);
          --text-primary: #f0f0f0;
          --text-secondary: #9ca3af;
          --text-muted: #6b7280;
          --accent: #6366f1;
          --accent-glow: rgba(99, 102, 241, 0.2);
          --success: #10b981;
          --warning: #f59e0b;
          --error: #ef4444;
          --outbound-bg: rgba(255, 255, 255, 0.06);
          --inbound-bg: #6366f1;
        }

        [data-theme="light"] {
          --bg-primary: #f5f5f7;
          --bg-secondary: #ffffff;
          --bg-card: rgba(255, 255, 255, 0.9);
          --bg-card-hover: rgba(255, 255, 255, 1);
          --bg-input: rgba(0, 0, 0, 0.04);
          --bg-badge: rgba(0, 0, 0, 0.05);
          --border: rgba(0, 0, 0, 0.08);
          --border-focus: rgba(99, 102, 241, 0.5);
          --shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
          --shadow-hover: 0 8px 32px rgba(0, 0, 0, 0.12);
          --text-primary: #1a1a2e;
          --text-secondary: #4b5563;
          --text-muted: #9ca3af;
          --accent: #4f46e5;
          --accent-glow: rgba(79, 70, 229, 0.15);
          --success: #059669;
          --warning: #d97706;
          --error: #dc2626;
          --outbound-bg: rgba(0, 0, 0, 0.05);
          --inbound-bg: #4f46e5;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: var(--font-sans) !important;
          min-height: 100vh;
          transition: background 0.3s, color 0.3s;
        }

        .glass-card {
          background: var(--bg-card);
          backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 24px;
          box-shadow: var(--shadow);
          transition: all 0.25s ease;
        }

        .glass-card:hover {
          box-shadow: var(--shadow-hover);
        }

        .glass-card h2 {
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        input, textarea, select {
          width: 100%;
          padding: 10px 14px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-primary);
          font-family: inherit;
          font-size: 0.9rem;
          transition: border 0.2s, box-shadow 0.2s;
        }

        input:focus, textarea:focus, select:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--border-focus);
        }

        .btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 20px;
          background: var(--accent);
          border: none;
          border-radius: 8px;
          color: white;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-primary:active { transform: translateY(0); }

        .btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 16px;
          background: var(--bg-badge);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--text-primary);
          font-weight: 600;
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: var(--accent-glow);
          border-color: var(--accent);
        }

        .badge {
          display: inline-flex;
          padding: 3px 10px;
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .badge-high { background: rgba(16,185,129,0.12); color: var(--success); }
        .badge-medium { background: rgba(245,158,11,0.12); color: var(--warning); }
        .badge-low { background: rgba(239,68,68,0.12); color: var(--error); }
        .badge-neutral { background: var(--bg-badge); color: var(--text-muted); }

        label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; display: block; }

        small { color: var(--text-muted); font-size: 0.75rem; }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
