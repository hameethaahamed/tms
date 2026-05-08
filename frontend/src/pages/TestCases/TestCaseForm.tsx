import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import client from '../../api/client';
import { useTitle } from '../../hooks/useTitle';

const PRIORITIES  = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const TEMPLATES   = ['STEPS', 'TEXT', 'EXPLORATORY', 'BDD'];
const TEST_TYPES  = ['FUNCTIONAL', 'REGRESSION', 'PERFORMANCE', 'USABILITY', 'SECURITY', 'SMOKE', 'SANITY'];
const CATEGORIES  = ['Authentication', 'Authorization', 'UI', 'API', 'Performance', 'Security', 'Other'];

const TEMPLATE_LABELS: Record<string, string> = {
  STEPS: 'Test Case (Steps)', TEXT: 'Test Case (Text)',
  EXPLORATORY: 'Exploratory Session', BDD: 'Behaviour Driven Development',
};

interface Section { id: string; name: string; children: Section[]; depth: number }
interface User    { id: string; name: string; email: string; role: string }
interface StepItem {
  description: string;
  screenshots: string[];
  expectedResult: string;
  expectedScreenshots: string[];
}
interface BDDScenario { scenario: string; given: string; when: string; then: string }

function flattenSections(secs: Section[], prefix = ''): { id: string; label: string }[] {
  return secs.flatMap((s) => [
    { id: s.id, label: prefix + s.name },
    ...flattenSections(s.children, prefix + s.name + ' / '),
  ]);
}

function emptyStep(): StepItem { return { description: '', screenshots: [], expectedResult: '', expectedScreenshots: [] }; }
function emptyScenario(): BDDScenario { return { scenario: '', given: '', when: '', then: '' }; }
function normaliseStep(s: unknown): StepItem {
  if (typeof s === 'string') return { description: s, screenshots: [], expectedResult: '', expectedScreenshots: [] };
  const o = s as Record<string, unknown>;
  return {
    description: (o.description as string) ?? '',
    screenshots: (o.screenshots as string[]) ?? [],
    expectedResult: (o.expectedResult as string) ?? '',
    expectedScreenshots: (o.expectedScreenshots as string[]) ?? [],
  };
}


function captureImagePaste(e: React.ClipboardEvent, onCapture: (dataUrl: string) => void) {
  const img = Array.from(e.clipboardData?.items ?? []).find(it => it.type.startsWith('image/'));
  if (!img) return;
  e.preventDefault();
  const file = img.getAsFile();
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => onCapture(reader.result as string);
  reader.readAsDataURL(file);
}

