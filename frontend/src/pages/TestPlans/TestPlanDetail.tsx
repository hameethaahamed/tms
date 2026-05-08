import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import { useTitle } from '../../hooks/useTitle';
import { useAuth } from '../../contexts/AuthContext';

interface CaseItem {
  id: string;
  testCase: { id: string; title: string; priority: string; status: string };
}

interface PlanSuite {
  id: string;
  suite: { id: string; name: string; items: CaseItem[]; _count: { items: number } };
}

interface Plan {
  id: string; name: string; description: string | null; environment: string;
  status: string; startDate: string | null; endDate: string | null;
  suites: PlanSuite[];
  _count: { runs: number };
}

interface Suite { id: string; name: string; _count: { items: number } }

export default function TestPlanDetail() {
  useTitle('Test Plan');
  const { projectId, planId } = useParams<{ projectId: string; planId: string }>();
  const id = planId;
  const { user } = useAuth();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [allSuites, setAllSuites] = useState<Suite[]>([]);

  // Add Suite state
  const [addingSuite, setAddingSuite] = useState(false);
  const [selectedSuiteId, setSelectedSuiteId] = useState('');

  // Start Run state
  const [creatingRun, setCreatingRun] = useState(false);
  const [runName, setRunName] = useState('');
  const [runSuiteId, setRunSuiteId] = useState('');
  const [selectedCaseIds, setSelectedCaseIds] = useState<Set<string>>(new Set());

  const base = projectId ? `/projects/${projectId}` : '';

  async function load() {
    const { data } = await client.get(`/test-plans/${id}`);
    setPlan(data);
  }

  useEffect(() => {
    load();
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    client.get(`/test-suites?${params}`).then((r) => setAllSuites(r.data));
  }, [id]);

  // When the user picks a suite inside "Start Run", pre-select all its cases
  useEffect(() => {
    if (!runSuiteId || !plan) return;
    const ps = plan.suites.find((s) => s.suite.id === runSuiteId);
    if (ps) {
      setSelectedCaseIds(new Set(ps.suite.items.map((i) => i.testCase.id)));
    }
  }, [runSuiteId]);

  async function addSuite() {
    if (!selectedSuiteId) return;
    await client.post(`/test-plans/${id}/suites`, { suiteId: selectedSuiteId });
    setSelectedSuiteId(''); setAddingSuite(false);
    await load();
  }

  async function removeSuite(suiteId: string) {
    await client.delete(`/test-plans/${id}/suites/${suiteId}`);
    await load();
  }

  async function startRun() {
    if (!runName.trim() || !runSuiteId) return;
    const { data } = await client.post('/test-runs', {
      name: runName,
      planId: id,
      suiteId: runSuiteId,
      testCaseIds: Array.from(selectedCaseIds),
    });
    navigate(`${base}/test-runs/${data.id}`);
  }

  function toggleCase(caseId: string) {
    setSelectedCaseIds((prev) => {
      const next = new Set(prev);
      next.has(caseId) ? next.delete(caseId) : next.add(caseId);
      return next;
    });
  }

  function toggleAllCases(items: CaseItem[]) {
    const allSelected = items.every((i) => selectedCaseIds.has(i.testCase.id));
    setSelectedCaseIds(allSelected ? new Set() : new Set(items.map((i) => i.testCase.id)));
  }

  const canEdit = ['ADMIN', 'QA', 'PO'].includes(user?.role ?? '');
  const existingIds = new Set(plan?.suites.map((s) => s.suite.id) ?? []);
  const availableSuites = allSuites.filter((s) => !existingIds.has(s.id));

  const runSuite = plan?.suites.find((s) => s.suite.id === runSuiteId);
  const runItems = runSuite?.suite.items ?? [];
  const allRunCasesSelected = runItems.length > 0 && runItems.every((i) => selectedCaseIds.has(i.testCase.id));

  if (!plan) return <div className="p-8 text-gray-400">Loading…</div>;

  const totalCases = plan.suites.reduce((sum, s) => sum + s.suite._count.items, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to={`${base}/test-plans`} className="text-sm text-gray-400 hover:text-blue-600 mb-1 inline-block">← Test Plans</Link>

      <div className="flex items-start justify-between mb-6 mt-1">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{plan.name}</h2>
          <div className="flex items-center gap-2 mt-2">
            <StatusBadge status={plan.status} />
            <span className="badge bg-gray-100 text-gray-600">{plan.environment}</span>
          </div>
          {plan.description && <p className="text-sm text-gray-500 mt-2">{plan.description}</p>}
          <p className="text-sm text-gray-400 mt-1">
            {plan.suites.length} suites · {totalCases} total cases · {plan._count.runs} runs
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => { setAddingSuite(true); setCreatingRun(false); }}>
              + Add Suite
            </button>
            <button className="btn-primary" onClick={() => { setCreatingRun(true); setAddingSuite(false); setRunName(''); setRunSuiteId(''); setSelectedCaseIds(new Set()); }}>
              ▶ Start Run
            </button>
          </div>
        )}
      </div>

      {/* ── Add Suite panel ── */}
      {addingSuite && (
        <div className="card p-5 mb-5 border border-indigo-100 bg-indigo-50/40">
          <h3 className="font-semibold text-gray-800 mb-3">Add Suite to Plan</h3>
          {availableSuites.length === 0 ? (
            <p className="text-sm text-gray-400">All project suites are already in this plan.</p>
          ) : (
            <div className="grid gap-2 mb-3 max-h-52 overflow-y-auto">
              {availableSuites.map((s) => (
                <label key={s.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedSuiteId === s.id
                      ? 'border-indigo-400 bg-indigo-50'
                      : 'border-gray-200 bg-white hover:border-indigo-200'
                  }`}>
                  <input type="radio" name="suite" value={s.id} checked={selectedSuiteId === s.id}
                    onChange={() => setSelectedSuiteId(s.id)} className="accent-indigo-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{s.name}</p>
                    <p className="text-xs text-gray-400">{s._count.items} cases</p>
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn-primary" onClick={addSuite} disabled={!selectedSuiteId}>Add</button>
            <button className="btn-secondary" onClick={() => { setAddingSuite(false); setSelectedSuiteId(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Start Run panel ── */}
      {creatingRun && (
        <div className="card p-5 mb-5 border border-blue-100 bg-blue-50/30">
          <h3 className="font-semibold text-gray-800 mb-4">Start New Test Run</h3>

          {/* Run name */}
          <div className="mb-4">
            <label className="label">Run Name *</label>
            <input className="input" placeholder="e.g. Sprint 12 Smoke Test"
              value={runName} onChange={(e) => setRunName(e.target.value)} />
          </div>

          {/* Suite selector */}
          <div className="mb-4">
            <label className="label">Select Suite *</label>
            {plan.suites.length === 0 ? (
              <p className="text-sm text-gray-400">
                No suites in this plan yet.{' '}
                <button className="text-blue-600 hover:underline" onClick={() => { setCreatingRun(false); setAddingSuite(true); }}>
                  Add a suite first
                </button>.
              </p>
            ) : (
              <div className="grid gap-2">
                {plan.suites.map(({ suite }) => (
                  <label key={suite.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                      runSuiteId === suite.id
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-blue-200'
                    }`}>
                    <input type="radio" name="runSuite" value={suite.id} checked={runSuiteId === suite.id}
                      onChange={() => setRunSuiteId(suite.id)} className="accent-blue-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{suite.name}</p>
                      <p className="text-xs text-gray-400">{suite._count.items} cases</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Test case checklist */}
          {runSuiteId && runItems.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">
                  Test Cases{' '}
                  <span className="text-gray-400 font-normal">({selectedCaseIds.size} / {runItems.length} selected)</span>
                </label>
                <button onClick={() => toggleAllCases(runItems)}
                  className="text-xs text-blue-600 hover:underline">
                  {allRunCasesSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                {runItems.map(({ testCase }) => (
                  <label key={testCase.id}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors border-b border-gray-50 last:border-0 ${
                      selectedCaseIds.has(testCase.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}>
                    <input type="checkbox" checked={selectedCaseIds.has(testCase.id)}
                      onChange={() => toggleCase(testCase.id)} className="accent-blue-600 shrink-0" />
                    <span className="text-sm text-gray-800 flex-1">{testCase.title}</span>
                    <PriorityBadge priority={testCase.priority} />
                    <StatusBadge status={testCase.status} />
                  </label>
                ))}
              </div>
            </div>
          )}

          {runSuiteId && runItems.length === 0 && (
            <p className="text-sm text-gray-400 mb-4">This suite has no test cases yet.</p>
          )}

          <div className="flex gap-2">
            <button className="btn-primary"
              onClick={startRun}
              disabled={!runName.trim() || !runSuiteId || selectedCaseIds.size === 0}>
              ▶ Start Run ({selectedCaseIds.size} cases)
            </button>
            <button className="btn-secondary" onClick={() => setCreatingRun(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Suites in this Plan ── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
          <h3 className="font-medium text-gray-700 text-sm">Suites in this Plan</h3>
          {canEdit && !addingSuite && (
            <button onClick={() => { setAddingSuite(true); setCreatingRun(false); }}
              className="text-xs text-blue-600 hover:underline">+ Add Suite</button>
          )}
        </div>
        {plan.suites.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">
            No suites yet.{' '}
            {canEdit && (
              <button onClick={() => setAddingSuite(true)} className="text-blue-600 hover:underline">
                Add one to get started
              </button>
            )}.
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {plan.suites.map((ps) => (
              <div key={ps.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors group">
                <Link to={`${base}/test-suites/${ps.suite.id}`}
                  className="font-medium text-blue-600 hover:underline text-sm">
                  {ps.suite.name}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">{ps.suite._count.items} cases</span>
                  {canEdit && (
                    <button onClick={() => removeSuite(ps.suite.id)}
                      className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
