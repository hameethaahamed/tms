import bcrypt from 'bcryptjs';
import path from 'node:path';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`;
const adapter = new PrismaLibSql({ url });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ── Users ───────────────────────────────────────────────────────────────
  const users = [
    { email: 'admin@test.com', name: 'Admin User',   password: 'admin123', role: 'ADMIN' },
    { email: 'qa@test.com',    name: 'QA Engineer',  password: 'qa123',    role: 'QA'    },
    { email: 'po@test.com',    name: 'Product Owner', password: 'po123',   role: 'PO'    },
    { email: 'dev@test.com',   name: 'Developer',    password: 'dev123',   role: 'DEV'   },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, password: await bcrypt.hash(u.password, 10) },
    });
  }
  const qa = await prisma.user.findUnique({ where: { email: 'qa@test.com' } });
  if (!qa) return;

  // ── Project 1: Single Repository ─────────────────────────────────────────
  const singleProject = await prisma.project.create({
    data: {
      name: 'Web Application',
      description: 'Main web app — single test repository with sections.',
      type: 'SINGLE_REPO',
      suites: {
        create: {
          name: 'Test Repository',
          description: 'All test cases for the web application',
          isDefault: true,
        },
      },
    },
    include: { suites: true },
  });
  const defaultSuite = singleProject.suites[0];

  // Sections
  const authSection = await prisma.section.create({
    data: { name: 'Authentication', suiteId: defaultSuite.id, order: 0 },
  });
  const loginSection = await prisma.section.create({
    data: { name: 'Login', suiteId: defaultSuite.id, parentId: authSection.id, depth: 1, order: 0 },
  });
  const registrationSection = await prisma.section.create({
    data: { name: 'Registration', suiteId: defaultSuite.id, parentId: authSection.id, depth: 1, order: 1 },
  });
  const dashboardSection = await prisma.section.create({
    data: { name: 'Dashboard', suiteId: defaultSuite.id, order: 1 },
  });

  // Test cases
  const tc1 = await prisma.testCase.create({
    data: {
      title: 'User can log in with valid credentials',
      description: 'Verify the login flow works end-to-end.',
      steps: JSON.stringify(['Navigate to /login', 'Enter valid email and password', 'Click the Login button']),
      expectedResult: 'User is redirected to the dashboard.',
      priority: 'HIGH', status: 'APPROVED',
      category: 'Authentication', tags: JSON.stringify(['smoke', 'auth']),
      createdById: qa.id,
      projectId: singleProject.id,
      sectionId: loginSection.id,
    },
  });
  const tc2 = await prisma.testCase.create({
    data: {
      title: 'User sees error on invalid login',
      description: 'Verify that wrong credentials show an error.',
      steps: JSON.stringify(['Navigate to /login', 'Enter wrong password', 'Click the Login button']),
      expectedResult: 'Error message "Invalid credentials" is displayed.',
      priority: 'MEDIUM', status: 'DRAFT',
      category: 'Authentication', tags: JSON.stringify(['auth']),
      createdById: qa.id,
      projectId: singleProject.id,
      sectionId: loginSection.id,
    },
  });
  await prisma.testCase.create({
    data: {
      title: 'New user can register successfully',
      description: 'Verify the registration form creates an account.',
      steps: JSON.stringify(['Navigate to /register', 'Fill in all required fields', 'Click Register']),
      expectedResult: 'Account is created and user is redirected to onboarding.',
      priority: 'HIGH', status: 'QA_REVIEW',
      category: 'Authentication', tags: JSON.stringify(['smoke']),
      createdById: qa.id,
      projectId: singleProject.id,
      sectionId: registrationSection.id,
    },
  });
  await prisma.testCase.create({
    data: {
      title: 'Dashboard loads all widgets',
      description: 'Verify all dashboard widgets render correctly.',
      steps: JSON.stringify(['Log in', 'Navigate to /dashboard', 'Observe page']),
      expectedResult: 'All widgets are visible and load data correctly.',
      priority: 'MEDIUM', status: 'APPROVED',
      category: 'UI', tags: JSON.stringify(['smoke']),
      createdById: qa.id,
      projectId: singleProject.id,
      sectionId: dashboardSection.id,
    },
  });

  // Suite items (for the plan/run feature)
  await prisma.testSuiteItem.create({ data: { suiteId: defaultSuite.id, testCaseId: tc1.id, order: 0 } });
  await prisma.testSuiteItem.create({ data: { suiteId: defaultSuite.id, testCaseId: tc2.id, order: 1 } });

  // Test plan & run
  const plan = await prisma.testPlan.create({
    data: {
      name: 'Sprint 1 Regression',
      description: 'Regression plan for sprint 1',
      environment: 'QA', status: 'ACTIVE',
      projectId: singleProject.id,
      suites: { create: [{ suiteId: defaultSuite.id }] },
    },
  });

  // ── Project 2: Multiple Test Suites ──────────────────────────────────────
  const multiProject = await prisma.project.create({
    data: {
      name: 'Mobile App',
      description: 'iOS and Android app — separated by platform suites.',
      type: 'MULTI_SUITE',
    },
  });

  const iosSuite = await prisma.testSuite.create({
    data: {
      name: 'iOS',
      description: 'Test cases for the iOS application',
      projectId: multiProject.id,
    },
  });
  const androidSuite = await prisma.testSuite.create({
    data: {
      name: 'Android',
      description: 'Test cases for the Android application',
      projectId: multiProject.id,
    },
  });

  const iosAuthSection = await prisma.section.create({
    data: { name: 'Authentication', suiteId: iosSuite.id, order: 0 },
  });
  await prisma.section.create({
    data: { name: 'Navigation', suiteId: iosSuite.id, order: 1 },
  });
  await prisma.section.create({
    data: { name: 'Authentication', suiteId: androidSuite.id, order: 0 },
  });

  const iosTc = await prisma.testCase.create({
    data: {
      title: 'iOS user can log in with Face ID',
      steps: JSON.stringify(['Open app', 'Tap Sign In', 'Authenticate with Face ID']),
      expectedResult: 'User is logged in successfully.',
      priority: 'HIGH', status: 'APPROVED',
      category: 'Authentication', tags: JSON.stringify(['ios', 'biometric']),
      createdById: qa.id,
      projectId: multiProject.id,
      sectionId: iosAuthSection.id,
    },
  });
  await prisma.testSuiteItem.create({ data: { suiteId: iosSuite.id, testCaseId: iosTc.id, order: 0 } });

  await prisma.testPlan.create({
    data: {
      name: 'iOS v2 Release',
      environment: 'STAGING', status: 'DRAFT',
      projectId: multiProject.id,
      suites: { create: [{ suiteId: iosSuite.id }] },
    },
  });

  console.log('Seed complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
