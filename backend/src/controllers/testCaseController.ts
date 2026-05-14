import { Response } from 'express';
import prisma from '../db';
import { AuthRequest } from '../middleware/auth';

const caseSelect = {
  id: true, seqId: true, title: true, description: true, steps: true, expectedResult: true,
  priority: true, status: true, template: true, testType: true, category: true, tags: true,
  references: true, markedForDeletion: true,
  qaComment: true, poComment: true, reviewComment: true,
  createdAt: true, updatedAt: true,
  projectId: true, sectionId: true,
  project: { select: { id: true, name: true } },
  section: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
  qaReviewedBy: { select: { id: true, name: true } },
  poReviewedBy: { select: { id: true, name: true } },
};

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT:    ['READY', 'REVIEW'],
  READY:    ['REVIEW', 'DRAFT'],
  REVIEW:   ['APPROVED', 'REJECTED'],
  REJECTED: ['DRAFT'],
  APPROVED: [],
};

export async function listTestCases(req: AuthRequest, res: Response) {
  const { status, priority, category, projectId, suiteId, showDeleted } = req.query;

  let sectionFilter: { sectionId: { in: string[] } } | undefined;
  if (suiteId) {
    const sections = await prisma.section.findMany({
      where: { suiteId: String(suiteId) },
      select: { id: true },
    });
    sectionFilter = { sectionId: { in: sections.map((s) => s.id) } };
  }

  const cases = await prisma.testCase.findMany({
    where: {
      ...(status ? { status: String(status) } : {}),
      ...(priority ? { priority: String(priority) } : {}),
      ...(category ? { category: String(category) } : {}),
      ...(projectId ? { projectId: String(projectId) } : {}),
      ...(sectionFilter ?? {}),
      ...(showDeleted === 'true' ? {} : { markedForDeletion: false }),
    },
    select: caseSelect,
    orderBy: { seqId: 'asc' },
  });
  res.json(cases);
}

export async function createTestCase(req: AuthRequest, res: Response) {
  const { title, description, steps, expectedResult, priority, template, testType,
          category, tags, references, projectId, sectionId, assignedToId } = req.body;
  const { _max } = await prisma.testCase.aggregate({ _max: { seqId: true } });
  const nextSeqId = (_max.seqId ?? 0) + 1;
  const tc = await prisma.testCase.create({
    data: {
      seqId: nextSeqId,
      title, description, expectedResult,
      steps: JSON.stringify(steps || []),
      tags: JSON.stringify(tags || []),
      references: JSON.stringify(references || []),
      priority: priority || 'MEDIUM',
      template: template || 'STEPS',
      testType: testType || 'FUNCTIONAL',
      category,
      projectId: projectId ?? null,
      sectionId: sectionId ?? null,
      assignedToId: assignedToId ?? null,
      createdById: req.user!.id,
    },
    select: caseSelect,
  });
  res.status(201).json(tc);
}

export async function getTestCase(req: AuthRequest, res: Response) {
  const tc = await prisma.testCase.findUnique({ where: { id: req.params.id }, select: caseSelect });
  if (!tc) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(tc);
}

export async function updateTestCase(req: AuthRequest, res: Response) {
  const tc = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!tc) { res.status(404).json({ error: 'Not found' }); return; }
  const { title, description, steps, expectedResult, priority, template, testType,
          category, tags, references, sectionId, assignedToId } = req.body;
  const updated = await prisma.testCase.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(expectedResult !== undefined ? { expectedResult } : {}),
      ...(steps ? { steps: JSON.stringify(steps) } : {}),
      ...(tags ? { tags: JSON.stringify(tags) } : {}),
      ...(references !== undefined ? { references: JSON.stringify(references || []) } : {}),
      ...(priority ? { priority } : {}),
      ...(template ? { template } : {}),
      ...(testType ? { testType } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(sectionId !== undefined ? { sectionId: sectionId ?? null } : {}),
      ...(assignedToId !== undefined ? { assignedToId: assignedToId ?? null } : {}),
    },
    select: caseSelect,
  });
  res.json(updated);
}

