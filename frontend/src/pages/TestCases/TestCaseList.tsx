import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import { useAuth } from '../../contexts/AuthContext';

interface Section {
  id: string; name: string; depth: number;
  _count: { testCases: number };
  children: Section[];
}

interface TestCase {
  id: string; seqId: number; title: string; status: string; priority: string;
  template: string; testType: string;
  category: string | null; sectionId: string | null; tags: string;
  description: string | null; steps: string; expectedResult: string;
  references: string; markedForDeletion: boolean;
  createdBy: { name: string }; assignedTo: { name: string } | null;
  section: { name: string } | null;
  updatedAt: string; createdAt: string;
}

const STATUSES = ['DRAFT', 'READY', 'REVIEW', 'APPROVED', 'REJECTED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function parseTags(json: string): string[] {
  try { return JSON.parse(json) as string[]; } catch { return []; }
}

function flatAll(secs: Section[]): Section[] {
  return secs.flatMap((s) => [s, ...flatAll(s.children)]);
}

function countAllTcs(sec: Section): number {
  return sec._count.testCases + sec.children.reduce((n, c) => n + countAllTcs(c), 0);
}

function getSubtreeIds(sec: Section): Set<string> {
  const ids = new Set<string>();
  flatAll([sec]).forEach(s => ids.add(s.id));
  return ids;
}

// ── Section sidebar tree (read-only navigation) ───────────────────────────────

