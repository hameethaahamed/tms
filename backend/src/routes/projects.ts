import { Router } from 'express';
import {
  listProjects, createProject, getProject,
  updateProject, deleteProject, getProjectCases,
  getProjectTodos, getProjectReports,
  getDashboardStats,
} from '../controllers/projectController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/dashboard', getDashboardStats);
router.get('/', listProjects);
router.post('/', requireRole('ADMIN', 'QA', 'PO'), createProject);
router.get('/:id', getProject);
router.put('/:id', requireRole('ADMIN', 'QA', 'PO'), updateProject);
router.delete('/:id', requireRole('ADMIN'), deleteProject);
router.get('/:id/cases', getProjectCases);
router.get('/:id/todos', getProjectTodos);
router.get('/:id/reports', getProjectReports);

export default router;
