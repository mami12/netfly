// Variantet e emrave te tregjeve qe duken njelloj ne shqip
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  for (const pat of ['%both teams%', '%double chance%', '%handicap%', '%odd%even%', '%correct score%']) {
    const rows = await p.$queryRawUnsafe<any[]>(
      `SELECT name, COUNT(*)::int AS c FROM "Market"
       WHERE "matchId" LIKE 'lb-%' AND name ILIKE $1
       GROUP BY name ORDER BY c DESC LIMIT 12`, pat);
    console.log(`\n=== ${pat} ===`);
    for (const r of rows) console.log(`   ${String(r.c).padStart(5)}  "${r.name}"`);
  }

  // Emra qe ndryshojne vetem ne shkronja te medha
  const caseDups = await p.$queryRawUnsafe<any[]>(`
    SELECT lower(btrim(name)) AS low, COUNT(DISTINCT name)::int AS variants, array_agg(DISTINCT name) AS names
    FROM "Market" WHERE "matchId" LIKE 'lb-%'
    GROUP BY lower(btrim(name)) HAVING COUNT(DISTINCT name) > 1 ORDER BY variants DESC LIMIT 15`);
  console.log(`\n=== EMRA ME VARIANTE (case) ===`);
  console.log(`Grupe: ${caseDups.length}`);
  for (const d of caseDups) console.log(`   ${JSON.stringify(d.names)}`);

  await p.$disconnect();
})().catch(async (e) => { console.error('ERR', e.message); process.exit(1); });