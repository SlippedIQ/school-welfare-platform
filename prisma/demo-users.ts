/**
 * Demo accounts shared by prisma/seed.ts (full resets) and
 * scripts/seed-users.ts (users only, leaves all other data intact).
 *
 * Passwords are deliberately simple demo credentials — change them before
 * any real deployment (see README → Deploying).
 */
import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/password';
import type { UserRole } from '../src/lib/types';

interface DemoUser {
  username: string;
  displayName: string;
  role: UserRole;
  password: string;
  /** TEACHER accounts are linked to the matching Teacher record. */
  teacherEmail?: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    username: 'admin',
    displayName: 'School Administrator',
    role: 'ADMIN',
    password: 'admin123',
  },
  {
    username: 'ananya',
    displayName: 'Ananya Rao',
    role: 'TEACHER',
    password: 'ananya123',
    teacherEmail: 'ananya.rao@school.edu',
  },
  {
    username: 'vikram',
    displayName: 'Vikram Shah',
    role: 'TEACHER',
    password: 'vikram123',
    teacherEmail: 'vikram.shah@school.edu',
  },
  {
    username: 'meera',
    displayName: 'Meera Iyer',
    role: 'TEACHER',
    password: 'meera123',
    teacherEmail: 'meera.iyer@school.edu',
  },
  {
    username: 'nurse',
    displayName: 'Nurse Kavita',
    role: 'NURSE',
    password: 'nurse123',
  },
];

/** Upserts every demo user; returns the usernames that are now available. */
export async function seedDemoUsers(prisma: PrismaClient): Promise<string[]> {
  const usernames: string[] = [];

  for (const entry of DEMO_USERS) {
    const teacher = entry.teacherEmail
      ? await prisma.teacher.findUnique({ where: { email: entry.teacherEmail } })
      : null;
    const passwordHash = await hashPassword(entry.password);
    const data = {
      displayName: entry.displayName,
      role: entry.role,
      passwordHash,
      teacherId: teacher?.id ?? null,
    };

    await prisma.user.upsert({
      where: { username: entry.username },
      update: data,
      create: { username: entry.username, ...data },
    });
    usernames.push(entry.username);
  }

  return usernames;
}
