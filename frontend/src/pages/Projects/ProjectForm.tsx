import { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import client from '../../api/client';

type ProjectType = 'SINGLE_REPO' | 'MULTI_SUITE';

interface TypeOption {
  value: ProjectType;
  icon: string;
  title: string;
  subtitle: string;
  bullets: string[];
}

const TYPE_OPTIONS: TypeOption[] = [
  {
    value: 'SINGLE_REPO',
    icon: '📁',
    title: 'Single Repository',
    subtitle: 'One test suite organised with sections',
    bullets: [
      'All test cases in one repository',
      'Sections & subsections like folders',
      'Ideal for most projects',
      'Mix cases from different sections in one run',
    ],
  },
  {
    value: 'MULTI_SUITE',
    icon: '📂',
    title: 'Multiple Test Suites',
    subtitle: 'Separate suites per module or platform',
    bullets: [
      'Create multiple independent test suites',
      'Each suite has its own sections',
      'Best for large teams with strict divisions',
      'Each test run is limited to one suite',
    ],
  },
];

export default function ProjectForm() {
  const { id, projectId } = useParams<{ id: string; projectId: string }>();
  const editId = id || projectId;
  const navigate = useNavigate();
  const isEdit = Boolean(editId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<ProjectType>('SINGLE_REPO');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editId) return;
    client.get(`/projects/${editId}`).then((r) => {
      setName(r.data.name);
      setDescription(r.data.description ?? '');
      setType(r.data.type);
    });
  }, [editId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (isEdit) {
        await client.put(`/projects/${editId}`, { name, description });
        navigate(`/projects/${editId}`);
      } else {
        const { data } = await client.post('/projects', { name, description, type });
        navigate(`/projects/${data.id}`);
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
        <h2 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Project' : 'New Project'}</h2>
        {!isEdit && <p className="text-gray-500 text-sm mt-1">Choose a project type — this cannot be changed later.</p>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card p-5 space-y-4">
          <div>
            <label className="label">Project Name *</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Web Application, Mobile App…" />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input resize-none" rows={2} value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this project covers…" />
          </div>
        </div>

        {!isEdit && (
          <div>
            <p className="label mb-3">Project Type *</p>
            <div className="grid grid-cols-2 gap-4">
              {TYPE_OPTIONS.map((opt) => (
                <button key={opt.value} type="button"
                  onClick={() => setType(opt.value)}
                  className={`card p-5 text-left transition-all ${
                    type === opt.value
                      ? 'border-blue-500 ring-2 ring-blue-200 bg-blue-50'
                      : 'hover:border-gray-300 hover:shadow-sm'
                  }`}>
                  <div className="text-3xl mb-2">{opt.icon}</div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{opt.title}</h3>
                    {type === opt.value && (
                      <span className="text-blue-600 text-sm">✓</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{opt.subtitle}</p>
                  <ul className="space-y-1">
                    {opt.bullets.map((b) => (
                      <li key={b} className="text-xs text-gray-600 flex items-start gap-1.5">
                        <span className="text-gray-400 mt-0.5 shrink-0">•</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>
        )}

        {type === 'SINGLE_REPO' && !isEdit && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            <strong>Single Repository:</strong> A default "Test Repository" suite will be created automatically. Use sections and subsections to organise your test cases.
          </div>
        )}
        {type === 'MULTI_SUITE' && !isEdit && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-800">
            <strong>Multiple Test Suites:</strong> You will create suites manually after the project is created. Each suite can have its own sections and you cannot mix test cases from different suites in the same test run.
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Project'}
          </button>
          <button type="button" className="btn-secondary"
            onClick={() => navigate(isEdit ? `/projects/${editId}` : '/projects')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
