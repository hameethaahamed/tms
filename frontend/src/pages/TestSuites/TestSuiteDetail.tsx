import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import { useTitle } from '../../hooks/useTitle';
import { useAuth } from '../../contexts/AuthContext';

interface Section {
  id: string; name: string; depth: number;
  _count: { testCases: number };
  children: Section[];
}

interface SuiteItem {
  id: string;
  testCase: {
    id: string; seqId: number; title: string; priority: string; status: string;
    category: string | null; tags: string; sectionId: string | null;
    section: { id: string; name: string } | null;
  };
}

interface FullTestCase {
  id: string; seqId: number; title: string; description: string | null;
  steps: string; expectedResult: string;
  priority: string; status: string; category: string | null; tags: string;
}

interface FlatTestCase {
  id: string; seqId: number; title: string; priority: string; status: string;
  category: string | null; tags: string; sectionId: string | null;
  section: { id: string; name: string } | null;
}

interface Suite {
  id: string; name: string; description: string | null; isDefault: boolean;
  items: SuiteItem[];
}

const OPTIONAL_COLS = [
  { key: 'priority', label: 'Priority' },
  { key: 'status',   label: 'Status'   },
  { key: 'category', label: 'Category' },
  { key: 'tags',     label: 'Tags'     },
];

function flatAll(secs: Section[]): Section[] {
  return secs.flatMap((s) => [s, ...flatAll(s.children)]);
}

function parseTags(json: string): string[] {
  try { return JSON.parse(json) as string[]; } catch { return []; }
}

// ── SectionNode ───────────────────────────────────────────────────────────────

