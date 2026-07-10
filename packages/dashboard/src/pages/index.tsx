import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import {
  Activity,
  AlertTriangle,
  Home,
  Info,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Trash2,
  Users,
  Wifi,
} from 'lucide-react';
import { isAuthConfigured, isAuthenticated } from '../lib/auth';

type Tab = 'overview' | 'accounts' | 'messages' | 'blacklist' | 'proxies' | 'status' | 'settings';

interface SystemConfig {
  welcomeMessage: string;
  initialMessageVariants: string;
  followupMessage: string;
  initialDelayMinutes: number;
  followupDelayHours: number;
  enableAi: boolean;
  confidenceThreshold: number;
  telegramBotToken: string;
  telegramChatId: string;
  typingSimulation: boolean;
  enableFriendRequests: boolean;
  processRejoins: boolean;
  skipAutomessagesAfterInbound: boolean;
  rotateDeliveryAccounts: boolean;
  fixedDeliveryAccountId: string;
  enablePings: boolean;
  pingChannelId: string;
  pingMessage: string;
  pingDelayHours: number;
  userToken: string;
  geminiApiKey: string;
  captchaSolver: string;
  captchaKey: string;
  friendRequestDelayMinutes: number;
  typingSpeedMultiplier: number;
  capsolverKey?: string;
  anysolverKey?: string;
  captchaProxy?: string;
  safetyMinInitialDmDelayMinutes: number;
  safetyMinFriendRequestDelayMinutes: number;
  safetyDmCooldownSeconds: number;
  safetyFriendRequestCooldownSeconds: number;
  safetyDmCooldownMinMs: number;
  safetyDmCooldownMaxMs: number;
  safetyFriendRequestCooldownMinMs: number;
  safetyFriendRequestCooldownMaxMs: number;
  safetyFailureCooldownMinutes: number;
  safetyMaxDmPerHour: number;
  safetyMaxFriendRequestsPerHour: number;
  queueScanIntervalSeconds: number;
  queueDmSpreadSeconds: number;
  queueFriendRequestSpreadSeconds: number;
}

interface Member {
  userId: string;
  username: string;
  joinTime: string;
  status: string;
  interestScore: number | null;
  interestLevel: string | null;
  sentiment: string | null;
  tags: string | null;
  isToxic: boolean;
}

interface Conversation {
  id: string;
  userId: string;
  message: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
}

interface LogEntry {
  id: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
  timestamp: string;
}

interface Account {
  id: string;
  username: string;
  status: string;
  blocksAutomessagesOnInbound: boolean;
  proxyId?: string | null;
  tokenPreview?: string;
  createdAt: string;
}

interface ProxyEntry {
  id: string;
  label: string;
  type: string;
  urlPreview: string;
  createdAt: string;
}

interface ProxyPayload {
  proxies: ProxyEntry[];
  accounts: Pick<Account, 'id' | 'username' | 'proxyId'>[];
}

interface BlacklistEntry {
  id: string;
  type: 'user' | 'guild' | 'guild_whitelist';
  value: string;
  label: string;
  createdAt: string;
}

type BlacklistType = BlacklistEntry['type'];

function blacklistTypeName(type: BlacklistType): string {
  if (type === 'guild_whitelist') {
    return 'Allowed guild';
  }
  return type === 'guild' ? 'Blocked guild' : 'Blocked user';
}

function blacklistTypeBadge(type: BlacklistType): string {
  if (type === 'guild_whitelist') {
    return 'Allowed guild ID';
  }
  return type === 'guild' ? 'Blocked guild ID' : 'Blocked user ID';
}

function parseMessageVariants(value?: string): string[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

interface StatusSnapshot {
  generatedAt: string;
  services: Record<string, { status: string; port?: number | null }>;
  accounts: {
    total: number;
    active: number;
    invalid: number;
    rateLimited: number;
    unavailable?: number;
    rows: Account[];
  };
  members: {
    total: number;
    byStatus: Record<string, number>;
  };
  logs: LogEntry[];
}

async function safeFetch<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return (await res.json()) ?? fallback;
  } catch {
    return fallback;
  }
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    active: 'Active',
    invalid: 'Invalid token',
    unavailable: 'Unavailable',
    rate_limited: 'Rate limited',
    pending: 'Waiting',
    first_dm_sent: 'First DM sent',
    replied: 'Replied',
    stopped: 'No reply',
    failed_dm: 'DM failed',
    failed_followup: 'Follow-up failed',
    pinged: 'Pinged',
    opted_out: 'Opted out',
  };
  return labels[status] || status.replace(/_/g, ' ');
}

