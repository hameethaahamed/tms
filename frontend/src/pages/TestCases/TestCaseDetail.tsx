import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import client from '../../api/client';
import StatusBadge from '../../components/StatusBadge';
import PriorityBadge from '../../components/PriorityBadge';
import { useAuth } from '../../contexts/AuthContext';

interface TestCase {
  id: string; seqId: number; title: string; description: string | null;
  steps: string; expectedResult: string; priority: string; status: string;
  template: string; testType: string; category: string | null; tags: string;
  references: string; markedForDeletion: boolean;
  qaComment: string | null; poComment: string | null; reviewComment: string | null;
  createdBy: { name: string }; assignedTo: { id: string; name: string } | null;
  reviewedBy: { name: string } | null;
  qaReviewedBy: { name: string } | null; poReviewedBy: { name: string } | null;
  section: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  createdAt: string; updatedAt: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  STEPS: 'Test Case (Steps)', TEXT: 'Test Case (Text)',
  EXPLORATORY: 'Exploratory Session', BDD: 'BDD',
};


function ConfirmModal({ title, message, onConfirm, onCancel }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-5">{message}</p>
        <div className="flex gap-3">
          <button onClick={onConfirm} className="btn-danger flex-1 justify-center">Delete</button>
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function TestCaseDetail() {
  const { projectId, id } = useParams<{ projectId: string; id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tc, setTc] = useState<TestCase | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const base = projectId ? `/projects/${projectId}` : '';

  async function load() {
    const { data } = await client.get(`/test-cases/${id}`);
    setTc(data);
  }

  useEffect(() => { load(); }, [id]);

  async function transition(status: string) {
    setBusy(true);
    await client.post(`/test-cases/${id}/transition`, { status, comment });
    setComment('');
    await load();
    setBusy(false);
  }

  async function handleDelete() {
    setBusy(true);
    await client.delete(`/test-cases/${id}`);
    navigate(`${base}/test-cases`);
  }

  async function handleMarkDeletion() {
    setBusy(true);
    await client.post(`/test-cases/${id}/mark-deletion`);
    await load();
    setBusy(false);
  }

  if (!tc) return <div className="p-8 text-gray-400">Loading…</div>;

  const steps: string[]    = JSON.parse(tc.steps);
  const tags: string[]     = JSON.parse(tc.tags);
  const refs: string[]     = JSON.parse(tc.references || '[]');

  const canEdit        = ['ADMIN', 'QA'].includes(user?.role ?? '');
  const canTransition  = ['ADMIN', 'QA', 'PO'].includes(user?.role ?? '');
  const canReview      = ['ADMIN', 'QA', 'PO'].includes(user?.role ?? '') && tc.status === 'REVIEW';
  const canDelete      = ['ADMIN', 'QA'].includes(user?.role ?? '');

  const isDraftOrRejected = ['DRAFT', 'REJECTED'].includes(tc.status);
  const canReady      = canTransition && tc.status === 'DRAFT';
  const canSendReview = canTransition && ['DRAFT', 'READY'].includes(tc.status);
  const canReset      = canTransition && tc.status === 'REJECTED';

  return (
    <div className="p-6 max-w-4xl mx-auto">

      {/* Marked for deletion banner */}
      {tc.markedForDeletion && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <span className="text-red-500">⚠</span>
          <p className="text-sm text-red-700 font-medium flex-1">This test case is marked for deletion</p>
          <button onClick={handleMarkDeletion} disabled={busy}
            className="text-xs text-red-600 hover:underline">Unmark</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1 min-w-0">
          <Link to={`${base}/test-cases`} className="text-sm text-gray-400 hover:text-blue-600 mb-1 inline-block">← Test Cases</Link>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-sm text-gray-400">TC-{String(tc.seqId).padStart(4, '0')}</span>
            <h2 className="text-2xl font-bold text-gray-900">{tc.title}</h2>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <StatusBadge status={tc.status} />
            <PriorityBadge priority={tc.priority} />
            <span className="badge bg-gray-100 text-gray-600 text-xs">{TEMPLATE_LABELS[tc.template] ?? tc.template}</span>
            <span className="badge bg-indigo-50 text-indigo-700 text-xs">{tc.testType.charAt(0) + tc.testType.slice(1).toLowerCase()}</span>
            {tc.category && <span className="badge bg-gray-100 text-gray-600">{tc.category}</span>}
            {tags.map((t) => <span key={t} className="badge bg-blue-50 text-blue-600">{t}</span>)}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 ml-4 justify-end">
          {canEdit && (
            <Link to={`${base}/test-cases/${tc.id}/edit`} className="btn-secondary text-xs">Edit</Link>
          )}
          {canDelete && !tc.markedForDeletion && (
            <button onClick={handleMarkDeletion} disabled={busy} className="btn-secondary text-xs text-orange-600 border-orange-300 hover:bg-orange-50">
              Mark for Deletion
            </button>
          )}
          {canDelete && (
            <button onClick={() => setShowDeleteConfirm(true)} disabled={busy} className="btn-danger text-xs">Delete</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          {tc.description && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{tc.description}</p>
            </div>
          )}

          {/* Steps / content */}
          {steps.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                {tc.template === 'BDD' ? 'Given / When / Then' :
                 tc.template === 'EXPLORATORY' ? 'Session Notes' :
                 tc.template === 'TEXT' ? 'Test Description' : 'Test Steps'}
              </h3>
              {tc.template === 'STEPS' || tc.template === 'BDD' ? (
                <ol className="space-y-2">
                  {steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-medium mt-0.5">{i + 1}</span>
                      <span className="text-gray-700">{step}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{steps[0]}</p>
              )}
            </div>
          )}

          <div className="card p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Expected Result</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{tc.expectedResult}</p>
          </div>

          {refs.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">References</h3>
              <ul className="space-y-1">
                {refs.map((ref, i) => (
                  <li key={i} className="text-sm text-blue-600">
                    {ref.startsWith('http') ? (
                      <a href={ref} target="_blank" rel="noreferrer" className="hover:underline">{ref}</a>
                    ) : <span className="text-gray-700">{ref}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Details */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              <div><dt className="text-gray-400">Created by</dt><dd className="font-medium">{tc.createdBy.name}</dd></div>
              {tc.assignedTo && <div><dt className="text-gray-400">Assigned to</dt><dd className="font-medium">{tc.assignedTo.name}</dd></div>}
              {tc.section && <div><dt className="text-gray-400">Section</dt><dd>{tc.section.name}</dd></div>}
              <div><dt className="text-gray-400">Created</dt><dd>{new Date(tc.createdAt).toLocaleDateString()}</dd></div>
              <div><dt className="text-gray-400">Updated</dt><dd>{new Date(tc.updatedAt).toLocaleDateString()}</dd></div>
            </dl>
          </div>

          {/* Workflow actions */}
          {canTransition && (isDraftOrRejected || canSendReview) && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Workflow</h3>
              <div className="flex flex-col gap-2">
                {canReady && (
                  <button className="btn-secondary text-xs justify-center" disabled={busy}
                    onClick={() => transition('READY')}>
                    Mark Ready
                  </button>
                )}
                {canSendReview && (
                  <button className="btn-primary text-xs justify-center" disabled={busy}
                    onClick={() => transition('REVIEW')}>
                    Send for Review
                  </button>
                )}
                {canReset && (
                  <button className="btn-secondary text-xs justify-center" disabled={busy}
                    onClick={() => transition('DRAFT')}>
                    Reset to Draft
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Review panel */}
          {canReview && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Review Decision</h3>
              <textarea className="input text-sm resize-none mb-3" rows={3}
                placeholder="Leave a comment (optional)…"
                value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex gap-2">
                <button className="btn-success flex-1 justify-center text-xs" disabled={busy}
                  onClick={() => transition('APPROVED')}>Approve</button>
                <button className="btn-danger flex-1 justify-center text-xs" disabled={busy}
                  onClick={() => transition('REJECTED')}>Reject</button>
              </div>
            </div>
          )}

          {/* Review result */}
          {tc.reviewComment && tc.reviewedBy && (
            <div className={`card p-4 ${tc.status === 'APPROVED' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <h3 className={`text-sm font-semibold mb-1 ${tc.status === 'APPROVED' ? 'text-green-800' : 'text-red-800'}`}>
                Review by {tc.reviewedBy.name}
              </h3>
              <p className={`text-sm mt-1 ${tc.status === 'APPROVED' ? 'text-green-900' : 'text-red-900'}`}>
                {tc.reviewComment}
              </p>
            </div>
          )}

          {/* Legacy QA/PO comments */}
          {(tc.qaComment || tc.qaReviewedBy) && (
            <div className="card p-4 border-yellow-200 bg-yellow-50">
              <h3 className="text-sm font-semibold text-yellow-800 mb-1">QA Review</h3>
              <p className="text-xs text-yellow-700">by {tc.qaReviewedBy?.name}</p>
              {tc.qaComment && <p className="text-sm text-yellow-900 mt-1">{tc.qaComment}</p>}
            </div>
          )}
          {(tc.poComment || tc.poReviewedBy) && (
            <div className="card p-4 border-purple-200 bg-purple-50">
              <h3 className="text-sm font-semibold text-purple-800 mb-1">PO Review</h3>
              <p className="text-xs text-purple-700">by {tc.poReviewedBy?.name}</p>
              {tc.poComment && <p className="text-sm text-purple-900 mt-1">{tc.poComment}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && tc && (
        <ConfirmModal
          title="Delete Test Case"
          message={`Are you sure you want to delete "${tc.title}"? This action cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

    </div>
  );
}
