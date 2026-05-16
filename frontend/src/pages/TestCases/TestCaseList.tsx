import { Fragment, useEffect, useRef, useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
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

function parseCSVRow(line: string, delimiter = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === delimiter && !inQuotes) {
      result.push(current); current = '';
    } else { current += c; }
  }
  result.push(current);
  return result;
}

const CSV_HEADERS = ['Title','Priority','Template','TestType','Category','Tags','Section','Precondition','Steps','ExpectedResult','References'];

function generateSampleCSV(): string {
  const rows = [
    ['Login with valid credentials','HIGH','STEPS','FUNCTIONAL','Authentication','smoke,regression','Authentication > Login','User must be logged in','Navigate to /login;;Enter valid email;;Enter password;;Click Sign In','User is redirected to dashboard','JIRA-123'],
    ['Forgot password flow','MEDIUM','TEXT','FUNCTIONAL','Authentication','regression','Authentication > Password','User is on login page','Click Forgot Password, enter email, check inbox, click reset link','Password reset email is received',''],
    ['Explore checkout edge cases','LOW','EXPLORATORY','FUNCTIONAL','Payments','exploratory','Payments > Exploratory','User is logged in with items in cart','Explore the checkout process and test edge cases like empty cart and expired session','No regressions found in checkout flow',''],
    ['Customer places order','HIGH','BDD','FUNCTIONAL','Payments','regression','Payments > BDD','User is logged in;;Given the user has items in cart;;When the user proceeds to checkout;;And the user enters valid payment info;;Then the order is placed successfully','','Order confirmation is displayed','JIRA-456'],
  ];
  return [CSV_HEADERS.join(','), ...rows.map(r => r.map(escapeCSV).join(','))].join('\n');
}

// Excel column headers matching the utils/TMS Export.xlsx format
const EXCEL_HEADERS = ['Title','Template','Type','Priority','Category','Section','Assigned To','Tags','References','Precondition','Step','Expected Result','Overall Expected Result'];

function generateSampleXLSX(): void {
  const rows: (string | number)[][] = [EXCEL_HEADERS];

  // STEPS template — multi-row (each step is its own row)
  rows.push(['Login with valid credentials','(Steps)','Functional','High','Authentication','Login > Smoke Tests','','smoke,regression','JIRA-123','User must be logged in','Navigate to /login','Login page is displayed','All login steps pass']);
  rows.push(['','','','','','','','','','','Enter valid email and password','Credentials accepted','']);
  rows.push(['','','','','','','','','','','Click Sign In','User redirected to dashboard','']);

  // TEXT template — single row, step cell holds the prose body
  rows.push(['Forgot password flow','(Text)','Functional','Medium','Authentication','Login > Text Tests','','regression','JIRA-124','User has a registered account','Click Forgot Password, enter email, submit form, open inbox and click reset link','','Password reset email received within 2 minutes']);

  // EXPLORATORY template — single row, step cell holds the mission/charter
  rows.push(['Explore checkout edge cases','(Exploratory)','Functional','Low','Payments','Payments > Exploratory','','exploratory','','User is logged in with items in cart','Explore the checkout process — test empty cart, invalid card, expired session, and concurrent orders','','No regressions found; edge cases documented']);

  // BDD template — multi-row (each Given/When/Then is its own row)
  rows.push(['Customer places order','(BDD)','Functional','High','Payments','Payments > BDD Tests','','regression','JIRA-456','User is logged in','Given the user has items in cart','Given condition is met','Order confirmation is displayed']);
  rows.push(['','','','','','','','','','','When the user proceeds to checkout','Checkout page loads','']);
  rows.push(['','','','','','','','','','','And the user enters valid payment info','Payment info accepted','']);
  rows.push(['','','','','','','','','','','Then the order is placed successfully','Order ID is generated','']);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Style the header row (bold) via column widths
  ws['!cols'] = EXCEL_HEADERS.map((_h, i) => ({
    wch: [30, 14, 12, 10, 16, 28, 14, 20, 12, 28, 45, 35, 35][i] ?? 20,
  }));

  // Freeze header row
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
  XLSX.writeFile(wb, 'test-cases-sample.xlsx');
}

// TMS field definitions for column mapping
const TMS_FIELDS: { key: string; label: string }[] = [
  { key: '',                   label: '— Skip —' },
  { key: 'title',              label: 'Title *' },
  { key: 'priority',           label: 'Priority' },
  { key: 'template',           label: 'Template' },
  { key: 'testType',           label: 'Test Type' },
  { key: 'category',           label: 'Category' },
  { key: 'tags',               label: 'Tags (comma-separated)' },
  { key: 'section',            label: 'Section / Path' },
  { key: 'description',        label: 'Precondition / Description' },
  // Single-row CSV format: steps delimited by ;;
  { key: 'steps',              label: 'Steps (CSV — separated by ;;)' },
  { key: 'expectedResult',     label: 'Expected Result / Overall Result' },
  // Multi-row Excel format: one row per step
  { key: 'stepDesc',           label: 'Step (Excel — one row per step)' },
  { key: 'stepExpectedResult', label: 'Step Expected Result (per row)' },
  { key: 'references',         label: 'References' },
];

const TMS_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// ── Export column definitions ─────────────────────────────────────────────────

const EXPORT_COLUMNS = [
  { key: 'seqId',          label: 'ID' },
  { key: 'title',          label: 'Title' },
  { key: 'section',        label: 'Section' },
  { key: 'status',         label: 'Status' },
  { key: 'priority',       label: 'Priority' },
  { key: 'template',       label: 'Template' },
  { key: 'testType',       label: 'Test Type' },
  { key: 'category',       label: 'Category' },
  { key: 'tags',           label: 'Tags' },
  { key: 'description',    label: 'Precondition' },
  { key: 'steps',          label: 'Steps' },
  { key: 'expectedResult', label: 'Expected Result' },
  { key: 'references',     label: 'References' },
  { key: 'createdBy',      label: 'Created By' },
  { key: 'assignedTo',     label: 'Assigned To' },
];
const DEFAULT_EXPORT_COLS = new Set([
  'title', 'section', 'status', 'priority', 'template', 'testType',
  'category', 'tags', 'description', 'steps', 'expectedResult', 'references',
]);

