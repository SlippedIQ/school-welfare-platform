/**
 * Seeds the local SQLite database with classrooms, camera/NAS mappings,
 * teachers, students, baseline biometric history, a few alerts and
 * observation notes so both portals are populated on first run.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STATES = ['FOCUSED', 'ACTIVE', 'SLEEPY', 'ANXIOUS'] as const;

function pick<T extends string>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function jitter(value: number, spread: number): number {
  return value + (Math.random() * 2 - 1) * spread;
}

async function main() {
  // Clear existing data (child rows first) so the seed is repeatable.
  await prisma.observation.deleteMany();
  await prisma.alertLog.deleteMany();
  await prisma.biometricLog.deleteMany();
  await prisma.student.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.classroom.deleteMany();

  const classrooms = await Promise.all([
    prisma.classroom.create({
      data: {
        className: 'Grade 9-A',
        nasId: 'NAS-NVR-01',
        streamUrl: 'rtsp://10.0.4.11:554/ch/9a/main',
      },
    }),
    prisma.classroom.create({
      data: {
        className: 'Grade 10-B',
        nasId: 'NAS-NVR-02',
        streamUrl: 'rtsp://10.0.4.12:554/ch/10b/main',
      },
    }),
    // Intentionally left without a stream gateway so the "no feed configured"
    // state is visible in the camera panel out of the box.
    prisma.classroom.create({
      data: {
        className: 'Grade 8-C',
        nasId: 'NAS-NVR-03',
        streamUrl: '',
      },
    }),
  ]);
  const [grade9a, grade10b, grade8c] = classrooms;

  await prisma.teacher.create({
    data: {
      name: 'Ananya Rao',
      email: 'ananya.rao@school.edu',
      assignedClasses: { connect: [{ id: grade9a.id }, { id: grade10b.id }] },
    },
  });
  await prisma.teacher.create({
    data: {
      name: 'Vikram Shah',
      email: 'vikram.shah@school.edu',
      assignedClasses: { connect: [{ id: grade8c.id }] },
    },
  });
  await prisma.teacher.create({
    data: {
      name: 'Meera Iyer',
      email: 'meera.iyer@school.edu',
      assignedClasses: { connect: [{ id: grade10b.id }, { id: grade8c.id }] },
    },
  });

  type Seed = {
    fullName: string;
    admissionNo: string;
    age: number;
    guardianContact: string;
    baselineHeartRate: number;
    classroomId: string;
    gradeClass: string;
  };

  const roster: Seed[] = [
    { fullName: 'Aarav Mehta', admissionNo: 'ADM-2024-0901', age: 14, guardianContact: '+91 98201 41120', baselineHeartRate: 78, classroomId: grade9a.id, gradeClass: '9-A' },
    { fullName: 'Diya Nair', admissionNo: 'ADM-2024-0902', age: 14, guardianContact: '+91 98450 22914', baselineHeartRate: 72, classroomId: grade9a.id, gradeClass: '9-A' },
    { fullName: 'Kabir Singh', admissionNo: 'ADM-2024-0903', age: 15, guardianContact: '+91 99870 55218', baselineHeartRate: 81, classroomId: grade9a.id, gradeClass: '9-A' },
    { fullName: 'Ishaan Verma', admissionNo: 'ADM-2024-0904', age: 14, guardianContact: '+91 98110 77345', baselineHeartRate: 75, classroomId: grade9a.id, gradeClass: '9-A' },
    { fullName: 'Tara Menon', admissionNo: 'ADM-2024-0905', age: 15, guardianContact: '+91 98470 63019', baselineHeartRate: 70, classroomId: grade9a.id, gradeClass: '9-A' },

    { fullName: 'Riya Kapoor', admissionNo: 'ADM-2024-1001', age: 16, guardianContact: '+91 98100 48827', baselineHeartRate: 74, classroomId: grade10b.id, gradeClass: '10-B' },
    { fullName: 'Aditya Joshi', admissionNo: 'ADM-2024-1002', age: 16, guardianContact: '+91 98220 91164', baselineHeartRate: 83, classroomId: grade10b.id, gradeClass: '10-B' },
    { fullName: 'Sana Qureshi', admissionNo: 'ADM-2024-1003', age: 15, guardianContact: '+91 98330 70452', baselineHeartRate: 69, classroomId: grade10b.id, gradeClass: '10-B' },
    { fullName: 'Neel Bhatt', admissionNo: 'ADM-2024-1004', age: 16, guardianContact: '+91 98250 33781', baselineHeartRate: 77, classroomId: grade10b.id, gradeClass: '10-B' },
    { fullName: 'Maya Reddy', admissionNo: 'ADM-2024-1005', age: 16, guardianContact: '+91 98490 12206', baselineHeartRate: 71, classroomId: grade10b.id, gradeClass: '10-B' },

    { fullName: 'Arjun Pillai', admissionNo: 'ADM-2024-0801', age: 13, guardianContact: '+91 98950 44317', baselineHeartRate: 76, classroomId: grade8c.id, gradeClass: '8-C' },
    { fullName: 'Zoya Khan', admissionNo: 'ADM-2024-0802', age: 14, guardianContact: '+91 98670 28490', baselineHeartRate: 73, classroomId: grade8c.id, gradeClass: '8-C' },
    { fullName: 'Vihaan Gupta', admissionNo: 'ADM-2024-0803', age: 13, guardianContact: '+91 98550 61723', baselineHeartRate: 80, classroomId: grade8c.id, gradeClass: '8-C' },
    { fullName: 'Anika Desai', admissionNo: 'ADM-2024-0804', age: 13, guardianContact: '+91 98230 15508', baselineHeartRate: 72, classroomId: grade8c.id, gradeClass: '8-C' },
  ];

  const students = [] as { id: string; fullName: string; gradeClass: string; baselineHeartRate: number }[];

  for (const seed of roster) {
    const student = await prisma.student.create({ data: seed });
    students.push(student);

    // ~90 minutes of history at 3-minute intervals for out-of-the-box trends.
    const history = [] as {
      studentId: string;
      heartRate: number;
      stressLevel: string;
      state: string;
      bodyTemp: number;
      timestamp: Date;
    }[];

    for (let i = 30; i >= 1; i--) {
      const base = seed.baselineHeartRate;
      const calm = Math.random() > 0.85;
      history.push({
        studentId: student.id,
        heartRate: Math.round(jitter(base + (calm ? 6 : 0), 5)),
        stressLevel: calm ? 'MODERATE' : 'LOW',
        state: pick(STATES.slice(0, 3)),
        bodyTemp: Number(jitter(36.8, 0.25).toFixed(1)),
        timestamp: new Date(Date.now() - i * 3 * 60_000),
      });
    }
    await prisma.biometricLog.createMany({ data: history });
  }

  const [aarav, aditya, kabir] = students;

  await prisma.alertLog.createMany({
    data: [
      {
        studentId: aditya.id,
        severity: 'CRITICAL',
        message: `${aditya.fullName} — heart rate 132 BPM (baseline ${aditya.baselineHeartRate}), stress HIGH`,
        timestamp: new Date(Date.now() - 6 * 60_000),
        isRead: false,
      },
      {
        studentId: kabir.id,
        severity: 'WARNING',
        message: `${kabir.fullName} — stress sustained at MODERATE for 3 consecutive readings`,
        timestamp: new Date(Date.now() - 21 * 60_000),
        isRead: false,
      },
      {
        studentId: aarav.id,
        severity: 'WARNING',
        message: `${aarav.fullName} — body temperature 37.9 °C, above comfort threshold`,
        timestamp: new Date(Date.now() - 64 * 60_000),
        isRead: true,
      },
    ],
  });

  await prisma.observation.createMany({
    data: [
      {
        studentId: aarav.id,
        authorName: 'Ananya Rao',
        note: 'Asked for water twice during the period; kept shifting in seat. Seemed distracted during the quiz.',
        createdAt: new Date(Date.now() - 38 * 60_000),
      },
      {
        studentId: aditya.id,
        authorName: 'Ananya Rao',
        note: 'Reported mild headache before the test. Sent to the infirmary for a quick check.',
        createdAt: new Date(Date.now() - 12 * 60_000),
      },
    ],
  });

  console.log(
    `Seeded ${classrooms.length} classrooms, 3 teachers, ${students.length} students, 3 alerts, 2 observations.`,
  );
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
