import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import client from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import { useTitle } from '../../hooks/useTitle';
import { useAuth } from '../../contexts/AuthContext';

// ── CSV helpers ───────────────────────────────────────────────────────────────

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current); current = '';
    } else { current += c; }
  }
  result.push(current);
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]).map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseCSVRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
    return obj;
  });
}

const CSV_HEADERS = ['Title','Priority','Template','TestType','Category','Tags','Section','Precondition','Steps','ExpectedResult','References'];

function generateSampleCSV(): string {
  const rows = [
    ['Login with valid credentials','HIGH','STEPS','FUNCTIONAL','Authentication','smoke,regression','','User must be logged in','Navigate to /login;;Enter valid email;;Enter password;;Click Sign In','User is redirected to dashboard','JIRA-123'],
    ['Forgot password flow','MEDIUM','TEXT','FUNCTIONAL','Authentication','regression','','User is on login page','Click Forgot Password, enter email, check inbox, click reset link','Password reset email is received',''],
  ];
  return [CSV_HEADERS.join(','), ...rows.map(r => r.map(escapeCSV).join(','))].join('\n');
}

interface Section {
  id: string; name: string; depth: number;
  _count: { testCases: number };
  children: Section[];
}

interface ImportRow {
  title: string; priority: string; template: string; testType: string;
  category: string; tags: string[]; sectionId: string | null; sectionName: string;
  description: string; steps: unknown[]; expectedResult: string; references: string[];
  error?: string;
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

// ── Section sidebar tree (navigation + drop target) ──────────────────────────

const NO_SECTION_DROP_ID = '__no_section__';

function SectionTree({ sections, selectedId, onSelect, depth = 0, dropTargetId, onDragOver, onDragLeave, onDrop }: {
  sections: Section[]; selectedId: string | null;
  onSelect: (id: string | null) => void; depth?: number;
  dropTargetId: string | null;
  onDragOver: (id: string) => void;
  onDragLeave: () => void;
  onDrop: (id: string | null) => void;
}) {
  return (
    <>
      {sections.map((s) => {
        const total = countAllTcs(s);
        const isTarget = dropTargetId === s.id;
        return (
          <div key={s.id}>
            <button
              onClick={() => onSelect(selectedId === s.id ? null : s.id)}
              onDragOver={(e) => { e.preventDefault(); onDragOver(s.id); }}
              onDragLeave={onDragLeave}
              onDrop={(e) => { e.preventDefault(); onDrop(s.id); }}
              className={`w-full text-left flex items-center gap-1 py-1.5 rounded-lg text-sm transition-colors ${
                isTarget
                  ? 'bg-blue-200 border border-blue-400 text-blue-800 font-medium'
                  : selectedId === s.id
                    ? 'bg-blue-100 text-blue-800 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: '8px' }}
            >
              <span className="text-gray-400 text-xs w-4 shrink-0">{s.children.length > 0 ? '▾' : ' '}</span>
              <span className="truncate flex-1 select-none">
                {s.name}
                <span className={`font-normal ml-1 ${isTarget ? 'text-blue-600' : 'text-gray-400'}`}>({total})</span>
              </span>
              {isTarget && <span className="shrink-0 text-blue-500 text-xs ml-1">↙</span>}
            </button>
            {s.children.length > 0 && (
              <SectionTree
                sections={s.children} selectedId={selectedId} onSelect={onSelect} depth={depth + 1}
                dropTargetId={dropTargetId} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TestCaseList() {
  useTitle('Test Cases');
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

  // Import / Export
  const [showImport, setShowImport]     = useState(false);
  const [importStep, setImportStep]     = useState<'upload' | 'preview' | 'done'>('upload');
  const [importRows, setImportRows]     = useState<ImportRow[]>([]);
  const [importResult, setImportResult] = useState<{ imported: number; errors: { row: number; error: string }[] } | null>(null);
  const [importBusy, setImportBusy]     = useState(false);

  const canCreate = ['ADMIN', 'QA'].includes(user?.role ?? '');
  const base = projectId ? `/projects/${projectId}` : '';
  const dragTcId = useRef<string | null>(null);
  const [dropTargetSectionId, setDropTargetSectionId] = useState<string | null>(null);
  const [draggingTcId, setDraggingTcId] = useState<string | null>(null);

  async function handleDrop(targetSectionId: string | null) {
    if (!dragTcId.current) return;
    const tcId = dragTcId.current;
    dragTcId.current = null;
    setDraggingTcId(null);
    setDropTargetSectionId(null);
    const resolvedId = targetSectionId === NO_SECTION_DROP_ID ? null : targetSectionId;
    await client.post(`/test-cases/${tcId}/move`, { sectionId: resolvedId });
    setCases(prev => prev.map(c => c.id === tcId ? { ...c, sectionId: resolvedId } : c));
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

  // Load sections/suites when bulk-move, bulk-copy, or import modal opens
  useEffect(() => {
    if ((!showBulkMove && !showBulkCopy && !showImport) || !projectId) return;
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
  }, [showBulkMove, showBulkCopy, showImport, projectId]);

  // ── Export ────────────────────────────────────────────────────────────────

  function handleExport() {
    const rows = visibleCases.map(tc => {
      const rawSteps: unknown[] = (() => { try { return JSON.parse(tc.steps || '[]'); } catch { return []; } })();
      const stepsStr = tc.template === 'STEPS'
        ? rawSteps.map((s) => (typeof s === 'string' ? s : (s as Record<string,string>).description || '')).join(';;')
        : String((rawSteps[0] as string) || '');
      const tags: string[] = (() => { try { return JSON.parse(tc.tags || '[]'); } catch { return []; } })();
      const refs: string[] = (() => { try { return JSON.parse(tc.references || '[]'); } catch { return []; } })();
      return [
        tc.title, tc.priority, tc.template, tc.testType,
        tc.category || '', tags.join(','), tc.section?.name || '',
        tc.description || '', stepsStr, tc.expectedResult, refs.join(';;'),
      ].map(escapeCSV).join(',');
    });
    const csv = [CSV_HEADERS.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-cases-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSampleCSV() {
    const csv = generateSampleCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'test-cases-sample.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Import ────────────────────────────────────────────────────────────────

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const csvRows = parseCSV(reader.result as string);
      const parsed: ImportRow[] = csvRows.map(row => {
        const tpl = row.Template?.toUpperCase();
        const template = ['STEPS','TEXT','EXPLORATORY','BDD'].includes(tpl) ? tpl : 'STEPS';
        const stepsRaw = row.Steps || '';
        let steps: unknown[];
        if (template === 'STEPS') {
          steps = stepsRaw.split(';;').filter(Boolean).map(s => ({ description: s.trim(), screenshots: [], expectedResult: '', expectedScreenshots: [] }));
        } else if (template === 'TEXT') {
          steps = stepsRaw ? [stepsRaw] : [];
        } else { steps = []; }
        const sectionName = row.Section?.trim() || '';
        const sectionId = sectionName
          ? (bulkMoveSections.find(s => s.label.toLowerCase() === sectionName.toLowerCase())?.id ?? null)
          : null;
        const ttRaw = row.TestType?.toUpperCase();
        const testType = ['FUNCTIONAL','REGRESSION','PERFORMANCE','USABILITY','SECURITY','SMOKE','SANITY'].includes(ttRaw) ? ttRaw : 'FUNCTIONAL';
        const prRaw = row.Priority?.toUpperCase();
        const priority = ['LOW','MEDIUM','HIGH','CRITICAL'].includes(prRaw) ? prRaw : 'MEDIUM';
        return {
          title: row.Title?.trim() || '',
          priority, template, testType,
          category: row.Category?.trim() || '',
          tags: row.Tags?.split(',').map(t => t.trim()).filter(Boolean) || [],
          sectionId, sectionName,
          description: row.Precondition?.trim() || '',
          steps,
          expectedResult: row.ExpectedResult?.trim() || '',
          references: row.References?.split(';;').map(r => r.trim()).filter(Boolean) || [],
          error: !row.Title?.trim() ? 'Title is required' : undefined,
        };
      });
      setImportRows(parsed);
      setImportStep('preview');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleImportSubmit() {
    const valid = importRows.filter(r => !r.error);
    if (!valid.length) return;
    setImportBusy(true);
    try {
      const { data } = await client.post('/test-cases/bulk-import', {
        projectId,
        cases: valid.map(r => ({
          title: r.title, priority: r.priority, template: r.template, testType: r.testType,
          category: r.category || null, tags: r.tags, sectionId: r.sectionId,
          description: r.description || null, steps: r.steps,
          expectedResult: r.expectedResult, references: r.references,
        })),
      });
      setImportResult(data);
      setImportStep('done');
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      client.get(`/test-cases?${params}`).then(r => setCases(r.data));
    } finally { setImportBusy(false); }
  }

  function closeImport() {
    setShowImport(false);
    setImportStep('upload');
    setImportRows([]);
    setImportResult(null);
  }

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
        onDragStart={() => { dragTcId.current = tc.id; setDraggingTcId(tc.id); }}
        onDragEnd={() => { dragTcId.current = null; setDraggingTcId(null); setDropTargetSectionId(null); }}
        className={`border-b border-gray-50 transition-colors cursor-grab active:cursor-grabbing ${
          draggingTcId === tc.id ? 'opacity-40' :
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
            <tr
              className={`border-b border-gray-100 transition-colors ${dropTargetSectionId === NO_SECTION_DROP_ID ? 'bg-orange-50' : 'bg-gray-50/80'}`}
              onDragOver={(e) => { e.preventDefault(); setDropTargetSectionId(NO_SECTION_DROP_ID); }}
              onDragLeave={() => setDropTargetSectionId(null)}
              onDrop={() => handleDrop(NO_SECTION_DROP_ID)}
            >
              <td colSpan={totalCols + 1} className="px-4 py-2.5">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">No Section</span>
                <span className="ml-1.5 text-xs text-gray-400 font-normal">({uncategorized.length})</span>
                {dropTargetSectionId === NO_SECTION_DROP_ID && (
                  <span className="ml-2 text-xs text-orange-600 font-medium">Drop here</span>
                )}
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
        <div className="flex items-center gap-2">
          <button onClick={handleExport} disabled={visibleCases.length === 0}
            className="btn-secondary text-sm disabled:opacity-40">
            ↓ Export CSV
          </button>
          {canCreate && (
            <button onClick={() => setShowImport(true)} className="btn-secondary text-sm">
              ↑ Import CSV
            </button>
          )}
          {canCreate && (
            <Link to={`${base}/test-cases/new`} className="btn-primary">+ New Test Case</Link>
          )}
        </div>
      </div>

      <div className="flex gap-4 items-start">

        {/* ── Left: Test cases table ────────────────────────────────────────── */}
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

        {/* ── Right: Section sidebar ────────────────────────────────────────── */}
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
              <SectionTree
                sections={sections} selectedId={selectedSectionId} onSelect={setSelectedSectionId}
                dropTargetId={dropTargetSectionId}
                onDragOver={(id) => setDropTargetSectionId(id)}
                onDragLeave={() => setDropTargetSectionId(null)}
                onDrop={(id) => handleDrop(id)}
              />
            )}
            {/* No Section drop zone */}
            {draggingTcId && (
              <div
                className={`mt-2 px-2 py-1.5 rounded-lg border border-dashed text-xs transition-colors select-none ${
                  dropTargetSectionId === NO_SECTION_DROP_ID
                    ? 'bg-orange-50 border-orange-400 text-orange-600 font-medium'
                    : 'border-gray-300 text-gray-400 hover:border-gray-400'
                }`}
                onDragOver={(e) => { e.preventDefault(); setDropTargetSectionId(NO_SECTION_DROP_ID); }}
                onDragLeave={() => setDropTargetSectionId(null)}
                onDrop={(e) => { e.preventDefault(); handleDrop(NO_SECTION_DROP_ID); }}
              >
                {dropTargetSectionId === NO_SECTION_DROP_ID ? '↙ Drop to remove section' : '⊘ No Section'}
              </div>
            )}
          </div>
        </div>
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

      {/* Import CSV modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold text-gray-900">Import Test Cases</h3>
                <div className="flex items-center gap-1 text-xs">
                  {(['upload', 'preview', 'done'] as const).map((step, idx) => (
                    <Fragment key={step}>
                      {idx > 0 && <span className="text-gray-300 mx-1">›</span>}
                      <span className={`px-2 py-0.5 rounded-full font-medium ${
                        importStep === step
                          ? 'bg-blue-100 text-blue-700'
                          : idx < (['upload','preview','done'] as const).indexOf(importStep)
                            ? 'text-green-600'
                            : 'text-gray-400'
                      }`}>
                        {idx + 1}. {step.charAt(0).toUpperCase() + step.slice(1)}
                      </span>
                    </Fragment>
                  ))}
                </div>
              </div>
              <button onClick={closeImport} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-5">

              {/* Step 1: Upload */}
              {importStep === 'upload' && (
                <div className="space-y-5">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800 space-y-1">
                    <p className="font-medium">CSV Format</p>
                    <p className="text-blue-700 text-xs">Required column: <code className="bg-blue-100 px-1 rounded">Title</code>. Optional: Priority, Template, TestType, Category, Tags, Section, Precondition, Steps, ExpectedResult, References.</p>
                    <ul className="text-xs text-blue-600 list-disc list-inside space-y-0.5 mt-1">
                      <li>Steps: separate multiple steps with <code className="bg-blue-100 px-1 rounded">;;</code></li>
                      <li>Tags: comma-separated values</li>
                      <li>References: separate multiple with <code className="bg-blue-100 px-1 rounded">;;</code></li>
                      <li>Priority: LOW, MEDIUM, HIGH, CRITICAL (defaults to MEDIUM)</li>
                      <li>Template: STEPS, TEXT, EXPLORATORY, BDD (defaults to STEPS)</li>
                    </ul>
                  </div>

                  <div className="flex items-center gap-3">
                    <button onClick={downloadSampleCSV} className="btn-secondary text-sm">
                      ↓ Download Sample CSV
                    </button>
                    <span className="text-xs text-gray-400">Use this as a template for your import file</span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select CSV file</label>
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                      <div className="text-center">
                        <p className="text-2xl mb-1">📄</p>
                        <p className="text-sm text-gray-600 font-medium">Click to choose a CSV file</p>
                        <p className="text-xs text-gray-400 mt-0.5">or drag and drop here</p>
                      </div>
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        className="hidden"
                        onChange={handleImportFile}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Step 2: Preview */}
              {importStep === 'preview' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {importRows.filter(r => !r.error).length} of {importRows.length} rows ready to import
                      </p>
                      {importRows.some(r => r.error) && (
                        <p className="text-xs text-red-600 mt-0.5">
                          {importRows.filter(r => r.error).length} row{importRows.filter(r => r.error).length !== 1 ? 's' : ''} have errors and will be skipped
                        </p>
                      )}
                    </div>
                    <button onClick={() => setImportStep('upload')} className="text-xs text-gray-400 hover:text-gray-600">
                      ← Back
                    </button>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto" style={{ maxHeight: '360px', overflowY: 'auto' }}>
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 w-6">#</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Title</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Priority</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Template</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Category</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Section</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600">Steps</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-600 w-20">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importRows.map((row, i) => (
                            <tr key={i} className={`border-b border-gray-100 ${row.error ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                              <td className="px-3 py-2 font-medium text-gray-800 max-w-[200px]">
                                <span className="block truncate" title={row.title}>{row.title || <em className="text-red-400">missing</em>}</span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  row.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                                  row.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                                  row.priority === 'LOW' ? 'bg-gray-100 text-gray-600' :
                                  'bg-yellow-100 text-yellow-700'
                                }`}>{row.priority}</span>
                              </td>
                              <td className="px-3 py-2 text-gray-600">{row.template}</td>
                              <td className="px-3 py-2 text-gray-500">{row.category || '—'}</td>
                              <td className="px-3 py-2 text-gray-500 max-w-[120px]">
                                {row.sectionName ? (
                                  <span className={`block truncate ${row.sectionId ? 'text-green-700' : 'text-orange-600'}`} title={row.sectionName}>
                                    {row.sectionId ? '✓ ' : '? '}{row.sectionName}
                                  </span>
                                ) : '—'}
                              </td>
                              <td className="px-3 py-2 text-gray-500">
                                {Array.isArray(row.steps) ? row.steps.length : 0} step{(Array.isArray(row.steps) ? row.steps.length : 0) !== 1 ? 's' : ''}
                              </td>
                              <td className="px-3 py-2">
                                {row.error ? (
                                  <span className="text-red-600 font-medium" title={row.error}>✕ Error</span>
                                ) : (
                                  <span className="text-green-600 font-medium">✓ Ready</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {importRows.some(r => r.error) && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700 space-y-1">
                      <p className="font-medium">Rows with errors (will be skipped):</p>
                      {importRows.filter(r => r.error).map((r, i) => (
                        <p key={i}>Row {importRows.indexOf(r) + 1}: {r.error}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Done */}
              {importStep === 'done' && importResult && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center py-4 text-center">
                    <div className="text-4xl mb-3">{importResult.imported > 0 ? '✅' : '⚠️'}</div>
                    <p className="text-lg font-semibold text-gray-900">
                      {importResult.imported > 0
                        ? `${importResult.imported} test case${importResult.imported !== 1 ? 's' : ''} imported successfully`
                        : 'No test cases were imported'}
                    </p>
                    {importResult.errors.length > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        {importResult.errors.length} row{importResult.errors.length !== 1 ? 's' : ''} failed
                      </p>
                    )}
                  </div>

                  {importResult.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm space-y-1">
                      <p className="font-medium text-red-800">Import errors:</p>
                      {importResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-700">Row {e.row}: {e.error}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              {importStep === 'preview' && (
                <>
                  <button onClick={closeImport} className="btn-secondary">Cancel</button>
                  <button
                    onClick={handleImportSubmit}
                    disabled={importBusy || importRows.filter(r => !r.error).length === 0}
                    className="btn-primary disabled:opacity-40"
                  >
                    {importBusy
                      ? 'Importing…'
                      : `Import ${importRows.filter(r => !r.error).length} case${importRows.filter(r => !r.error).length !== 1 ? 's' : ''}`}
                  </button>
                </>
              )}
              {importStep === 'done' && (
                <button onClick={closeImport} className="btn-primary">Done</button>
              )}
              {importStep === 'upload' && (
                <button onClick={closeImport} className="btn-secondary">Cancel</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
