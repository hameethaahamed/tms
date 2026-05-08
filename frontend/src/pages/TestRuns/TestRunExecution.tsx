import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import { useTitle } from '../../hooks/useTitle';
import { useAuth } from '../../contexts/AuthContext';

/* ── colour maps ─────────────────────────────────────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600 border-gray-200',
  PASS:    'bg-green-100 text-green-700 border-green-200',
  FAIL:    'bg-red-100 text-red-700 border-red-200',
  BLOCKED: 'bg-orange-100 text-orange-700 border-orange-200',
  SKIP:    'bg-gray-100 text-gray-500 border-gray-200',
};
const STATUS_DOT: Record<string, string> = {
  PENDING: 'bg-gray-400', PASS: 'bg-green-500',
  FAIL: 'bg-red-500', BLOCKED: 'bg-orange-400', SKIP: 'bg-gray-300',
};
const FILTER_TABS = ['ALL', 'PENDING', 'PASS', 'FAIL', 'BLOCKED', 'SKIP'] as const;
type FilterTab = typeof FILTER_TABS[number];

/* ── interfaces ──────────────────────────────────────────────────────────── */
interface Result {
  id: string; status: string; comment: string | null; executedAt: string | null;
  testCase: { id: string; title: string; priority: string; steps: string; expectedResult: string };
}

interface SuiteCase {
  id: string;
  testCase: { id: string; title: string; priority: string; status: string };
}

interface PlanSuite {
  id: string;
  suite: { id: string; name: string; items: SuiteCase[]; _count: { items: number } };
}

interface Run {
  id: string; name: string; status: string;
  plan: { id: string; name: string; suites: PlanSuite[] };
  assignedTo: { name: string } | null;
  results: Result[];
}

