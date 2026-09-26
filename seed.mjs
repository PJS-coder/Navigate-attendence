/**
 * seed.mjs
 * Seeds Manager (Admin) and Employee accounts.
 * Run: node --env-file=.env seed.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const usersToSeed = [
  // Manager (Admin)
  {
    name: 'Jitesh',
    email: 'jitesh001@navigate.gmail.com',
    password: 'jitesh@001navigate',
    role: 'ADMIN',
    hourlyRate: 0,
    officeSsid: 'RH-2.4G-EDE610',
  },
  // Employees
  {
    name: 'Paarth',
    email: 'paarth@navigate.gmail.com',
    password: 'paarth@navigate',
    role: 'EMPLOYEE',
    hourlyRate: 0,
    officeSsid: 'RH-2.4G-EDE610',
  },
  {
    name: 'Harpreet',
    email: 'harpreet@navigate.gmail.com',
    password: 'harpreet@navigate',
    role: 'EMPLOYEE',
    hourlyRate: 0,
    officeSsid: 'RH-2.4G-EDE610',
  },
  {
    name: 'Samarth',
    email: 'samarth@navigate.gmail.com',
    password: 'samarth@navigate',
    role: 'EMPLOYEE',
    hourlyRate: 0,
    officeSsid: 'RH-2.4G-EDE610',
  },
  {
    name: 'PJS',
    email: 'pjs@navigate.gmail.com',
    password: 'pjs@calicore',
    role: 'EMPLOYEE',
    hourlyRate: 0,
    officeSsid: 'RH-2.4G-EDE610',
  },
  {
    name: 'Shachi',
    email: 'shachi@navigate.gmail.com',
    password: 'shachi@navigate',
    role: 'EMPLOYEE',
    hourlyRate: 0,
    officeSsid: 'RH-2.4G-EDE610',
  },
];

async function main() {
  console.log('🗑️  Wiping existing attendance & users...');

  // Delete in dependency order
  await prisma.attendance.deleteMany();
  await prisma.salaryRule.deleteMany();
  await prisma.user.deleteMany();

  console.log('🌱 Seeding users & salary rules...\n');

  for (const user of usersToSeed) {
    const hashedPassword = await bcrypt.hash(user.password, 12);

    const created = await prisma.user.create({
      data: {
        email: user.email,
        password: hashedPassword,
        name: user.name,
        role: user.role,
        officeSsid: user.officeSsid,
        hourlyRate: user.hourlyRate,
        salaryRules: {
          create: {
            baseSalary: 0,
            overtimeMultiplier: 1.5,
            latePenaltyPerMin: 1.0,
            officeStartTime: '09:00',
            workingHoursPerDay: 8.0,
          },
        },
      },
    });

    console.log(`✅ [${created.role}] ${created.name} (${created.email}) created`);
  }

  console.log('\n🚀 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
