import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useTitle } from '../hooks/useTitle';

interface ProjectCard {
  id: string; name: string; description: string | null; type: string;
  _count: { testCases: number; plans: number; suites: number };
  pendingReview: number;
  activeRuns: number;
}

interface Totals {
  projects: number; testCases: number; plans: number;
  activeRuns: number; pendingReview: number;
}

interface TodoItem {
  type: 'test_case' | 'test_run';
  id: string;
  title: string;
  status: string;
  priority: string | null;
  projectId: string | null;
  projectName: string | null;
  updatedAt: string;
}

interface ActivityItem {
  type: 'test_case' | 'test_run';
  id: string;
  title: string;
  status: string;
  projectId: string | null;
  projectName: string | null;
  timestamp: string;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  DRAFT:        { label: 'Draft',          cls: 'bg-gray-100 text-gray-600' },
  QA_REVIEW:    { label: 'Needs QA',       cls: 'bg-orange-100 text-orange-700' },
  QA_APPROVED:  { label: 'Needs PO',       cls: 'bg-purple-100 text-purple-700' },
  QA_REJECTED:  { label: 'QA Rejected',    cls: 'bg-red-100 text-red-600' },
  PO_REJECTED:  { label: 'PO Rejected',    cls: 'bg-red-100 text-red-600' },
  APPROVED:     { label: 'Approved',       cls: 'bg-green-100 text-green-700' },
  IN_PROGRESS:  { label: 'In Progress',    cls: 'bg-blue-100 text-blue-700' },
  COMPLETED:    { label: 'Completed',      cls: 'bg-green-100 text-green-700' },
  NOT_STARTED:  { label: 'Not Started',    cls: 'bg-gray-100 text-gray-500' },
};

