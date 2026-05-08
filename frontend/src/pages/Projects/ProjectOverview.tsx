import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useTitle } from '../../hooks/useTitle';
import StatusBadge from '../../components/StatusBadge';
import { useProject } from '../../contexts/ProjectContext';
import { useAuth } from '../../contexts/AuthContext';

interface Section {
  id: string; name: string; depth: number;
  _count: { testCases: number };
  children: Section[];
}

interface Suite {
  id: string; name: string; description: string | null; isDefault: boolean;
  sections: Section[];
  _count: { items: number; sections: number };
}

interface Plan { id: string; name: string; status: string; environment: string }

interface ProjectDetail {
  id: string; name: string; description: string | null; type: string;
  _count: { suites: number; plans: number; testCases: number };
  suites: Suite[];
  plans: Plan[];
}

interface Run {
  id: string; name: string; status: string;
  plan: { id: string; name: string };
  assignedTo: { name: string } | null;
  _count: { results: number };
  createdAt: string;
}

function SectionTree({ sections, selectedId, onSelect, depth = 0 }: {
  sections: Section[]; selectedId: string | null;
  onSelect: (id: string | null) => void; depth?: number;
}) {
  return (
    <>
      {sections.map((s) => (
        <div key={s.id}>
          <button
            onClick={() => onSelect(selectedId === s.id ? null : s.id)}
            className={`w-full text-left flex items-center gap-2 py-1.5 rounded-lg text-sm transition-colors ${
              selectedId === s.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'
            }`}
            style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: '12px' }}
          >
            <span className="text-gray-400 text-xs">{s.children.length > 0 ? '▾' : '▸'}</span>
            <span className="truncate flex-1">{s.name}</span>
            {s._count.testCases > 0 && <span className="text-xs text-gray-400 shrink-0">{s._count.testCases}</span>}
          </button>
          {s.children.length > 0 && (
            <SectionTree sections={s.children} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
          )}
        </div>
      ))}
    </>
  );
}

type Tab = 'suites' | 'runs' | 'plans';


