import path from 'node:path';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';

const url = process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`;

const adapter = new PrismaLibSql({ url });
const prisma = new PrismaClient({ adapter });

export default prisma;
