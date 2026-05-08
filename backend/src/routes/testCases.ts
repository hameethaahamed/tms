import { Router } from 'express';
import {
  listTestCases, createTestCase, getTestCase,
  updateTestCase, transitionStatus,
  deleteTestCase, markForDeletion, copyTestCase, moveTestCase,
  bulkImportTestCases,
} from '../controllers/testCaseController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', listTestCases);
router.post('/', requireRole('ADMIN', 'QA'), createTestCase);
router.get('/:id', getTestCase);
router.put('/:id', requireRole('ADMIN', 'QA', 'PO'), updateTestCase);
router.delete('/:id', requireRole('ADMIN', 'QA'), deleteTestCase);
router.post('/:id/transition', requireRole('ADMIN', 'QA', 'PO'), transitionStatus);
router.post('/:id/mark-deletion', requireRole('ADMIN', 'QA'), markForDeletion);
router.post('/:id/copy', requireRole('ADMIN', 'QA'), copyTestCase);
router.post('/:id/move', requireRole('ADMIN', 'QA'), moveTestCase);
router.post('/bulk-import', requireRole('ADMIN', 'QA'), bulkImportTestCases);

export default router;
