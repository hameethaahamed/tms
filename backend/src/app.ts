import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import testCaseRoutes from './routes/testCases';
import testSuiteRoutes from './routes/testSuites';
import testPlanRoutes from './routes/testPlans';
import testRunRoutes from './routes/testRuns';
import userRoutes from './routes/users';
import projectRoutes from './routes/projects';
import sectionRoutes from './routes/sections';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/test-cases', testCaseRoutes);
// Sections are nested under test-suites: /api/test-suites/:suiteId/sections
app.use('/api/test-suites/:suiteId/sections', sectionRoutes);
app.use('/api/test-suites', testSuiteRoutes);
app.use('/api/test-plans', testPlanRoutes);
app.use('/api/test-runs', testRunRoutes);
app.use('/api/users', userRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

export default app;
