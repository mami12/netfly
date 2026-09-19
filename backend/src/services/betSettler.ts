import { WalletService } from './walletService';
import { prisma } from '../db';

/** Heq aksente + lowercase për krahasim emrash (Südtirol == sudtirol). */
const norm = (s: string) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

const endsWithLine = (name: string): number | null => {
  const m = String(name).match(/([+-]?\d+(?:\.\d+)?)\s*$/);
  return m ? parseFloat(m[1]) : null;
};

export class BetSettler {
  /**
   * Mbyll një ndeshje me score final: gjykon çdo treg të mbështetur nga score
   * (1X2, Double Chance, BTTS, Total/Total ekipi, Handicap, Odd/Even, Correct
   * Score, Exact goals). Tregjet pa të dhëna (kartona, korner, lojtarë, gjysma)
   * -> VOID = kthim i shumës për atë linjë, si te bukmekerët realë.
   */
  static async settleMatch(matchId: string, homeScore: number, awayScore: number) {
    const match = await prisma.match.update({
      where: { id: matchId },
      data: { status: 'ENDED', homeScore, awayScore, currentMinute: 90 },
      include: { markets: { include: { outcomes: true } } }
    });

    const totalGoals = homeScore + awayScore;
    const homeWin = homeScore > awayScore;
    const awayWin = awayScore > homeScore;
    const draw = homeScore === awayScore;
    const bothScored = homeScore > 0 && awayScore > 0;
    const homeN = norm(match.homeTeam);
    const awayN = norm(match.awayTeam);

    const isHome = (n: string) => { const w = norm(n); return !!w && homeN.startsWith(w); };
    const isAway = (n: string) => { const w = norm(n); return !!w && awayN.startsWith(w); };
    const side = (name: string): '1' | 'X' | '2' | null => {
      const n = String(name).trim();
      if (/^1$/i.test(n)) return '1';
      if (/^x$/i.test(n)) return 'X';
      if (/^2$/i.test(n)) return '2';
      if (/^draw$/i.test(n)) return 'X';
      if (isHome(n)) return '1';
      if (isAway(n)) return '2';
      return null;
    };
    const teamOf = (n: string): 'home' | 'away' | null =>
      isHome(n) ? 'home' : isAway(n) ? 'away' : null;

    for (const market of match.markets) {
      if (market.status === 'SETTLED') continue;
      const type = String(market.marketType || '').toUpperCase();

      for (const outcome of market.outcomes) {
        const name = String(outcome.name);
        const code = String((outcome as any).code || '').trim().toLowerCase();
        let isWinner = false;
        let voidLine = false;

        // 1) Kodet e feed-it jane me te besueshme se emrat (emrat mund te jene emra ekipesh).
        let handled = true;
        if (code === '1' && type !== 'HANDICAP' && type !== 'ASIAN_HANDICAP') isWinner = homeWin;
        else if (code === '2' && type !== 'HANDICAP' && type !== 'ASIAN_HANDICAP') isWinner = awayWin;
        else if (code === 'x' || code === 'draw') isWinner = draw;
        else if (code === '1x') isWinner = homeWin || draw;
        else if (code === '12') isWinner = homeWin || awayWin;
        else if (code === 'x2') isWinner = awayWin || draw;
        else if (code === 'over' || code === 'under') {
          const l = endsWithLine(name);
          if (l === null) voidLine = true;
          else isWinner = code === 'over' ? totalGoals > l : totalGoals < l;
        } else if (code === 'yes' || code === 'no') isWinner = code === 'yes' ? bothScored : !bothScored;
        else if (code === 'odd' || code === 'even') isWinner = code === 'odd' ? totalGoals % 2 === 1 : totalGoals % 2 === 0;
        else handled = false;

        // 2) Gjykimi nga emri (fallback kur feed-i nuk jep kod).
        if (!handled) {
        if (type === '1X2' || type === 'MATCH_WINNER') {
          const s = side(name);
          isWinner = s === '1' ? homeWin : s === '2' ? awayWin : s === 'X' ? draw : false;
          voidLine = !s;
        } else if (type === 'DOUBLE_CHANCE') {
          const n = norm(name);
          const hit = (s: string | null) => s === '1' ? homeWin : s === '2' ? awayWin : s === 'X' ? draw : false;
          if (/^1x$/.test(n)) isWinner = homeWin || draw;
          else if (/^12$/.test(n)) isWinner = homeWin || awayWin;
          else if (/^x2$/.test(n)) isWinner = awayWin || draw;
          else {
            const parts = n.split('or').map((p: string) => p.trim()).filter(Boolean);
            if (parts.length === 2) isWinner = hit(side(parts[0])) || hit(side(parts[1]));
            else voidLine = true;
          }
        } else if (type === 'BOTH_TEAMS_SCORE') {
          const n = norm(name);
          if (n.startsWith('yes')) isWinner = bothScored;
          else if (n.startsWith('no')) isWinner = !bothScored;
          else voidLine = true;
        } else if (type === 'OVER_UNDER' || type === 'TOTAL') {
          const line = endsWithLine(name);
          if (line === null) voidLine = true;
          else if (/^over/i.test(name)) isWinner = totalGoals > line;
          else if (/^under/i.test(name)) isWinner = totalGoals < line;
          else voidLine = true;
        } else if (type === 'HANDICAP' || type === 'ASIAN_HANDICAP') {
          const line = endsWithLine(name);
          const t = teamOf(name.replace(/[+-]?\d+(\.\d+)?\s*$/, '').trim());
          if (line === null || !t) voidLine = true;
          else {
            const adj = (t === 'home' ? homeScore : awayScore) + line;
            const opp = t === 'home' ? awayScore : homeScore;
            if (adj === opp) voidLine = true; // push -> refund
            else isWinner = adj > opp;
          }
        } else if (type === 'ODD_EVEN') {
          const n = norm(name);
          const t = teamOf(name);
          const goals = t === 'home' ? homeScore : t === 'away' ? awayScore : totalGoals;
          if (n.startsWith('odd')) isWinner = goals % 2 === 1;
          else if (n.startsWith('even')) isWinner = goals % 2 === 0;
          else voidLine = true;
        } else if (type === 'CORRECT_SCORE' || type === 'EXACT_SCORE') {
          const n = norm(name).replace(/[^0-9:]/g, '');
          if (/^\d+:\d+$/.test(n)) isWinner = n === `${homeScore}:${awayScore}`;
          else voidLine = true;
        } else if (type === 'EXACT_GOALS') {
          const n = norm(name);
          if (n.includes('nogoal')) isWinner = totalGoals === 0;
          else if (n.includes('ormore')) { const v = endsWithLine(name); isWinner = v !== null ? totalGoals >= v : false; }
          else {
            const v = Number(n);
            if (Number.isFinite(v) && v > 0) isWinner = totalGoals === v;
            else voidLine = true;
          }
        } else {
          voidLine = true; // çdo treg tjetër pa të dhëna -> VOID
        }

        }

        await prisma.outcome.update({
          where: { id: outcome.id },
          data: voidLine ? { isWinner: false, status: 'VOID' } : { isWinner, status: 'SETTLED' }
        });
      }

      await prisma.market.update({ where: { id: market.id }, data: { status: 'SETTLED' } });
    }

    await this.settleTickets(matchId);
  }

