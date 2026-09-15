import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Seed minimal: KRIJON VETËM ADMININ + MANAGERIN.
// Ndeshjet/kuotat vijnë 100% nga LuckyBetFeed (futboll real live) — asgjë e falsket.
async function main() {
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      balance: 999999,
      currency: 'LEK'
    }
  });

  const managerPasswordHash = await bcrypt.hash('manager123', 10);
  await prisma.user.upsert({
    where: { username: 'manager' },
    update: {},
    create: {
      username: 'manager',
      passwordHash: managerPasswordHash,
      role: 'MANAGER',
      balance: 500000,
      currency: 'LEK'
    }
  });

  console.log('Seed: admin + manager u kryen. Ndeshjet do i tërheqë LuckyBetFeed automatikisht.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
