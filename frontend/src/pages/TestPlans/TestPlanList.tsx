import { useEffect, useState, FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';

interface Plan {
  id: string; name: string; environment: string; status: string;
  _count: { runs: number; suites: number }; startDate: string | null; updatedAt: string;
}

const ENVS = ['DEV', 'QA', 'STAGING', 'PROD'];

export default function TestPlanList() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', environment: 'QA', startDate: '', endDate: '' });

  const base = projectId ? `/projects/${projectId}` : '';

  useEffect(() => {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    client.get(`/test-plans?${params}`).then((r) => { setPlans(r.data); setLoading(false); });
  }, [projectId]);

  async function create(e: FormEvent) {
    e.preventDefault();
    const { data } = await client.post('/test-plans', { ...form, projectId: projectId ?? null });
    setPlans([data, ...plans]);
    setForm({ name: '', description: '', environment: 'QA', startDate: '', endDate: '' });
    setCreating(false);
  }

  const canCreate = ['ADMIN', 'QA', 'PO'].includes(user?.role ?? '');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Test Plans</h2>
          <p className="text-gray-500 text-sm mt-0.5">Organise suites into executable plans</p>
        </div>
        {canCreate && <button className="btn-primary" onClick={() => setCreating(true)}>+ New Plan</button>}
      </div>

      {creating && (
        <form onSubmit={create} className="card p-5 mb-4 space-y-3">
          <h3 className="font-medium text-gray-800">New Test Plan</h3>
          <input className="input" placeholder="Plan name *" required value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <textarea className="input resize-none" rows={2} placeholder="Description"
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-3 gap-3">
            <select className="input" value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })}>
              {ENVS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <input type="date" className="input" value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            <input type="date" className="input" value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">Create</button>
            <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? <p className="text-gray-400 p-4">Loading…</p> :
        plans.length === 0 ? <div className="card p-8 text-center text-gray-400">No plans yet.</div> : (
          <div className="grid gap-3">
            {plans.map((p) => (
              <Link key={p.id} to={`${base}/test-plans/${p.id}`}
                className="card p-4 flex items-center justify-between hover:bg-blue-50 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{p.name}</p>
                    <span className="badge bg-gray-100 text-gray-500">{p.environment}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  {p.startDate && <p className="text-xs text-gray-400 mt-1">Starts {new Date(p.startDate).toLocaleDateString()}</p>}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span>{p._count.suites} suites</span>
                  <span>{p._count.runs} runs</span>
                  <span className="text-blue-500">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
    </div>
  );
}
