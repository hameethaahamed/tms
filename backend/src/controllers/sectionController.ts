import { Response } from 'express';
import prisma from '../db';
import { AuthRequest } from '../middleware/auth';

// Recursive helper – builds a section tree of unlimited depth
function buildChildren(depth = 0): object {
  if (depth >= 5) return { _count: { select: { testCases: true } } };
  return {
    children: {
      include: buildChildren(depth + 1),
      orderBy: { order: 'asc' as const },
    },
    _count: { select: { testCases: true } },
  };
}
const sectionWithChildren = buildChildren();

export async function listSections(req: AuthRequest, res: Response) {
  const sections = await prisma.section.findMany({
    where: { suiteId: req.params.suiteId, parentId: null },
    include: sectionWithChildren,
    orderBy: { order: 'asc' },
  });
  res.json(sections);
}

export async function createSection(req: AuthRequest, res: Response) {
  const { name, parentId } = req.body;
  const { suiteId } = req.params;

  const count = await prisma.section.count({ where: { suiteId, parentId: parentId ?? null } });
  const depth = parentId
    ? (await prisma.section.findUnique({ where: { id: parentId }, select: { depth: true } }))?.depth ?? 0 + 1
    : 0;

  const section = await prisma.section.create({
    data: { name, suiteId, parentId: parentId ?? null, order: count, depth },
    include: sectionWithChildren,
  });
  res.status(201).json(section);
}

export async function updateSection(req: AuthRequest, res: Response) {
  const { name } = req.body;
  const section = await prisma.section.update({
    where: { id: req.params.sectionId },
    data: { name },
    include: sectionWithChildren,
  });
  res.json(section);
}

export async function deleteSection(req: AuthRequest, res: Response) {
  await prisma.section.delete({ where: { id: req.params.sectionId } });
  res.status(204).send();
}
