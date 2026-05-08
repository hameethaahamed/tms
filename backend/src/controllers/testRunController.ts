import { Response } from 'express';
import prisma from '../db';
import { AuthRequest } from '../middleware/auth';

export async function listRuns(req: AuthRequest, res: Response) {
  const { projectId } = req.query as { projectId?: string };
  const runs = await prisma.testRun.findMany({
    where: projectId ? { plan: { projectId } } : undefined,
    include: {
      plan: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      _count: { select: { results: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(runs);
}

export async function createRun(req: AuthRequest, res: Response) {
  const { name, planId, suiteId, testCaseIds, assignedToId } = req.body;

  if (!planId) { res.status(400).json({ error: 'planId is required' }); return; }

  // Determine which test case IDs to seed into the run
  let caseIdList: string[] = [];

  if (Array.isArray(testCaseIds) && testCaseIds.length > 0) {
    // Caller passed an explicit selection
    caseIdList = testCaseIds;
  } else if (suiteId) {
    // No explicit selection — use every case in the chosen suite
    const suite = await prisma.testSuite.findUnique({
      where: { id: suiteId },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!suite) { res.status(404).json({ error: 'Suite not found' }); return; }
    caseIdList = suite.items.map((i) => i.testCaseId);
  } else {
    // Legacy fallback — all cases from all suites in the plan
    const plan = await prisma.testPlan.findUnique({
      where: { id: planId },
      include: { suites: { include: { suite: { include: { items: true } } } } },
    });
    if (!plan) { res.status(404).json({ error: 'Plan not found' }); return; }
    const ids = new Set<string>();
    for (const ps of plan.suites) for (const item of ps.suite.items) ids.add(item.testCaseId);
    caseIdList = Array.from(ids);
  }

  if (caseIdList.length === 0) {
    res.status(400).json({ error: 'No test cases to include in the run' }); return;
  }

  const run = await prisma.testRun.create({
    data: {
      name,
      planId,
      assignedToId: assignedToId || req.user!.id,
      results: {
        create: caseIdList.map((tcId) => ({ testCaseId: tcId })),
      },
    },
    include: {
      plan: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      results: {
        include: {
          testCase: { select: { id: true, title: true, priority: true } },
        },
      },
    },
  });
  res.status(201).json(run);
}

export async function getRun(req: AuthRequest, res: Response) {
  const run = await prisma.testRun.findUnique({
    where: { id: req.params.id },
    include: {
      plan: {
        select: {
          id: true, name: true,
          suites: {
            include: {
              suite: {
                include: {
                  items: {
                    orderBy: { order: 'asc' },
                    include: {
                      testCase: { select: { id: true, title: true, priority: true, status: true } },
                    },
                  },
                  _count: { select: { items: true } },
                },
              },
            },
          },
        },
      },
      assignedTo: { select: { id: true, name: true } },
      results: {
        include: {
          testCase: { select: { id: true, title: true, priority: true, steps: true, expectedResult: true } },
        },
      },
    },
  });
  if (!run) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(run);
}

export async function addCasesToRun(req: AuthRequest, res: Response) {
  const runId = req.params.id;
  const { suiteId, testCaseIds } = req.body;

  // Cases already in the run
  const existing = await prisma.testRunResult.findMany({
    where: { runId },
    select: { testCaseId: true },
  });
  const existingIds = new Set(existing.map((r) => r.testCaseId));

  let toAdd: string[] = [];
  if (Array.isArray(testCaseIds) && testCaseIds.length > 0) {
    toAdd = testCaseIds.filter((id: string) => !existingIds.has(id));
  } else if (suiteId) {
    const suite = await prisma.testSuite.findUnique({
      where: { id: suiteId },
      include: { items: { orderBy: { order: 'asc' } } },
    });
    if (!suite) { res.status(404).json({ error: 'Suite not found' }); return; }
    toAdd = suite.items.map((i) => i.testCaseId).filter((id) => !existingIds.has(id));
  }

  if (toAdd.length === 0) {
    res.status(200).json({ added: 0 }); return;
  }

  await prisma.testRunResult.createMany({
    data: toAdd.map((testCaseId) => ({ runId, testCaseId })),
  });

  // Return the refreshed run
  const run = await prisma.testRun.findUnique({
    where: { id: runId },
    include: {
      plan: {
        select: {
          id: true, name: true,
          suites: {
            include: {
              suite: {
                include: {
                  items: { orderBy: { order: 'asc' }, include: { testCase: { select: { id: true, title: true, priority: true, status: true } } } },
                  _count: { select: { items: true } },
                },
              },
            },
          },
        },
      },
      assignedTo: { select: { id: true, name: true } },
      results: {
        include: {
          testCase: { select: { id: true, title: true, priority: true, steps: true, expectedResult: true } },
        },
      },
    },
  });
  res.json(run);
}

export async function updateResult(req: AuthRequest, res: Response) {
  const { status, comment } = req.body;
  const result = await prisma.testRunResult.update({
    where: { id: req.params.resultId },
    data: {
      status,
      comment,
      executedAt: new Date(),
    },
    include: {
      testCase: { select: { id: true, title: true, priority: true } },
    },
  });

  await prisma.testRun.update({
    where: { id: req.params.id },
    data: { status: 'IN_PROGRESS' },
  });

  res.json(result);
}

export async function completeRun(req: AuthRequest, res: Response) {
  const run = await prisma.testRun.update({
    where: { id: req.params.id },
    data: { status: 'COMPLETED' },
    include: {
      results: true,
      plan: { select: { id: true, name: true } },
    },
  });
  res.json(run);
}