function toNumber(value: string, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function containsLink(value: string) {
  return /(?:https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/|[a-z0-9-]+\.[a-z]{2,}(?:\/|\b))/i.test(value);
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [proxies, setProxies] = useState<ProxyEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [statusData, setStatusData] = useState<StatusSnapshot | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [newAccountToken, setNewAccountToken] = useState('');
  const [newAccountUsername, setNewAccountUsername] = useState('');
  const [blacklistType, setBlacklistType] = useState<BlacklistType>('guild_whitelist');
  const [blacklistValue, setBlacklistValue] = useState('');
  const [blacklistLabel, setBlacklistLabel] = useState('');
  const [newProxyLabel, setNewProxyLabel] = useState('');
  const [newProxyType, setNewProxyType] = useState<'socks5' | 'http'>('socks5');
  const [newProxyUrl, setNewProxyUrl] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectedMember = useMemo(
    () => members.find((member) => member.userId === selectedUserId) ?? members[0] ?? null,
    [members, selectedUserId],
  );

  const stats = useMemo(() => {
    const delivered = members.filter((member) => ['first_dm_sent', 'replied', 'pinged', 'stopped'].includes(member.status)).length;
    const replied = members.filter((member) => member.status === 'replied').length;
    const qualified = members.filter((member) => ['medium', 'high'].includes(member.interestLevel ?? '')).length;
    const total = Math.max(members.length, 1);

    return [
      { label: 'Total Members', value: String(members.length), detail: `${accounts.filter((account) => account.status === 'active').length} active accounts` },
      { label: 'Delivery Rate', value: `${Math.round((delivered / total) * 100)}%`, detail: `${delivered} delivered` },
      { label: 'Response Rate', value: `${Math.round((replied / total) * 100)}%`, detail: `${replied} replies` },
      { label: 'Qualified Leads', value: String(qualified), detail: 'medium or high' },
      { label: 'Safety Cooldown', value: `${config?.safetyDmCooldownMinMs ?? 0}-${config?.safetyDmCooldownMaxMs ?? 0}ms`, detail: 'DM gap per account' },
    ];
  }, [accounts, config, members]);

  const loadData = async () => {
    const [configData, membersData, accountsData, blacklistData, proxyData, logsData, statusSnapshot] = await Promise.all([
      safeFetch<SystemConfig | null>('/api/config', null),
      safeFetch<Member[]>('/api/members', []),
      safeFetch<Account[]>('/api/accounts', []),
      safeFetch<BlacklistEntry[]>('/api/blacklist', []),
      safeFetch<ProxyPayload>('/api/proxies', { proxies: [], accounts: [] }),
      safeFetch<LogEntry[]>('/api/logs', []),
      safeFetch<StatusSnapshot | null>('/api/status', null),
    ]);

    if (!isEditingConfig && configData && !('error' in configData)) setConfig(configData);
    setMembers(Array.isArray(membersData) ? membersData : []);
    setAccounts(Array.isArray(accountsData) ? accountsData : []);
    setBlacklist(Array.isArray(blacklistData) ? blacklistData : []);
    setProxies(Array.isArray(proxyData.proxies) ? proxyData.proxies : []);
    setLogs(Array.isArray(logsData) ? logsData : []);
    if (statusSnapshot && !('error' in statusSnapshot)) setStatusData(statusSnapshot);
  };

  useEffect(() => {
    loadData();
    const interval = window.setInterval(loadData, 5000);
    return () => window.clearInterval(interval);
  }, [isEditingConfig]);

  useEffect(() => {
    const userId = selectedMember?.userId;
    if (!userId) {
      setConversations([]);
      return;
    }

    setSelectedUserId(userId);
    safeFetch<Conversation[]>(`/api/conversations?userId=${encodeURIComponent(userId)}`, []).then((data) => {
      setConversations(Array.isArray(data) ? data : []);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    });
  }, [selectedMember?.userId]);

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 3000);
  };

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(''), 5000);
  };

  const saveConfig = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!config) return;
    if (containsLink(config.welcomeMessage || '')) {
      showError('Welcome Message cannot contain links.');
      return;
    }
    if (parseMessageVariants(config.initialMessageVariants).some((variant) => containsLink(variant))) {
      showError('Initial message variants cannot contain links.');
      return;
    }

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      showError(data.error || 'Config save failed');
      return;
    }

    setConfig(data);
    setIsEditingConfig(false);
    showNotice('Config saved');
  };

  const addAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = newAccountToken.trim();
    if (!token) {
      showError('Token is required');
      return;
    }

    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, username: newAccountUsername.trim() }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      showError(data.error || 'Account add failed');
      return;
    }

    setNewAccountToken('');
    setNewAccountUsername('');
    await loadData();
    showNotice('Account added');
  };

  const deleteAccount = async (id: string) => {
    const res = await fetch('/api/accounts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      showError(data.error || 'Account delete failed');
      return;
    }

    await loadData();
    showNotice('Account removed');
  };

  const updateAccountInboundBlock = async (id: string, blocksAutomessagesOnInbound: boolean) => {
    const res = await fetch('/api/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, blocksAutomessagesOnInbound }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      showError(data.error || 'Account update failed');
      return;
    }
    await loadData();
    showNotice('Account automation rule updated');
  };

  const addBlacklistEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = blacklistValue.trim();
    if (!value) {
      showError('ID is required');
      return;
    }

    const res = await fetch('/api/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: blacklistType, value, label: blacklistLabel.trim() }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      showError(data.error || 'Access list add failed');
      return;
    }

    setBlacklistValue('');
    setBlacklistLabel('');
    await loadData();
    showNotice('Access list updated');
  };

  const deleteBlacklistEntry = async (id: string) => {
    const res = await fetch('/api/blacklist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      showError(data.error || 'Access list delete failed');
      return;
    }

    await loadData();
    showNotice('Access list entry removed');
  };

  const addProxy = async (event: React.FormEvent) => {
    event.preventDefault();
    const res = await fetch('/api/proxies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newProxyLabel.trim(), type: newProxyType, url: newProxyUrl.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      showError(data.error || 'Proxy add failed');
      return;
    }
    setNewProxyLabel('');
    setNewProxyUrl('');
    await loadData();
    showNotice('Proxy added');
  };

  const updateProxyAccounts = async (proxyId: string, accountIds: string[]) => {
    const res = await fetch('/api/proxies', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxyId, accountIds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      showError(data.error || 'Proxy assignment failed');
      return;
    }
    await loadData();
    showNotice('Proxy assignments updated');
  };

  const deleteProxy = async (id: string) => {
    const res = await fetch('/api/proxies', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      showError(data.error || 'Proxy delete failed');
      return;
    }
    await loadData();
    showNotice('Proxy removed');
  };

  const clearLogs = async () => {
    const res = await fetch('/api/logs', { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      showError(data.error || 'Log clear failed');
      return;
    }

    setLogs([]);
    await loadData();
    showNotice('Logs cleared');
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const postMemberAction = async (action: string, payload: Record<string, string>) => {
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      showError(data.error || 'Bot action failed');
      return;
    }

    await loadData();
    showNotice('Command sent to bot');
  };

  const updateConfig = <K extends keyof SystemConfig>(key: K, value: SystemConfig[K]) => {
    setIsEditingConfig(true);
    setConfig((current) => current ? { ...current, [key]: value } : current);
  };

  const updateWelcomeMessage = (value: string) => {
    if (containsLink(value)) {
      showError('Links are not allowed in Welcome Message.');
      return;
    }
    updateConfig('welcomeMessage', value);
  };

  const updateInitialVariant = (index: number, value: string) => {
    if (containsLink(value)) {
      showError('Links are not allowed in Initial Message variants.');
      return;
    }
    const variants = parseMessageVariants(config?.initialMessageVariants);
    variants[index] = value;
    updateConfig('initialMessageVariants', JSON.stringify(variants));
  };

  const addInitialVariant = () => {
    const variants = parseMessageVariants(config?.initialMessageVariants);
    updateConfig('initialMessageVariants', JSON.stringify([...variants, '']));
  };

  const removeInitialVariant = (index: number) => {
    const variants = parseMessageVariants(config?.initialMessageVariants);
    variants.splice(index, 1);
    updateConfig('initialMessageVariants', JSON.stringify(variants));
  };

  const blockWelcomePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData.getData('text');
    if (containsLink(text)) {
      event.preventDefault();
      showError('Links cannot be pasted into Welcome Message.');
    }
  };

  const navItems: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'accounts', label: 'Accounts', icon: Users },
    { id: 'messages', label: 'Messages', icon: MessageSquare },
    { id: 'blacklist', label: 'Access Lists', icon: Shield },
    { id: 'proxies', label: 'Proxy Manager', icon: Wifi },
    { id: 'status', label: 'Status', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      <Head>
        <title>Managing Panel</title>
      </Head>
      <div className="c404-shell">
        <aside className="c404-sidebar">
          <nav className="nav-list">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={`nav-item ${activeTab === item.id ? 'active' : ''}`} onClick={() => setActiveTab(item.id)}>
                  <Icon size={21} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="c404-main">
          <header className="topbar">
            <div>
              <p className="eyebrow">Discord outreach dashboard</p>
              <h1>{navItems.find((item) => item.id === activeTab)?.label}</h1>
            </div>
            <button className="icon-button" onClick={loadData} title="Refresh data">
              <RefreshCw size={18} />
            </button>
            <button className="icon-button" onClick={logout} title="Log out">
              <LogOut size={18} />
            </button>
          </header>

          {(notice || error) && (
            <div className={`toast ${error ? 'error' : 'success'}`}>
              {error || notice}
            </div>
          )}

          {activeTab === 'overview' && (
            <section className="view-stack">
              <div className="stats-grid">
                {stats.map((stat) => (
                  <div className="stat-card" key={stat.label}>
                    <span>{stat.label}</span>
                    <strong>{stat.value}</strong>
                    <small>{stat.detail}</small>
                  </div>
                ))}
              </div>

              <div className="panel logs-panel">
                <div className="panel-header">
                  <div>
                    <h2>System Logs</h2>
                    <p>Live stream from bot and dashboard actions.</p>
                  </div>
                  <button className="secondary-button" type="button" onClick={clearLogs}>
                    Clear
                  </button>
                </div>
                <div className="log-list">
                  {logs.length === 0 && <div className="empty-state">No logs yet.</div>}
                  {logs.slice(0, 80).map((log) => (
                    <div className="log-row" key={log.id}>
                      <span className="log-time">[{formatTime(log.timestamp)}]</span>
                      <span className={`log-level ${log.level}`}>{log.level.toUpperCase()}</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'accounts' && (
            <section className="view-stack">
              <form className="panel account-form" onSubmit={addAccount}>
                <div className="panel-header">
                  <div>
                    <h2>Add Account</h2>
                    <p>Tokens stay in the database. The UI only shows masked previews.</p>
                  </div>
                  <button className="primary-button" type="submit">
                    <Plus size={17} />
                    Add
                  </button>
                </div>
                <div className="form-grid two">
                  <Field label="Discord Token">
                    <input value={newAccountToken} onChange={(event) => setNewAccountToken(event.target.value)} placeholder="Paste token" type="password" />
                  </Field>
                  <Field label="Label">
                    <input value={newAccountUsername} onChange={(event) => setNewAccountUsername(event.target.value)} placeholder="Alt-1" />
                  </Field>
                </div>
              </form>

              <div className="accounts-grid">
                {accounts.length === 0 && <div className="panel empty-state">No accounts configured.</div>}
                {accounts.map((account) => (
                  <div className="account-card" key={account.id}>
                    <div className="avatar">{(account.username || 'A').charAt(0).toUpperCase()}</div>
                    <div className="account-body">
                      <strong>{account.username || 'Unnamed account'}</strong>
                      <span>{account.tokenPreview || 'token hidden'}</span>
                      <label className="inline-toggle">
                        <input
                          type="checkbox"
                          checked={account.blocksAutomessagesOnInbound !== false}
                          onChange={(event) => updateAccountInboundBlock(account.id, event.target.checked)}
                        />
                        <span>Blocks automessages after inbound DM</span>
                      </label>
                    </div>
                    <span className={`status-pill ${account.status}`}>{statusLabel(account.status)}</span>
                    <button className="danger-button" onClick={() => deleteAccount(account.id)} title="Remove account">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'messages' && (
            <section className="messages-grid">
              <div className="panel members-panel">
                <div className="panel-header compact">
                  <h2>Members</h2>
                </div>
                <div className="member-list">
                  {members.length === 0 && <div className="empty-state">No members yet.</div>}
                  {members.map((member) => (
                    <button
                      className={`member-row ${selectedMember?.userId === member.userId ? 'active' : ''}`}
                      key={member.userId}
                      onClick={() => setSelectedUserId(member.userId)}
                    >
                      <div>
                        <strong>{member.username}</strong>
                        <span>{formatTime(member.joinTime)}</span>
                      </div>
                      <small className={`member-status ${member.status}`}>{statusLabel(member.status)}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel chat-panel">
                {selectedMember ? (
                  <>
                    <div className="chat-header">
                      <div>
                        <h2>{selectedMember.username}</h2>
                        <p>
                          Sentiment: <strong>{selectedMember.sentiment || 'N/A'}</strong>
                          <span> Confidence: </span>
                          <strong>{selectedMember.interestScore ?? 'N/A'}</strong>
                        </p>
                      </div>
                      <div className="chat-actions">
                        <button onClick={() => postMemberAction('trigger_initial', { userId: selectedMember.userId })}>Initial DM</button>
                        <button onClick={() => postMemberAction('trigger_followup', { userId: selectedMember.userId })}>Follow-up</button>
                      </div>
                    </div>

                    <div className="chat-scroll">
                      {conversations.length === 0 && <div className="empty-state">No conversation saved for this member.</div>}
                      {conversations.map((message) => (
                        <div className={`bubble ${message.direction}`} key={message.id}>
                          <p>{message.message}</p>
                          <span>{formatTime(message.timestamp)}</span>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>

                  </>
                ) : (
                  <div className="empty-state">Select a member.</div>
                )}
              </div>
            </section>
          )}

          {activeTab === 'blacklist' && (
            <section className="view-stack">
              <form className="panel account-form" onSubmit={addBlacklistEntry}>
                <div className="panel-header">
                  <div>
                    <h2>Access Lists</h2>
                    <p>Only allowed guilds are scanned. Blocked users and guilds are ignored.</p>
                  </div>
                  <button className="primary-button" type="submit">
                    <Plus size={17} />
                    Add
                  </button>
                </div>
                <div className="form-grid three">
                  <Field label="Type">
                    <select value={blacklistType} onChange={(event) => setBlacklistType(event.target.value as BlacklistType)}>
                      <option value="guild_whitelist">Allowed Guild ID</option>
                      <option value="user">Blocked User ID</option>
                      <option value="guild">Blocked Guild ID</option>
                    </select>
                  </Field>
                  <Field label="ID">
                    <input value={blacklistValue} onChange={(event) => setBlacklistValue(event.target.value)} placeholder="Discord ID" />
                  </Field>
                  <Field label="Label">
                    <input value={blacklistLabel} onChange={(event) => setBlacklistLabel(event.target.value)} placeholder="Optional note" />
                  </Field>
                </div>
              </form>

              <div className="accounts-grid">
                {blacklist.length === 0 && <div className="panel empty-state">No access list entries.</div>}
                {blacklist.map((entry) => (
                  <div className="account-card" key={entry.id}>
                    <div className="avatar">{entry.type === 'user' ? 'U' : 'G'}</div>
                    <div className="account-body">
                      <strong>{entry.label || blacklistTypeName(entry.type)}</strong>
                      <span>{entry.value}</span>
                    </div>
                    <span className={`status-pill ${entry.type === 'guild_whitelist' ? 'active' : 'invalid'}`}>{blacklistTypeBadge(entry.type)}</span>
                    <button className="danger-button" onClick={() => deleteBlacklistEntry(entry.id)} title="Remove access list entry">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'proxies' && (
            <section className="view-stack">
              <form className="panel account-form" onSubmit={addProxy}>
                <div className="panel-header">
                  <div>
                    <h2>Proxy Manager</h2>
                    <p>Add proxies and assign Discord accounts to them.</p>
                  </div>
                  <button className="primary-button" type="submit">
                    <Plus size={17} />
                    Add
                  </button>
                </div>
                <div className="form-grid three">
                  <Field label="Label">
                    <input value={newProxyLabel} onChange={(event) => setNewProxyLabel(event.target.value)} placeholder="Warsaw proxy" />
                  </Field>
                  <Field label="Proxy Type">
                    <select value={newProxyType} onChange={(event) => setNewProxyType(event.target.value as 'socks5' | 'http')}>
                      <option value="socks5">SOCKS5</option>
                      <option value="http">HTTP</option>
                    </select>
                  </Field>
                  <Field label="Proxy URL">
                    <input value={newProxyUrl} onChange={(event) => setNewProxyUrl(event.target.value)} placeholder={newProxyType === 'socks5' ? 'socks5://user:pass@host:port' : 'http://user:pass@host:port'} type="password" />
                  </Field>
                </div>
              </form>

              <div className="accounts-grid">
                {proxies.length === 0 && <div className="panel empty-state">No proxies configured.</div>}
                {proxies.map((proxy) => {
                  const assignedIds = accounts.filter((account) => account.proxyId === proxy.id).map((account) => account.id);
                  return (
                    <div className="account-card proxy-card" key={proxy.id}>
                      <div className="avatar">P</div>
                      <div className="account-body">
                        <strong>{proxy.label || 'Proxy'}</strong>
                        <span>{(proxy.type || 'http').toUpperCase()}</span>
                        <span>{proxy.urlPreview}</span>
                        <select
                          multiple
                          className="proxy-account-select"
                          value={assignedIds}
                          onChange={(event) => updateProxyAccounts(
                            proxy.id,
                            Array.from(event.currentTarget.selectedOptions).map((option) => option.value),
                          )}
                        >
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.username || account.id}
                            </option>
                          ))}
                        </select>
                      </div>
                      <span className="status-pill active">{assignedIds.length} accounts</span>
                      <button className="danger-button" onClick={() => deleteProxy(proxy.id)} title="Remove proxy">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === 'status' && (
            <section className="view-stack">
              <UptimeGroup title="CORE SYSTEMS" items={[
                { name: 'Dashboard', status: statusData?.services.dashboard.status || 'unknown', uptime: 100 },
                { name: 'Database', status: statusData?.services.database.status || 'unknown', uptime: 100 },
                { name: 'Bot', status: statusData?.services.bot.status || 'unknown', uptime: statusData?.services.bot.status === 'online' ? 100 : 0 },
              ]} />
              <UptimeGroup title="ACCOUNT SYSTEMS" items={(statusData?.accounts.rows || accounts).map((account) => ({
                name: account.username || 'Unknown account',
                status: account.status,
                uptime: account.status === 'active' ? 100 : 0,
              }))} />
            </section>
          )}

          {activeTab === 'settings' && (
            <section className="settings-scroll">
              {!config ? (
                <div className="panel empty-state">Loading config...</div>
              ) : (
                <form className="settings-form" onSubmit={saveConfig}>
                  <ConfigPanel title="Messages" icon={MessageSquare}>
                    <Field
                      label="Welcome Message"
                      info="Links are blocked here. Do not include URLs, invites, domains, or clickable addresses."
                    >
                      <textarea
                        value={config.welcomeMessage}
                        onChange={(event) => updateWelcomeMessage(event.target.value)}
                        onPaste={blockWelcomePaste}
                        rows={4}
                      />
                    </Field>
                    <div className="variant-list">
                      <div className="variant-list-header">
                        <span>Initial Message Variants</span>
                        <button className="icon-button" type="button" onClick={addInitialVariant} title="Add initial message variant">
                          <Plus size={16} />
                        </button>
                      </div>
                      {parseMessageVariants(config.initialMessageVariants).length === 0 && (
                        <div className="empty-state compact">No extra variants. The welcome message is used by default.</div>
                      )}
                      {parseMessageVariants(config.initialMessageVariants).map((variant, index) => (
                        <div className="variant-row" key={index}>
                          <textarea
                            value={variant}
                            onChange={(event) => updateInitialVariant(index, event.target.value)}
                            onPaste={blockWelcomePaste}
                            rows={3}
                            placeholder={`Variant ${index + 1}`}
                          />
                          <button className="danger-button" type="button" onClick={() => removeInitialVariant(index)} title="Remove initial message variant">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Field label="Follow-up Message">
                      <textarea value={config.followupMessage} onChange={(event) => updateConfig('followupMessage', event.target.value)} rows={4} />
                    </Field>
                    <div className="form-grid three">
                      <NumberField label="Initial Delay (min)" value={config.initialDelayMinutes} onChange={(value) => updateConfig('initialDelayMinutes', value)} />
                      <NumberField label="Follow-up Delay (h)" value={config.followupDelayHours} onChange={(value) => updateConfig('followupDelayHours', value)} />
                      <NumberField label="Friend Request Delay (min)" value={config.friendRequestDelayMinutes} onChange={(value) => updateConfig('friendRequestDelayMinutes', value)} />
                    </div>
                  </ConfigPanel>

                  <ConfigPanel title="Safety Limits" icon={Shield}>
                    <div className="warning-strip">
                      <AlertTriangle size={17} />
                      Conservative settings reduce account lockouts and spam flags.
                    </div>
                    <div className="form-grid three">
                      <NumberField label="Min Initial DM Delay (min)" value={config.safetyMinInitialDmDelayMinutes} onChange={(value) => updateConfig('safetyMinInitialDmDelayMinutes', value)} />
                      <NumberField label="Min Friend Request Delay (min)" value={config.safetyMinFriendRequestDelayMinutes} onChange={(value) => updateConfig('safetyMinFriendRequestDelayMinutes', value)} />
                      <NumberField label="Failure Cooldown (min)" value={config.safetyFailureCooldownMinutes} onChange={(value) => updateConfig('safetyFailureCooldownMinutes', value)} />
                      <NumberField label="DM Cooldown Min (ms)" value={config.safetyDmCooldownMinMs} onChange={(value) => updateConfig('safetyDmCooldownMinMs', value)} />
                      <NumberField label="DM Cooldown Max (ms)" value={config.safetyDmCooldownMaxMs} onChange={(value) => updateConfig('safetyDmCooldownMaxMs', value)} />
                      <NumberField label="Friend Cooldown Min (ms)" value={config.safetyFriendRequestCooldownMinMs} onChange={(value) => updateConfig('safetyFriendRequestCooldownMinMs', value)} />
                      <NumberField label="Friend Cooldown Max (ms)" value={config.safetyFriendRequestCooldownMaxMs} onChange={(value) => updateConfig('safetyFriendRequestCooldownMaxMs', value)} />
                      <NumberField label="Max DM / hour" value={config.safetyMaxDmPerHour} onChange={(value) => updateConfig('safetyMaxDmPerHour', value)} />
                      <NumberField label="Max Friend Requests / hour" value={config.safetyMaxFriendRequestsPerHour} onChange={(value) => updateConfig('safetyMaxFriendRequestsPerHour', value)} />
                      <NumberField label="Queue Scan (s)" value={config.queueScanIntervalSeconds} onChange={(value) => updateConfig('queueScanIntervalSeconds', value)} />
                      <NumberField label="Queue DM Gap (s)" value={config.queueDmSpreadSeconds} onChange={(value) => updateConfig('queueDmSpreadSeconds', value)} />
                      <NumberField label="Queue Friend Gap (s)" value={config.queueFriendRequestSpreadSeconds} onChange={(value) => updateConfig('queueFriendRequestSpreadSeconds', value)} />
                      <NumberField label="Typing Speed Multiplier" value={config.typingSpeedMultiplier} onChange={(value) => updateConfig('typingSpeedMultiplier', value)} step="0.1" />
                    </div>
                  </ConfigPanel>

                  <ConfigPanel title="Integrations" icon={Activity}>
                    <div className="form-grid two">
                      <Field label="Captcha Solver">
                        <select value={config.captchaSolver || ''} onChange={(event) => updateConfig('captchaSolver', event.target.value)}>
                          <option value="">Disabled</option>
                          <option value="anysolver">AnySolver</option>
                          <option value="capsolver">CapSolver</option>
                        </select>
                      </Field>
                      <Field label="AnySolver Key">
                        <input value={config.anysolverKey || ''} onChange={(event) => updateConfig('anysolverKey', event.target.value)} type="password" />
                      </Field>
                      <Field label="Captcha Proxy">
                        <input value={config.captchaProxy || ''} onChange={(event) => updateConfig('captchaProxy', event.target.value)} placeholder="http://user:pass@host:port" />
                      </Field>
                      <Field label="Gemini API Key">
                        <input value={config.geminiApiKey || ''} onChange={(event) => updateConfig('geminiApiKey', event.target.value)} type="password" />
                      </Field>
                      <Field label="Telegram Bot Token">
                        <input value={config.telegramBotToken || ''} onChange={(event) => updateConfig('telegramBotToken', event.target.value)} type="password" />
                      </Field>
                      <Field label="Telegram Chat ID">
                        <input value={config.telegramChatId || ''} onChange={(event) => updateConfig('telegramChatId', event.target.value)} />
                      </Field>
                    </div>
                  </ConfigPanel>

                  <ConfigPanel title="Automation" icon={Settings}>
                    <div className="toggles-grid">
                      <Toggle label="AI classification" checked={config.enableAi} onChange={(value) => updateConfig('enableAi', value)} />
                      <Toggle label="Typing simulation" checked={config.typingSimulation} onChange={(value) => updateConfig('typingSimulation', value)} />
                      <Toggle label="Friend requests" checked={config.enableFriendRequests} onChange={(value) => updateConfig('enableFriendRequests', value)} />
                      <Toggle label="Process rejoins" checked={config.processRejoins} onChange={(value) => updateConfig('processRejoins', value)} />
                      <Toggle label="Skip after user DM" checked={config.skipAutomessagesAfterInbound} onChange={(value) => updateConfig('skipAutomessagesAfterInbound', value)} />
                      <Toggle label="Rotate delivery accounts" checked={config.rotateDeliveryAccounts} onChange={(value) => updateConfig('rotateDeliveryAccounts', value)} />
                      <Toggle label="Staff pings" checked={config.enablePings} onChange={(value) => updateConfig('enablePings', value)} />
                    </div>
                    <div className="form-grid three">
                      <NumberField label="Confidence Threshold" value={config.confidenceThreshold} onChange={(value) => updateConfig('confidenceThreshold', value)} step="0.01" />
                      <NumberField label="Ping Delay (h)" value={config.pingDelayHours} onChange={(value) => updateConfig('pingDelayHours', value)} />
                      <Field label="Fixed delivery account">
                        <select
                          value={config.fixedDeliveryAccountId || ''}
                          onChange={(event) => updateConfig('fixedDeliveryAccountId', event.target.value)}
                          disabled={config.rotateDeliveryAccounts}
                        >
                          <option value="">Select account</option>
                          {accounts.map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.username || account.id}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Ping Channel ID">
                        <input value={config.pingChannelId || ''} onChange={(event) => updateConfig('pingChannelId', event.target.value)} />
                      </Field>
                    </div>
                    <Field label="Ping Message">
                      <textarea value={config.pingMessage || ''} onChange={(event) => updateConfig('pingMessage', event.target.value)} rows={3} />
                    </Field>
                  </ConfigPanel>

                  <div className="save-row">
                    <button className="primary-button large" type="submit">Save Configuration</button>
                  </div>
                </form>
              )}
            </section>
          )}
        </main>
      </div>

      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body, #__next { min-height: 100%; margin: 0; }
        body {
          background: #1a1a1c;
          color: #f5f5f5;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        button, input, textarea, select { font: inherit; }
        button { cursor: pointer; }
        .c404-shell {
          width: 100vw;
          height: 100vh;
          display: flex;
          overflow: hidden;
          background: #1a1a1c;
        }
        .c404-sidebar {
          width: 250px;
          padding: 18px 16px;
          border-right: 1px solid #26262b;
          display: flex;
          flex-direction: column;
          gap: 22px;
          flex-shrink: 0;
        }
        .brand-mark {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 10px 18px;
          border-bottom: 1px solid #26262b;
        }
        .brand-mark svg {
          width: 38px;
          height: 38px;
          padding: 9px;
          border-radius: 12px;
          color: #ff5a5a;
          background: #26262b;
        }
        .brand-mark strong, .brand-mark span { display: block; }
        .brand-mark strong { font-size: 15px; }
        .brand-mark span { margin-top: 2px; color: #a1a1aa; font-size: 12px; }
        .nav-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
          flex: 1;
        }
        .nav-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          border: 0;
          border-radius: 14px;
          padding: 13px 14px;
          color: #a1a1aa;
          background: transparent;
          text-align: left;
          font-weight: 700;
          transition: 150ms ease;
        }
        .nav-item:hover, .nav-item.active {
          color: #f5f5f5;
          background: #2b2b31;
        }
        .sidebar-card {
          display: flex;
          gap: 11px;
          align-items: center;
          padding: 14px;
          border: 1px solid #2b2b31;
          border-radius: 16px;
          background: #222227;
        }
        .sidebar-card svg { color: #ffaf33; }
        .sidebar-card strong, .sidebar-card span { display: block; }
        .sidebar-card strong { font-size: 13px; }
        .sidebar-card span { color: #a1a1aa; font-size: 12px; margin-top: 3px; }
        .uptime-group {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .uptime-heading {
          display: flex;
          align-items: center;
          gap: 14px;
          color: #71717a;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
        }
        .uptime-heading::after {
          content: "";
          height: 1px;
          flex: 1;
          background: #2b2b31;
        }
        .uptime-card {
          border: 1px solid #2b2b31;
          background: #202024;
          border-radius: 16px;
          padding: 18px;
        }
        .uptime-top {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 16px;
        }
        .uptime-name {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 900;
        }
        .uptime-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: #111113;
          color: #f5f5f5;
          font-size: 13px;
          font-weight: 900;
        }
        .uptime-pill {
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 900;
          border: 1px solid rgba(3, 200, 128, 0.35);
          color: #03c880;
          background: rgba(3, 200, 128, 0.12);
        }
        .uptime-pill.warn {
          color: #ffaf33;
          border-color: rgba(255, 175, 51, 0.35);
          background: rgba(255, 175, 51, 0.12);
        }
        .uptime-pill.down {
          color: #ff5a5a;
          border-color: rgba(255, 90, 90, 0.35);
          background: rgba(255, 90, 90, 0.12);
        }
        .uptime-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 9px;
          color: #a1a1aa;
          font-size: 13px;
          font-weight: 800;
        }
        .uptime-bars {
          display: grid;
          grid-template-columns: repeat(80, 1fr);
          gap: 2px;
        }
        .uptime-bar {
          height: 32px;
          border-radius: 2px;
          background: #2b2b31;
        }
        .uptime-bar.good { background: #18c76f; }
        .uptime-bar.warn { background: #f4c20d; }
        .uptime-bar.down { background: #323238; }
        .uptime-dates {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          color: #71717a;
          font-size: 12px;
          font-weight: 800;
        }
        .c404-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 28px;
          overflow: hidden;
        }
        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .topbar h1 {
          margin: 3px 0 0;
          font-size: 28px;
          line-height: 1.1;
        }
        .eyebrow {
          margin: 0;
          color: #a1a1aa;
          font-size: 13px;
          font-weight: 700;
        }
        .icon-button, .danger-button {
          width: 40px;
          height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #2b2b31;
          border-radius: 12px;
          color: #d4d4d8;
          background: #222227;
        }
        .danger-button {
          color: #ff5a5a;
          background: #312022;
        }
        .toast {
          padding: 12px 14px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 700;
          flex-shrink: 0;
        }
        .toast.success { color: #03c880; background: rgba(3, 200, 128, 0.12); }
        .toast.error { color: #ff5a5a; background: rgba(255, 90, 90, 0.12); }
        .view-stack, .settings-scroll {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
          overflow-y: auto;
          scrollbar-width: none;
        }
        .view-stack::-webkit-scrollbar, .settings-scroll::-webkit-scrollbar, .log-list::-webkit-scrollbar, .member-list::-webkit-scrollbar, .chat-scroll::-webkit-scrollbar { display: none; }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 16px;
          flex-shrink: 0;
        }
        .stat-card, .panel, .account-card {
          border: 1px solid #2b2b31;
          background: #222227;
          border-radius: 20px;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.16);
        }
        .stat-card {
          padding: 20px;
          min-height: 130px;
        }
        .stat-card span, .stat-card small {
          display: block;
          color: #a1a1aa;
          font-size: 12px;
          font-weight: 700;
        }
        .stat-card strong {
          display: block;
          margin: 16px 0 10px;
          font-size: 32px;
          line-height: 1;
        }
        .panel {
          padding: 22px;
          min-width: 0;
        }
        .logs-panel {
          flex: 1;
          min-height: 360px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .panel-header, .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }
        .panel-header.compact { margin-bottom: 12px; }
        .panel-header h2, .chat-header h2 {
          margin: 0;
          font-size: 18px;
        }
        .panel-header p, .chat-header p {
          margin: 5px 0 0;
          color: #a1a1aa;
          font-size: 13px;
        }
        .log-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          font-family: "JetBrains Mono", Consolas, monospace;
          color: #d4d4d8;
          font-size: 13px;
          line-height: 1.8;
        }
        .log-row {
          display: grid;
          grid-template-columns: 82px 76px 1fr;
          gap: 8px;
          align-items: start;
        }
        .log-time { color: #71717a; }
        .log-level { font-weight: 800; }
        .log-level.info { color: #60a5fa; }
        .log-level.warn { color: #ffaf33; }
        .log-level.error { color: #ff5a5a; }
        .log-level.success { color: #03c880; }
        .primary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 42px;
          border: 0;
          border-radius: 12px;
          padding: 0 17px;
          color: #fff;
          background: #ff5a5a;
          font-size: 13px;
          font-weight: 800;
        }
        .primary-button.large { min-width: 210px; }
        .secondary-button {
          border: 1px solid #2b2b31;
          border-radius: 12px;
          padding: 10px 14px;
          color: #d4d4d8;
          background: #1a1a1c;
          font-size: 13px;
          font-weight: 800;
        }
        .secondary-button:hover {
          color: #fff;
          border-color: #3a3a40;
        }
        .form-grid {
          display: grid;
          gap: 16px;
        }
        .form-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .form-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .field label {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 8px;
          color: #a1a1aa;
          font-size: 12px;
          font-weight: 800;
        }
        .field-info {
          width: 17px;
          height: 17px;
          color: #d6d6df;
          flex-shrink: 0;
        }
        .field input, .field textarea, .field select {
          width: 100%;
          border: 1px solid #2b2b31;
          border-radius: 13px;
          outline: none;
          color: #f5f5f5;
          background: #1a1a1c;
          padding: 13px 14px;
          resize: vertical;
        }
        .field input:focus, .field textarea:focus, .field select:focus {
          border-color: #4a4a52;
        }
        .accounts-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 14px;
        }
        .account-card {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 16px;
          border-radius: 18px;
        }
        .avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #3a3a40;
          font-weight: 900;
          flex-shrink: 0;
        }
        .account-body {
          min-width: 0;
          flex: 1;
        }
        .account-body strong, .account-body span {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .account-body span {
          margin-top: 3px;
          color: #a1a1aa;
          font-size: 12px;
          font-family: Consolas, monospace;
        }
        .inline-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
          color: #d4d4d8;
          font-size: 12px;
          font-weight: 700;
        }
        .inline-toggle input {
          width: 15px;
          height: 15px;
          accent-color: #ff5a5a;
        }
        .inline-toggle span {
          margin-top: 0;
          font-family: inherit;
          white-space: normal;
        }
        .proxy-card {
          align-items: flex-start;
        }
        .proxy-account-select {
          margin-top: 10px;
          min-height: 98px;
          width: 100%;
          border: 1px solid #2b2b31;
          border-radius: 8px;
          outline: none;
          color: #f5f5f5;
          background: #1a1a1c;
          padding: 9px;
        }
        .variant-list {
          display: grid;
          gap: 10px;
        }
        .variant-list-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #a1a1aa;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .variant-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: start;
        }
        .variant-row textarea {
          width: 100%;
          border: 1px solid #2b2b31;
          border-radius: 8px;
          outline: none;
          color: #f5f5f5;
          background: #1a1a1c;
          padding: 12px 13px;
          resize: vertical;
        }
        .empty-state.compact {
          padding: 12px;
        }
        .status-pill, .member-status {
          padding: 5px 9px;
          border-radius: 999px;
          color: #03c880;
          background: rgba(3, 200, 128, 0.14);
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .status-pill.invalid, .status-pill.unavailable, .member-status.failed_dm, .member-status.failed_followup {
          color: #ff5a5a !important;
          background: rgba(255, 90, 90, 0.14) !important;
        }
        .status-pill.rate_limited, .member-status.first_dm_sent, .member-status.pinged {
          color: #ffaf33 !important;
          background: rgba(255, 175, 51, 0.14) !important;
        }
        .status-table {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .status-row {
          display: grid;
          grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr) auto;
          gap: 14px;
          align-items: center;
          padding: 13px;
          border: 1px solid #2b2b31;
          border-radius: 13px;
          background: #1a1a1c;
        }
        .status-row span {
          color: #a1a1aa;
          font-family: Consolas, monospace;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .status-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
          gap: 12px;
        }
        .mini-status {
          padding: 15px;
          border: 1px solid #2b2b31;
          border-radius: 14px;
          background: #1a1a1c;
        }
        .mini-status span {
          display: block;
          color: #a1a1aa;
          font-size: 12px;
          font-weight: 800;
        }
        .mini-status strong {
          display: block;
          margin-top: 8px;
          font-size: 26px;
        }
        .messages-grid {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: 380px minmax(0, 1fr);
          gap: 20px;
        }
        .members-panel, .chat-panel {
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .member-list, .chat-scroll {
          min-height: 0;
          overflow-y: auto;
          scrollbar-width: none;
        }
        .member-row {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 0;
          border-radius: 14px;
          padding: 13px;
          color: #f5f5f5;
          background: transparent;
          text-align: left;
        }
        .member-row:hover, .member-row.active { background: #2b2b31; }
        .member-row strong, .member-row span { display: block; }
        .member-row strong {
          max-width: 190px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 14px;
        }
        .member-row span {
          margin-top: 4px;
          color: #a1a1aa;
          font-size: 12px;
        }
        .member-status.stopped { color: #ff5a5a; background: rgba(255, 90, 90, 0.14); }
        .chat-header {
          padding-bottom: 18px;
          border-bottom: 1px solid #2b2b31;
          margin-bottom: 0;
        }
        .chat-actions {
          display: flex;
          gap: 10px;
        }
        .chat-actions button {
          border: 1px solid #2b2b31;
          border-radius: 12px;
          padding: 10px 14px;
          color: #d4d4d8;
          background: #1a1a1c;
          font-size: 13px;
          font-weight: 800;
        }
        .chat-scroll {
          flex: 1;
          padding: 20px 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .bubble {
          width: fit-content;
          max-width: min(75%, 720px);
          padding: 14px 16px;
          border-radius: 18px;
        }
        .bubble.inbound {
          align-self: flex-start;
          color: #d4d4d8;
          background: #1a1a1c;
          border: 1px solid #2b2b31;
          border-top-left-radius: 5px;
        }
        .bubble.outbound {
          align-self: flex-end;
          color: #fff;
          background: #ff5a5a;
          border-top-right-radius: 5px;
        }
        .bubble p { margin: 0; line-height: 1.55; }
        .bubble span {
          display: block;
          margin-top: 8px;
          color: inherit;
          opacity: 0.72;
          text-align: right;
          font-size: 11px;
          font-weight: 800;
        }
        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .config-title {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 0 18px;
          font-size: 18px;
        }
        .config-title svg { color: #ff5a5a; }
        .warning-strip {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-bottom: 16px;
          padding: 12px 13px;
          border-radius: 13px;
          color: #ffaf33;
          background: rgba(255, 175, 51, 0.12);
          font-size: 13px;
          font-weight: 800;
        }
        .toggles-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }
        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 13px;
          border: 1px solid #2b2b31;
          border-radius: 13px;
          background: #1a1a1c;
          color: #d4d4d8;
          font-size: 13px;
          font-weight: 800;
        }
        .toggle-row input {
          width: 18px;
          height: 18px;
          accent-color: #ff5a5a;
        }
        .save-row {
          display: flex;
          justify-content: flex-end;
          padding-bottom: 6px;
        }
        .empty-state {
          color: #a1a1aa;
          font-size: 14px;
          font-weight: 700;
        }
        @media (max-width: 1100px) {
          .stats-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .messages-grid { grid-template-columns: 320px minmax(0, 1fr); }
          .form-grid.three, .toggles-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 760px) {
          .c404-shell { flex-direction: column; }
          .c404-sidebar {
            width: 100%;
            height: auto;
            border-right: 0;
            border-bottom: 1px solid #26262b;
          }
          .nav-list { flex-direction: row; overflow-x: auto; }
          .sidebar-card { display: none; }
          .c404-main { padding: 18px; }
          .stats-grid, .messages-grid, .form-grid.two, .form-grid.three, .toggles-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  if (isAuthConfigured() && !isAuthenticated(req)) {
    return {
      redirect: {
        destination: '/login',
        permanent: false,
      },
    };
  }
  return { props: {} };
};

function Field({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>
        {label}
        {info && (
          <span className="field-info" aria-label={info} title={info}>
            <Info size={16} />
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function UptimeGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ name: string; status: string; uptime: number }>;
}) {
  if (items.length === 0) return null;

  return (
    <div className="uptime-group">
      <div className="uptime-heading">{title}</div>
      {items.map((item) => {
        const normalized = item.status.toLowerCase();
        const isGood = ['online', 'active', 'ok'].includes(normalized);
        const isWarn = ['unknown', 'idle', 'rate_limited'].includes(normalized);
        const pillClass = isGood ? '' : isWarn ? 'warn' : 'down';

        return (
          <div className="uptime-card" key={`${title}-${item.name}`}>
            <div className="uptime-top">
              <div className="uptime-name">
                <div className="uptime-icon">{item.name.slice(0, 2).toUpperCase()}</div>
                <span>{item.name}</span>
              </div>
              <div className={`uptime-pill ${pillClass}`}>{statusLabel(item.status)}</div>
            </div>
            <div className="uptime-line">
              <span>{item.name}</span>
              <span>{item.uptime.toFixed(2)}% uptime</span>
            </div>
            <div className="uptime-bars">
              {Array.from({ length: 80 }).map((_, index) => {
                const threshold = (index / 80) * 100;
                const barClass = threshold < item.uptime ? (isGood ? 'good' : 'warn') : 'down';
                return <span className={`uptime-bar ${barClass}`} key={index} />;
              })}
            </div>
            <div className="uptime-dates">
              <span>Last checks</span>
              <span>Now</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = '1',
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <Field label={label}>
      <input type="number" step={step} value={value ?? 0} onChange={(event) => onChange(toNumber(event.target.value))} />
    </Field>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ConfigPanel({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2 className="config-title">
        <Icon size={19} />
        {title}
      </h2>
      {children}
    </section>
  );
}
