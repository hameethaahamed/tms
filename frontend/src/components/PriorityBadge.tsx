const PRIORITY_STYLES: Record<string, string> = {
  LOW:      'bg-gray-100 text-gray-600',
  MEDIUM:   'bg-blue-100 text-blue-700',
  HIGH:     'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
};

export default function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`badge ${PRIORITY_STYLES[priority] ?? 'bg-gray-100 text-gray-600'}`}>
      {priority}
    </span>
  );
}