export default function TestCaseForm() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const suiteId       = searchParams.get('suiteId');
  const fromSectionId = searchParams.get('sectionId');
  const isEdit = Boolean(id);
  useTitle(isEdit ? 'Edit Test Case' : 'New Test Case');

  // Meta fields
  const [title,        setTitle]       = useState('');
  const [priority,     setPriority]    = useState('MEDIUM');
  const [template,     setTemplate]    = useState('STEPS');
  const [testType,     setTestType]    = useState('FUNCTIONAL');
  const [category,     setCategory]    = useState('');
  const [tags,         setTags]        = useState('');
  const [references,   setReferences]  = useState('');
  const [sectionId,    setSectionId]   = useState(fromSectionId ?? '');
  const [assignedToId, setAssignedToId]= useState('');

  // Shared template fields
  const [precondition,    setPrecondition]   = useState('');  // maps to description
  const [expectedResult,  setExpectedResult] = useState('');

  // TEXT template
  const [textSteps, setTextSteps] = useState('');

  // STEPS template
  const [stepsItems, setStepsItems] = useState<StepItem[]>([emptyStep()]);

  // EXPLORATORY template
  const [mission, setMission] = useState('');
  const [goals,   setGoals]   = useState('');

  // BDD template
  const [bddScenarios, setBddScenarios] = useState<BDDScenario[]>([emptyScenario()]);


  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [sections, setSections] = useState<{ id: string; label: string }[]>([]);
  const [users,    setUsers]   = useState<User[]>([]);

  const base = projectId ? `/projects/${projectId}` : '';

  useEffect(() => { client.get('/users/all').then((r) => setUsers(r.data)); }, []);

  useEffect(() => {
    if (!projectId) return;
    client.get(`/projects/${projectId}`).then((r) => {
      const proj = r.data;
      if (proj.type === 'SINGLE_REPO') {
        const defaultSuite = proj.suites.find((s: { isDefault: boolean }) => s.isDefault) ?? proj.suites[0];
        if (defaultSuite) setSections(flattenSections(defaultSuite.sections));
      } else {
        const all: { id: string; label: string }[] = [];
        for (const suite of proj.suites) all.push(...flattenSections(suite.sections, suite.name + ' / '));
        setSections(all);
      }
    });
  }, [projectId]);

  useEffect(() => {
    if (!id) return;
    client.get(`/test-cases/${id}`).then((r) => {
      const tc = r.data;
      setTitle(tc.title);
      setPriority(tc.priority);
      setTemplate(tc.template || 'STEPS');
      setTestType(tc.testType || 'FUNCTIONAL');
      setCategory(tc.category || '');
      setTags((JSON.parse(tc.tags) as string[]).join(', '));
      setReferences((JSON.parse(tc.references || '[]') as string[]).join('\n'));
      setSectionId(tc.sectionId || '');
      setAssignedToId(tc.assignedTo?.id || '');

      const rawSteps = JSON.parse(tc.steps || '[]');
      const tpl = tc.template || 'STEPS';

      if (tpl === 'STEPS') {
        setPrecondition(tc.description || '');
        setExpectedResult(tc.expectedResult || '');
        setStepsItems(rawSteps.length ? rawSteps.map(normaliseStep) : [emptyStep()]);
      } else if (tpl === 'TEXT') {
        setPrecondition(tc.description || '');
        setTextSteps(rawSteps[0] || '');
        setExpectedResult(tc.expectedResult || '');
      } else if (tpl === 'EXPLORATORY') {
        setMission(tc.description || '');
        setGoals(tc.expectedResult || '');
      } else if (tpl === 'BDD') {
        setPrecondition(tc.description || '');
        if (rawSteps.length > 0 && typeof rawSteps[0] === 'object') {
          setBddScenarios(rawSteps.length ? rawSteps : [emptyScenario()]);
        } else {
          setBddScenarios([emptyScenario()]);
        }
      }
    });
  }, [id]);

  // STEPS helpers
  function updateStep(i: number, field: keyof StepItem, val: string) {
    setStepsItems(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  }
  function addStep()         { setStepsItems(prev => [...prev, emptyStep()]); }
  function removeStep(i: number) { setStepsItems(prev => prev.filter((_, idx) => idx !== i)); }
  function moveStep(i: number, dir: -1 | 1) {
    setStepsItems(prev => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  // Step attachment helpers
  function addAttachment(i: number, field: 'screenshots' | 'expectedScreenshots', value: string) {
    if (!value.trim()) return;
    setStepsItems(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: [...s[field], value] } : s));
  }
  function removeAttachment(i: number, field: 'screenshots' | 'expectedScreenshots', fi: number) {
    setStepsItems(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: s[field].filter((_, j) => j !== fi) } : s));
  }

  // BDD helpers
  function updateScenario(i: number, field: keyof BDDScenario, val: string) {
    setBddScenarios(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  }
  function addScenario()           { setBddScenarios(prev => [...prev, emptyScenario()]); }
  function removeScenario(i: number) { setBddScenarios(prev => prev.filter((_, idx) => idx !== i)); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);

    let stepsPayload: unknown[];
    let descriptionPayload: string;
    let expectedResultPayload: string;

    if (template === 'STEPS') {
      stepsPayload = stepsItems.filter(s => s.description.trim());
      descriptionPayload = precondition;
      expectedResultPayload = expectedResult;
    } else if (template === 'TEXT') {
      stepsPayload = [textSteps];
      descriptionPayload = precondition;
      expectedResultPayload = expectedResult;
    } else if (template === 'EXPLORATORY') {
      stepsPayload = [];
      descriptionPayload = mission;
      expectedResultPayload = goals;
    } else { // BDD
      stepsPayload = bddScenarios.filter(s => s.given.trim() || s.when.trim() || s.then.trim());
      descriptionPayload = precondition;
      expectedResultPayload = '';
    }

    const payload = {
      title,
      description: descriptionPayload,
      steps: stepsPayload,
      expectedResult: expectedResultPayload,
      priority, template, testType,
      category: category || undefined,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      references: references.split('\n').map((r) => r.trim()).filter(Boolean),
      projectId: projectId ?? null,
      sectionId: sectionId || null,
      assignedToId: assignedToId || null,
    };

    try {
      if (isEdit) {
        await client.put(`/test-cases/${id}`, payload);
        navigate(`${base}/test-cases/${id}`);
      } else {
        const { data } = await client.post('/test-cases', payload);
        if (suiteId) {
          await client.post(`/test-suites/${suiteId}/cases`, { testCaseId: data.id });
          navigate(`${base}/test-suites/${suiteId}`);
        } else {
          navigate(`${base}/test-cases/${data.id}`);
        }
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link to={isEdit ? `${base}/test-cases/${id}` : `${base}/test-cases`}
          className="text-sm text-gray-400 hover:text-blue-600 mb-1 inline-block">
          ← {isEdit ? 'Back to case' : 'Test Cases'}
        </Link>
        <h2 className="text-2xl font-bold text-gray-900 mt-1">{isEdit ? 'Edit' : 'New'} Test Case</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Meta ──────────────────────────────────────────────────────── */}
        <div className="card p-5 space-y-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Template *</label>
              <select className="input" value={template} onChange={(e) => setTemplate(e.target.value)} required>
                {TEMPLATES.map((t) => <option key={t} value={t}>{TEMPLATE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type *</label>
              <select className="input" value={testType} onChange={(e) => setTestType(e.target.value)} required>
                {TEST_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Priority *</label>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)} required>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">— Select —</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {sections.length > 0 && (
              <div>
                <label className="label">Section</label>
                <select className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                  <option value="">— No section —</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="label">Assigned To</label>
              <select className="input" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
                <option value="">— Unassigned —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Tags <span className="text-gray-400 font-normal">(comma separated)</span></label>
            <input className="input" placeholder="smoke, regression, auth"
              value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>

          <div>
            <label className="label">References <span className="text-gray-400 font-normal">(one per line)</span></label>
            <textarea className="input resize-none" rows={2}
              placeholder={"JIRA-123\nhttps://docs.example.com/spec"}
              value={references} onChange={(e) => setReferences(e.target.value)} />
          </div>
        </div>

        {/* ── TEXT template ─────────────────────────────────────────────── */}
        {template === 'TEXT' && (
          <>
            <div className="card p-5 space-y-4">
              <div>
                <label className="label">Precondition</label>
                <p className="text-xs text-gray-400 mb-1">Setup or configuration required before execution (data, access, OS, browser, prior steps…)</p>
                <textarea className="input resize-none" rows={3}
                  placeholder="User must be logged in. Test data must be seeded."
                  value={precondition} onChange={(e) => setPrecondition(e.target.value)} />
              </div>
            </div>

            <div className="card p-5">
              <label className="label">Steps *</label>
              <p className="text-xs text-gray-400 mb-2">Describe the actions to complete the test. Use prose, bullets, or numbered lists.</p>
              <textarea className="input resize-none" rows={8} required
                placeholder={"1. Navigate to the login page\n2. Enter a valid email address\n3. Enter the correct password\n4. Click Sign in"}
                value={textSteps} onChange={(e) => setTextSteps(e.target.value)} />
            </div>

            <div className="card p-5">
              <label className="label">Expected Result *</label>
              <p className="text-xs text-gray-400 mb-1">How the software should respond after steps are correctly executed.</p>
              <textarea className="input resize-none" rows={3} required
                value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} />
            </div>
          </>
        )}

        {/* ── STEPS template ────────────────────────────────────────────── */}
        {template === 'STEPS' && (
          <>
            <div className="card p-5">
              <label className="label">Precondition</label>
              <p className="text-xs text-gray-400 mb-1">Setup or configuration required before execution.</p>
              <textarea className="input resize-none" rows={2}
                placeholder="User must be logged in. Test data must be seeded."
                value={precondition} onChange={(e) => setPrecondition(e.target.value)} />
            </div>

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700">Steps</h3>
              </div>

              {stepsItems.length === 0 ? (
                <div className="p-6 text-center">
                  <button type="button" onClick={addStep}
                    className="px-4 py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                    + Add the first step
                  </button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="w-8 px-3 py-2 text-center text-xs font-medium text-gray-500 border-r border-gray-100">#</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 border-r border-gray-100">Step</th>
                      <th className="w-80 px-3 py-2 text-left text-xs font-medium text-gray-500 border-r border-gray-100">Expected Result</th>
                      <th className="w-16 px-3 py-2 text-center text-xs font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stepsItems.map((step, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50/60 align-top">
                        <td className="px-3 py-2 text-center border-r border-gray-100">
                          <span className="inline-flex w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs items-center justify-center font-semibold mt-1">{i + 1}</span>
                        </td>

                        {/* Step cell */}
                        <td className="px-3 py-2 border-r border-gray-100"
                          onPaste={(e) => captureImagePaste(e, (data) => addAttachment(i, 'screenshots', data))}>
                          <div className="border border-gray-200 rounded-md focus-within:border-blue-300 transition-colors">
                            <textarea className="w-full px-2.5 py-2 text-sm resize-none bg-transparent outline-none" rows={2}
                              placeholder={`Describe step ${i + 1}…`}
                              value={step.description}
                              onChange={(e) => updateStep(i, 'description', e.target.value)} />
                            {step.screenshots.length > 0 && (
                              <div className="px-2.5 pb-2 pt-1 flex flex-wrap gap-1.5 border-t border-gray-100">
                                {step.screenshots.map((src, si) => (
                                  <div key={si} className="relative group inline-block">
                                    <img src={src} alt="" className="h-12 w-16 object-cover rounded border border-gray-200 bg-gray-50" />
                                    <button type="button" onClick={() => removeAttachment(i, 'screenshots', si)}
                                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] hidden group-hover:flex items-center justify-center leading-none">✕</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="px-2.5 py-1 border-t border-gray-100">
                              <span className="text-[11px] text-gray-400 select-none">📷 Ctrl+V to paste screenshot</span>
                            </div>
                          </div>
                        </td>

                        {/* Expected Result cell */}
                        <td className="px-3 py-2 border-r border-gray-100"
                          onPaste={(e) => captureImagePaste(e, (data) => addAttachment(i, 'expectedScreenshots', data))}>
                          <div className="border border-gray-200 rounded-md focus-within:border-blue-300 transition-colors">
                            <textarea className="w-full px-2.5 py-2 text-sm resize-none bg-transparent outline-none" rows={2}
                              placeholder="What should happen…"
                              value={step.expectedResult}
                              onChange={(e) => updateStep(i, 'expectedResult', e.target.value)} />
                            {step.expectedScreenshots.length > 0 && (
                              <div className="px-2.5 pb-2 pt-1 flex flex-wrap gap-1.5 border-t border-gray-100">
                                {step.expectedScreenshots.map((src, si) => (
                                  <div key={si} className="relative group inline-block">
                                    <img src={src} alt="" className="h-12 w-16 object-cover rounded border border-gray-200 bg-gray-50" />
                                    <button type="button" onClick={() => removeAttachment(i, 'expectedScreenshots', si)}
                                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] hidden group-hover:flex items-center justify-center leading-none">✕</button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="px-2.5 py-1 border-t border-gray-100">
                              <span className="text-[11px] text-gray-400 select-none">📷 Ctrl+V to paste screenshot</span>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-2">
                          <div className="flex flex-col items-center gap-0.5 mt-1">
                            <button type="button" title="Move up" onClick={() => moveStep(i, -1)} disabled={i === 0}
                              className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25 text-xs">↑</button>
                            <button type="button" title="Move down" onClick={() => moveStep(i, 1)} disabled={i === stepsItems.length - 1}
                              className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-25 text-xs">↓</button>
                            <button type="button" title="Delete step" onClick={() => removeStep(i)}
                              className="p-1 text-gray-400 hover:text-red-500 text-xs">🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan={4} className="px-4 py-2">
                        <button type="button" onClick={addStep}
                          className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                          + Add Step
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            <div className="card p-5">
              <label className="label">Overall Expected Result *</label>
              <p className="text-xs text-gray-400 mb-1">The final outcome after all steps are executed.</p>
              <textarea className="input resize-none" rows={3} required
                value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} />
            </div>
          </>
        )}

        {/* ── EXPLORATORY template ──────────────────────────────────────── */}
        {template === 'EXPLORATORY' && (
          <>
            <div className="card p-5">
              <label className="label">Mission *</label>
              <p className="text-xs text-gray-400 mb-1">Brief description of the user journey or area to focus on (1–2 sentences).</p>
              <textarea className="input resize-none" rows={4} required
                placeholder="Explore the shopping cart checkout flow to uncover unexpected behaviours and usability issues."
                value={mission} onChange={(e) => setMission(e.target.value)} />
            </div>

            <div className="card p-5">
              <label className="label">Goals *</label>
              <p className="text-xs text-gray-400 mb-1">Checkpoints, desired outcomes, or considerations to keep in mind during the session.</p>
              <textarea className="input resize-none" rows={6} required
                placeholder={"• What do you expect to find?\n• Are you looking for all improvements or only bugs?\n• Did the functionality solve the problem in a way users would find valuable?\n• Were there confusing flows or interactions?"}
                value={goals} onChange={(e) => setGoals(e.target.value)} />
            </div>
          </>
        )}

        {/* ── BDD template ──────────────────────────────────────────────── */}
        {template === 'BDD' && (
          <>
            <div className="card p-5">
              <label className="label">Precondition</label>
              <p className="text-xs text-gray-400 mb-1">State that must be true before the scenarios are executed.</p>
              <textarea className="input resize-none" rows={3}
                placeholder="Given the user has a registered account and is on the login page."
                value={precondition} onChange={(e) => setPrecondition(e.target.value)} />
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">BDD Scenarios *</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Define scenarios using the Given-When-Then format.</p>
                </div>
                <button type="button" onClick={addScenario} className="btn-secondary text-xs py-1">+ Add Scenario</button>
              </div>

              {bddScenarios.length === 0 && (
                <button type="button" onClick={addScenario}
                  className="w-full py-6 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                  + Add the first scenario
                </button>
              )}

              <div className="space-y-4">
                {bddScenarios.map((sc, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Scenario {i + 1}</span>
                      {bddScenarios.length > 1 && (
                        <button type="button" onClick={() => removeScenario(i)}
                          className="text-gray-300 hover:text-red-500 text-sm px-1">✕</button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Scenario title</label>
                        <input className="input text-sm" placeholder="e.g. Successful login with valid credentials"
                          value={sc.scenario} onChange={(e) => updateScenario(i, 'scenario', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-green-700 block mb-1">Given</label>
                        <textarea className="input text-sm resize-none" rows={2}
                          placeholder="the initial context or state…"
                          value={sc.given} onChange={(e) => updateScenario(i, 'given', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-blue-700 block mb-1">When</label>
                        <textarea className="input text-sm resize-none" rows={2}
                          placeholder="the action or event that occurs…"
                          value={sc.when} onChange={(e) => updateScenario(i, 'when', e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-purple-700 block mb-1">Then</label>
                        <textarea className="input text-sm resize-none" rows={2}
                          placeholder="the expected outcome…"
                          value={sc.then} onChange={(e) => updateScenario(i, 'then', e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {bddScenarios.length > 0 && (
                <button type="button" onClick={addScenario}
                  className="mt-3 w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                  + Add Scenario
                </button>
              )}
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Test Case'}
          </button>
          <button type="button" className="btn-secondary"
            onClick={() => navigate(isEdit ? `${base}/test-cases/${id}` : suiteId ? `${base}/test-suites/${suiteId}` : `${base}/test-cases`)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
