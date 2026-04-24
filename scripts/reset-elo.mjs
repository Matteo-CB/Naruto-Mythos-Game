

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    data: {
      elo: 500,
      wins: 0,
      losses: 0,
      draws: 0,
    },
  });

  console.log(`Reset ${result.count} users to ELO 500, W/L/D = 0`);
}

main()
  .catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
