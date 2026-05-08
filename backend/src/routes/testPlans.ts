import { Router } from 'express';
import {
  listPlans, createPlan, getPlan, updatePlan, addSuite, removeSuite,
} from '../controllers/testPlanController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', listPlans);
router.post('/', requireRole('ADMIN', 'QA', 'PO'), createPlan);
router.get('/:id', getPlan);
router.put('/:id', requireRole('ADMIN', 'QA', 'PO'), updatePlan);
router.post('/:id/suites', requireRole('ADMIN', 'QA', 'PO'), addSuite);
router.delete('/:id/suites/:suiteId', requireRole('ADMIN', 'QA', 'PO'), removeSuite);

export default router;
