import { Response } from 'express';
import prisma from '../db';
import { AuthRequest } from '../middleware/auth';

const projectInclude = {
  _count: { select: { suites: true, plans: true, testCases: true } },
};

export async function listProjects(_req: AuthRequest, res: Response) {
  const projects = await prisma.project.findMany({
    include: projectInclude,
    orderBy: { updatedAt: 'desc' },
  });
  res.json(projects);
}

export async function createProject(req: AuthRequest, res: Response) {
  const { name, description, type } = req.body;
  const projectType: string = type === 'MULTI_SUITE' ? 'MULTI_SUITE' : 'SINGLE_REPO';

  const project = await prisma.project.create({
    data: {
      name,
      description,
      type: projectType,
      // Auto-create the default suite for SINGLE_REPO projects
      suites: projectType === 'SINGLE_REPO' ? {
        create: {
          name: 'Test Repository',
          description: 'Default test repository',
          isDefault: true,
        },
      } : undefined,
    },
    include: {
      ...projectInclude,
      suites: {
        where: { isDefault: true },
        select: { id: true, name: true },
      },
    },
  });

  res.status(201).json(project);
}

export async function getProject(req: AuthRequest, res: Response) {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      _count: { select: { suites: true, plans: true, testCases: true } },
      suites: {
        include: {
          sections: {
            where: { parentId: null },
            include: {
              children: {
                include: {
                  children: true,
                  _count: { select: { testCases: true } },
                },
                orderBy: { order: 'asc' },
              },
              _count: { select: { testCases: true } },
            },
            orderBy: { order: 'asc' },
          },
          _count: { select: { items: true, sections: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      plans: {
        select: { id: true, name: true, status: true, environment: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!project) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(project);
}

export async function updateProject(req: AuthRequest, res: Response) {
  const { name, description } = req.body;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: { name, description },
    include: projectInclude,
  });
  res.json(project);
}

export async function deleteProject(req: AuthRequest, res: Response) {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

export async function getDashboardStats(req: AuthRequest, res: Response) {
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const projects = await prisma.project.findMany({
    include: {
      _count: { select: { suites: true, plans: true, testCases: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const projectIds = projects.map((p) => p.id);

  const todoStatuses = userRole === 'QA' || userRole === 'PO' || userRole === 'ADMIN'
    ? ['REVIEW']
    : [] as string[];

  const caseActivitySelect = {
    id: true, title: true, status: true, priority: true,
    projectId: true, updatedAt: true,
    project: { select: { name: true } },
  } as const;

  const runActivitySelect = {
    id: true, name: true, status: true, updatedAt: true,
    plan: { select: { projectId: true, project: { select: { id: true, name: true } } } },
  } as const;

  const [pendingCounts, activeRunCounts, todosCases, todosRuns, recentCases, recentRuns] =
    await Promise.all([
      prisma.testCase.groupBy({
        by: ['projectId'],
        where: { projectId: { in: projectIds }, status: { in: ['REVIEW', 'READY'] }, markedForDeletion: false },
        _count: { id: true },
      }),
      prisma.testRun.groupBy({
        by: ['planId'],
        where: { status: 'IN_PROGRESS', plan: { projectId: { in: projectIds } } },
        _count: { id: true },
      }),
      // Pending review cases (by role) or rejected cases DEV created
      userRole === 'DEV'
        ? prisma.testCase.findMany({
            where: { createdById: userId, status: 'REJECTED', markedForDeletion: false },
            select: caseActivitySelect,
            orderBy: { updatedAt: 'desc' },
            take: 10,
          })
        : todoStatuses.length > 0
          ? prisma.testCase.findMany({
              where: { status: { in: todoStatuses } },
              select: caseActivitySelect,
              orderBy: { updatedAt: 'desc' },
              take: 10,
            })
          : Promise.resolve([]),
      // Active runs assigned to the current user
      prisma.testRun.findMany({
        where: { assignedToId: userId, status: 'IN_PROGRESS' },
        select: runActivitySelect,
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      // Recent test case activity
      prisma.testCase.findMany({
        select: caseActivitySelect,
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      // Recent test run activity
      prisma.testRun.findMany({
        select: runActivitySelect,
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
    ]);

  const planToProject = await prisma.testPlan.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true, projectId: true },
  });
  const planProjectMap = new Map(planToProject.map((p) => [p.id, p.projectId]));

  const activeRunsByProject = new Map<string, number>();
  for (const row of activeRunCounts) {
    const projId = planProjectMap.get(row.planId);
    if (projId) activeRunsByProject.set(projId, (activeRunsByProject.get(projId) ?? 0) + row._count.id);
  }

  const pendingByProject = new Map(pendingCounts.map((r) => [r.projectId, r._count.id]));

  const enriched = projects.map((p) => ({
    ...p,
    pendingReview: pendingByProject.get(p.id) ?? 0,
    activeRuns: activeRunsByProject.get(p.id) ?? 0,
  }));

  const totals = {
    projects: projects.length,
    testCases: projects.reduce((s, p) => s + p._count.testCases, 0),
    plans: projects.reduce((s, p) => s + p._count.plans, 0),
    activeRuns: [...activeRunsByProject.values()].reduce((s, v) => s + v, 0),
    pendingReview: [...pendingByProject.values()].reduce((s, v) => s + v, 0),
  };

  const todos = [
    ...todosCases.map((tc) => ({
      type: 'test_case' as const,
      id: tc.id,
      title: tc.title,
      status: tc.status,
      priority: tc.priority,
      projectId: tc.projectId,
      projectName: tc.project?.name ?? null,
      updatedAt: tc.updatedAt,
    })),
    ...todosRuns.map((r) => ({
      type: 'test_run' as const,
      id: r.id,
      title: r.name,
      status: r.status,
      priority: null as string | null,
      projectId: r.plan.projectId ?? null,
      projectName: r.plan.project?.name ?? null,
      updatedAt: r.updatedAt,
    })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const recentActivity = [
    ...recentCases.map((tc) => ({
      type: 'test_case' as const,
      id: tc.id,
      title: tc.title,
      status: tc.status,
      projectId: tc.projectId,
      projectName: tc.project?.name ?? null,
      timestamp: tc.updatedAt,
    })),
    ...recentRuns.map((r) => ({
      type: 'test_run' as const,
      id: r.id,
      title: r.name,
      status: r.status,
      projectId: r.plan.projectId ?? null,
      projectName: r.plan.project?.name ?? null,
      timestamp: r.updatedAt,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  res.json({ projects: enriched, totals, todos, recentActivity });
}

export async function getProjectTodos(req: AuthRequest, res: Response) {
  const projectId = req.params.id;
  const userId = req.user!.id;
  const userRole = req.user!.role;

  const reviewStatuses =
    ['QA', 'PO', 'ADMIN'].includes(userRole) ? ['REVIEW'] : [] as string[];

  const caseSelect = {
    id: true, title: true, status: true, priority: true, updatedAt: true,
    section: { select: { name: true } },
    createdBy: { select: { name: true } },
  } as const;

  const [reviewCases, rejectedCases, activeRuns] = await Promise.all([
    reviewStatuses.length > 0
      ? prisma.testCase.findMany({
          where: { projectId, status: { in: reviewStatuses }, markedForDeletion: false },
          select: caseSelect,
          orderBy: { updatedAt: 'desc' },
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof prisma.testCase.findMany<{ select: typeof caseSelect }>>>),
    userRole === 'DEV'
      ? prisma.testCase.findMany({
          where: { projectId, createdById: userId, status: 'REJECTED', markedForDeletion: false },
          select: caseSelect,
          orderBy: { updatedAt: 'desc' },
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof prisma.testCase.findMany<{ select: typeof caseSelect }>>>),
    prisma.testRun.findMany({
      where: { status: 'IN_PROGRESS', plan: { projectId } },
      select: {
        id: true, name: true, status: true, updatedAt: true,
        assignedTo: { select: { name: true } },
        _count: { select: { results: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  res.json({ reviewCases, rejectedCases, activeRuns });
}

export async function getProjectReports(req: AuthRequest, res: Response) {
  const projectId = req.params.id;

  const [casesByStatus, runsByStatus, casesByPriority] = await Promise.all([
    prisma.testCase.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { id: true },
    }),
    prisma.testRun.groupBy({
      by: ['status'],
      where: { plan: { projectId } },
      _count: { id: true },
    }),
    prisma.testCase.groupBy({
      by: ['priority'],
      where: { projectId },
      _count: { id: true },
    }),
  ]);

  res.json({ casesByStatus, runsByStatus, casesByPriority });
}

export async function getProjectCases(req: AuthRequest, res: Response) {
  const { sectionId, status, priority } = req.query;
  const cases = await prisma.testCase.findMany({
    where: {
      projectId: req.params.id,
      ...(sectionId ? { sectionId: String(sectionId) } : {}),
      ...(status ? { status: String(status) } : {}),
      ...(priority ? { priority: String(priority) } : {}),
    },
    select: {
      id: true, seqId: true, title: true, status: true, priority: true,
      category: true, sectionId: true, updatedAt: true,
      section: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(cases);
}
