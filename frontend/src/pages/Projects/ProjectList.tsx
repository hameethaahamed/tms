import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useTitle } from '../../hooks/useTitle';

interface Project {
  id: string; name: string; description: string | null; type: string;
  _count: { suites: number; plans: number; testCases: number };
  updatedAt: string;
}

function TypeBadge({ type }: { type: string }) {
  return type === 'MULTI_SUITE'
    ? <span className="badge bg-purple-100 text-purple-700">Multiple Suites</span>
    : <span className="badge bg-blue-100 text-blue-700">Single Repository</span>;
}

export default function ProjectList() {
  useTitle('Projects');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get('/projects').then((r) => { setProjects(r.data); setLoading(false); });
  }, []);

  const canCreate = ['ADMIN', 'QA', 'PO'].includes(user?.role ?? '');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
          <p className="text-gray-500 text-sm mt-0.5">Select a project to manage its test cases, suites, plans and runs</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => navigate('/projects/new')}>+ New Project</button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">📁</p>
          <p className="text-lg font-medium text-gray-700">No projects yet</p>
          <p className="text-gray-400 text-sm mt-1 mb-4">Create your first project to start organising test cases</p>
          {canCreate && (
            <button className="btn-primary" onClick={() => navigate('/projects/new')}>Create Project</button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`}
              className="card p-5 hover:shadow-md hover:border-blue-300 transition-all group">
              <div className="flex items-start justify-between mb-3">
                <div className="text-2xl">{p.type === 'MULTI_SUITE' ? '📂' : '📁'}</div>
                <TypeBadge type={p.type} />
              </div>
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors text-lg">
                {p.name}
              </h3>
              {p.description && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.description}</p>
              )}
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100 text-xs text-gray-400">
                <span>{p._count.testCases} cases</span>
                <span>{p._count.suites} suites</span>
                <span>{p._count.plans} plans</span>
                <span className="ml-auto">{new Date(p.updatedAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
