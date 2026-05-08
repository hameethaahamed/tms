import { useEffect, useState } from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';

interface ProjectStub { id: string; name: string; type: string }

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  QA:    'bg-blue-100 text-blue-700',
  PO:    'bg-green-100 text-green-700',
  DEV:   'bg-gray-100 text-gray-700',
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectStub[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    client.get('/projects').then((r) => setProjects(r.data));
  }, []);

  function handleProjectsClick() {
    setDropdownOpen((v) => !v);
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-blue-600">TestMan</h1>
          <p className="text-xs text-gray-400 mt-0.5">Test Management</p>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {/* Dashboard */}
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
              }`
            }
          >
            <span className="text-base leading-none">▦</span>
            Dashboard
          </NavLink>

          {/* Projects — dropdown */}
          <div className="relative">
            <button
              onClick={handleProjectsClick}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-gray-600 hover:bg-gray-100"
            >
              <div className="flex items-center gap-3">
                <span className="text-base leading-none">📁</span>
                <span>Projects</span>
              </div>
              <span className="text-gray-400 text-xs shrink-0">{dropdownOpen ? '▴' : '▾'}</span>
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
                  {projects.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">No projects yet.</p>
                  )}
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { navigate(`/projects/${p.id}`); setDropdownOpen(false); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <span>{p.type === 'MULTI_SUITE' ? '📂' : '📁'}</span>
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                  <div className="border-t border-gray-100 p-1">
                    <Link
                      to="/projects"
                      onClick={() => setDropdownOpen(false)}
                      className="block px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      View all projects →
                    </Link>
                    {['ADMIN', 'QA', 'PO'].includes(user?.role ?? '') && (
                      <Link
                        to="/projects/new"
                        onClick={() => setDropdownOpen(false)}
                        className="block px-3 py-1.5 text-xs text-green-600 hover:bg-green-50 rounded transition-colors"
                      >
                        + New Project
                      </Link>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </nav>

        <div className="px-4 py-3 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium">
              {user?.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{user?.name}</p>
              <span className={`badge text-xs ${ROLE_COLORS[user?.role ?? ''] ?? 'bg-gray-100 text-gray-700'}`}>
                {user?.role}
              </span>
            </div>
          </div>
          <button onClick={() => { logout(); navigate('/login'); }} className="w-full text-left text-xs text-gray-500 hover:text-red-600 transition-colors">
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