export default function ProjectOverview() {
  useTitle('Project Overview');
  const { projectId } = useParams<{ projectId: string }>();
  useProject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('suites');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingSuite, setCreatingSuite] = useState(false);
  const [newSuiteName, setNewSuiteName] = useState('');
  const [newSuiteDesc, setNewSuiteDesc] = useState('');

  async function handleDelete() {
    setDeleting(true);
    await client.delete(`/projects/${projectId}`);
    navigate('/');
  }

  async function createSuite() {
    if (!newSuiteName.trim()) return;
    await client.post('/test-suites', { name: newSuiteName, description: newSuiteDesc, projectId });
    setNewSuiteName(''); setNewSuiteDesc(''); setCreatingSuite(false);
    client.get(`/projects/${projectId}`).then((r) => setDetail(r.data));
  }

  useEffect(() => {
    client.get(`/projects/${projectId}`).then((r) => setDetail(r.data));
  }, [projectId]);

  useEffect(() => {
    if (activeTab !== 'runs') return;
    setLoadingRuns(true);
    client.get(`/test-runs?projectId=${projectId}`)
      .then((r) => setRuns(r.data))
      .finally(() => setLoadingRuns(false));
  }, [activeTab, projectId]);

  const canEdit = ['ADMIN', 'QA', 'PO'].includes(user?.role ?? '');
  const isSingleRepo = detail?.type === 'SINGLE_REPO';
  const defaultSuite = detail?.suites.find((s) => s.isDefault) ?? detail?.suites[0];

  if (!detail) return <div className="p-8 text-gray-400">Loading…</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{detail.name}</h2>
          {detail.description && <p className="text-sm text-gray-500 mt-0.5">{detail.description}</p>}
          <p className="text-xs text-gray-400 mt-1">
            {detail._count.testCases} cases · {detail._count.suites} suite{detail._count.suites !== 1 ? 's' : ''} · {detail._count.plans} plans
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link to={`/projects/${projectId}/edit`} className="btn-secondary text-sm">Edit</Link>
            {user?.role === 'ADMIN' && (
              <button onClick={() => setShowDeleteConfirm(true)} className="btn-secondary text-sm text-red-600 hover:bg-red-50 border-red-200">
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats cards — always visible */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Test Suites', value: detail._count.suites,    color: 'text-indigo-600', bg: 'bg-indigo-50', tab: 'suites' as Tab },
          { label: 'Test Runs',   value: null,                    color: 'text-green-600',  bg: 'bg-green-50',  tab: 'runs'   as Tab },
          { label: 'Test Plans',  value: detail._count.plans,     color: 'text-purple-600', bg: 'bg-purple-50', tab: 'plans'  as Tab },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => setActiveTab(s.tab)}
            className={`card p-4 text-left transition-all hover:shadow-sm ${s.bg} ${
              activeTab === s.tab ? 'ring-2 ring-blue-400 ring-offset-1' : ''
            }`}
          >
            <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </button>
        ))}
      </div>

      {/* ── Test Suites tab ── */}
      {activeTab === 'suites' && (
        <div className="space-y-3">
          {!isSingleRepo && canEdit && (
            <div className="flex justify-end">
              <button className="btn-primary text-sm" onClick={() => setCreatingSuite(true)}>+ Add TestSuite</button>
            </div>
          )}
          {creatingSuite && (
            <div className="card p-4">
              <h3 className="font-medium text-gray-800 mb-3">New Test Suite</h3>
              <input className="input mb-2" placeholder="Suite name *" value={newSuiteName}
                onChange={(e) => setNewSuiteName(e.target.value)} />
              <textarea className="input resize-none mb-3" rows={2} placeholder="Description (optional)"
                value={newSuiteDesc} onChange={(e) => setNewSuiteDesc(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn-primary" onClick={createSuite} disabled={!newSuiteName.trim()}>Create</button>
                <button className="btn-secondary" onClick={() => setCreatingSuite(false)}>Cancel</button>
              </div>
            </div>
          )}
          {isSingleRepo && defaultSuite ? (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800 text-sm">Repository Structure</h3>
                <Link to={`/projects/${projectId}/test-suites/${defaultSuite.id}`}
                  className="text-xs text-blue-600 hover:underline">Manage sections →</Link>
              </div>
              {defaultSuite.sections.length === 0 ? (
                <p className="p-5 text-sm text-gray-400 text-center">
                  No sections yet.{' '}
                  <Link to={`/projects/${projectId}/test-suites/${defaultSuite.id}`}
                    className="text-blue-600 hover:underline">Add sections</Link>{' '}to organise test cases.
                </p>
              ) : (
                <div className="p-3 space-y-0.5">
                  <SectionTree sections={defaultSuite.sections} selectedId={null} onSelect={() => {}} />
                </div>
              )}
            </div>
          ) : detail.suites.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">No suites yet.</div>
          ) : (
            detail.suites.map((s) => (
              <Link key={s.id} to={`/projects/${projectId}/test-suites/${s.id}`}
                className="card p-4 flex items-center justify-between hover:bg-blue-50 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{s.name}</span>
                    {s.isDefault && <span className="badge bg-blue-100 text-blue-700 text-xs">Default</span>}
                  </div>
                  {s.description && <p className="text-sm text-gray-500 mt-0.5">{s.description}</p>}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <span>{s._count.items} cases</span>
                  <span>{s._count.sections} sections</span>
                  <span className="text-blue-500">→</span>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* ── Test Runs tab ── */}
      {activeTab === 'runs' && (
        <div>
          {loadingRuns ? (
            <p className="text-gray-400 p-4">Loading…</p>
          ) : runs.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">
              No runs yet.{' '}
              <Link to={`/projects/${projectId}/test-plans`} className="text-blue-600 hover:underline">
                Start one from a Test Plan
              </Link>.
            </div>
          ) : (
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
                        <Link to={`/projects/${projectId}/test-runs/${r.id}`}
                          className="font-medium text-blue-600 hover:underline">{r.name}</Link>
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
      )}

      {/* ── Test Plans tab ── */}
      {activeTab === 'plans' && (
        <div className="space-y-3">
          {detail.plans.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">No plans yet.</div>
          ) : (
            detail.plans.map((p) => (
              <Link key={p.id} to={`/projects/${projectId}/test-plans/${p.id}`}
                className="card p-4 flex items-center justify-between hover:bg-blue-50 transition-colors">
                <span className="font-medium text-gray-900">{p.name}</span>
                <div className="flex items-center gap-2">
                  <span className="badge bg-gray-100 text-gray-500">{p.environment}</span>
                  <StatusBadge status={p.status} />
                </div>
              </Link>
            ))
          )}
        </div>
      )}
      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete project?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">"{detail.name}"</span> and all its test cases, suites, and runs will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="btn-secondary text-sm bg-red-600 text-white border-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
