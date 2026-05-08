import { Router } from 'express';
import {
  listSuites, createSuite, getSuite, updateSuite, addCase, removeCase,
} from '../controllers/testSuiteController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', listSuites);
router.post('/', requireRole('ADMIN', 'QA'), createSuite);
router.get('/:id', getSuite);
router.put('/:id', requireRole('ADMIN', 'QA'), updateSuite);
router.post('/:id/cases', requireRole('ADMIN', 'QA'), addCase);
router.delete('/:id/cases/:caseId', requireRole('ADMIN', 'QA'), removeCase);

export default router;