// Maps display template names (including Excel parens format) to internal enum values
const TEMPLATE_NORMALIZE: Record<string, string> = {
  steps: 'STEPS', '(steps)': 'STEPS',
  text: 'TEXT', '(text)': 'TEXT',
  exploratory: 'EXPLORATORY', '(exploratory)': 'EXPLORATORY',
  bdd: 'BDD', '(bdd)': 'BDD',
};

function autoDetectColumnMap(headers: string[]): Record<string, string> {
  const ALIASES: Record<string, string[]> = {
    title:               ['title', 'name', 'test title', 'test name', 'case title', 'test case title'],
    priority:            ['priority', 'test priority', 'severity', 'p'],
    // 'type' is intentionally NOT in template to avoid conflict with testType
    template:            ['template', 'case type'],
    // 'type' maps to testType (matches Excel "Type" column)
    testType:            ['testtype', 'test type', 'type'],
    category:            ['category', 'module', 'area', 'component'],
    tags:                ['tags', 'labels', 'label', 'tag'],
    section:             ['section', 'folder', 'section/folder', 'suite', 'path', 'section path', 'sections'],
    description:         ['precondition', 'description', 'pre-condition', 'prerequisite', 'preconditions'],
    // CSV format: ;; delimited steps in one cell
    steps:               ['steps', 'test steps', 'actions'],
    // Excel format: one step per row — 'step' (singular) maps here
    stepDesc:            ['step', 'step description', 'action'],
    // Overall expected result (test-case level)
    expectedResult:      ['expectedresult', 'overall expected result', 'overall result', 'test expected result'],
    // Per-step expected result (Excel "Expected Result" column)
    stepExpectedResult:  ['expected result', 'step expected result', 'expected', 'expected outcome', 'result'],
    references:          ['references', 'reference', 'jira', 'links', 'link'],
  };
  const map: Record<string, string> = {};
  const usedFields = new Set<string>();
  for (const h of headers) {
    const norm = h.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (!usedFields.has(field) && aliases.includes(norm)) {
        map[h] = field;
        usedFields.add(field);
        break;
      }
    }
  }
  return map;
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
// Like parseTags but returns unknown[] — safe for steps which may contain objects
function parseJSON(json: string): unknown[] {
  try { return JSON.parse(json) as unknown[]; } catch { return []; }
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
  const [showImport, setShowImport]         = useState(false);
  const [importStep, setImportStep]         = useState<'upload' | 'column-map' | 'value-map' | 'preview' | 'done'>('upload');
  const [importSettings, setImportSettings] = useState({ delimiter: ',', hasHeader: true });
  const [importSuiteId, setImportSuiteId]   = useState('');
  const [rawFileText, setRawFileText]       = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [csvHeaders, setCsvHeaders]         = useState<string[]>([]);
  const [csvRawRows, setCsvRawRows]         = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap]           = useState<Record<string, string>>({});
  const [valueMap, setValueMap]             = useState<Record<string, string>>({});
  const [importRows, setImportRows]         = useState<ImportRow[]>([]);
  const [importResult, setImportResult]     = useState<{ imported: number; createdSections: number; errors: { row: number; error: string }[] } | null>(null);
  const [importBusy, setImportBusy]         = useState(false);
  const [isExcelFile, setIsExcelFile]       = useState(false);

  // Export
  const [showExport, setShowExport]                   = useState(false);
  const [exportFormat, setExportFormat]               = useState<'xlsx' | 'csv' | 'xml'>('xlsx');
  const [exportSectionScope, setExportSectionScope]   = useState<'all' | 'specific'>('all');
  const [exportSectionId, setExportSectionId]         = useState('');
  const [exportSeparateSteps, setExportSeparateSteps] = useState(true);
  const [exportMaxCompat, setExportMaxCompat]         = useState(false);
  const [exportCols, setExportCols]                   = useState<Set<string>>(new Set(DEFAULT_EXPORT_COLS));

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

  function getExportCases(): TestCase[] {
    if (exportSectionScope === 'all') return cases;
    const sec = flatAll(sections).find(s => s.id === exportSectionId);
    if (!sec) return cases;
    const ids = getSubtreeIds(sec);
    return cases.filter(c => c.sectionId && ids.has(c.sectionId));
  }

  function getExportCasesCount(): number {
    if (exportSectionScope === 'all') return cases.length;
    const sec = flatAll(sections).find(s => s.id === exportSectionId);
    if (!sec) return cases.length;
    const ids = getSubtreeIds(sec);
    return cases.filter(c => c.sectionId && ids.has(c.sectionId)).length;
  }

  function getCellValue(tc: TestCase, key: string): string {
    const steps: unknown[] = parseJSON(tc.steps);
    const tags: string[] = parseTags(tc.tags);
    const refs: string[] = parseTags(tc.references);
    switch (key) {
      case 'seqId':          return String(tc.seqId);
      case 'title':          return tc.title;
      case 'section':        return tc.section?.name ?? '';
      case 'status':         return tc.status;
      case 'priority':       return tc.priority;
      case 'template':       return tc.template;
      case 'testType':       return tc.testType ?? '';
      case 'category':       return tc.category ?? '';
      case 'tags':           return tags.join(', ');
      case 'description':    return tc.description ?? '';
      case 'steps':          return steps.map(s => typeof s === 'string' ? s : (s as Record<string,string>).description ?? '').join(';;');
      case 'expectedResult': return tc.expectedResult ?? '';
      case 'references':     return refs.join(', ');
      case 'createdBy':      return tc.createdBy?.name ?? '';
      case 'assignedTo':     return tc.assignedTo?.name ?? '';
      default:               return '';
    }
  }

  function exportAsCSV() {
    const cols = EXPORT_COLUMNS.filter(c => exportCols.has(c.key));
    const delim = exportMaxCompat ? '\t' : ',';
    const esc = (v: string) => exportMaxCompat ? v.replace(/\t/g, ' ') : escapeCSV(v);
    const lines: string[] = [cols.map(c => c.label).join(delim)];

    for (const tc of getExportCases()) {
      const steps: unknown[] = parseJSON(tc.steps);
      const useSeparate = exportSeparateSteps && exportCols.has('steps')
        && (tc.template === 'STEPS' || tc.template === 'BDD') && steps.length > 1;

      if (useSeparate) {
        steps.forEach((s, i) => {
          const row = cols.map(col => {
            if (col.key === 'steps') return esc(typeof s === 'string' ? s : (s as Record<string,string>).description ?? '');
            if (col.key === 'expectedResult') {
              const perStep = typeof s === 'object' ? (s as Record<string,string>).expectedResult ?? '' : '';
              return esc(i === steps.length - 1 ? (tc.expectedResult ?? perStep) : perStep);
            }
            return i === 0 ? esc(getCellValue(tc, col.key)) : esc('');
          });
          lines.push(row.join(delim));
        });
      } else {
        lines.push(cols.map(col => esc(getCellValue(tc, col.key))).join(delim));
      }
    }

    const bom = exportMaxCompat ? '﻿' : '';
    const ext = exportMaxCompat ? '.tsv' : '.csv';
    const blob = new Blob([bom + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `test-cases-${new Date().toISOString().split('T')[0]}${ext}`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportAsXLSX() {
    const cols = EXPORT_COLUMNS.filter(c => exportCols.has(c.key));
    const rows: (string | number)[][] = [cols.map(c => c.label)];

    for (const tc of getExportCases()) {
      const steps: unknown[] = parseJSON(tc.steps);
      const useSeparate = exportSeparateSteps && exportCols.has('steps')
        && (tc.template === 'STEPS' || tc.template === 'BDD') && steps.length > 1;

      if (useSeparate) {
        steps.forEach((s, i) => {
          const row = cols.map(col => {
            if (col.key === 'steps') return typeof s === 'string' ? s : (s as Record<string,string>).description ?? '';
            if (col.key === 'expectedResult') {
              const perStep = typeof s === 'object' ? (s as Record<string,string>).expectedResult ?? '' : '';
              return i === steps.length - 1 ? (tc.expectedResult ?? perStep) : perStep;
            }
            return i === 0 ? getCellValue(tc, col.key) : '';
          });
          rows.push(row);
        });
      } else {
        rows.push(cols.map(col => getCellValue(tc, col.key)));
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = cols.map(c => ({ wch: c.key === 'steps' || c.key === 'expectedResult' ? 50 : c.key === 'title' ? 35 : 18 }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Test Cases');
    XLSX.writeFile(wb, `test-cases-${new Date().toISOString().split('T')[0]}.xlsx`);
  }

  function exportAsXML() {
    const xmlEsc = (s: string) => String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const TMPL_LABEL: Record<string, string> = {
      STEPS: 'Test Case (Steps)', TEXT: 'Test Case (Text)',
      EXPLORATORY: 'Exploratory Session', BDD: 'Test Case (BDD)',
    };
    const PRI_LABEL: Record<string, string> = {
      LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical',
    };

    const bySection = new Map<string, TestCase[]>();
    for (const tc of getExportCases()) {
      const key = tc.section?.name ?? 'No Section';
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key)!.push(tc);
    }

    let xml = '<?xml version="1.0" encoding="utf-8"?>\n<sections>\n';
    for (const [sname, tcs] of bySection) {
      xml += `  <section>\n    <name>${xmlEsc(sname)}</name>\n    <cases>\n`;
      for (const tc of tcs) {
        const steps: unknown[] = parseJSON(tc.steps);
        const tags: string[] = parseTags(tc.tags);
        const refs: string[] = parseTags(tc.references);
        xml += `      <case>\n`;
        xml += `        <id>${tc.seqId}</id>\n`;
        xml += `        <title>${xmlEsc(tc.title)}</title>\n`;
        xml += `        <template>${xmlEsc(TMPL_LABEL[tc.template] ?? tc.template)}</template>\n`;
        xml += `        <type>${xmlEsc(tc.testType ?? 'Functional')}</type>\n`;
        xml += `        <priority>${xmlEsc(PRI_LABEL[tc.priority] ?? tc.priority)}</priority>\n`;
        xml += `        <references>${xmlEsc(refs.join(', '))}</references>\n`;
        xml += `        <custom>\n`;
        xml += `          <preconds>${xmlEsc(tc.description ?? '')}</preconds>\n`;
        if (tc.template === 'STEPS' || tc.template === 'BDD') {
          if (exportSeparateSteps) {
            xml += `          <steps_separated>\n`;
            for (const s of steps) {
              const desc = typeof s === 'string' ? s : (s as Record<string,string>).description ?? '';
              const exp  = typeof s === 'object'  ? (s as Record<string,string>).expectedResult ?? '' : '';
              xml += `            <step>\n              <content>${xmlEsc(desc)}</content>\n              <expected>${xmlEsc(exp)}</expected>\n            </step>\n`;
            }
            xml += `          </steps_separated>\n`;
          } else {
            const joined = steps.map(s => typeof s === 'string' ? s : (s as Record<string,string>).description ?? '').join('\n');
            xml += `          <steps>${xmlEsc(joined)}</steps>\n`;
          }
        } else {
          const body = steps.length ? (typeof steps[0] === 'string' ? steps[0] : (steps[0] as Record<string,string>).description ?? '') : '';
          xml += `          <steps>${xmlEsc(body)}</steps>\n`;
        }
        xml += `          <expected>${xmlEsc(tc.expectedResult ?? '')}</expected>\n`;
        if (tags.length) xml += `          <tags>${xmlEsc(tags.join(', '))}</tags>\n`;
        xml += `        </custom>\n      </case>\n`;
      }
      xml += `    </cases>\n  </section>\n`;
    }
    xml += '</sections>';

    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `test-cases-${new Date().toISOString().split('T')[0]}.xml`; a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportSubmit() {
    if (exportFormat === 'csv') exportAsCSV();
    else if (exportFormat === 'xlsx') exportAsXLSX();
    else exportAsXML();
    setShowExport(false);
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

  // Derived: unique priority values present in the CSV for the mapped priority column
  const uniquePriorityValues = useMemo(() => {
    const col = Object.entries(columnMap).find(([, f]) => f === 'priority')?.[0];
    if (!col) return [];
    return [...new Set(csvRawRows.map(r => r[col] ?? '').filter(Boolean))];
  }, [columnMap, csvRawRows]);

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('File exceeds 10 MB limit. Please split the file and try again.');
      e.target.value = '';
      return;
    }
    const name = file.name.toLowerCase();
    const isXlsx = name.endsWith('.xlsx') || name.endsWith('.xls');
    setIsExcelFile(isXlsx);
    setImportFileName(file.name);

    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = () => {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
        const headers = (rows[0] as unknown[]).map(h => String(h).trim()).filter(Boolean);
        const dataRows = (rows.slice(1) as unknown[][]).filter(r =>
          r.some(c => String(c).trim() !== '')
        );
        const rawRows: Record<string, string>[] = dataRows.map(row => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = String(row[i] ?? '').trim(); });
          return obj;
        });
        setCsvHeaders(headers);
        setCsvRawRows(rawRows);
        setColumnMap(autoDetectColumnMap(headers));
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        setRawFileText(reader.result as string);
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  }

  function handleUploadNext() {
    if (isExcelFile) {
      if (csvHeaders.length === 0) {
        alert('The file appears to be empty or could not be parsed.');
        return;
      }
      setImportStep('column-map');
      return;
    }
    if (!rawFileText) return;
    // Strip UTF-8 BOM if present
    const text = rawFileText.replace(/^﻿/, '');
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
    if (lines.length < 1 || (lines.length === 1 && !lines[0].trim())) {
      alert('The file appears to be empty.');
      return;
    }
    const delim = importSettings.delimiter;
    const headerLine = importSettings.hasHeader ? lines[0] : null;
    const headers = headerLine
      ? parseCSVRow(headerLine, delim).map(h => h.trim()).filter(Boolean)
      : lines[0].split(delim).map((_, i) => `Column ${i + 1}`);
    if (headers.length === 0) {
      alert('Could not detect any columns. Check the delimiter setting.');
      return;
    }
    const dataLines = importSettings.hasHeader ? lines.slice(1) : lines;
    const rawRows: Record<string, string>[] = dataLines.filter(l => l.trim()).map(line => {
      const vals = parseCSVRow(line, delim);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] ?? '').trim(); });
      return obj;
    });
    setCsvHeaders(headers);
    setCsvRawRows(rawRows);
    setColumnMap(autoDetectColumnMap(headers));
    setImportStep('column-map');
  }

  function buildImportRows(): ImportRow[] {
    const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const VALID_TEMPLATES  = ['STEPS', 'TEXT', 'EXPLORATORY', 'BDD'];
    const VALID_TYPES      = ['FUNCTIONAL', 'REGRESSION', 'PERFORMANCE', 'USABILITY', 'SECURITY', 'SMOKE', 'SANITY'];

    const fieldToCol: Record<string, string> = {};
    for (const [col, field] of Object.entries(columnMap)) fieldToCol[field] = col;
    const get = (row: Record<string, string>, field: string) => fieldToCol[field] ? (row[fieldToCol[field]] ?? '') : '';

    // Normalize Excel section separator " / " → " > " expected by backend
    function normalizeSection(raw: string): string {
      return raw.replace(/\s*\/\s*/g, ' > ').trim();
    }

    // Normalize template: handles "(Steps)", "Steps", "STEPS", etc.
    function normalizeTemplate(raw: string): string {
      const mapped = TEMPLATE_NORMALIZE[raw.toLowerCase().trim()];
      if (mapped && VALID_TEMPLATES.includes(mapped)) return mapped;
      const upper = raw.toUpperCase().trim();
      return VALID_TEMPLATES.includes(upper) ? upper : 'STEPS';
    }

    // Build the scalar fields for a test case from its header row
    function buildBaseRow(row: Record<string, string>): ImportRow {
      const rawTitle = get(row, 'title').trim();
      const rawPriority = get(row, 'priority').trim();
      const mappedPriority = (valueMap[rawPriority] || rawPriority).toUpperCase();
      const priority = VALID_PRIORITIES.includes(mappedPriority) ? mappedPriority : 'MEDIUM';
      const template = normalizeTemplate(get(row, 'template'));
      const ttRaw = get(row, 'testType').toUpperCase();
      const testType = VALID_TYPES.includes(ttRaw) ? ttRaw : 'FUNCTIONAL';
      const sectionName = normalizeSection(get(row, 'section'));
      const sectionId = sectionName
        ? (bulkMoveSections.find(s => s.label.toLowerCase() === sectionName.toLowerCase())?.id ?? null)
        : null;
      const tagsRaw = get(row, 'tags');
      const tags = tagsRaw ? tagsRaw.split(',').map((t: string) => t.trim()).filter(Boolean) : [];
      const refsRaw = get(row, 'references');
      const references = refsRaw ? refsRaw.split(';;').map((r: string) => r.trim()).filter(Boolean) : [];
      // Overall expected result: explicit field takes priority, else fall back to expectedResult
      const expectedResult = (get(row, 'expectedResult') || '').trim();
      return {
        title: rawTitle, priority, template, testType,
        category: get(row, 'category').trim(),
        tags, sectionId, sectionName,
        description: get(row, 'description').trim(),
        steps: [],
        expectedResult,
        references,
        error: !rawTitle ? 'Title is required' : undefined,
      };
    }

    // Build a single step object from a row for STEPS/BDD templates
    function buildStepObj(row: Record<string, string>): Record<string, unknown> {
      const desc = (get(row, 'stepDesc') || get(row, 'steps')).trim();
      const stepER = get(row, 'stepExpectedResult').trim();
      return { description: desc, expectedResult: stepER, screenshots: [], expectedScreenshots: [] };
    }

    // Multi-row mode: Excel format where each step occupies its own row
    // Detected when stepDesc is mapped AND at least one continuation row exists
    const hasStepDescCol = Boolean(fieldToCol['stepDesc']);
    const hasMultiRows = hasStepDescCol && csvRawRows.some(r => !get(r, 'title').trim() && get(r, 'stepDesc').trim());

    if (hasMultiRows) {
      const result: ImportRow[] = [];
      let current: ImportRow | null = null;

      for (const row of csvRawRows) {
        const titleVal = get(row, 'title').trim();
        const stepVal = get(row, 'stepDesc').trim();

        if (titleVal) {
          // Start of a new test case
          if (current) result.push(current);
          current = buildBaseRow(row);
          if (stepVal) {
            if (current.template === 'STEPS' || current.template === 'BDD') {
              current.steps = [buildStepObj(row)];
            } else {
              // TEXT / EXPLORATORY: step cell is the body text
              current.steps = [stepVal];
            }
          }
        } else if (current && stepVal) {
          // Continuation row — append step to current test case
          if (current.template === 'STEPS' || current.template === 'BDD') {
            (current.steps as unknown[]).push(buildStepObj(row));
          } else {
            // Accumulate multi-line text body
            const prev = (current.steps as string[])[0] ?? '';
            current.steps = [prev ? prev + '\n' + stepVal : stepVal];
          }
        }
      }
      if (current) result.push(current);
      return result;
    }

    // Single-row mode: CSV flat format (steps delimited by ;;)
    return csvRawRows.map(row => {
      const base = buildBaseRow(row);
      const stepsRaw = get(row, 'steps').trim();
      let steps: unknown[];
      if (base.template === 'STEPS' || base.template === 'BDD') {
        steps = stepsRaw.split(';;').filter(Boolean).map(s => ({
          description: s.trim(), expectedResult: '', screenshots: [], expectedScreenshots: [],
        }));
      } else if (base.template === 'TEXT' || base.template === 'EXPLORATORY') {
        steps = stepsRaw ? [stepsRaw] : [];
      } else {
        steps = [];
      }
      return { ...base, steps };
    });
  }

  function handleColumnMapNext() {
    if (uniquePriorityValues.length > 0) {
      const PRIORITY_ALIASES: Record<string, string> = {
        p0: 'CRITICAL', p1: 'HIGH', p2: 'MEDIUM', p3: 'LOW',
        critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW',
        blocker: 'CRITICAL', major: 'HIGH', minor: 'LOW', trivial: 'LOW',
        '1': 'CRITICAL', '2': 'HIGH', '3': 'MEDIUM', '4': 'LOW',
      };
      const initial: Record<string, string> = {};
      uniquePriorityValues.forEach(v => { initial[v] = PRIORITY_ALIASES[v.toLowerCase()] || ''; });
      setValueMap(initial);
      setImportStep('value-map');
    } else {
      setImportRows(buildImportRows());
      setImportStep('preview');
    }
  }

  function handleValueMapNext() {
    setImportRows(buildImportRows());
    setImportStep('preview');
  }

  async function handleImportSubmit() {
    const valid = importRows.filter(r => !r.error);
    if (!valid.length) return;
    setImportBusy(true);
    try {
      const { data } = await client.post('/test-cases/bulk-import', {
        projectId,
        suiteId: importSuiteId || undefined,
        cases: valid.map(r => ({
          title: r.title, priority: r.priority, template: r.template, testType: r.testType,
          category: r.category || null, tags: r.tags,
          sectionId: r.sectionId, sectionPath: r.sectionName || null,
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
    setImportSettings({ delimiter: ',', hasHeader: true });
    setImportSuiteId('');
    setRawFileText('');
    setImportFileName('');
    setIsExcelFile(false);
    setCsvHeaders([]);
    setCsvRawRows([]);
    setColumnMap({});
    setValueMap({});
    setImportRows([]);
    setImportResult(null);
  }

  function downloadErrorLog() {
    if (!importResult?.errors.length) return;
    const lines = ['Row,Error', ...importResult.errors.map(e => `${e.row},"${e.error.replace(/"/g, '""')}"`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'import-errors.csv'; a.click();
    URL.revokeObjectURL(url);
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
          <button onClick={() => setShowExport(true)} disabled={cases.length === 0}
            className="btn-secondary text-sm disabled:opacity-40">
            ↓ Export
          </button>
          {canCreate && (
            <button onClick={() => setShowImport(true)} className="btn-secondary text-sm">
              ↑ Import CSV / Excel
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
                    const rawSteps: unknown[] = parseJSON(selectedTc.steps);
                    const getStepText = (s: unknown) =>
                      typeof s === 'string' ? s : ((s as Record<string, string>).description ?? '');
                    const label = selectedTc.template === 'BDD' ? 'Given / When / Then'
                      : selectedTc.template === 'EXPLORATORY' ? 'Session Notes'
                      : selectedTc.template === 'TEXT' ? 'Test Description' : 'Steps';
                    return rawSteps.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
                        {(selectedTc.template === 'STEPS' || selectedTc.template === 'BDD') ? (
                          <ol className="space-y-2">
                            {rawSteps.map((s, i) => (
                              <li key={i} className="flex gap-2 text-sm">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium mt-0.5">
                                  {i + 1}
                                </span>
                                <span className="text-gray-700">{getStepText(s)}</span>
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{getStepText(rawSteps[0])}</p>
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

      {/* Export modal — TMS-17 */}
      {showExport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl flex flex-col" style={{ maxHeight: '90vh' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
              <h3 className="text-base font-semibold text-gray-900">Export Test Cases</h3>
              <button onClick={() => setShowExport(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Format */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Format</p>
                <div className="flex gap-2">
                  {(['xlsx', 'csv', 'xml'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setExportFormat(fmt)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        exportFormat === fmt
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {fmt === 'xlsx' ? 'Excel (.xlsx)' : fmt === 'csv' ? 'CSV (.csv)' : 'XML (.xml)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section scope */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sections</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={exportSectionScope === 'all'} onChange={() => setExportSectionScope('all')} className="accent-blue-600" />
                    <span className="text-sm text-gray-700">All sections ({cases.length} test cases)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={exportSectionScope === 'specific'} onChange={() => setExportSectionScope('specific')} className="accent-blue-600" />
                    <span className="text-sm text-gray-700">Specific section</span>
                  </label>
                  {exportSectionScope === 'specific' && (
                    <select
                      className="input ml-6"
                      value={exportSectionId}
                      onChange={e => setExportSectionId(e.target.value)}
                    >
                      <option value="">— Select a section —</option>
                      {flatAll(sections).map(s => (
                        <option key={s.id} value={s.id}>
                          {'　'.repeat(s.depth)}{s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Columns */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Columns</p>
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => setExportCols(new Set(EXPORT_COLUMNS.map(c => c.key)))} className="text-blue-600 hover:underline">Select all</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={() => setExportCols(new Set(DEFAULT_EXPORT_COLS))} className="text-blue-600 hover:underline">Reset to default</button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  {EXPORT_COLUMNS.map(col => (
                    <label key={col.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportCols.has(col.key)}
                        onChange={() => setExportCols(prev => {
                          const next = new Set(prev);
                          next.has(col.key) ? next.delete(col.key) : next.add(col.key);
                          return next;
                        })}
                        className="accent-blue-600"
                      />
                      <span className="text-sm text-gray-700">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Options</p>
                <div className="space-y-3">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportSeparateSteps}
                      onChange={e => setExportSeparateSteps(e.target.checked)}
                      className="accent-blue-600 mt-0.5"
                    />
                    <div>
                      <p className="text-sm text-gray-700">Include separated steps</p>
                      <p className="text-xs text-gray-400">
                        {exportFormat === 'xml'
                          ? 'Outputs <steps_separated> elements (TestRail-compatible)'
                          : 'Each step on its own row for STEPS and BDD templates'}
                      </p>
                    </div>
                  </label>
                  {exportFormat === 'csv' && (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={exportMaxCompat}
                        onChange={e => setExportMaxCompat(e.target.checked)}
                        className="accent-blue-600 mt-0.5"
                      />
                      <div>
                        <p className="text-sm text-gray-700">Maximum Excel compatibility</p>
                        <p className="text-xs text-gray-400">Uses tab delimiter and UTF-8 BOM for seamless opening in Excel (.tsv)</p>
                      </div>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
              <p className="text-xs text-gray-400 mr-auto">
                {getExportCasesCount()} test case{getExportCasesCount() !== 1 ? 's' : ''} will be exported
              </p>
              <button onClick={() => setShowExport(false)} className="btn-secondary">Cancel</button>
              <button
                onClick={handleExportSubmit}
                disabled={exportCols.size === 0 || (exportSectionScope === 'specific' && !exportSectionId)}
                className="btn-primary disabled:opacity-40"
              >
                ↓ Export {exportFormat.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV modal — 5-step flow per TMS-16 */}
      {showImport && (() => {
        const STEPS = ['upload', 'column-map', 'value-map', 'preview', 'done'] as const;
        const STEP_LABELS = ['Upload', 'Map Columns', 'Map Values', 'Preview', 'Done'];
        const currentIdx = STEPS.indexOf(importStep);
        const validRows = importRows.filter(r => !r.error);
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl flex flex-col" style={{ maxHeight: '92vh' }}>

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-4">
                  <h3 className="text-base font-semibold text-gray-900">Import Test Cases</h3>
                  <ol className="flex items-center gap-1 text-xs">
                    {STEPS.map((s, idx) => (
                      <Fragment key={s}>
                        {idx > 0 && <span className="text-gray-300">›</span>}
                        <li className={`px-2 py-0.5 rounded-full font-medium ${
                          idx === currentIdx ? 'bg-blue-100 text-blue-700' :
                          idx < currentIdx   ? 'text-green-600' : 'text-gray-400'
                        }`}>
                          {idx + 1}. {STEP_LABELS[idx]}
                        </li>
                      </Fragment>
                    ))}
                  </ol>
                </div>
                <button onClick={closeImport} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto flex-1 px-6 py-5">

                {/* ── Screen 1: Upload + Settings ─────────────────────────── */}
                {importStep === 'upload' && (
                  <div className="space-y-5">
                    {/* File drop zone */}
                    <div>
                      <label className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                        importFileName ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                      }`}>
                        {importFileName ? (
                          <div className="text-center">
                            <p className="text-2xl mb-1">✓</p>
                            <p className="text-sm font-medium text-green-700">{importFileName}</p>
                            <p className="text-xs text-green-600 mt-0.5">Click to choose a different file</p>
                          </div>
                        ) : (
                          <div className="text-center">
                            <p className="text-3xl mb-1">📂</p>
                            <p className="text-sm font-medium text-gray-600">Click to choose a CSV or Excel file</p>
                            <p className="text-xs text-gray-400 mt-0.5">Max 10 MB · Supported: .csv, .xlsx</p>
                          </div>
                        )}
                        <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleImportFile} />
                      </label>
                    </div>

                    {/* Import settings */}
                    <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      {!isExcelFile && (
                        <div>
                          <label className="label text-xs">Delimiter</label>
                          <select
                            className="input"
                            value={importSettings.delimiter}
                            onChange={e => setImportSettings(s => ({ ...s, delimiter: e.target.value }))}
                          >
                            <option value=",">Comma ( , )</option>
                            <option value=";">Semicolon ( ; )</option>
                            <option value={'\t'}>Tab</option>
                            <option value="|">Pipe ( | )</option>
                          </select>
                        </div>
                      )}
                      <div className={isExcelFile ? 'col-span-2' : ''}>
                        <label className="label text-xs">Suite (for section auto-creation)</label>
                        <select
                          className="input"
                          value={importSuiteId}
                          onChange={e => setImportSuiteId(e.target.value)}
                        >
                          <option value="">— Auto-detect —</option>
                          {bulkMoveSuites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      {!isExcelFile && (
                        <div className="col-span-2 flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="hasHeader"
                            checked={importSettings.hasHeader}
                            onChange={e => setImportSettings(s => ({ ...s, hasHeader: e.target.checked }))}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <label htmlFor="hasHeader" className="text-sm text-gray-700 cursor-pointer">
                            First row contains column headers
                          </label>
                        </div>
                      )}
                      {isExcelFile && (
                        <div className="col-span-2 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-2">
                          <span>📊</span>
                          <span>Excel file detected — first row used as headers automatically.</span>
                        </div>
                      )}
                    </div>

                    {/* Sample downloads */}
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Sample Files</p>
                      <div className="flex items-center gap-3">
                        <button onClick={generateSampleXLSX} className="btn-secondary text-sm">
                          ↓ Sample Excel (.xlsx)
                        </button>
                        <button onClick={downloadSampleCSV} className="btn-secondary text-sm">
                          ↓ Sample CSV (.csv)
                        </button>
                        <span className="text-xs text-gray-400">
                          Includes all 4 template types with example rows
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                        <p><span className="font-semibold text-gray-700">Excel format</span> — one step per row; blank Title = continuation of the previous test case</p>
                        <p><span className="font-semibold text-gray-700">CSV format</span> — steps in a single cell separated by <code className="bg-gray-100 px-1 rounded">;;</code></p>
                        <p><span className="font-semibold text-gray-700">Section paths</span> — use <code className="bg-gray-100 px-1 rounded">Parent / Child</code> (Excel) or <code className="bg-gray-100 px-1 rounded">Parent &gt; Child</code> (CSV)</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Screen 2: Column Mapping ─────────────────────────────── */}
                {importStep === 'column-map' && (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-sm text-gray-600">
                        Map each column from <span className="font-medium text-gray-800">{importFileName}</span> to the corresponding TMS field.
                        Auto-detected mappings are pre-filled.
                      </p>
                      {isExcelFile && (
                        <div className="shrink-0 text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-700 space-y-0.5 min-w-[220px]">
                          <p className="font-semibold">Excel multi-row format</p>
                          <p>Map <code className="bg-blue-100 px-0.5 rounded">Step</code> → <strong>Step (one row per step)</strong></p>
                          <p>Map <code className="bg-blue-100 px-0.5 rounded">Expected Result</code> → <strong>Step Expected Result</strong></p>
                          <p>Map <code className="bg-blue-100 px-0.5 rounded">Overall Expected Result</code> → <strong>Expected Result / Overall</strong></p>
                        </div>
                      )}
                    </div>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-medium text-gray-600">CSV Column</th>
                            <th className="px-4 py-2.5 text-left font-medium text-gray-600">Sample Value</th>
                            <th className="px-4 py-2.5 text-left font-medium text-gray-600">TMS Field</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvHeaders.map(h => {
                            const sample = csvRawRows[0]?.[h] ?? '';
                            const mapped = columnMap[h] ?? '';
                            const isDupe = mapped && Object.entries(columnMap).filter(([k, v]) => v === mapped && k !== h).length > 0;
                            return (
                              <tr key={h} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="px-4 py-2.5 font-mono text-xs text-gray-700 font-medium">{h}</td>
                                <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[180px]">
                                  <span className="block truncate">{sample || '—'}</span>
                                </td>
                                <td className="px-4 py-2.5">
                                  <select
                                    className={`input text-sm py-1 ${isDupe ? 'border-orange-400 bg-orange-50' : ''}`}
                                    value={mapped}
                                    onChange={e => setColumnMap(m => ({ ...m, [h]: e.target.value }))}
                                  >
                                    {TMS_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                                  </select>
                                  {isDupe && <p className="text-[10px] text-orange-600 mt-0.5">Duplicate mapping</p>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {!Object.values(columnMap).includes('title') && (
                      <p className="text-xs text-red-600 flex items-center gap-1">
                        ⚠ No column mapped to <strong>Title</strong> — this is required to import.
                      </p>
                    )}
                  </div>
                )}

                {/* ── Screen 3: Value Mapping ──────────────────────────────── */}
                {importStep === 'value-map' && (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                      Map the priority values found in your CSV to TMS priority levels.
                    </p>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-medium text-gray-600">CSV Priority Value</th>
                            <th className="px-4 py-2.5 text-left font-medium text-gray-600">TMS Priority</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uniquePriorityValues.map(val => (
                            <tr key={val} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-mono text-sm text-gray-800">{val}</td>
                              <td className="px-4 py-3">
                                <select
                                  className="input text-sm py-1 w-40"
                                  value={valueMap[val] ?? ''}
                                  onChange={e => setValueMap(m => ({ ...m, [val]: e.target.value }))}
                                >
                                  <option value="">— Keep as-is —</option>
                                  {TMS_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-400">
                      Values left as "Keep as-is" will use MEDIUM if they don't match a known priority.
                    </p>
                  </div>
                )}

                {/* ── Screen 4: Preview ────────────────────────────────────── */}
                {importStep === 'preview' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          <span className="text-green-700 font-semibold">{validRows.length}</span> of {importRows.length} rows ready to import
                        </p>
                        {importRows.some(r => r.error) && (
                          <p className="text-xs text-red-600 mt-0.5">
                            {importRows.filter(r => r.error).length} row{importRows.filter(r => r.error).length !== 1 ? 's' : ''} have errors and will be skipped
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600 w-8">#</th>
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
                                  <span className="block truncate" title={row.title}>
                                    {row.title || <em className="text-red-400 font-normal">missing</em>}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    row.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                                    row.priority === 'HIGH'     ? 'bg-orange-100 text-orange-700' :
                                    row.priority === 'LOW'      ? 'bg-gray-100 text-gray-600' :
                                                                  'bg-yellow-100 text-yellow-700'
                                  }`}>{row.priority}</span>
                                </td>
                                <td className="px-3 py-2 text-gray-600">{row.template}</td>
                                <td className="px-3 py-2 text-gray-500">{row.category || '—'}</td>
                                <td className="px-3 py-2 text-gray-500 max-w-[140px]">
                                  {row.sectionName ? (
                                    <span className={`block truncate ${row.sectionId ? 'text-green-700' : 'text-blue-600'}`} title={row.sectionName}>
                                      {row.sectionId ? '✓ ' : '+ '}{row.sectionName}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-500">
                                  {(Array.isArray(row.steps) ? row.steps.length : 0)} step{(Array.isArray(row.steps) ? row.steps.length : 0) !== 1 ? 's' : ''}
                                </td>
                                <td className="px-3 py-2">
                                  {row.error
                                    ? <span className="text-red-600 font-medium" title={row.error}>✕ Error</span>
                                    : <span className="text-green-600 font-medium">✓ Ready</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {importRows.some(r => r.sectionName && !r.sectionId) && (
                      <p className="text-xs text-blue-600">
                        + Sections marked in blue will be auto-created during import.
                      </p>
                    )}

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

                {/* ── Screen 5: Done ───────────────────────────────────────── */}
                {importStep === 'done' && importResult && (
                  <div className="space-y-5">
                    <div className="flex flex-col items-center py-6 text-center">
                      <div className="text-5xl mb-4">{importResult.imported > 0 ? '✅' : '⚠️'}</div>
                      <p className="text-xl font-semibold text-gray-900">
                        {importResult.imported > 0 ? 'Import Completed' : 'Nothing Imported'}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-2xl font-bold text-green-700">{importResult.imported}</p>
                        <p className="text-xs text-green-600 mt-0.5">Test Cases Imported</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-2xl font-bold text-blue-700">{importResult.createdSections ?? 0}</p>
                        <p className="text-xs text-blue-600 mt-0.5">Sections Created</p>
                      </div>
                      <div className={`border rounded-lg p-3 ${importResult.errors.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                        <p className={`text-2xl font-bold ${importResult.errors.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>{importResult.errors.length}</p>
                        <p className={`text-xs mt-0.5 ${importResult.errors.length > 0 ? 'text-red-600' : 'text-gray-400'}`}>Failed Records</p>
                      </div>
                    </div>

                    {importResult.errors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1">
                        <p className="text-sm font-medium text-red-800">Warnings / Errors:</p>
                        {importResult.errors.map((e, i) => (
                          <p key={i} className="text-xs text-red-700">· Row {e.row}: {e.error}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
                <div>
                  {importStep === 'done' && importResult && importResult.errors.length > 0 && (
                    <button onClick={downloadErrorLog} className="btn-secondary text-sm">
                      ↓ Download Error Log
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {importStep === 'upload' && (
                    <>
                      <button onClick={closeImport} className="btn-secondary">Cancel</button>
                      <button
                        onClick={handleUploadNext}
                        disabled={!importFileName || (isExcelFile && csvHeaders.length === 0)}
                        className="btn-primary disabled:opacity-40"
                      >Next →</button>
                    </>
                  )}
                  {importStep === 'column-map' && (
                    <>
                      <button onClick={() => setImportStep('upload')} className="btn-secondary">← Back</button>
                      <button
                        onClick={handleColumnMapNext}
                        disabled={!Object.values(columnMap).includes('title')}
                        className="btn-primary disabled:opacity-40"
                      >Next →</button>
                    </>
                  )}
                  {importStep === 'value-map' && (
                    <>
                      <button onClick={() => setImportStep('column-map')} className="btn-secondary">← Back</button>
                      <button onClick={handleValueMapNext} className="btn-primary">Next →</button>
                    </>
                  )}
                  {importStep === 'preview' && (
                    <>
                      <button onClick={() => setImportStep(uniquePriorityValues.length > 0 ? 'value-map' : 'column-map')} className="btn-secondary">← Back</button>
                      <button
                        onClick={handleImportSubmit}
                        disabled={importBusy || validRows.length === 0}
                        className="btn-primary disabled:opacity-40"
                      >
                        {importBusy ? 'Importing…' : `Import ${validRows.length} case${validRows.length !== 1 ? 's' : ''}`}
                      </button>
                    </>
                  )}
                  {importStep === 'done' && (
                    <>
                      {projectId && (
                        <Link to={`${base}/test-cases`} onClick={closeImport} className="btn-secondary text-sm">
                          Go to Test Cases
                        </Link>
                      )}
                      <button onClick={closeImport} className="btn-primary">Done</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
