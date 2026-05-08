import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import StatusBadge from '../../components/StatusBadge';

interface Run {
  id: string; name: string; status: string;
  plan: { id: string; name: string };
  assignedTo: { name: string } | null;
  _count: { results: number };
  createdAt: string;
}

export default function TestRunList() {
  const { projectId } = useParams<{ projectId: string }>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  const base = projectId ? `/projects/${projectId}` : '';

  useEffect(() => {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    client.get(`/test-runs?${params}`).then((r) => { setRuns(r.data); setLoading(false); });
  }, [projectId]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Test Runs</h2>
          <p className="text-gray-500 text-sm mt-0.5">Execution history — start a run from a Test Plan</p>
        </div>
        <Link to={`${base}/test-plans`} className="btn-secondary">Go to Plans →</Link>
      </div>

      {loading ? <p className="text-gray-400 p-4">Loading…</p> :
        runs.length === 0 ? <div className="card p-8 text-center text-gray-400">No runs yet. Start one from a test plan.</div> : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Run Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Assignee</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cases</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`${base}/test-runs/${r.id}`} className="font-medium text-blue-600 hover:underline">{r.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{r.plan.name}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-gray-500">{r.assignedTo?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{r._count.results}</td>
                    <td className="px-4 py-3 text-gray-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