/* ── component ───────────────────────────────────────────────────────────── */
export default function TestRunExecution() {
  useTitle('Test Run');
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();
  const id = runId;
  const { user } = useAuth();

  const [run, setRun]             = useState<Run | null>(null);
  const [selected, setSelected]   = useState<Result | null>(null);
  const [comment, setComment]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [filter, setFilter]       = useState<FilterTab>('ALL');

  // "Add Cases" overlay state
  const [showAddCases, setShowAddCases] = useState(false);
  const [addSuiteId, setAddSuiteId]     = useState('');
  const [addCaseIds, setAddCaseIds]     = useState<Set<string>>(new Set());
  const [adding, setAdding]             = useState(false);

  const base = projectId ? `/projects/${projectId}` : '';

  async function load(keepSelected = false) {
    const { data } = await client.get(`/test-runs/${id}`);
    setRun(data);
    if (!keepSelected && data.results.length > 0) {
      setSelected(data.results[0]);
      setComment(data.results[0].comment ?? '');
    }
  }

  useEffect(() => { load(); }, [id]);

  // When suite changes in "Add Cases", pre-select all new cases
  useEffect(() => {
    if (!addSuiteId || !run) return;
    const ps = run.plan.suites.find((s) => s.suite.id === addSuiteId);
    if (!ps) return;
    const alreadyIn = new Set(run.results.map((r) => r.testCase.id));
    const fresh = ps.suite.items
      .map((i) => i.testCase.id)
      .filter((cid) => !alreadyIn.has(cid));
    setAddCaseIds(new Set(fresh));
  }, [addSuiteId]);

  /* ── actions ─────────────────────────────────────────────────────────── */
  async function recordResult(status: string) {
    if (!selected) return;
    setSaving(true);
    const { data: updated } = await client.put(`/test-runs/${id}/results/${selected.id}`, { status, comment });
    // Update local state without full reload for speed
    setRun((prev) => prev ? {
      ...prev,
      results: prev.results.map((r) => r.id === updated.id ? { ...r, status: updated.status, comment: updated.comment, executedAt: updated.executedAt } : r),
    } : prev);
    setSelected((prev) => prev ? { ...prev, status: updated.status, comment: updated.comment ?? '', executedAt: updated.executedAt } : prev);
    setSaving(false);
  }

  async function completeRun() {
    await client.post(`/test-runs/${id}/complete`);
    load(true);
  }

  async function submitAddCases() {
    if (!addSuiteId || addCaseIds.size === 0) return;
    setAdding(true);
    const { data } = await client.post(`/test-runs/${id}/cases`, {
      suiteId: addSuiteId,
      testCaseIds: Array.from(addCaseIds),
    });
    setRun(data);
    setShowAddCases(false);
    setAddSuiteId('');
    setAddCaseIds(new Set());
    setAdding(false);
  }

  function selectCase(r: Result) {
    setSelected(r);
    setComment(r.comment ?? '');
  }

  function navigate(dir: 1 | -1) {
    if (!run || !selected) return;
    const list = filteredResults;
    const idx  = list.findIndex((r) => r.id === selected.id);
    const next = list[idx + dir];
    if (next) selectCase(next);
  }

  /* ── derived ─────────────────────────────────────────────────────────── */
  if (!run) return <div className="p-8 text-gray-400">Loading…</div>;

  const counts: Record<string, number> = { ALL: run.results.length };
  for (const r of run.results) counts[r.status] = (counts[r.status] ?? 0) + 1;

  const filteredResults = filter === 'ALL'
    ? run.results
    : run.results.filter((r) => r.status === filter);

  const total   = run.results.length;
  const pending = counts.PENDING ?? 0;
  const passed  = counts.PASS    ?? 0;
  const failed  = counts.FAIL    ?? 0;
  const progress = total > 0 ? Math.round(((total - pending) / total) * 100) : 0;

  const canExecute  = ['ADMIN', 'QA'].includes(user?.role ?? '') && run.status !== 'COMPLETED';
  const selectedIdx = filteredResults.findIndex((r) => r.id === selected?.id);
  const steps: string[] = selected ? JSON.parse(selected.testCase.steps) : [];

  // Cases in "Add Cases" panel not already in the run
  const alreadyInRun  = new Set(run.results.map((r) => r.testCase.id));
  const addSuiteItems = addSuiteId
    ? (run.plan.suites.find((s) => s.suite.id === addSuiteId)?.suite.items ?? [])
        .filter((i) => !alreadyInRun.has(i.testCase.id))
    : [];
  const allAddSelected = addSuiteItems.length > 0 && addSuiteItems.every((i) => addCaseIds.has(i.testCase.id));

  function toggleAddCase(cid: string) {
    setAddCaseIds((prev) => { const n = new Set(prev); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });
  }

  /* ── render ──────────────────────────────────────────────────────────── */
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ════════════════════════════════ SIDEBAR ══════════════════════════ */}
      <aside className="w-80 shrink-0 bg-white border-r border-gray-200 flex flex-col">

        {/* Run header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <Link to={`${base}/test-runs`} className="text-xs text-gray-400 hover:text-blue-600 mb-1 inline-block">← Test Runs</Link>
          <p className="font-semibold text-gray-900 truncate">{run.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge status={run.status} />
            <span className="text-xs text-gray-400 truncate">Plan: {run.plan.name}</span>
          </div>

          {/* Progress */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500 font-medium">{progress}% complete</span>
              <span className="text-gray-400">{total - pending}/{total}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex gap-3 mt-2 text-xs">
              <span className="text-green-600 font-medium">{passed} Pass</span>
              <span className="text-red-500 font-medium">{failed} Fail</span>
              <span className="text-gray-400">{pending} Pending</span>
            </div>
          </div>
        </div>

        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-100">
          {FILTER_TABS.map((tab) => (
            <button key={tab} onClick={() => setFilter(tab)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                filter === tab
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              <span className="ml-1 opacity-70">({counts[tab] ?? 0})</span>
            </button>
          ))}
        </div>

        {/* Case list */}
        <div className="flex-1 overflow-y-auto">
          {filteredResults.length === 0 ? (
            <p className="p-4 text-xs text-gray-400 text-center">No cases match this filter.</p>
          ) : (
            filteredResults.map((r, i) => (
              <button key={r.id} onClick={() => selectCase(r)}
                className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                  selected?.id === r.id
                    ? 'bg-blue-50 border-l-[3px] border-l-blue-500'
                    : 'hover:bg-gray-50'
                }`}>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 mt-0.5 w-5 shrink-0 text-right">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate leading-snug">{r.testCase.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[r.status]}`} />
                      <span className="text-xs text-gray-500">{r.status}</span>
                      <PriorityBadge priority={r.testCase.priority} />
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Sidebar footer */}
        <div className="px-3 py-3 border-t border-gray-100 space-y-2">
          {canExecute && (
            <button onClick={() => { setShowAddCases(true); setAddSuiteId(''); setAddCaseIds(new Set()); }}
              className="w-full btn-secondary text-xs py-1.5">
              + Add Cases from Suite
            </button>
          )}
          {canExecute && pending === 0 && (
            <button onClick={completeRun} className="w-full btn-success text-xs py-1.5">
              ✓ Mark Run Complete
            </button>
          )}
        </div>
      </aside>

      {/* ════════════════════════════════ MAIN PANEL ═══════════════════════ */}
      <main className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a test case from the sidebar
          </div>
        ) : (
          <div className="p-6 max-w-3xl mx-auto">

            {/* Case header + prev/next nav */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-xs text-gray-400 mb-0.5">
                  {selectedIdx + 1} of {filteredResults.length}
                  {filter !== 'ALL' && <span className="ml-1 text-blue-500">({filter})</span>}
                </p>
                <h2 className="text-xl font-bold text-gray-900 leading-snug">{selected.testCase.title}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <PriorityBadge priority={selected.testCase.priority} />
                  <span className={`badge border text-xs ${STATUS_COLORS[selected.status]}`}>{selected.status}</span>
                  {selected.executedAt && (
                    <span className="text-xs text-gray-400">
                      Executed {new Date(selected.executedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Prev / Next */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => navigate(-1)} disabled={selectedIdx <= 0}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  ← Prev
                </button>
                <button onClick={() => navigate(1)} disabled={selectedIdx >= filteredResults.length - 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  Next →
                </button>
              </div>
            </div>

            {/* Steps */}
            <div className="card p-5 mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Test Steps</h4>
              {steps.length === 0 ? (
                <p className="text-sm text-gray-400">No steps defined.</p>
              ) : (
                <ol className="space-y-2">
                  {steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium shrink-0 mt-0.5">{i + 1}</span>
                      <span className="text-gray-700">{step}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Expected result */}
            <div className="p-4 bg-green-50 rounded-lg border border-green-100 mb-5">
              <h4 className="text-xs font-semibold text-green-700 mb-1">Expected Result</h4>
              <p className="text-sm text-green-800">{selected.testCase.expectedResult}</p>
            </div>

            {/* Execution controls */}
            {canExecute && (
              <div className="card p-5">
                <label className="label">Comment / Notes</label>
                <textarea className="input resize-none mb-4" rows={2}
                  placeholder="Optional notes for this result…"
                  value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="flex flex-wrap gap-2">
                  {(['PASS', 'FAIL', 'BLOCKED', 'SKIP'] as const).map((s) => (
                    <button key={s} disabled={saving}
                      onClick={() => recordResult(s)}
                      className={`px-5 py-2 rounded-lg font-medium text-sm border transition-colors disabled:opacity-50 ${
                        s === 'PASS'    ? 'bg-green-500 hover:bg-green-600 text-white border-green-500' :
                        s === 'FAIL'    ? 'bg-red-500 hover:bg-red-600 text-white border-red-500' :
                        s === 'BLOCKED' ? 'bg-orange-500 hover:bg-orange-600 text-white border-orange-500' :
                        'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                      } ${selected.status === s ? 'ring-2 ring-offset-1 ring-current' : ''}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Jump to next pending */}
            {canExecute && selected.status !== 'PENDING' && (counts.PENDING ?? 0) > 0 && (
              <button
                onClick={() => {
                  const nextPending = run.results.find((r) => r.status === 'PENDING');
                  if (nextPending) selectCase(nextPending);
                }}
                className="mt-3 text-sm text-blue-600 hover:underline">
                → Jump to next pending ({counts.PENDING} remaining)
              </button>
            )}
          </div>
        )}
      </main>

      {/* ════════════════════════════════ ADD CASES OVERLAY ════════════════ */}
      {showAddCases && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowAddCases(false)} />
          <div className="fixed inset-y-0 right-0 w-[480px] bg-white shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Add Cases from Suite</h3>
              <button onClick={() => setShowAddCases(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Suite picker */}
              <div>
                <label className="label">Select Suite</label>
                {run.plan.suites.length === 0 ? (
                  <p className="text-sm text-gray-400">No suites in this plan yet.</p>
                ) : (
                  <div className="space-y-2">
                    {run.plan.suites.map(({ suite }) => {
                      const newCount = suite.items.filter((i) => !alreadyInRun.has(i.testCase.id)).length;
                      return (
                        <label key={suite.id}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                            addSuiteId === suite.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-200'
                          }`}>
                          <input type="radio" name="addSuite" value={suite.id} checked={addSuiteId === suite.id}
                            onChange={() => setAddSuiteId(suite.id)} className="accent-blue-600" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-800">{suite.name}</p>
                            <p className="text-xs text-gray-400">{newCount} new cases available</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Case checklist */}
              {addSuiteId && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">
                      Cases to Add{' '}
                      <span className="text-gray-400 font-normal">({addCaseIds.size} selected)</span>
                    </label>
                    {addSuiteItems.length > 0 && (
                      <button onClick={() => {
                        setAddCaseIds(allAddSelected
                          ? new Set()
                          : new Set(addSuiteItems.map((i) => i.testCase.id)));
                      }} className="text-xs text-blue-600 hover:underline">
                        {allAddSelected ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                  </div>
                  {addSuiteItems.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">All cases from this suite are already in the run.</p>
                  ) : (
                    <div className="border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                      {addSuiteItems.map(({ testCase }) => (
                        <label key={testCase.id}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-50 last:border-0 transition-colors ${
                            addCaseIds.has(testCase.id) ? 'bg-blue-50' : 'hover:bg-gray-50'
                          }`}>
                          <input type="checkbox" checked={addCaseIds.has(testCase.id)}
                            onChange={() => toggleAddCase(testCase.id)} className="accent-blue-600 shrink-0" />
                          <span className="text-sm text-gray-800 flex-1">{testCase.title}</span>
                          <PriorityBadge priority={testCase.priority} />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={submitAddCases}
                disabled={adding || addCaseIds.size === 0}
                className="btn-primary flex-1 justify-center">
                {adding ? 'Adding…' : `Add ${addCaseIds.size || ''} Case${addCaseIds.size !== 1 ? 's' : ''}`}
              </button>
              <button onClick={() => setShowAddCases(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
