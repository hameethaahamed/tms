import { Router } from 'express';
import {
  listRuns, createRun, getRun, addCasesToRun, updateResult, completeRun,
} from '../controllers/testRunController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', listRuns);
router.post('/', requireRole('ADMIN', 'QA'), createRun);
router.get('/:id', getRun);
router.post('/:id/cases', requireRole('ADMIN', 'QA'), addCasesToRun);
router.put('/:id/results/:resultId', requireRole('ADMIN', 'QA'), updateResult);
router.post('/:id/complete', requireRole('ADMIN', 'QA'), completeRun);

export default router;