function SectionTree({ sections, selectedId, onSelect, depth = 0 }: {
  sections: Section[]; selectedId: string | null;
  onSelect: (id: string | null) => void; depth?: number;
}) {
  return (
    <>
      {sections.map((s) => {
        const total = countAllTcs(s);
        return (
          <div key={s.id}>
            <button
              onClick={() => onSelect(selectedId === s.id ? null : s.id)}
              className={`w-full text-left flex items-center gap-1 py-1.5 rounded-lg text-sm transition-colors ${
                selectedId === s.id ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px' }}
            >
              <span className="text-gray-400 text-xs w-4 shrink-0">{s.children.length > 0 ? '▾' : ' '}</span>
              <span className="truncate flex-1 select-none">
                {s.name}
                <span className="text-gray-400 font-normal ml-1">({total})</span>
              </span>
            </button>
            {s.children.length > 0 && (
              <SectionTree sections={s.children} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TestCaseList() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const [cases, setCases] = useState<TestCase[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedTcId, setSelectedTcId] = useState<string | null>(null);

  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Checkbox + bulk actions
  const [checkedIds, setCheckedIds]           = useState<Set<string>>(new Set());
  const [showBulkMove, setShowBulkMove]       = useState(false);
  const [showBulkCopy, setShowBulkCopy]       = useState(false);
  const [bulkMoveSection, setBulkMoveSection] = useState('');
  const [bulkMoveSuite, setBulkMoveSuite]     = useState('');
  const [bulkCopySection, setBulkCopySection] = useState('');
  const [bulkCopySuite, setBulkCopySuite]     = useState('');
  const [bulkMoveSections, setBulkMoveSections] = useState<{ id: string; label: string }[]>([]);
  const [bulkMoveSuites, setBulkMoveSuites]   = useState<{ id: string; name: string }[]>([]);
  const [bulkBusy, setBulkBusy]               = useState(false);

  const canCreate = ['ADMIN', 'QA'].includes(user?.role ?? '');
  const base = projectId ? `/projects/${projectId}` : '';
  const dragTcId = useRef<string | null>(null);
  const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(null);

  async function handleDrop(targetSectionId: string | null) {
    if (!dragTcId.current) return;
    const tcId = dragTcId.current;
    dragTcId.current = null;
    setDropTargetSectionId(null);
    await client.post(`/test-cases/${tcId}/move`, { sectionId: targetSectionId });
    setCases(prev => prev.map(c => c.id === tcId ? { ...c, sectionId: targetSectionId } : c));
  }

  function toggleCheck(id: string) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    if (visibleCases.every(c => checkedIds.has(c.id))) {
      setCheckedIds(prev => { const n = new Set(prev); visibleCases.forEach(c => n.delete(c.id)); return n; });
    } else {
      setCheckedIds(prev => { const n = new Set(prev); visibleCases.forEach(c => n.add(c.id)); return n; });
    }
  }

  async function handleBulkCopy() {
    if (checkedIds.size === 0) return;
    setBulkBusy(true);
    for (const tcId of checkedIds) {
      await client.post(`/test-cases/${tcId}/copy`, {
        sectionId: bulkCopySection || null,
        suiteId: bulkCopySuite || null,
      });
    }
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    const { data } = await client.get(`/test-cases?${params}`);
    setCases(data);
    setCheckedIds(new Set());
    setShowBulkCopy(false);
    setBulkBusy(false);
  }

  // Load sections/suites when bulk-move or bulk-copy modal opens
  useEffect(() => {
    if ((!showBulkMove && !showBulkCopy) || !projectId) return;
    client.get(`/projects/${projectId}`).then((r) => {
      const proj = r.data;
      const suites: { id: string; name: string }[] = [];
      const flat: { id: string; label: string }[] = [];
      function flatten(secs: Section[], prefix = '') {
        secs.forEach(s => {
          flat.push({ id: s.id, label: prefix + s.name });
          flatten(s.children, prefix + s.name + ' / ');
        });
      }
      for (const suite of proj.suites ?? []) {
        suites.push({ id: suite.id, name: suite.name });
        flatten(suite.sections ?? [], proj.type === 'MULTI_SUITE' ? suite.name + ' / ' : '');
      }
      setBulkMoveSuites(suites);
      setBulkMoveSections(flat);
    });
  }, [showBulkMove, showBulkCopy, projectId]);

  async function handleBulkMove() {
    if (checkedIds.size === 0) return;
    setBulkBusy(true);
    await Promise.all([...checkedIds].map(tcId =>
      client.post(`/test-cases/${tcId}/move`, {
        sectionId: bulkMoveSection || null,
        suiteId: bulkMoveSuite || null,
      })
    ));
    setCases(prev => prev.map(c =>
      checkedIds.has(c.id) ? { ...c, sectionId: bulkMoveSection || null } : c
    ));
    setCheckedIds(new Set());
    setShowBulkMove(false);
    setBulkBusy(false);
  }

  // Fetch sections from project
  useEffect(() => {
    if (!projectId) return;
    client.get(`/projects/${projectId}`).then((r) => {
      const proj = r.data;
      const allSections: Section[] = [];
      for (const suite of proj.suites ?? []) {
        allSections.push(...(suite.sections ?? []));
      }
      setSections(allSections);
    });
  }, [projectId]);

  // Fetch test cases
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    client.get(`/test-cases?${params}`).then((r) => {
      setCases(r.data);
      setLoading(false);
    });
  }, [projectId, status, priority]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const searchFiltered = cases.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const visibleCases: TestCase[] = selectedSectionId
    ? (() => {
        const sec = flatAll(sections).find(s => s.id === selectedSectionId);
        if (!sec) return [];
        const ids = getSubtreeIds(sec);
        return searchFiltered.filter(c => c.sectionId && ids.has(c.sectionId));
      })()
    : searchFiltered;

  const selectedSectionName = selectedSectionId
    ? flatAll(sections).find(s => s.id === selectedSectionId)?.name
    : null;

  const selectedTc = cases.find(c => c.id === selectedTcId) ?? null;
  // checkbox + ID + Title + Category + Priority + Status + Author + actions
  const totalCols = 8;
  const allVisibleChecked = visibleCases.length > 0 && visibleCases.every(c => checkedIds.has(c.id));
  const someVisibleChecked = visibleCases.some(c => checkedIds.has(c.id));

  // ── Row renderers ───────────────────────────────────────────────────────────

  function renderTcRow(tc: TestCase, indent = 0) {
    const isActive  = selectedTcId === tc.id;
    const isChecked = checkedIds.has(tc.id);

    return (
      <tr
        key={tc.id}
        draggable
        onDragStart={() => { dragTcId.current = tc.id; }}
        onDragEnd={() => { dragTcId.current = null; setDropTargetSectionId(null); }}
        className={`border-b border-gray-50 transition-colors ${
          isChecked ? 'bg-blue-50/60' : isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
        }`}
        onClick={() => setSelectedTcId(prev => prev === tc.id ? null : tc.id)}
      >
        <td className="pl-4 pr-2 py-3 w-8" onClick={(e) => { e.stopPropagation(); toggleCheck(tc.id); }}>
          <input
            type="checkbox"
            checked={isChecked}
            readOnly
            className="w-4 h-4 accent-blue-600 cursor-pointer"
          />
        </td>
        <td className="px-3 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
          TC-{String(tc.seqId).padStart(4, '0')}
        </td>
        <td className="px-3 py-3" style={indent ? { paddingLeft: `${12 + indent}px` } : undefined}>
          <span className={`font-medium ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
            {tc.title}
          </span>
        </td>
        <td className="px-3 py-3 text-gray-500 text-sm">{tc.category || '—'}</td>
        <td className="px-3 py-3"><PriorityBadge priority={tc.priority} /></td>
        <td className="px-3 py-3"><StatusBadge status={tc.status} /></td>
        <td className="px-3 py-3 text-gray-500 text-sm">{tc.createdBy.name}</td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedTcId(prev => prev === tc.id ? null : tc.id); }}
              title={isActive ? 'Close details' : 'View details'}
              className={`font-bold text-base leading-none transition-colors ${isActive ? 'text-blue-500' : 'text-gray-400 hover:text-blue-600'}`}
            >›</button>
          </div>
        </td>
      </tr>
    );
  }

  function renderSectionGroup(sec: Section, items: TestCase[], level: number): JSX.Element {
    const directItems = items.filter(c => c.sectionId === sec.id);
    const childSections = sec.children.filter(child =>
      items.some(c => {
        const childIds = getSubtreeIds(child);
        return c.sectionId && childIds.has(c.sectionId);
      })
    );
    if (directItems.length === 0 && childSections.length === 0) return <Fragment key={`sg-empty-${sec.id}`} />;

    const sectionIndent = level * 20;
    const tcIndent = (level + 1) * 20;

    return (
      <Fragment key={`sg-${sec.id}`}>
        <tr
          className={`border-b border-gray-100 transition-colors ${dropTargetSectionId === sec.id ? 'bg-blue-100' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDropTargetSectionId(sec.id); }}
          onDragLeave={() => setDropTargetSectionId(null)}
          onDrop={() => handleDrop(sec.id)}
        >
          <td
            colSpan={totalCols + 1}
            style={{ paddingLeft: `${16 + sectionIndent}px` }}
            className="py-2.5 pr-4 bg-transparent"
          >
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{sec.name}</span>
            <span className="ml-1.5 text-xs text-gray-400 font-normal">({directItems.length})</span>
            {dropTargetSectionId === sec.id && (
              <span className="ml-2 text-xs text-blue-600 font-normal">Drop here</span>
            )}
          </td>
        </tr>
        {directItems.map(tc => renderTcRow(tc, tcIndent))}
        {sec.children.map(child => {
          const childItems = items.filter(c => {
            const childIds = getSubtreeIds(child);
            return c.sectionId && childIds.has(c.sectionId);
          });
          return renderSectionGroup(child, childItems, level + 1);
        })}
      </Fragment>
    );
  }

  function renderTableBody(): JSX.Element {
    if (selectedSectionId) {
      const sec = flatAll(sections).find(s => s.id === selectedSectionId);
      if (!sec || sec.children.length === 0) {
        return <>{visibleCases.map(tc => renderTcRow(tc))}</>;
      }
      const directItems = visibleCases.filter(c => c.sectionId === selectedSectionId);
      return (
        <>
          {directItems.map(tc => renderTcRow(tc))}
          {sec.children.map(child => {
            const childItems = visibleCases.filter(c => {
              const childIds = getSubtreeIds(child);
              return c.sectionId && childIds.has(c.sectionId);
            });
            return renderSectionGroup(child, childItems, 0);
          })}
        </>
      );
    }

    // All — group by section
    const addedIds = new Set<string>();
    const sectionGroups = sections.map(sec => {
      const secItems = searchFiltered.filter(c => {
        const ids = getSubtreeIds(sec);
        return c.sectionId && ids.has(c.sectionId);
      });
      secItems.forEach(c => addedIds.add(c.id));
      if (secItems.length === 0) return <Fragment key={`sg-skip-${sec.id}`} />;
      return renderSectionGroup(sec, secItems, 0);
    });

    const uncategorized = searchFiltered.filter(c => !addedIds.has(c.id));

    return (
      <>
        {sectionGroups}
        {uncategorized.length > 0 && (
          <>
            <tr className="border-b border-gray-100">
              <td colSpan={totalCols + 1} className="px-4 py-2.5 bg-gray-50/80">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">No Section</span>
                <span className="ml-1.5 text-xs text-gray-400 font-normal">({uncategorized.length})</span>
              </td>
            </tr>
            {uncategorized.map(tc => renderTcRow(tc))}
          </>
        )}
      </>
    );
  }

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Test Cases</h2>
          <p className="text-gray-500 text-sm mt-0.5">{cases.length} total</p>
        </div>
        {canCreate && (
          <Link to={`${base}/test-cases/new`} className="btn-primary">+ New Test Case</Link>
        )}
      </div>

      <div className="flex gap-4 items-start">

        {/* ── Left: Section sidebar ─────────────────────────────────────────── */}
        <div className="w-60 shrink-0">
          <div className="card p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-2">Sections</p>
            <button
              onClick={() => setSelectedSectionId(null)}
              className={`w-full text-left flex items-center justify-between px-2 py-1.5 rounded-lg text-sm mb-1 transition-colors ${
                !selectedSectionId ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>All Test Cases</span>
              <span className="text-xs text-gray-400">{cases.length}</span>
            </button>
            {sections.length === 0 ? (
              <p className="text-xs text-gray-400 px-2 py-2">No sections yet.</p>
            ) : (
              <SectionTree sections={sections} selectedId={selectedSectionId} onSelect={setSelectedSectionId} />
            )}
          </div>
        </div>

        {/* ── Center: Test cases table ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="flex gap-3 mb-3">
            <input className="input flex-1 max-w-xs" placeholder="Search by title…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="input w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
            <select className="input w-36" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Bulk action bar */}
          {checkedIds.size > 0 && (
            <div className="flex items-center gap-3 mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <span className="text-sm font-medium text-blue-800">
                {checkedIds.size} selected
              </span>
              <button
                onClick={() => setShowBulkCopy(true)}
                disabled={bulkBusy}
                className="btn-secondary text-xs py-1"
              >Copy</button>
              <button
                onClick={() => setShowBulkMove(true)}
                disabled={bulkBusy}
                className="btn-secondary text-xs py-1"
              >Move to Section</button>
              <button
                onClick={() => setCheckedIds(new Set())}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
              >✕ Clear</button>
            </div>
          )}

          <div className="card overflow-hidden">
            {/* Table header with section breadcrumb */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-700">
                {selectedSectionName ?? 'All Test Cases'}
                <span className="ml-2 text-gray-400 font-normal">({visibleCases.length})</span>
              </p>
              {selectedSectionName && (
                <button onClick={() => setSelectedSectionId(null)}
                  className="text-xs text-gray-400 hover:text-red-500">✕ clear filter</button>
              )}
            </div>

            {loading ? (
              <p className="p-6 text-center text-gray-400">Loading…</p>
            ) : visibleCases.length === 0 ? (
              <p className="p-8 text-center text-gray-400">No test cases found.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="pl-4 pr-2 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={allVisibleChecked}
                        ref={el => { if (el) el.indeterminate = someVisibleChecked && !allVisibleChecked; }}
                        onChange={toggleAllVisible}
                        className="w-4 h-4 accent-blue-600 cursor-pointer"
                      />
                    </th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600 w-24">ID</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Title</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Category</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Priority</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-3 py-3 font-medium text-gray-600">Author</th>
                    <th className="px-3 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {renderTableBody()}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Right: TC detail pane ─────────────────────────────────────────── */}
        {selectedTcId && (
          <div className="w-80 shrink-0 card flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 9rem)' }}>
            {/* Pane header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
              <span className="font-mono text-xs text-gray-400">
                TC-{selectedTc ? String(selectedTc.seqId).padStart(4, '0') : '????'}
              </span>
              <div className="flex items-center gap-3">
                {canCreate && (
                  <Link to={`${base}/test-cases/${selectedTcId}/edit`}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</Link>
                )}
                <Link to={`${base}/test-cases/${selectedTcId}`}
                  className="text-xs text-gray-500 hover:text-gray-700">Full view</Link>
                <button onClick={() => setSelectedTcId(null)}
                  className="text-gray-400 hover:text-gray-700 text-sm leading-none">✕</button>
              </div>
            </div>

            {/* Pane content */}
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {!selectedTc ? (
                <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
              ) : (
                <>
                  {selectedTc.markedForDeletion && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                      <span>⚠</span> Marked for deletion
                    </div>
                  )}

                  <h3 className="text-base font-semibold text-gray-900 leading-snug">{selectedTc.title}</h3>

                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={selectedTc.status} />
                    <PriorityBadge priority={selectedTc.priority} />
                    {selectedTc.template && (
                      <span className="badge bg-gray-100 text-gray-600 text-xs">{selectedTc.template}</span>
                    )}
                    {selectedTc.testType && (
                      <span className="badge bg-indigo-50 text-indigo-700 text-xs">
                        {selectedTc.testType.charAt(0) + selectedTc.testType.slice(1).toLowerCase()}
                      </span>
                    )}
                    {selectedTc.category && (
                      <span className="badge bg-gray-100 text-gray-600 text-xs">{selectedTc.category}</span>
                    )}
                  </div>

                  {selectedTc.description && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTc.description}</p>
                    </div>
                  )}

                  {(() => {
                    const steps = parseTags(selectedTc.steps);
                    const label = selectedTc.template === 'BDD' ? 'Given / When / Then'
                      : selectedTc.template === 'EXPLORATORY' ? 'Session Notes'
                      : selectedTc.template === 'TEXT' ? 'Test Description' : 'Steps';
                    return steps.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
                        {(selectedTc.template === 'STEPS' || selectedTc.template === 'BDD') ? (
                          <ol className="space-y-2">
                            {steps.map((s, i) => (
                              <li key={i} className="flex gap-2 text-sm">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium mt-0.5">
                                  {i + 1}
                                </span>
                                <span className="text-gray-700">{s}</span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{steps[0]}</p>
                        )}
                      </div>
                    ) : null;
                  })()}

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Expected Result</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedTc.expectedResult}</p>
                  </div>

                  {(() => {
                    const refs: string[] = parseTags(selectedTc.references || '[]');
                    return refs.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">References</p>
                        <ul className="space-y-0.5">
                          {refs.map((r, i) => (
                            <li key={i} className="text-xs text-blue-600">
                              {r.startsWith('http') ? <a href={r} target="_blank" rel="noreferrer" className="hover:underline">{r}</a> : <span className="text-gray-700">{r}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null;
                  })()}

                  {parseTags(selectedTc.tags).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {parseTags(selectedTc.tags).map(t => (
                          <span key={t} className="badge bg-blue-50 text-blue-600 text-xs">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                    <p>Author: <span className="text-gray-600">{selectedTc.createdBy.name}</span></p>
                    {selectedTc.assignedTo && (
                      <p>Assigned: <span className="text-gray-600">{selectedTc.assignedTo.name}</span></p>
                    )}
                    {selectedTc.section && (
                      <p>Section: <span className="text-gray-600">{selectedTc.section.name}</span></p>
                    )}
                    <p>Updated: <span className="text-gray-600">{new Date(selectedTc.updatedAt).toLocaleDateString()}</span></p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bulk copy modal */}
      {showBulkCopy && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Copy Test Cases</h3>
            <p className="text-sm text-gray-500 mb-4">{checkedIds.size} case{checkedIds.size !== 1 ? 's' : ''} will be copied to:</p>
            <div className="space-y-3">
              {bulkMoveSuites.length > 1 && (
                <div>
                  <label className="label text-xs">Suite</label>
                  <select className="input" value={bulkCopySuite} onChange={(e) => setBulkCopySuite(e.target.value)}>
                    <option value="">— Same suite —</option>
                    {bulkMoveSuites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label text-xs">Section</label>
                <select className="input" value={bulkCopySection} onChange={(e) => setBulkCopySection(e.target.value)}>
                  <option value="">— Same section —</option>
                  {bulkMoveSections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-primary flex-1 justify-center" disabled={bulkBusy} onClick={handleBulkCopy}>
                {bulkBusy ? 'Copying…' : 'Copy'}
              </button>
              <button className="btn-secondary flex-1 justify-center" onClick={() => setShowBulkCopy(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk move modal */}
      {showBulkMove && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Move Test Cases</h3>
            <p className="text-sm text-gray-500 mb-4">{checkedIds.size} case{checkedIds.size !== 1 ? 's' : ''} selected</p>
            <div className="space-y-3">
              {bulkMoveSuites.length > 1 && (
                <div>
                  <label className="label text-xs">Suite</label>
                  <select className="input" value={bulkMoveSuite} onChange={(e) => setBulkMoveSuite(e.target.value)}>
                    <option value="">— Keep current suite —</option>
                    {bulkMoveSuites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="label text-xs">Section</label>
                <select className="input" value={bulkMoveSection} onChange={(e) => setBulkMoveSection(e.target.value)}>
                  <option value="">— No section —</option>
                  {bulkMoveSections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button className="btn-primary flex-1 justify-center" disabled={bulkBusy} onClick={handleBulkMove}>
                {bulkBusy ? 'Moving…' : 'Move'}
              </button>
              <button className="btn-secondary flex-1 justify-center" onClick={() => setShowBulkMove(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
