import { PrismaClient } from '@prisma/client';
import { WalletService } from './walletService';

const prisma = new PrismaClient();

export class BetSettler {
  static async settleMatch(matchId: string, homeScore: number, awayScore: number) {
    const match = await prisma.match.update({
      where: { id: matchId },
      data: {
        status: 'ENDED',
        homeScore,
        awayScore,
        currentMinute: 90
      },
      include: {
        markets: { include: { outcomes: true } }
      }
    });

    const totalGoals = homeScore + awayScore;
    const homeWin = homeScore > awayScore;
    const awayWin = awayScore > homeScore;
    const draw = homeScore === awayScore;
    const bothScored = homeScore > 0 && awayScore > 0;

    for (const market of match.markets) {
      if (market.status === 'SETTLED') continue;

      for (const outcome of market.outcomes) {
        let isWinner = false;

        switch (market.marketType) {
          case '1X2':
            if (outcome.name === '1' && homeWin) isWinner = true;
            if (outcome.name === 'X' && draw) isWinner = true;
            if (outcome.name === '2' && awayWin) isWinner = true;
            break;
          case 'OVER_UNDER':
            const specifier = parseFloat(market.specifier || '2.5');
            if (outcome.name === 'Over' && totalGoals > specifier) isWinner = true;
            if (outcome.name === 'Under' && totalGoals < specifier) isWinner = true;
            break;
          case 'BOTH_TEAMS_SCORE':
            if (outcome.name === 'Yes' && bothScored) isWinner = true;
            if (outcome.name === 'No' && !bothScored) isWinner = true;
            break;
          case 'DOUBLE_CHANCE':
            if (outcome.name === '1X' && (homeWin || draw)) isWinner = true;
            if (outcome.name === '12' && (homeWin || awayWin)) isWinner = true;
            if (outcome.name === 'X2' && (awayWin || draw)) isWinner = true;
            break;
        }

        await prisma.outcome.update({
          where: { id: outcome.id },
          data: { isWinner, status: 'SETTLED' }
        });
      }

      await prisma.market.update({
        where: { id: market.id },
        data: { status: 'SETTLED' }
      });
    }

    // Process tickets
    const ticketLines = await prisma.ticketLine.findMany({
      where: { matchId, status: 'PENDING' },
      include: { outcome: true }
    });

    for (const line of ticketLines) {
      const outcome = await prisma.outcome.findUnique({ where: { id: line.outcomeId } });
      const lineStatus = outcome?.isWinner ? 'WON' : 'LOST';
      await prisma.ticketLine.update({
        where: { id: line.id },
        data: { status: lineStatus }
      });

      // Check if ticket is fully settled
      const ticket = await prisma.ticket.findUnique({
        where: { id: line.ticketId },
        include: { lines: true }
      });

      if (ticket && ticket.status === 'PENDING') {
        const allSettled = ticket.lines.every(l => l.status !== 'PENDING');
        if (allSettled) {
          let ticketStatus = 'WON';
          if (ticket.ticketType === 'SINGLE' || ticket.ticketType === 'COMBO') {
            if (ticket.lines.some(l => l.status === 'LOST')) {
              ticketStatus = 'LOST';
            }
          } else {
             // Basic system type handling (just simplified logic for now)
             if (ticket.lines.some(l => l.status === 'LOST')) ticketStatus = 'LOST';
          }

          await prisma.ticket.update({
            where: { id: ticket.id },
            data: { status: ticketStatus, settledAt: new Date() }
          });

          if (ticketStatus === 'WON' && ticket.userId) {
            await WalletService.creditWinnings(ticket.userId, ticket.potentialPayout, ticket.id);
          }
        }
      }
    }
  }
}
