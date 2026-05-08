import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import ProjectLayout from './components/ProjectLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProjectList from './pages/Projects/ProjectList';
import ProjectForm from './pages/Projects/ProjectForm';
import ProjectOverview from './pages/Projects/ProjectOverview';
import ProjectTodo from './pages/Projects/ProjectTodo';
import ProjectReports from './pages/Projects/ProjectReports';
import TestCaseList from './pages/TestCases/TestCaseList';
import TestCaseForm from './pages/TestCases/TestCaseForm';
import TestCaseDetail from './pages/TestCases/TestCaseDetail';
import TestSuiteList from './pages/TestSuites/TestSuiteList';
import TestSuiteDetail from './pages/TestSuites/TestSuiteDetail';
import TestPlanList from './pages/TestPlans/TestPlanList';
import TestPlanDetail from './pages/TestPlans/TestPlanDetail';
import TestRunList from './pages/TestRuns/TestRunList';
import TestRunExecution from './pages/TestRuns/TestRunExecution';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen text-gray-500">Loading…</div>;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      {/* ── Global shell (Dashboard + Projects list) ─────────────────── */}
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<ProjectList />} />
        <Route path="projects/new" element={<ProjectForm />} />
      </Route>

      {/* ── Project-scoped shell ──────────────────────────────────────── */}
      <Route
        path="/projects/:projectId"
        element={<PrivateRoute><ProjectLayout /></PrivateRoute>}
      >
        <Route index element={<ProjectOverview />} />
        <Route path="edit" element={<ProjectForm />} />

        <Route path="test-cases" element={<TestCaseList />} />
        <Route path="test-cases/new" element={<TestCaseForm />} />
        <Route path="test-cases/:id" element={<TestCaseDetail />} />
        <Route path="test-cases/:id/edit" element={<TestCaseForm />} />

        <Route path="test-suites" element={<TestSuiteList />} />
        <Route path="test-suites/:suiteId" element={<TestSuiteDetail />} />

        <Route path="test-plans" element={<TestPlanList />} />
        <Route path="test-plans/:planId" element={<TestPlanDetail />} />

        <Route path="test-runs" element={<TestRunList />} />
        <Route path="test-runs/:runId" element={<TestRunExecution />} />

        <Route path="todo" element={<ProjectTodo />} />
        <Route path="reports" element={<ProjectReports />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