  /** Mbyll linjat + skedinat: WON / LOST / VOID me refund të pjesëshëm ose të plotë. */
  static async settleTickets(matchId: string) {
    const lines = await prisma.ticketLine.findMany({
      where: { matchId, status: 'PENDING' },
      include: { outcome: true }
    });

    for (const line of lines) {
      const st = line.outcome?.status === 'VOID' ? 'VOID'
        : line.outcome?.isWinner ? 'WON' : 'LOST';
      await prisma.ticketLine.update({ where: { id: line.id }, data: { status: st } });
      await this.recalcTicket(line.ticketId);
    }
  }

  /** Rillogarit një skedinë pas çdo ndryshimi të linjës. */
  static async recalcTicket(ticketId: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { lines: true, user: true }
    });
    if (!ticket || ticket.status !== 'PENDING') return;
    if (ticket.lines.some(l => l.status === 'PENDING')) return; // prit linjat e mbetura

    const voids = ticket.lines.filter(l => l.status === 'VOID');
    const lost = ticket.lines.filter(l => l.status === 'LOST');
    const won = ticket.lines.filter(l => l.status === 'WON');
    const activeOdds = ticket.lines
      .filter(l => l.status !== 'VOID')
      .reduce((acc, l) => acc * (l.oddsAtPlacement || 1), 1);

    let status: string;
    let payout = 0;

    if (!lost.length && won.length) {
      status = 'WON';
      payout = ticket.stake * activeOdds; // kuota rillogaritet pa linjat VOID
    } else if (!lost.length && !won.length && voids.length) {
      status = 'VOID';
      payout = ticket.stake; // të gjitha VOID -> refund i plotë
    } else {
      status = 'LOST';
      payout = 0;
    }

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status, potentialPayout: payout || ticket.potentialPayout, settledAt: new Date() }
    });

    if (payout > 0 && ticket.userId) {
      if (status === 'VOID') await WalletService.refund(ticket.userId, payout, ticket.id);
      else await WalletService.creditWinnings(ticket.userId, payout, ticket.id);
    }

    if (ticket.user?.managerId) {
      if (status === 'WON') {
        const updatedMgr = await prisma.user.update({
          where: { id: ticket.user.managerId },
          data: { balance: { decrement: payout } }
        });
        await prisma.transaction.create({
          data: {
            userId: ticket.user.managerId,
            amount: -payout,
            type: 'MANAGER_PAYOUT_DEDUCTION',
            referenceId: ticket.id,
            balanceAfter: updatedMgr.balance,
            description: `Pagesë për skedinë fituese të lojtarit ${ticket.user.username} (#${ticket.id.substring(0, 8)})`
          }
        });
      } else if (status === 'LOST') {
        const updatedMgr = await prisma.user.update({
          where: { id: ticket.user.managerId },
          data: { balance: { increment: ticket.stake } }
        });
        await prisma.transaction.create({
          data: {
            userId: ticket.user.managerId,
            amount: ticket.stake,
            type: 'MANAGER_LOST_COLLECTED',
            referenceId: ticket.id,
            balanceAfter: updatedMgr.balance,
            description: `Fonde të mbledhura nga skedina humbëse e lojtarit ${ticket.user.username} (#${ticket.id.substring(0, 8)})`
          }
        });
      }
      // VOID: stake-u iu kthye lojtarit, manageri nuk ka as fitim as humbje
    }
  }
}
