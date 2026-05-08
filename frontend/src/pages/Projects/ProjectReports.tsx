import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import client from '../../api/client';
import { useProject } from '../../contexts/ProjectContext';

interface GroupCount { _count: { id: number } }
interface CaseByStatus  extends GroupCount { status: string }
interface RunByStatus   extends GroupCount { status: string }
interface CaseByPriority extends GroupCount { priority: string }

interface ReportData {
  casesByStatus: CaseByStatus[];
  runsByStatus: RunByStatus[];
  casesByPriority: CaseByPriority[];
}

const STATUS_META: Record<string, { label: string; color: string; bar: string }> = {
  DRAFT:       { label: 'Draft',        color: 'text-gray-600',   bar: 'bg-gray-300' },
  READY:       { label: 'Ready',        color: 'text-blue-600',   bar: 'bg-blue-300' },
  REVIEW:      { label: 'In Review',    color: 'text-yellow-600', bar: 'bg-yellow-400' },
  APPROVED:    { label: 'Approved',     color: 'text-green-600',  bar: 'bg-green-500' },
  REJECTED:    { label: 'Rejected',     color: 'text-red-600',    bar: 'bg-red-400' },
  QA_REVIEW:   { label: 'QA Review',    color: 'text-orange-600', bar: 'bg-orange-400' },
  QA_APPROVED: { label: 'QA Approved',  color: 'text-blue-600',   bar: 'bg-blue-400' },
  QA_REJECTED: { label: 'QA Rejected',  color: 'text-red-600',    bar: 'bg-red-400' },
  PO_REJECTED: { label: 'PO Rejected',  color: 'text-red-600',    bar: 'bg-red-400' },
  NOT_STARTED: { label: 'Not Started',  color: 'text-gray-500',   bar: 'bg-gray-300' },
  IN_PROGRESS: { label: 'In Progress',  color: 'text-blue-600',   bar: 'bg-blue-400' },
  COMPLETED:   { label: 'Completed',    color: 'text-green-600',  bar: 'bg-green-500' },
};

const PRIORITY_META: Record<string, { label: string; color: string; bar: string }> = {
  LOW:      { label: 'Low',      color: 'text-gray-500',   bar: 'bg-gray-300' },
  MEDIUM:   { label: 'Medium',   color: 'text-yellow-600', bar: 'bg-yellow-400' },
  HIGH:     { label: 'High',     color: 'text-orange-600', bar: 'bg-orange-400' },
  CRITICAL: { label: 'Critical', color: 'text-red-600',    bar: 'bg-red-500' },
};

function BarChart({
  rows,
  meta,
  keyField,
}: {
  rows: GroupCount[];
  meta: Record<string, { label: string; color: string; bar: string }>;
  keyField: string;
}) {
  const total = rows.reduce((s, r) => s + r._count.id, 0);
  if (total === 0) return <p className="text-sm text-gray-400 py-4 text-center">No data yet.</p>;

  return (
    <div className="space-y-2.5">
      {rows
        .sort((a, b) => b._count.id - a._count.id)
        .map((row) => {
          const key = (row as unknown as Record<string, string>)[keyField];
          const m = meta[key] ?? { label: key, color: 'text-gray-600', bar: 'bg-gray-300' };
          const pct = Math.round((row._count.id / total) * 100);
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-sm font-medium ${m.color}`}>{m.label}</span>
                <span className="text-sm text-gray-500">{row._count.id} <span className="text-gray-300">({pct}%)</span></span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
    </div>
  );
}

export default function ProjectReports() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project } = useProject();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.get(`/projects/${projectId}/reports`)
      .then((r) => setData(r.data))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (!data) return null;

  const totalCases = data.casesByStatus.reduce((s, r) => s + r._count.id, 0);
  const totalRuns  = data.runsByStatus.reduce((s, r) => s + r._count.id, 0);
  const approvedCases = data.casesByStatus.find((r) => r.status === 'APPROVED')?._count.id ?? 0;
  const completedRuns = data.runsByStatus.find((r) => r.status === 'COMPLETED')?._count.id ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Reports</h2>
        {project && <p className="text-sm text-gray-500 mt-0.5">{project.name}</p>}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Test Cases', value: totalCases,   color: 'text-blue-600',   bg: 'bg-blue-50' },
          { label: 'Approved Cases',   value: approvedCases, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Total Runs',       value: totalRuns,    color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Completed Runs',   value: completedRuns, color: 'text-teal-600',  bg: 'bg-teal-50' },
        ].map((s) => (
          <div key={s.label} className={`card p-4 ${s.bg}`}>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-5 mb-5">
        {/* Test Case Status */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Test Case Status</h3>
          <BarChart
            rows={data.casesByStatus}
            meta={STATUS_META}
            keyField="status"
          />
        </div>

        {/* Test Run Status */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Test Run Status</h3>
          <BarChart
            rows={data.runsByStatus}
            meta={STATUS_META}
            keyField="status"
          />
        </div>
      </div>

      {/* Priority distribution */}
      <div className="card p-5 max-w-lg">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Test Case Priority</h3>
        <BarChart
          rows={data.casesByPriority}
          meta={PRIORITY_META}
          keyField="priority"
        />
      </div>
    </div>
  );
}
