import { Response } from 'express';
import prisma from '../db';
import { AuthRequest } from '../middleware/auth';

const suiteInclude = {
  items: {
    orderBy: { order: 'asc' as const },
    include: {
      testCase: {
        select: {
          id: true, seqId: true, title: true, priority: true, status: true,
          category: true, tags: true, sectionId: true,
          section: { select: { id: true, name: true } },
        },
      },
    },
  },
  project: { select: { id: true, name: true, type: true } },
  _count: { select: { items: true } },
};

export async function listSuites(req: AuthRequest, res: Response) {
  const { projectId } = req.query as { projectId?: string };
  const suites = await prisma.testSuite.findMany({
    where: projectId ? { projectId } : undefined,
    include: {
      project: { select: { id: true, name: true, type: true } },
      _count: { select: { items: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(suites);
}

export async function createSuite(req: AuthRequest, res: Response) {
  const { name, description, projectId } = req.body;
  const suite = await prisma.testSuite.create({
    data: { name, description, projectId: projectId ?? null },
    include: suiteInclude,
  });
  res.status(201).json(suite);
}

export async function getSuite(req: AuthRequest, res: Response) {
  const suite = await prisma.testSuite.findUnique({
    where: { id: req.params.id },
    include: suiteInclude,
  });
  if (!suite) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(suite);
}

export async function updateSuite(req: AuthRequest, res: Response) {
  const { name, description } = req.body;
  const suite = await prisma.testSuite.update({
    where: { id: req.params.id },
    data: { name, description },
    include: suiteInclude,
  });
  res.json(suite);
}

export async function addCase(req: AuthRequest, res: Response) {
  const { testCaseId } = req.body;
  const count = await prisma.testSuiteItem.count({ where: { suiteId: req.params.id } });
  try {
    const item = await prisma.testSuiteItem.create({
      data: { suiteId: req.params.id, testCaseId, order: count },
    });
    res.status(201).json(item);
  } catch {
    res.status(409).json({ error: 'Test case already in suite' });
  }
}

export async function removeCase(req: AuthRequest, res: Response) {
  await prisma.testSuiteItem.deleteMany({
    where: { suiteId: req.params.id, testCaseId: req.params.caseId },
  });
  res.status(204).send();
}
