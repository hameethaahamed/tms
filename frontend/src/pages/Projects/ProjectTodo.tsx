import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';

interface TodoCase {
  id: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string;
  section: { name: string } | null;
  createdBy: { name: string };
}

interface ActiveRun {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  assignedTo: { name: string } | null;
  _count: { results: number };
}

interface TodoData {
  reviewCases: TodoCase[];
  rejectedCases: TodoCase[];
  activeRuns: ActiveRun[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const REVIEW_LABEL: Record<string, string> = {
  REVIEW:      'Awaiting Review',
  READY:       'Ready for Review',
  QA_REVIEW:   'Awaiting QA Review',
  QA_APPROVED: 'Awaiting PO Review',
};

export default function ProjectTodo() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const [data, setData] = useState<TodoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get(`/projects/${projectId}/todos`)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (!data) return null;

  const { reviewCases, rejectedCases, activeRuns } = data;
  const totalItems = reviewCases.length + rejectedCases.length + activeRuns.length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Todo</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {totalItems === 0
            ? 'Nothing to action — you\'re all caught up.'
            : `${totalItems} item${totalItems !== 1 ? 's' : ''} need${totalItems === 1 ? 's' : ''} your attention`}
        </p>
      </div>

      {totalItems === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-gray-500 font-medium">All caught up!</p>
          <p className="text-sm text-gray-400 mt-1">No pending reviews or active runs assigned to you.</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Cases pending review */}
          {reviewCases.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Pending Review ({reviewCases.length})
              </h3>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Test Case</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Section</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Priority</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Stage</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {reviewCases.map((tc) => (
                      <tr key={tc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <Link
                            to={`/projects/${projectId}/test-cases/${tc.id}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {tc.title}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400">{tc.section?.name ?? '—'}</td>
                        <td className="px-4 py-2.5"><PriorityBadge priority={tc.priority} /></td>
                        <td className="px-4 py-2.5">
                          <span className="badge bg-orange-100 text-orange-700 text-xs">
                            {REVIEW_LABEL[tc.status] ?? tc.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{timeAgo(tc.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Rejected cases needing rework (DEV view) */}
          {rejectedCases.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Needs Rework ({rejectedCases.length})
              </h3>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Test Case</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Section</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Priority</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rejectedCases.map((tc) => (
                      <tr key={tc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <Link
                            to={`/projects/${projectId}/test-cases/${tc.id}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {tc.title}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400">{tc.section?.name ?? '—'}</td>
                        <td className="px-4 py-2.5"><PriorityBadge priority={tc.priority} /></td>
                        <td className="px-4 py-2.5"><StatusBadge status={tc.status} /></td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{timeAgo(tc.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Active test runs */}
          {activeRuns.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Active Test Runs ({activeRuns.length})
              </h3>
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Run Name</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Assigned To</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Cases</th>
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {activeRuns.map((run) => (
                      <tr key={run.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <Link
                            to={`/projects/${projectId}/test-runs/${run.id}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {run.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {run.assignedTo?.name ?? (
                            <span className="text-gray-300">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{run._count.results}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{timeAgo(run.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}
