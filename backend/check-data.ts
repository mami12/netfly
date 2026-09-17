// Kontroll ne DB: dublikata te normaluara + tregje pa emer te vertete
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  // 1) Tregje emri i te cileve perputhet kur shkronjat e medha/hapesirat normalizohen
  const dups = await p.$queryRawUnsafe<any[]>(`
    SELECT m."matchId" AS mid, lower(regexp_replace(btrim(m.name), '\\s+', ' ', 'g')) AS n,
           COUNT(*)::int AS c, array_agg(m.name) AS names
    FROM "Market" m
    WHERE m."matchId" LIKE 'lb-%'
    GROUP BY m."matchId", n
    HAVING COUNT(*) > 1
    ORDER BY c DESC
    LIMIT 15`);
  console.log(`=== DUBLIKATA (case/hapesire) ===`);
  console.log(`Grupe te dublikuara: ${dups.length}`);
  for (const d of dups) console.log(`   ${d.mid} | "${d.n}" x${d.c} -> ${JSON.stringify(d.names)}`);

  const cnt = await p.$queryRawUnsafe<any[]>(`
    SELECT COUNT(*)::int AS c FROM (
      SELECT 1 FROM "Market" WHERE "matchId" LIKE 'lb-%'
      GROUP BY "matchId", lower(regexp_replace(btrim(name), '\\s+', ' ', 'g'))
      HAVING COUNT(*) > 1) t`);
  console.log(`GJITHSEJ grupe te dublikuara: ${cnt[0].c}`);

  // 2) Tregje me emer te pavlefshem
  const junk = await p.market.groupBy({ by: ['name'], where: { name: { in: ['Market', '', 'market'] } }, _count: true });
  for (const j of junk) console.log(`\nEmri "${j.name}": ${j._count} tregje`);

  // 3) Ndeshje live me minute 0
  const live = await p.match.findMany({ where: { id: { startsWith: 'lb-' }, status: 'LIVE' }, select: { currentMinute: true, startTime: true } });
  const zero = live.filter((m) => !m.currentMinute).length;
  const old = live.filter((m) => !m.currentMinute && Date.now() - m.startTime.getTime() > 20 * 60000).length;
  console.log(`\n=== MINUTAT ===`);
  console.log(`Live: ${live.length} | me minute 0: ${zero} | prej tyre te nisura >20 min me pare: ${old}`);

  await p.$disconnect();
})().catch(async (e) => { console.error('ERR', e.message); process.exit(1); });