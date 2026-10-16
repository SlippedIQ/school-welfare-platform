/**
 * Creates/refreshes the demo login accounts WITHOUT touching any other data
 * (unlike `npm run db:seed`, which resets classrooms, students, history, …).
 *
 * Run with: npx tsx scripts/seed-users.ts
 */
import { PrismaClient } from '@prisma/client';
import { seedDemoUsers } from '../prisma/demo-users';

const prisma = new PrismaClient();

seedDemoUsers(prisma)
  .then((usernames) => {
    console.log(`Users ready (${usernames.length}): ${usernames.join(', ')}`);
  })
  .catch((error) => {
    console.error('User seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
