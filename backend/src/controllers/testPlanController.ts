import { Response } from 'express';
import prisma from '../db';
import { AuthRequest } from '../middleware/auth';

const planInclude = {
  suites: {
    include: {
      suite: {
        include: {
          items: {
            orderBy: { order: 'asc' as const },
            include: {
              testCase: { select: { id: true, title: true, priority: true, status: true } },
            },
          },
          _count: { select: { items: true } },
        },
      },
    },
  },
  _count: { select: { runs: true } },
};

export async function listPlans(req: AuthRequest, res: Response) {
  const { projectId } = req.query as { projectId?: string };
  const plans = await prisma.testPlan.findMany({
    where: projectId ? { projectId } : undefined,
    include: { _count: { select: { runs: true, suites: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(plans);
}

export async function createPlan(req: AuthRequest, res: Response) {
  const { name, description, environment, startDate, endDate, projectId } = req.body;
  const plan = await prisma.testPlan.create({
    data: {
      name, description, environment: environment || 'QA',
      projectId: projectId ?? null,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    },
    include: planInclude,
  });
  res.status(201).json(plan);
}

export async function getPlan(req: AuthRequest, res: Response) {
  const plan = await prisma.testPlan.findUnique({
    where: { id: req.params.id },
    include: planInclude,
  });
  if (!plan) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(plan);
}

export async function updatePlan(req: AuthRequest, res: Response) {
  const { name, description, environment, status, startDate, endDate } = req.body;
  const plan = await prisma.testPlan.update({
    where: { id: req.params.id },
    data: {
      name, description, environment, status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    },
    include: planInclude,
  });
  res.json(plan);
}

export async function addSuite(req: AuthRequest, res: Response) {
  const { suiteId } = req.body;
  try {
    await prisma.testPlanSuite.create({
      data: { planId: req.params.id, suiteId },
    });
    res.status(201).json({ message: 'Suite added to plan' });
  } catch {
    res.status(409).json({ error: 'Suite already in plan' });
  }
}

export async function removeSuite(req: AuthRequest, res: Response) {
  await prisma.testPlanSuite.deleteMany({
    where: { planId: req.params.id, suiteId: req.params.suiteId },
  });
  res.status(204).send();
}
