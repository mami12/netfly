import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
Promise.all([p.match.count(), p.market.count(), p.outcome.count(), p.user.count()])
  .then(([m, mk, o, u]) => {
    console.log(`MATCHES=${m} MARKETS=${mk} OUTCOMES=${o} USERS=${u}`);
    return p.$disconnect();
  })
  .catch((e) => { console.error('ERR', e.message); process.exit(1); });