export async function transitionStatus(req: AuthRequest, res: Response) {
  const { status, comment } = req.body;
  const tc = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!tc) { res.status(404).json({ error: 'Not found' }); return; }
  const allowed = ALLOWED_TRANSITIONS[tc.status] ?? [];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: `Cannot transition from ${tc.status} to ${status}` });
    return;
  }
  const isReview = ['APPROVED', 'REJECTED'].includes(status);
  const updated = await prisma.testCase.update({
    where: { id: req.params.id },
    data: {
      status,
      ...(isReview ? {
        reviewedById: req.user!.id,
        reviewComment: comment || null,
      } : {}),
    },
    select: caseSelect,
  });
  res.json(updated);
}

export async function deleteTestCase(req: AuthRequest, res: Response) {
  const tc = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!tc) { res.status(404).json({ error: 'Not found' }); return; }
  await prisma.testCase.delete({ where: { id: req.params.id } });
  res.json({ success: true });
}

export async function markForDeletion(req: AuthRequest, res: Response) {
  const tc = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!tc) { res.status(404).json({ error: 'Not found' }); return; }
  const updated = await prisma.testCase.update({
    where: { id: req.params.id },
    data: { markedForDeletion: !tc.markedForDeletion },
    select: caseSelect,
  });
  res.json(updated);
}

export async function copyTestCase(req: AuthRequest, res: Response) {
  const { sectionId: targetSectionId, suiteId: targetSuiteId } = req.body;

  const [tc, suiteItems] = await Promise.all([
    prisma.testCase.findUnique({ where: { id: req.params.id } }),
    prisma.testSuiteItem.findMany({ where: { testCaseId: req.params.id }, select: { suiteId: true } }),
  ]);
  if (!tc) { res.status(404).json({ error: 'Not found' }); return; }

  const rows = await prisma.$queryRaw<Array<{ maxSeq: number | null }>>`SELECT MAX("seqId") as "maxSeq" FROM "TestCase"`;
  const nextSeqId = (Number(rows[0]?.maxSeq) || 0) + 1;

  const copy = await prisma.testCase.create({
    data: {
      seqId: nextSeqId,
      title: `${tc.title} (Copy)`,
      description: tc.description,
      steps: tc.steps,
      expectedResult: tc.expectedResult,
      priority: tc.priority,
      template: tc.template,
      testType: tc.testType,
      category: tc.category,
      tags: tc.tags,
      references: tc.references,
      status: 'DRAFT',
      projectId: tc.projectId,
      sectionId: targetSectionId !== undefined ? (targetSectionId || null) : tc.sectionId,
      assignedToId: tc.assignedToId,
      createdById: req.user!.id,
    },
    select: caseSelect,
  });

  const suitesToAdd: string[] = targetSuiteId
    ? [String(targetSuiteId)]
    : suiteItems.map((i) => i.suiteId);

  for (const sid of suitesToAdd) {
    await prisma.testSuiteItem.upsert({
      where: { suiteId_testCaseId: { suiteId: sid, testCaseId: copy.id } },
      update: {},
      create: { suiteId: sid, testCaseId: copy.id },
    });
  }

  res.status(201).json(copy);
}

export async function moveTestCase(req: AuthRequest, res: Response) {
  const { sectionId, suiteId } = req.body;
  const tc = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!tc) { res.status(404).json({ error: 'Not found' }); return; }

  const updated = await prisma.testCase.update({
    where: { id: req.params.id },
    data: { sectionId: sectionId ?? null },
    select: caseSelect,
  });

  // If a target suite is specified, update the suite item association
  if (suiteId) {
    // Remove from all other suites
    await prisma.testSuiteItem.deleteMany({ where: { testCaseId: req.params.id } });
    // Add to target suite
    await prisma.testSuiteItem.create({
      data: { suiteId, testCaseId: req.params.id },
    });
  }

  res.json(updated);
}

const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const VALID_TEMPLATES  = ['STEPS', 'TEXT', 'EXPLORATORY', 'BDD'];
const VALID_TYPES      = ['FUNCTIONAL', 'REGRESSION', 'PERFORMANCE', 'USABILITY', 'SECURITY', 'SMOKE', 'SANITY'];

