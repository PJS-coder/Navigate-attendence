import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('Admin@1234', 12);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@company.com' },
    update: {},
    create: {
      email: 'admin@company.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'ADMIN',
      officeSsid: 'RH-2.4G-EDE610',
      hourlyRate: 200,
      salaryRules: {
        create: {
          baseSalary: 32000,
          overtimeMultiplier: 1.5,
          latePenaltyPerMin: 1.0,
          officeStartTime: '09:00',
          workingHoursPerDay: 8.0,
        },
      },
    },
  });

  console.log('✅ Admin user created/verified:', admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
