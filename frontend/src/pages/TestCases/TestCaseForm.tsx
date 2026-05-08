import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import client from '../../api/client';

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

function flattenSections(secs: Section[], prefix = ''): { id: string; label: string }[] {
  return secs.flatMap((s) => [
    { id: s.id, label: prefix + s.name },
    ...flattenSections(s.children, prefix + s.name + ' / '),
  ]);
}

export default function TestCaseForm() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const suiteId      = searchParams.get('suiteId');
  const fromSectionId = searchParams.get('sectionId');
  const isEdit = Boolean(id);

  const [title,          setTitle]         = useState('');
  const [description,    setDescription]   = useState('');
  const [steps,          setSteps]         = useState<string[]>(['']);
  const [expectedResult, setExpectedResult]= useState('');
  const [priority,       setPriority]      = useState('MEDIUM');
  const [template,       setTemplate]      = useState('STEPS');
  const [testType,       setTestType]      = useState('FUNCTIONAL');
  const [category,       setCategory]      = useState('');
  const [tags,           setTags]          = useState('');
  const [references,     setReferences]    = useState('');
  const [sectionId,      setSectionId]     = useState(fromSectionId ?? '');
  const [assignedToId,   setAssignedToId]  = useState('');
  const [saving,         setSaving]        = useState(false);
  const [error,          setError]         = useState('');
  const [sections,       setSections]      = useState<{ id: string; label: string }[]>([]);
  const [users,          setUsers]         = useState<User[]>([]);

  const base = projectId ? `/projects/${projectId}` : '';

  useEffect(() => {
    client.get('/users/all').then((r) => setUsers(r.data));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    client.get(`/projects/${projectId}`).then((r) => {
      const proj = r.data;
      if (proj.type === 'SINGLE_REPO') {
        const defaultSuite = proj.suites.find((s: { isDefault: boolean }) => s.isDefault) ?? proj.suites[0];
        if (defaultSuite) setSections(flattenSections(defaultSuite.sections));
      } else {
        const allSections: { id: string; label: string }[] = [];
        for (const suite of proj.suites) {
          allSections.push(...flattenSections(suite.sections, suite.name + ' / '));
        }
        setSections(allSections);
      }
    });
  }, [projectId]);

  useEffect(() => {
    if (!id) return;
    client.get(`/test-cases/${id}`).then((r) => {
      const tc = r.data;
      setTitle(tc.title);
      setDescription(tc.description || '');
      setSteps(JSON.parse(tc.steps) || ['']);
      setExpectedResult(tc.expectedResult);
      setPriority(tc.priority);
      setTemplate(tc.template || 'STEPS');
      setTestType(tc.testType || 'FUNCTIONAL');
      setCategory(tc.category || '');
      setTags((JSON.parse(tc.tags) as string[]).join(', '));
      setReferences((JSON.parse(tc.references || '[]') as string[]).join('\n'));
      setSectionId(tc.sectionId || '');
      setAssignedToId(tc.assignedTo?.id || '');
    });
  }, [id]);

  function addStep()                       { setSteps([...steps, '']); }
  function removeStep(i: number)           { setSteps(steps.filter((_, idx) => idx !== i)); }
  function setStep(i: number, val: string) { const s = [...steps]; s[i] = val; setSteps(s); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const payload = {
      title, description,
      steps: steps.filter(Boolean),
      expectedResult, priority, template, testType,
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
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link to={isEdit ? `${base}/test-cases/${id}` : `${base}/test-cases`}
          className="text-sm text-gray-400 hover:text-blue-600 mb-1 inline-block">
          ← {isEdit ? 'Back to case' : 'Test Cases'}
        </Link>
        <h2 className="text-2xl font-bold text-gray-900 mt-1">{isEdit ? 'Edit' : 'New'} Test Case</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic info */}
        <div className="card p-5 space-y-4">
          <div>
            <label className="label">Title *</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea className="input resize-none" rows={2}
              value={description} onChange={(e) => setDescription(e.target.value)} />
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
                <label className="label">Section *</label>
                <select className="input" value={sectionId} onChange={(e) => setSectionId(e.target.value)} required>
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
            <textarea className="input resize-none" rows={3}
              placeholder="JIRA-123&#10;https://docs.example.com/spec"
              value={references} onChange={(e) => setReferences(e.target.value)} />
          </div>
        </div>

        {/* Steps (shown when template is STEPS or BDD) */}
        {(template === 'STEPS' || template === 'BDD') && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="label mb-0">
                {template === 'BDD' ? 'Given / When / Then *' : 'Test Steps *'}
              </label>
              <button type="button" onClick={addStep} className="btn-secondary text-xs py-1">+ Add Step</button>
            </div>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-2 text-xs text-gray-400 w-5 text-right shrink-0">{i + 1}.</span>
                  <input className="input flex-1" placeholder={template === 'BDD' ? ['Given', 'When', 'Then'][i] ?? `Step ${i + 1}` : `Step ${i + 1}`}
                    value={s} onChange={(e) => setStep(i, e.target.value)} />
                  {steps.length > 1 && (
                    <button type="button" onClick={() => removeStep(i)}
                      className="mt-2 text-gray-400 hover:text-red-500 text-sm">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Free text (for TEXT / EXPLORATORY templates) */}
        {(template === 'TEXT' || template === 'EXPLORATORY') && (
          <div className="card p-5">
            <label className="label">
              {template === 'EXPLORATORY' ? 'Session Notes *' : 'Test Description *'}
            </label>
            <textarea className="input resize-none" rows={6} required
              placeholder={template === 'EXPLORATORY' ? 'Charter, time box, notes…' : 'Describe what to test…'}
              value={steps[0] || ''} onChange={(e) => setSteps([e.target.value])} />
          </div>
        )}

        {/* Expected Result */}
        <div className="card p-5">
          <label className="label">Expected Result *</label>
          <textarea className="input resize-none" rows={3} required
            value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} />
        </div>

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