export async function bulkImportTestCases(req: AuthRequest, res: Response) {
  const { projectId, suiteId, cases: rows } = req.body as {
    projectId?: string;
    suiteId?: string;
    cases: Array<{
      title: string;
      priority?: string; template?: string; testType?: string;
      category?: string; tags?: string[]; sectionId?: string | null;
      sectionPath?: string | null;
      description?: string; steps?: unknown[]; expectedResult?: string;
      references?: string[];
    }>;
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    res.status(400).json({ error: 'No rows provided' });
    return;
  }

  // Resolve which suite to use for section creation
  let resolvedSuiteId: string | null = suiteId ?? null;
  if (!resolvedSuiteId && projectId) {
    const firstSuite = await prisma.testSuite.findFirst({ where: { projectId }, select: { id: true } });
    resolvedSuiteId = firstSuite?.id ?? null;
  }

  // Cache: sectionPath (pipe-joined parts) → sectionId
  const sectionCache = new Map<string, string>();

  async function resolveOrCreateSection(pathParts: string[]): Promise<string | null> {
    if (!resolvedSuiteId || pathParts.length === 0) return null;
    let parentId: string | null = null;
    for (let depth = 0; depth < pathParts.length; depth++) {
      const name = pathParts[depth].trim();
      if (!name) continue;
      const cacheKey = pathParts.slice(0, depth + 1).join('|');
      if (sectionCache.has(cacheKey)) {
        parentId = sectionCache.get(cacheKey)!;
        continue;
      }
      let section: { id: string } | null = await prisma.section.findFirst({
        where: { suiteId: resolvedSuiteId, parentId: parentId ?? null, name },
        select: { id: true },
      });
      if (!section) {
        const count: number = await prisma.section.count({ where: { suiteId: resolvedSuiteId!, parentId: parentId ?? null } });
        const parentDepth: number = parentId
          ? ((await prisma.section.findUnique({ where: { id: parentId }, select: { depth: true } }))?.depth ?? 0)
          : -1;
        section = await prisma.section.create({
          data: { name, suiteId: resolvedSuiteId!, parentId: parentId ?? null, order: count, depth: parentDepth + 1 },
          select: { id: true },
        });
        createdSections++;
      }
      sectionCache.set(cacheKey, section.id);
      parentId = section.id;
    }
    return parentId;
  }

  let imported = 0;
  let createdSections = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.title?.trim()) { errors.push({ row: i + 1, error: 'Title is required' }); continue; }
    try {
      // Resolve sectionId: prefer pre-resolved, fall back to path-based creation
      let sectionId: string | null = row.sectionId || null;
      if (!sectionId && row.sectionPath) {
        const parts = row.sectionPath.split('>').map(s => s.trim()).filter(Boolean);
        sectionId = await resolveOrCreateSection(parts);
      }

      const seqRows = await prisma.$queryRaw<Array<{ maxSeq: number | null }>>`SELECT MAX("seqId") as "maxSeq" FROM "TestCase"`;
      const nextSeqId = (Number(seqRows[0]?.maxSeq) || 0) + 1;
      await prisma.testCase.create({
        data: {
          seqId: nextSeqId,
          title: row.title.trim(),
          description: row.description || null,
          steps: JSON.stringify(row.steps || []),
          expectedResult: row.expectedResult || '',
          tags: JSON.stringify(row.tags || []),
          references: JSON.stringify(row.references || []),
          priority:  VALID_PRIORITIES.includes(row.priority ?? '') ? row.priority! : 'MEDIUM',
          template:  VALID_TEMPLATES.includes(row.template ?? '')   ? row.template!  : 'STEPS',
          testType:  VALID_TYPES.includes(row.testType ?? '')        ? row.testType!  : 'FUNCTIONAL',
          category: row.category || null,
          projectId: projectId || null,
          sectionId,
          createdById: req.user!.id,
        },
      });
      imported++;
    } catch (err) {
      errors.push({ row: i + 1, error: String(err) });
    }
  }

  res.json({ imported, createdSections, errors });
}

// Keep legacy handlers for backward compat (routes still import them)
export async function submitForQA(req: AuthRequest, res: Response) {
  return transitionStatus(req, res);
}
export async function qaReview(req: AuthRequest, res: Response) {
  return transitionStatus(req, res);
}
export async function poReview(req: AuthRequest, res: Response) {
  return transitionStatus(req, res);
}
