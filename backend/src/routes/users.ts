import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import prisma from '../db';

const router = Router();

router.get('/', authenticate, requireRole('ADMIN'), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(users);
});

router.get('/all', authenticate, async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  });
  res.json(users);
});

export default router;
