import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import { useAuth } from '../../contexts/AuthContext';

interface Section {
  id: string; name: string; depth: number; order: number;
  _count: { testCases: number };
  children: Section[];
}

interface Suite {
  id: string; name: string; description: string | null; isDefault: boolean;
  sections: Section[];
  _count: { items: number; sections: number };
}

interface Plan {
  id: string; name: string; status: string; environment: string;
}

interface Project {
  id: string; name: string; description: string | null; type: string;
  _count: { suites: number; plans: number; testCases: number };
  suites: Suite[];
  plans: Plan[];
}

interface TestCase {
  id: string; title: string; status: string; priority: string;
  section: { id: string; name: string } | null;
  createdBy: { name: string };
  updatedAt: string;
}

function SectionTree({ sections, selectedId, onSelect, depth = 0 }: {
  sections: Section[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  depth?: number;
}) {
  return (
    <>
      {sections.map((s) => (
        <div key={s.id}>
          <button
            onClick={() => onSelect(selectedId === s.id ? null : s.id)}
            className={`w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
              selectedId === s.id
                ? 'bg-blue-100 text-blue-800 font-medium'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            style={{ paddingLeft: `${12 + depth * 16}px` }}
          >
            <span className="text-gray-400 text-xs">{s.children.length > 0 ? '▾' : '▸'}</span>
            <span className="truncate flex-1">{s.name}</span>
            {s._count.testCases > 0 && (
              <span className="text-xs text-gray-400 shrink-0">{s._count.testCases}</span>
            )}
          </button>
          {s.children.length > 0 && (
            <SectionTree
              sections={s.children}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [loadingCases, setLoadingCases] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'cases' | 'plans'>('overview');

  async function loadProject() {
    const { data } = await client.get(`/projects/${id}`);
    setProject(data);
    if (data.type === 'SINGLE_REPO' && data.suites.length > 0) {
      setSelectedSuiteId(data.suites[0].id);
    }
  }

  useEffect(() => { loadProject(); }, [id]);

  useEffect(() => {
    if (activeTab !== 'cases') return;
    setLoadingCases(true);
    const params = new URLSearchParams();
    if (selectedSectionId) params.set('sectionId', selectedSectionId);
    client.get(`/projects/${id}/cases?${params}`)
      .then((r) => setCases(r.data))
      .finally(() => setLoadingCases(false));
  }, [activeTab, id, selectedSectionId]);

  const canEdit = ['ADMIN', 'QA', 'PO'].includes(user?.role ?? '');

  if (!project) return <div className="p-8 text-gray-400">Loading…</div>;

  const isSingleRepo = project.type === 'SINGLE_REPO';
  const defaultSuite = project.suites.find((s) => s.isDefault) ?? project.suites[0];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link to="/projects" className="text-sm text-gray-400 hover:text-blue-600 mb-1 inline-block">← Projects</Link>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-3xl">{isSingleRepo ? '📁' : '📂'}</span>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{project.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`badge ${isSingleRepo ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {isSingleRepo ? 'Single Repository' : 'Multiple Test Suites'}
                </span>
                <span className="text-sm text-gray-400">
                  {project._count.testCases} cases · {project._count.suites} suites · {project._count.plans} plans
                </span>
              </div>
            </div>
          </div>
          {project.description && <p className="text-sm text-gray-500 mt-2 ml-12">{project.description}</p>}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link to={`/test-cases/new?projectId=${id}`} className="btn-primary text-sm">+ Test Case</Link>
            <Link to={`/projects/${id}/edit`} className="btn-secondary text-sm">Edit</Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {(['overview', 'cases', 'plans'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {tab === 'cases' ? 'Test Cases' : tab === 'plans' ? 'Test Plans' : 'Overview'}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {isSingleRepo && defaultSuite && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">Test Repository — {defaultSuite.name}</h3>
                <Link to={`/test-suites/${defaultSuite.id}`} className="text-xs text-blue-600 hover:underline">
                  Open Suite →
                </Link>
              </div>
              {defaultSuite.sections.length === 0 ? (
                <p className="p-6 text-sm text-gray-400 text-center">
                  No sections yet.{' '}
                  <Link to={`/test-suites/${defaultSuite.id}`} className="text-blue-600 hover:underline">
                    Add sections
                  </Link>{' '}
                  to organise your test cases.
                </p>
              ) : (
                <div className="p-3">
                  <SectionTree
                    sections={defaultSuite.sections}
                    selectedId={null}
                    onSelect={() => {}}
                  />
                </div>
              )}
            </div>
          )}

          {!isSingleRepo && (
            <div className="grid gap-3">
              {project.suites.length === 0 ? (
                <div className="card p-8 text-center text-gray-400">
                  <p className="mb-2">No test suites yet.</p>
                  {canEdit && (
                    <Link to="/test-suites" className="text-blue-600 hover:underline text-sm">
                      Create your first suite →
                    </Link>
                  )}
                </div>
              ) : project.suites.map((s) => (
                <Link key={s.id} to={`/test-suites/${s.id}`}
                  className="card p-4 flex items-center justify-between hover:bg-blue-50 transition-colors">
                  <div>
                    <p className="font-medium text-gray-900">{s.name}</p>
                    {s.description && <p className="text-sm text-gray-500 mt-0.5">{s.description}</p>}
                    <p className="text-xs text-gray-400 mt-1">{s._count.sections} sections</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400">
                    <span>{s._count.items} cases</span>
                    <span className="text-blue-500">→</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Recent plans */}
          {project.plans.length > 0 && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">Recent Plans</h3>
                <Link to="/test-plans" className="text-xs text-blue-600 hover:underline">View all →</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {project.plans.map((p) => (
                  <Link key={p.id} to={`/test-plans/${p.id}`}
                    className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50 transition-colors">
                    <span className="text-sm font-medium text-gray-800">{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="badge bg-gray-100 text-gray-500 text-xs">{p.environment}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cases tab */}
      {activeTab === 'cases' && (
        <div className="flex gap-4">
          {/* Section tree sidebar (SINGLE_REPO) */}
          {isSingleRepo && defaultSuite && defaultSuite.sections.length > 0 && (
            <div className="w-56 shrink-0 card p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">Sections</p>
              <button
                onClick={() => setSelectedSectionId(null)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm mb-1 transition-colors ${
                  !selectedSectionId ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                All Cases
              </button>
              <SectionTree
                sections={defaultSuite.sections}
                selectedId={selectedSectionId}
                onSelect={setSelectedSectionId}
              />
            </div>
          )}

          {/* Case list */}
          <div className="flex-1 card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700">
                {loadingCases ? 'Loading…' : `${cases.length} test cases`}
              </p>
              {canEdit && (
                <Link to={`/test-cases/new?projectId=${id}`} className="btn-secondary text-xs py-1">+ New</Link>
              )}
            </div>
            {cases.length === 0 && !loadingCases ? (
              <p className="p-8 text-center text-gray-400 text-sm">No test cases found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Title</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Section</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Priority</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cases.map((tc) => (
                    <tr key={tc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link to={`/test-cases/${tc.id}`} className="text-blue-600 hover:underline font-medium">
                          {tc.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-gray-400">{tc.section?.name ?? '—'}</td>
                      <td className="px-4 py-2"><PriorityBadge priority={tc.priority} /></td>
                      <td className="px-4 py-2"><StatusBadge status={tc.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Plans tab */}
      {activeTab === 'plans' && (
        <div className="space-y-3">
          {project.plans.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">No plans yet.</div>
          ) : project.plans.map((p) => (
            <Link key={p.id} to={`/test-plans/${p.id}`}
              className="card p-4 flex items-center justify-between hover:bg-blue-50 transition-colors">
              <span className="font-medium text-gray-900">{p.name}</span>
              <div className="flex items-center gap-2">
                <span className="badge bg-gray-100 text-gray-500">{p.environment}</span>
                <StatusBadge status={p.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
