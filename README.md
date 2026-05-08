# Testly — Test Management Tool

A full-stack test management tool covering the complete QA lifecycle:
**Create test cases → QA review → PO sign-off → Build suites → Plan → Execute → Report**

---

## Tech Stack

| Layer    | Choice                              |
|----------|-------------------------------------|
| Frontend | React + TypeScript + Vite + Tailwind |
| Backend  | Node.js + Express + TypeScript       |
| Database | SQLite (local) / PostgreSQL (prod)   |
| ORM      | Prisma                               |
| Auth     | JWT                                  |
| Deploy   | Docker + docker-compose              |

---

## Quick Start — Local Dev (No Docker)

### Prerequisites
- Node.js 18+ installed
- npm 9+

### 1. Backend

```bash
cd backend
npm install
npx prisma migrate dev --name init
npx ts-node prisma/seed.ts
npm run dev
```

Backend runs at **http://localhost:4000**

### 2. Frontend (new terminal)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**

### 3. Open in browser

Go to **http://localhost:3000** and sign in with a demo account:

| Email           | Password | Role  |
|-----------------|----------|-------|
| admin@test.com  | admin123 | Admin |
| qa@test.com     | qa123    | QA    |
| po@test.com     | po123    | PO    |
| dev@test.com    | dev123   | Dev   |

---

## Quick Start — Docker

```bash
docker-compose up --build
```

Opens at **http://localhost:3000**

---

## Workflow Guide

```
1. QA creates a Test Case          → status: DRAFT
2. QA submits for review           → status: QA_REVIEW
3. Senior QA approves/rejects      → status: QA_APPROVED / QA_REJECTED
4. PO approves/rejects             → status: APPROVED / PO_REJECTED
5. QA adds approved cases to a Suite
6. Suite is added to a Test Plan
7. QA starts a Test Run from the plan
8. QA marks each case: PASS / FAIL / BLOCKED / SKIP
9. Run is marked Complete
```

---

## Project Structure

```
test-management-tool/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      ← Data model
│   │   └── seed.ts            ← Demo data
│   └── src/
│       ├── app.ts             ← Express app
│       ├── middleware/        ← Auth + error handling
│       ├── routes/            ← Route definitions
│       └── controllers/       ← Business logic
└── frontend/
    └── src/
        ├── api/client.ts      ← Axios + JWT interceptor
        ├── contexts/          ← Auth context
        ├── pages/             ← All page components
        └── components/        ← Shared UI components
```

---

## API Reference

```
POST   /api/auth/login
POST   /api/auth/register
GET    /api/auth/me

GET    /api/test-cases                       ?status=&priority=&category=
POST   /api/test-cases
GET    /api/test-cases/:id
PUT    /api/test-cases/:id
POST   /api/test-cases/:id/submit-qa
POST   /api/test-cases/:id/qa-review        { approved, comment }
POST   /api/test-cases/:id/po-review        { approved, comment }

GET    /api/test-suites
POST   /api/test-suites
GET    /api/test-suites/:id
PUT    /api/test-suites/:id
POST   /api/test-suites/:id/cases           { testCaseId }
DELETE /api/test-suites/:id/cases/:caseId

GET    /api/test-plans
POST   /api/test-plans
GET    /api/test-plans/:id
PUT    /api/test-plans/:id
POST   /api/test-plans/:id/suites           { suiteId }

GET    /api/test-runs
POST   /api/test-runs                       { name, planId, assignedToId? }
GET    /api/test-runs/:id
PUT    /api/test-runs/:id/results/:resultId { status, comment? }
POST   /api/test-runs/:id/complete

GET    /api/users/all
```

---

## Roles & Permissions

| Action                | ADMIN | QA | PO | DEV |
|-----------------------|-------|----|----|-----|
| Create/edit test cases|  ✓   | ✓  |    |     |
| Submit for QA review  |  ✓   | ✓  |    |     |
| QA review             |  ✓   | ✓  |    |     |
| PO review             |  ✓   |    | ✓  |     |
| Manage suites/plans   |  ✓   | ✓  | ✓  |     |
| Execute test runs     |  ✓   | ✓  |    |     |
| View everything       |  ✓   | ✓  | ✓  | ✓  |

---

## Production Deployment

1. Set a strong `JWT_SECRET` in your environment
2. Switch Prisma to PostgreSQL in `backend/prisma/schema.prisma`
3. Set `DATABASE_URL` to your Postgres connection string
4. Run `docker-compose up --build -d`
5. Run migrations: `docker exec <backend-container> npx prisma migrate deploy`

---

## Extending

- **Add fields to TestCase**: Edit `prisma/schema.prisma`, run `npx prisma migrate dev`, update the controller select object
- **Add a new role**: Add to the role checks in `middleware/auth.ts` and `requireRole()` calls in routes
- **Email notifications**: Add a mailer call in `submitForQA` / `qaReview` controllers
- **File attachments**: Add an S3/MinIO integration to the test case create/update endpoints