function StatusChip({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, cls: 'bg-gray-100 text-gray-500' };
  return <span className={`badge text-xs ${s.cls}`}>{s.label}</span>;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Dashboard() {
  useTitle('Dashboard');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/projects/dashboard').then((r) => {
      setProjects(r.data.projects);
      setTotals(r.data.totals);
      setTodos(r.data.todos ?? []);
      setActivity(r.data.recentActivity ?? []);
      setLoading(false);
    });
  }, []);

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const canCreate = ['ADMIN', 'QA', 'PO'].includes(user?.role ?? '');

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            Welcome back, {user?.name} — here's your overview
          </p>
        </div>
        {canCreate && (
          <Link to="/projects/new" className="btn-primary">+ New Project</Link>
        )}
      </div>

      {/* Global stats strip */}
      {totals && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Projects',       value: totals.projects,      color: 'text-blue-600',   bg: 'bg-blue-50' },
            { label: 'Test Cases',     value: totals.testCases,     color: 'text-indigo-600', bg: 'bg-indigo-50' },
            { label: 'Test Plans',     value: totals.plans,         color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Active Runs',    value: totals.activeRuns,    color: 'text-green-600',  bg: 'bg-green-50' },
            { label: 'Pending Review', value: totals.pendingReview, color: 'text-orange-600', bg: 'bg-orange-50' },
          ].map((s) => (
            <div key={s.label} className={`card p-4 ${s.bg}`}>
              <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Main area: projects (left) + sidebar (right) */}
      <div className="flex gap-5 items-start">

        {/* Left: search + project cards */}
        <div className="flex-1 min-w-0">
          <div className="mb-5">
            <input
              className="input max-w-sm"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="card p-12 text-center">
              {search ? (
                <p className="text-gray-400">No projects match "{search}"</p>
              ) : (
                <div>
                  <p className="text-gray-400 mb-3">No projects yet.</p>
                  {canCreate && (
                    <Link to="/projects/new" className="btn-primary">Create your first project</Link>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="card p-5 cursor-pointer hover:shadow-md hover:border-blue-200 border border-transparent transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-lg">{p.type === 'MULTI_SUITE' ? '📂' : '📁'}</span>
                        <h3 className="font-semibold text-gray-900 truncate">{p.name}</h3>
                      </div>
                      {p.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5 pl-7">{p.description}</p>
                      )}
                    </div>
                    <span className={`badge text-xs shrink-0 ml-2 ${
                      p.type === 'MULTI_SUITE' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {p.type === 'MULTI_SUITE' ? 'Multi-Suite' : 'Single Repo'}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { label: 'Test Cases',  value: p._count.testCases, color: 'text-indigo-600' },
                      { label: 'Suites',      value: p._count.suites,    color: 'text-blue-600' },
                      { label: 'Plans',       value: p._count.plans,     color: 'text-purple-600' },
                      { label: 'Active Runs', value: p.activeRuns,       color: 'text-green-600' },
                    ].map((s) => (
                      <div key={s.label} className="text-center bg-gray-50 rounded-lg py-2">
                        <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-gray-400 leading-tight">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {p.pendingReview > 0 && (
                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 mb-3">
                      <span className="text-orange-500 text-sm">⚠</span>
                      <p className="text-xs text-orange-700 font-medium">
                        {p.pendingReview} test case{p.pendingReview !== 1 ? 's' : ''} pending review
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-gray-100">
                    {[
                      { label: 'Test Cases', path: 'test-cases' },
                      { label: 'Test Plans', path: 'test-plans' },
                      { label: 'Test Runs',  path: 'test-runs'  },
                    ].map((link) => (
                      <button
                        key={link.path}
                        onClick={(e) => { e.stopPropagation(); navigate(`/projects/${p.id}/${link.path}`); }}
                        className="flex-1 text-center text-xs text-blue-600 hover:bg-blue-50 py-1 rounded transition-colors"
                      >
                        {link.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-72 shrink-0 space-y-4">

          {/* My To-Dos */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">My To-Dos</h3>
              {todos.length > 0 && (
                <span className="badge bg-orange-100 text-orange-700 text-xs">{todos.length}</span>
              )}
            </div>
            {todos.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Nothing to action right now.</p>
            ) : (
              <ul className="space-y-2">
                {todos.map((item) => (
                  <li key={`${item.type}-${item.id}`}>
                    <button
                      onClick={() =>
                        item.projectId
                          ? navigate(
                              item.type === 'test_case'
                                ? `/projects/${item.projectId}/test-cases/${item.id}`
                                : `/projects/${item.projectId}/test-runs/${item.id}`
                            )
                          : undefined
                      }
                      className="w-full text-left group"
                    >
                      <div className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                        <span className="text-base shrink-0 mt-0.5">
                          {item.type === 'test_case' ? '✓' : '▶'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate group-hover:text-blue-600">
                            {item.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <StatusChip status={item.status} />
                            {item.projectName && (
                              <span className="text-xs text-gray-400 truncate">{item.projectName}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-300 shrink-0">{timeAgo(item.updatedAt)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Activity */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Recent Activity</h3>
            {activity.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No recent activity.</p>
            ) : (
              <ul className="space-y-1">
                {activity.map((item, i) => (
                  <li key={`${item.type}-${item.id}-${i}`}>
                    <button
                      onClick={() =>
                        item.projectId
                          ? navigate(
                              item.type === 'test_case'
                                ? `/projects/${item.projectId}/test-cases/${item.id}`
                                : `/projects/${item.projectId}/test-runs/${item.id}`
                            )
                          : undefined
                      }
                      className="w-full text-left group"
                    >
                      <div className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                        <span className="text-xs shrink-0 mt-0.5 text-gray-400">
                          {item.type === 'test_case' ? '✓' : '▶'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-700 truncate group-hover:text-blue-600">
                            {item.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <StatusChip status={item.status} />
                            {item.projectName && (
                              <span className="text-xs text-gray-400 truncate">{item.projectName}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-gray-300 shrink-0">{timeAgo(item.timestamp)}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
