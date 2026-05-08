import { Router } from 'express';
import { listSections, createSection, updateSection, deleteSection } from '../controllers/sectionController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router({ mergeParams: true });
router.use(authenticate);

router.get('/', listSections);
router.post('/', requireRole('ADMIN', 'QA'), createSection);
router.put('/:sectionId', requireRole('ADMIN', 'QA'), updateSection);
router.delete('/:sectionId', requireRole('ADMIN', 'QA'), deleteSection);

export default router;
