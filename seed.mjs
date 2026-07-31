/**
 * seed.mjs
 * Wipes all data from the Neon DB and creates the real admin account.
 * Run: node seed.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Wiping all existing data...');

  // Delete in dependency order (attendance first, then users)
  await prisma.attendance.deleteMany();
  await prisma.salaryRule.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ All data cleared.');

  const hashedPassword = await bcrypt.hash('N@9876@5678@yhn', 12);

  const admin = await prisma.user.create({
    data: {
      email:     'navigate99b@gmail.com',
      password:  hashedPassword,
      name:      'Navigate Admin',
      role:      'ADMIN',
      officeSsid: 'RH-2.4G-EDE610',
      hourlyRate: 0,
    },
  });

  console.log('✅ Admin created:');
  console.log(`   Email : ${admin.email}`);
  console.log(`   Role  : ${admin.role}`);
  console.log(`   ID    : ${admin.id}`);
  console.log('\n🚀 Done! You can now log in with the admin credentials.');
}

main()
  .catch((e) => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