interface SectionNodeProps {
  section: Section;
  level?: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  canEdit: boolean;
  editingSectionId: string | null;
  editingName: string;
  onStartRename: (id: string, current: string) => void;
  onRenameChange: (v: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  sectionFormParentId: string | undefined;
  sectionFormName: string;
  onSectionNameChange: (v: string) => void;
  onCreateSection: () => void;
  onCancelSectionForm: () => void;
}

function SectionNode({
  section, level = 0, selectedId, onSelect, onDelete, onAddChild, canEdit,
  editingSectionId, editingName, onStartRename, onRenameChange, onSaveRename, onCancelRename,
  sectionFormParentId, sectionFormName, onSectionNameChange, onCreateSection, onCancelSectionForm,
}: SectionNodeProps) {
  const [open, setOpen] = useState(true);
  const isSelected = selectedId === section.id;
  const isRenaming = editingSectionId === section.id;
  const showForm = sectionFormParentId === section.id;
  const childIndent = 8 + (level + 1) * 16;
  return (
    <div>
      <div
        className={`flex items-center gap-1 group py-1.5 rounded-lg transition-colors cursor-pointer ${
          isSelected && !isRenaming ? 'bg-blue-100 text-blue-800' : 'hover:bg-gray-100 text-gray-700'
        }`}
        style={{ paddingLeft: `${8 + level * 16}px`, paddingRight: '8px' }}
        onClick={() => { if (!isRenaming) onSelect(section.id); }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className="text-gray-400 text-xs w-4 shrink-0"
        >
          {section.children.length > 0 || showForm ? (open ? '▾' : '▸') : ' '}
        </button>

        {isRenaming ? (
          <input
            autoFocus
            className="flex-1 text-sm px-1 py-0.5 rounded border border-blue-400 outline-none bg-white"
            value={editingName}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') onSaveRename();
              if (e.key === 'Escape') onCancelRename();
            }}
            onBlur={onSaveRename}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="text-sm flex-1 truncate select-none"
            onDoubleClick={(e) => { e.stopPropagation(); onStartRename(section.id, section.name); }}
            title="Double-click to rename"
          >
            {section.name}
            <span className="text-gray-400 font-normal ml-1">({section._count.testCases})</span>
          </span>
        )}

        {canEdit && !isRenaming && (
          <div className="opacity-0 group-hover:opacity-100 flex gap-1 ml-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { onAddChild(section.id); setOpen(true); }}
              className="text-gray-400 hover:text-blue-500 text-xs px-0.5" title="Add sub-section">+</button>
            <button onClick={() => onDelete(section.id)}
              className="text-gray-400 hover:text-red-500 text-xs px-0.5" title="Delete">✕</button>
          </div>
        )}
      </div>

      {open && (
        <>
          {section.children.map((child) => (
            <SectionNode
              key={child.id} section={child} level={level + 1}
              selectedId={selectedId} onSelect={onSelect}
              onDelete={onDelete} onAddChild={onAddChild} canEdit={canEdit}
              editingSectionId={editingSectionId} editingName={editingName}
              onStartRename={onStartRename} onRenameChange={onRenameChange}
              onSaveRename={onSaveRename} onCancelRename={onCancelRename}
              sectionFormParentId={sectionFormParentId}
              sectionFormName={sectionFormName}
              onSectionNameChange={onSectionNameChange}
              onCreateSection={onCreateSection}
              onCancelSectionForm={onCancelSectionForm}
            />
          ))}
          {showForm && (
            <div style={{ paddingLeft: `${childIndent}px` }} className="py-1 pr-2">
              <input
                autoFocus
                className="input text-sm py-1 mb-1 w-full"
                placeholder="Sub-section name"
                value={sectionFormName}
                onChange={(e) => onSectionNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCreateSection();
                  if (e.key === 'Escape') onCancelSectionForm();
                }}
              />
              <div className="flex gap-1">
                <button onClick={onCreateSection} className="btn-primary text-xs py-0.5 px-2" disabled={!sectionFormName.trim()}>Add</button>
                <button onClick={onCancelSectionForm} className="btn-secondary text-xs py-0.5 px-2">Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TestSuiteDetail() {
  useTitle('Test Suite');
  const { projectId, suiteId } = useParams<{ projectId: string; suiteId: string }>();
  const id = suiteId;
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [suite, setSuite] = useState<Suite | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [allCases, setAllCases] = useState<FlatTestCase[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(() => searchParams.get('section'));
  const [selectedTcId, setSelectedTcId] = useState<string | null>(null);

  // section form
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [sectionFormParentId, setSectionFormParentId] = useState<string | undefined>(undefined);
  const [sectionFormName, setSectionFormName] = useState('');

  // rename
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // column customizer
  const [visibleCols, setVisibleCols] = useState<string[]>(['priority', 'status']);
  const [showColPicker, setShowColPicker] = useState(false);
  const colPickerRef = useRef<HTMLDivElement>(null);

  // TC detail cache
  const [detailCache, setDetailCache] = useState<Record<string, FullTestCase>>({});

  // bulk actions
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [showBulkCopy, setShowBulkCopy] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkMoveSection, setBulkMoveSection] = useState('');
  const [bulkCopySection, setBulkCopySection] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const base = projectId ? `/projects/${projectId}` : '';
  const canEdit = ['ADMIN', 'QA'].includes(user?.role ?? '');

  async function loadSuite() {
    const { data } = await client.get(`/test-suites/${id}`);
    setSuite(data);
  }
  async function loadSections() {
    const { data } = await client.get(`/test-suites/${id}/sections`);
    setSections(data);
  }
  async function loadCases() {
    const { data } = await client.get(`/test-cases?suiteId=${id}`);
    setAllCases(data);
  }

  useEffect(() => { loadSuite(); loadSections(); loadCases(); }, [id]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (colPickerRef.current && !colPickerRef.current.contains(e.target as Node))
        setShowColPicker(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Section CRUD ────────────────────────────────────────────────────────────

  function openSectionForm(parentId?: string) {
    setSectionFormParentId(parentId);
    setSectionFormName('');
    setShowSectionForm(true);
  }

  async function createSection() {
    if (!sectionFormName.trim()) return;
    await client.post(`/test-suites/${id}/sections`, { name: sectionFormName, parentId: sectionFormParentId });
    setSectionFormName(''); setShowSectionForm(false);
    await loadSections();
  }

  async function deleteSection(sectionId: string) {
    await client.delete(`/test-suites/${id}/sections/${sectionId}`);
    if (selectedSectionId === sectionId) setSelectedSectionId(null);
    await loadSections();
  }

  function startRename(sectionId: string, current: string) {
    setEditingSectionId(sectionId);
    setEditingName(current);
  }

  async function saveRename() {
    if (!editingSectionId || !editingName.trim()) { setEditingSectionId(null); return; }
    await client.put(`/test-suites/${id}/sections/${editingSectionId}`, { name: editingName });
    setEditingSectionId(null);
    await loadSections();
  }

  function cancelRename() { setEditingSectionId(null); }

  // ── TC actions ──────────────────────────────────────────────────────────────

  async function removeCase(caseId: string) {
    await client.put(`/test-cases/${caseId}`, { sectionId: null });
    if (selectedTcId === caseId) setSelectedTcId(null);
    await Promise.all([loadCases(), loadSections()]);
  }

  function toggleCheck(tcId: string) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(tcId) ? next.delete(tcId) : next.add(tcId);
      return next;
    });
  }

  function toggleAllVisible() {
    const visibleIds = visibleItems.map(i => i.testCase.id);
    const allChecked = visibleIds.length > 0 && visibleIds.every(id => checkedIds.has(id));
    if (allChecked) {
      setCheckedIds(prev => { const n = new Set(prev); visibleIds.forEach(id => n.delete(id)); return n; });
    } else {
      setCheckedIds(prev => { const n = new Set(prev); visibleIds.forEach(id => n.add(id)); return n; });
    }
  }

  async function handleBulkMove() {
    if (checkedIds.size === 0) return;
    setBulkBusy(true);
    await Promise.all([...checkedIds].map(tcId =>
      client.post(`/test-cases/${tcId}/move`, { sectionId: bulkMoveSection || null })
    ));
    setCheckedIds(new Set());
    setShowBulkMove(false);
    setBulkBusy(false);
    await Promise.all([loadCases(), loadSections()]);
  }

  async function handleBulkCopy() {
    if (checkedIds.size === 0) return;
    setBulkBusy(true);
    for (const tcId of checkedIds) {
      await client.post(`/test-cases/${tcId}/copy`, { sectionId: bulkCopySection || null });
    }
    setCheckedIds(new Set());
    setShowBulkCopy(false);
    setBulkBusy(false);
    await loadCases();
  }

  async function handleBulkDelete() {
    if (checkedIds.size === 0) return;
    setBulkBusy(true);
    await Promise.all([...checkedIds].map(tcId => client.delete(`/test-cases/${tcId}`)));
    if (selectedTcId && checkedIds.has(selectedTcId)) setSelectedTcId(null);
    setCheckedIds(new Set());
    setShowBulkDelete(false);
    setBulkBusy(false);
    await Promise.all([loadCases(), loadSections()]);
  }

  async function openDetail(tcId: string) {
    setSelectedTcId(prev => prev === tcId ? null : tcId);
    if (!detailCache[tcId]) {
      const { data } = await client.get(`/test-cases/${tcId}`);
      setDetailCache(prev => ({ ...prev, [tcId]: data }));
    }
  }

  function toggleCol(key: string) {
    setVisibleCols(prev => prev.includes(key) ? prev.filter(c => c !== key) : [...prev, key]);
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const allItems: SuiteItem[] = allCases.map((tc) => ({ id: tc.id, testCase: tc }));

  function getSubtreeIds(sec: Section): Set<string> {
    const ids = new Set<string>();
    flatAll([sec]).forEach(s => ids.add(s.id));
    return ids;
  }

  const visibleItems: SuiteItem[] = selectedSectionId
    ? allItems.filter(i => i.testCase.sectionId === selectedSectionId)
    : allItems;

  const selectedSectionName = selectedSectionId
    ? flatAll(sections).find(s => s.id === selectedSectionId)?.name
    : null;

  const selectedDetail = selectedTcId ? detailCache[selectedTcId] : null;
  const selectedTcItem = allItems.find(i => i.testCase.id === selectedTcId);

  // checkbox + ID + Title + optional cols + actions
  const totalCols = 2 + visibleCols.length + 2;

  const allVisibleChecked = visibleItems.length > 0 && visibleItems.every(i => checkedIds.has(i.testCase.id));
  const someVisibleChecked = visibleItems.some(i => checkedIds.has(i.testCase.id));
  const flatSections = flatAll(sections).map(s => ({ id: s.id, label: ' '.repeat(s.depth * 2) + s.name }));

  if (!suite) return <div className="p-8 text-gray-400">Loading…</div>;

  const sectionNodeProps = {
    selectedId: selectedSectionId,
    onSelect: setSelectedSectionId,
    onDelete: deleteSection,
    onAddChild: openSectionForm,
    canEdit,
    editingSectionId,
    editingName,
    onStartRename: startRename,
    onRenameChange: setEditingName,
    onSaveRename: saveRename,
    onCancelRename: cancelRename,
    sectionFormParentId: showSectionForm ? sectionFormParentId : undefined,
    sectionFormName,
    onSectionNameChange: setSectionFormName,
    onCreateSection: createSection,
    onCancelSectionForm: () => setShowSectionForm(false),
  };

  // ── Row renderers ───────────────────────────────────────────────────────────

  function renderTcRow(item: SuiteItem, indent = 0) {
    const tc = item.testCase;
    const isActive = selectedTcId === tc.id;
    const isChecked = checkedIds.has(tc.id);
    const tags = parseTags(tc.tags);

    return (
      <tr
        key={item.id}
        className={`border-b border-gray-50 transition-colors ${
          isChecked ? 'bg-blue-50/60' : isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
        }`}
      >
        <td className="pl-4 pr-2 py-3 w-8" onClick={(e) => { e.stopPropagation(); toggleCheck(tc.id); }}>
          <input type="checkbox" checked={isChecked} readOnly className="rounded text-blue-600 cursor-pointer" />
        </td>
        <td className="px-4 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
          TC-{String(tc.seqId).padStart(4, '0')}
        </td>
        <td className="px-4 py-3" style={indent ? { paddingLeft: `${16 + indent}px` } : undefined}>
          <Link
            to={`${base}/test-cases/${tc.id}`}
            state={{ from: 'suite', suiteId: id }}
            className={`font-medium hover:text-blue-600 transition-colors ${isActive ? 'text-blue-700' : 'text-gray-800'}`}
          >
            {tc.title}
          </Link>
        </td>
        {visibleCols.includes('priority') && <td className="px-4 py-3"><PriorityBadge priority={tc.priority} /></td>}
        {visibleCols.includes('status')   && <td className="px-4 py-3"><StatusBadge status={tc.status} /></td>}
        {visibleCols.includes('category') && <td className="px-4 py-3 text-gray-500 text-xs">{tc.category ?? '—'}</td>}
        {visibleCols.includes('tags') && (
          <td className="px-4 py-3">
            {tags.length > 0
              ? <div className="flex flex-wrap gap-1">{tags.map(t => <span key={t} className="badge bg-gray-100 text-gray-600 text-xs">{t}</span>)}</div>
              : <span className="text-gray-400 text-xs">—</span>}
          </td>
        )}
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); openDetail(tc.id); }}
              title={isActive ? 'Close quick view' : 'Quick view'}
              className={`font-bold text-base leading-none transition-colors ${isActive ? 'text-blue-500' : 'text-gray-400 hover:text-blue-600'}`}
            >›</button>
            {canEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); removeCase(tc.id); }}
                className="text-gray-300 hover:text-red-500 text-xs" title="Remove from suite"
              >✕</button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  // Renders a section header row + its direct TCs + its children recursively
  function renderSectionGroup(sec: Section, items: SuiteItem[], level: number): JSX.Element {
    const directItems = items.filter(i => i.testCase.sectionId === sec.id);
    const childSections = sec.children.filter(child =>
      items.some(i => {
        const childIds = getSubtreeIds(child);
        return i.testCase.sectionId && childIds.has(i.testCase.sectionId);
      })
    );
    if (directItems.length === 0 && childSections.length === 0) return <Fragment key={`sg-empty-${sec.id}`} />;

    const sectionIndent = level * 20;
    const tcIndent = (level + 1) * 20;

    return (
      <Fragment key={`sg-${sec.id}`}>
        {/* Section header */}
        <tr className="border-b border-gray-100">
          <td
            colSpan={totalCols}
            style={{ paddingLeft: `${16 + sectionIndent}px` }}
            className="py-2.5 pr-4 bg-gray-50/80"
          >
            <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">
              {sec.name}
            </span>
            <span className="ml-1.5 text-xs text-gray-400 font-normal">
              ({directItems.length})
            </span>
          </td>
        </tr>

        {/* Direct TCs in this section */}
        {directItems.map(item => renderTcRow(item, tcIndent))}

        {/* Sub-sections */}
        {sec.children.map(child => {
          const childItems = items.filter(i => {
            const childIds = getSubtreeIds(child);
            return i.testCase.sectionId && childIds.has(i.testCase.sectionId);
          });
          return renderSectionGroup(child, childItems, level + 1);
        })}
      </Fragment>
    );
  }

  // Build the full table body
  function renderTableBody(): JSX.Element {
    if (selectedSectionId) {
      return <>{visibleItems.map(item => renderTcRow(item))}</>;
    }

    // All Test Cases — group by section
    const addedIds = new Set<string>();
    const sectionGroups = sections.map(sec => {
      const secItems = allItems.filter(i => {
        const ids = getSubtreeIds(sec);
        return i.testCase.sectionId && ids.has(i.testCase.sectionId);
      });
      secItems.forEach(i => addedIds.add(i.id));
      if (secItems.length === 0) return <Fragment key={`sg-skip-${sec.id}`} />;
      return renderSectionGroup(sec, secItems, 0);
    });

    const uncategorized = allItems.filter(i => !addedIds.has(i.id));

    return (
      <>
        {sectionGroups}
        {uncategorized.length > 0 && (
          <>
            <tr className="border-b border-gray-100">
              <td colSpan={totalCols} className="px-4 py-2.5 bg-gray-50/80">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                  No Section
                </span>
                <span className="ml-1.5 text-xs text-gray-400 font-normal">({uncategorized.length})</span>
              </td>
            </tr>
            {uncategorized.map(item => renderTcRow(item))}
          </>
        )}
      </>
    );
  }

  // ── JSX ─────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-full mx-auto">
      <Link to={`${base}/test-suites`} className="text-xs text-gray-400 hover:text-blue-600 mb-1 inline-block">
        ← Test Suites
      </Link>

      <div className="flex items-start justify-between mb-5 mt-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-gray-900">{suite.name}</h2>
            {suite.isDefault && <span className="badge bg-blue-100 text-blue-700 text-xs">Default Repository</span>}
          </div>
          {suite.description && <p className="text-gray-500 text-sm mt-1">{suite.description}</p>}
        </div>
        {canEdit && (
          <button
            className="btn-primary text-sm"
            onClick={() => navigate(`${base}/test-cases/new?suiteId=${id}${selectedSectionId ? `&sectionId=${selectedSectionId}` : ''}`)}
          >
            + New Test Case
          </button>
        )}
      </div>

      <div className="flex gap-4 items-start">

        {/* ── Left: Section sidebar ─────────────────────────────────────────── */}
        <div className="w-60 shrink-0">
          <div className="card p-3">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sections</span>
              {canEdit && (
                <button onClick={() => openSectionForm(undefined)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add</button>
              )}
            </div>

            <button
              onClick={() => setSelectedSectionId(null)}
              className={`w-full text-left flex items-center justify-between px-2 py-1.5 rounded-lg text-sm mb-1 transition-colors ${
                !selectedSectionId ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>All Test Cases</span>
              <span className="text-xs text-gray-400">{allCases.length}</span>
            </button>

            {showSectionForm && !sectionFormParentId && (
              <div className="mb-2 px-1">
                <input
                  autoFocus
                  className="input text-sm py-1 mb-1 w-full"
                  placeholder="Section name"
                  value={sectionFormName}
                  onChange={(e) => setSectionFormName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createSection();
                    if (e.key === 'Escape') setShowSectionForm(false);
                  }}
                />
                <div className="flex gap-1">
                  <button onClick={createSection} className="btn-primary text-xs py-0.5 px-2" disabled={!sectionFormName.trim()}>Add</button>
                  <button onClick={() => setShowSectionForm(false)} className="btn-secondary text-xs py-0.5 px-2">Cancel</button>
                </div>
              </div>
            )}

            {sections.length === 0 && !showSectionForm && canEdit && (
              <div className="text-center py-4 px-2">
                <p className="text-xs text-gray-400 mb-2">Add sections to organise test cases.</p>
                <button onClick={() => openSectionForm(undefined)} className="btn-primary text-xs py-1 px-3">+ Add Section</button>
              </div>
            )}

            <div className="space-y-0.5 mt-1">
              {sections.map(s => <SectionNode key={s.id} section={s} {...sectionNodeProps} />)}
            </div>
          </div>
        </div>

        {/* ── Center: Test cases table ──────────────────────────────────────── */}
        <div className="flex-1 min-w-0 card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700">
              {selectedSectionName ?? 'All Test Cases'}
              <span className="ml-2 text-gray-400 font-normal">({visibleItems.length})</span>
            </p>

            <div className="relative" ref={colPickerRef}>
              <button
                onClick={() => setShowColPicker(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  showColPicker ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-100'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                </svg>
                Columns
              </button>
              {showColPicker && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-20 w-44">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Show columns</p>
                  {OPTIONAL_COLS.map(col => (
                    <label key={col.key} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input type="checkbox" className="rounded text-blue-600"
                        checked={visibleCols.includes(col.key)} onChange={() => toggleCol(col.key)} />
                      <span className="text-sm text-gray-700">{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {checkedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-100">
              <span className="text-sm font-medium text-blue-800">{checkedIds.size} selected</span>
              <button onClick={() => setShowBulkCopy(true)} disabled={bulkBusy} className="btn-secondary text-xs py-1">Copy</button>
              <button onClick={() => setShowBulkMove(true)} disabled={bulkBusy} className="btn-secondary text-xs py-1">Move</button>
              <button onClick={() => setShowBulkDelete(true)} disabled={bulkBusy} className="btn-secondary text-xs py-1 text-red-600 border-red-200 hover:bg-red-50">Delete</button>
              <button onClick={() => setCheckedIds(new Set())} className="ml-auto text-xs text-gray-400 hover:text-gray-600">✕ Clear</button>
            </div>
          )}

          {visibleItems.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <p className="text-sm">No test cases{selectedSectionId ? ' in this section' : ''}.</p>
              {canEdit && (
                <button
                  onClick={() => navigate(`${base}/test-cases/new?suiteId=${id}${selectedSectionId ? `&sectionId=${selectedSectionId}` : ''}`)}
                  className="mt-3 btn-primary text-sm"
                >+ New Test Case</button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="pl-4 pr-2 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allVisibleChecked}
                      ref={(el) => { if (el) el.indeterminate = someVisibleChecked && !allVisibleChecked; }}
                      onChange={toggleAllVisible}
                      className="rounded text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
                  {visibleCols.includes('priority') && <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>}
                  {visibleCols.includes('status')   && <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>}
                  {visibleCols.includes('category') && <th className="text-left px-4 py-3 font-medium text-gray-600">Category</th>}
                  {visibleCols.includes('tags')     && <th className="text-left px-4 py-3 font-medium text-gray-600">Tags</th>}
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {renderTableBody()}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Right: TC detail pane ─────────────────────────────────────────── */}
        {selectedTcId && (
          <div className="w-80 shrink-0 card flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 9rem)' }}>
            {/* Pane header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 shrink-0">
              <span className="font-mono text-xs text-gray-400">
                TC-{selectedTcItem ? String(selectedTcItem.testCase.seqId).padStart(4, '0') : '????'}
              </span>
              <div className="flex items-center gap-3">
                {canEdit && (
                  <Link to={`${base}/test-cases/${selectedTcId}/edit`}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</Link>
                )}
                <Link to={`${base}/test-cases/${selectedTcId}`}
                  className="text-xs text-gray-500 hover:text-gray-700">Full view</Link>
                <button onClick={() => setSelectedTcId(null)} className="text-gray-400 hover:text-gray-700 text-sm leading-none">✕</button>
              </div>
            </div>

            {/* Pane content */}
            <div className="overflow-y-auto flex-1 p-4 space-y-4">
              {!selectedDetail ? (
                <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
              ) : (
                <>
                  <h3 className="text-base font-semibold text-gray-900 leading-snug">{selectedDetail.title}</h3>

                  <div className="flex flex-wrap gap-2">
                    <StatusBadge status={selectedDetail.status} />
                    <PriorityBadge priority={selectedDetail.priority} />
                    {selectedDetail.category && (
                      <span className="badge bg-gray-100 text-gray-600 text-xs">{selectedDetail.category}</span>
                    )}
                  </div>

                  {selectedDetail.description && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedDetail.description}</p>
                    </div>
                  )}

                  {(() => {
                    const steps = parseTags(selectedDetail.steps);
                    return steps.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Steps</p>
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
                      </div>
                    ) : null;
                  })()}

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Expected Result</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedDetail.expectedResult}</p>
                  </div>

                  {parseTags(selectedDetail.tags).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tags</p>
                      <div className="flex flex-wrap gap-1">
                        {parseTags(selectedDetail.tags).map(t => (
                          <span key={t} className="badge bg-blue-50 text-blue-600 text-xs">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Bulk Copy modal ─────────────────────────────────────────────────── */}
      {showBulkCopy && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Copy Test Cases</h3>
            <p className="text-sm text-gray-500 mb-4">
              {checkedIds.size} case{checkedIds.size !== 1 ? 's' : ''} will be copied to:
            </p>
            <div>
              <label className="label text-xs">Target Section</label>
              <select className="input" value={bulkCopySection} onChange={(e) => setBulkCopySection(e.target.value)}>
                <option value="">— Same section —</option>
                {flatSections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
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

      {/* ── Bulk Move modal ──────────────────────────────────────────────────── */}
      {showBulkMove && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Move Test Cases</h3>
            <p className="text-sm text-gray-500 mb-4">
              {checkedIds.size} case{checkedIds.size !== 1 ? 's' : ''} will be moved to:
            </p>
            <div>
              <label className="label text-xs">Target Section</label>
              <select className="input" value={bulkMoveSection} onChange={(e) => setBulkMoveSection(e.target.value)}>
                <option value="">— No section —</option>
                {flatSections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
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

      {/* ── Bulk Delete modal ────────────────────────────────────────────────── */}
      {showBulkDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete Test Cases?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">{checkedIds.size} case{checkedIds.size !== 1 ? 's' : ''}</span> will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                className="btn-secondary flex-1 justify-center bg-red-600 text-white border-red-600 hover:bg-red-700 disabled:opacity-50"
                disabled={bulkBusy}
                onClick={handleBulkDelete}
              >
                {bulkBusy ? 'Deleting…' : 'Delete'}
              </button>
              <button className="btn-secondary flex-1 justify-center" onClick={() => setShowBulkDelete(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
