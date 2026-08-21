import { useState } from 'react';
import { Activity, RefreshCw, Trash2 } from 'lucide-react';

interface Overview {
  health: { status: string; uptimeSec: number; timestamp: string };
  services: { geoclip: { available: boolean }; vision: { available: boolean }; checkedAt: string | null };
  lobbies: Array<{ id: string; state: string; gameType: string; players: number; photos: number; round: number }>;
  uploads: { totalFiles: number; totalSizeMB: number; orphanedFiles: number };
  statistics: { totalGamesPlayed: number; retainedGames: number; modeCounts: Record<string, number>; updatedAt: string };
}

export default function AdminPanel() {
  const [token, setToken] = useState(() => sessionStorage.getItem('spot-admin-token') || '');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const request = async (path: string, method = 'GET') => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
      sessionStorage.setItem('spot-admin-token', token);
      return body;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Request failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    const body = await request('overview');
    if (body) setOverview(body);
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl p-4 text-text">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Activity className="text-primary" />
        <h1 className="mr-auto text-2xl font-bold text-primary">SpotTheShot Admin</h1>
        <input aria-label="Admin token" type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="Admin token" className="rounded-lg border border-primary/20 bg-surface px-3 py-2" />
        <button disabled={busy || !token} onClick={refresh} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-bold text-black disabled:opacity-50"><RefreshCw size={16} /> Refresh</button>
      </div>
      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}
      {!overview ? <p className="text-text-darker">Enter the configured ADMIN_TOKEN to load operational data.</p> : <>
        <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Health" value={`${overview.health.status} · ${Math.floor(overview.health.uptimeSec / 60)} min`} />
          <Stat label="Active lobbies" value={String(overview.lobbies.length)} />
          <Stat label="Games played" value={String(overview.statistics.totalGamesPlayed)} />
          <Stat label="Uploads" value={`${overview.uploads.totalFiles} · ${overview.uploads.totalSizeMB} MB`} />
        </section>
        <section className="mb-4 rounded-xl border border-primary/20 bg-surface p-4">
          <h2 className="mb-3 font-bold text-primary">Model readiness</h2>
          <div className="flex gap-6"><Service name="GeoCLIP" ready={overview.services.geoclip.available} /><Service name="Vision" ready={overview.services.vision.available} /></div>
        </section>
        <section className="mb-4 rounded-xl border border-primary/20 bg-surface p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-primary">Active lobbies</h2><span className="text-xs text-text-darker">No player names or tokens shown</span></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-text-darker"><tr><th>ID</th><th>State</th><th>Mode</th><th>Players</th><th>Photos</th><th>Round</th></tr></thead><tbody>{overview.lobbies.map(lobby => <tr key={lobby.id} className="border-t border-primary/10"><td className="py-2 font-mono">{lobby.id}</td><td>{lobby.state}</td><td>{lobby.gameType}</td><td>{lobby.players}</td><td>{lobby.photos}</td><td>{lobby.round}</td></tr>)}</tbody></table></div>
          {!overview.lobbies.length && <p className="mt-3 text-text-darker">No active lobbies.</p>}
        </section>
        <section className="rounded-xl border border-primary/20 bg-surface p-4">
          <h2 className="mb-2 font-bold text-primary">Maintenance and statistics</h2>
          <p className="mb-3 text-sm text-text-darker">Orphan uploads: {overview.uploads.orphanedFiles} · Modes: {Object.entries(overview.statistics.modeCounts).map(([mode, count]) => `${mode} ${count}`).join(', ') || 'none'}</p>
          <button disabled={busy || overview.uploads.orphanedFiles === 0} onClick={async () => { if (confirm('Remove orphan files older than 10 minutes?')) { await request('cleanup-orphans', 'POST'); await refresh(); } }} className="flex items-center gap-2 rounded-lg bg-red-500/80 px-3 py-2 font-bold text-white disabled:opacity-40"><Trash2 size={16} /> Clean orphan uploads</button>
        </section>
      </>}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-primary/20 bg-surface p-4"><div className="text-xs text-text-darker">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>; }
function Service({ name, ready }: { name: string; ready: boolean }) { return <div><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${ready ? 'bg-green-400' : 'bg-amber-400'}`} />{name}: {ready ? 'ready' : 'degraded'}</div>; }
