const STATUS_STYLES: Record<string, string> = {
  DRAFT:        'bg-gray-100 text-gray-700',
  READY:        'bg-blue-100 text-blue-800',
  REVIEW:       'bg-yellow-100 text-yellow-800',
  APPROVED:     'bg-green-100 text-green-800',
  REJECTED:     'bg-red-100 text-red-800',
  // Legacy
  QA_REVIEW:    'bg-yellow-100 text-yellow-800',
  QA_APPROVED:  'bg-blue-100 text-blue-800',
  QA_REJECTED:  'bg-red-100 text-red-800',
  PO_REVIEW:    'bg-purple-100 text-purple-800',
  PO_REJECTED:  'bg-red-100 text-red-800',
  // Run statuses
  NOT_STARTED:  'bg-gray-100 text-gray-700',
  IN_PROGRESS:  'bg-blue-100 text-blue-800',
  COMPLETED:    'bg-green-100 text-green-800',
  ABORTED:      'bg-red-100 text-red-800',
  PENDING:      'bg-gray-100 text-gray-600',
  PASS:         'bg-green-100 text-green-800',
  FAIL:         'bg-red-100 text-red-800',
  BLOCKED:      'bg-orange-100 text-orange-800',
  SKIP:         'bg-gray-100 text-gray-500',
  ACTIVE:       'bg-green-100 text-green-800',
};

const STATUS_LABELS: Record<string, string> = {
  REVIEW:       'In Review',
  QA_REVIEW:    'QA Review',
  QA_APPROVED:  'QA Approved',
  QA_REJECTED:  'QA Rejected',
  PO_REVIEW:    'PO Review',
  PO_REJECTED:  'PO Rejected',
  NOT_STARTED:  'Not Started',
  IN_PROGRESS:  'In Progress',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {STATUS_LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
