import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

interface Suite {
  id: string; name: string; description: string | null; isDefault: boolean;
  _count: { items: number }; updatedAt: string;
  project?: { id: string; name: string; type: string } | null;
}

export default function TestSuiteList() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const [suites, setSuites] = useState<Suite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const base = projectId ? `/projects/${projectId}` : '';

  useEffect(() => {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    client.get(`/test-suites?${params}`).then((r) => {
      setSuites(r.data);
      setLoading(false);
    });
  }, [projectId]);

  async function create() {
    if (!name.trim()) return;
    const { data } = await client.post('/test-suites', {
      name, description: desc,
      projectId: projectId || undefined,
    });
    setSuites([data, ...suites]);
    setName(''); setDesc(''); setCreating(false);
  }

  const canCreate = ['ADMIN', 'QA'].includes(user?.role ?? '');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Test Suites</h2>
          <p className="text-gray-500 text-sm mt-0.5">Group related test cases into suites</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => setCreating(true)}>+ New Suite</button>
        )}
      </div>

      {creating && (
        <div className="card p-4 mb-4">
          <h3 className="font-medium text-gray-800 mb-3">New Test Suite</h3>
          <input className="input mb-2" placeholder="Suite name *" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className="input resize-none mb-3" rows={2} placeholder="Description (optional)"
            value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary" onClick={create}>Create</button>
            <button className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 p-4">Loading…</p>
      ) : suites.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">No suites yet.</div>
      ) : (
        <div className="grid gap-3">
          {suites.map((s) => (
            <Link key={s.id} to={`${base}/test-suites/${s.id}`}
              className="card p-4 flex items-center justify-between hover:bg-blue-50 transition-colors">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900">{s.name}</p>
                  {s.isDefault && <span className="badge bg-blue-100 text-blue-700 text-xs">Default</span>}
                </div>
                {s.description && <p className="text-sm text-gray-500 mt-0.5">{s.description}</p>}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <span>{s._count.items} cases</span>
                <span>{new Date(s.updatedAt).toLocaleDateString()}</span>
                <span className="text-blue-500">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
