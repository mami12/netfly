import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { WalletService } from '../services/walletService';
import { BetSettler } from '../services/betSettler';

const router = Router();
const prisma = new PrismaClient();

router.get('/stats', async (req, res) => {
  const [users, activeBets, totalStakeAgg, revenueAgg] = await Promise.all([
    prisma.user.count(),
    prisma.ticket.count({ where: { status: 'PENDING' } }),
    prisma.ticket.aggregate({ _sum: { stake: true }, where: { status: 'PENDING' } }),
    prisma.ticket.aggregate({ _sum: { stake: true }, where: { status: 'WON' } })
  ]);

  const totalStake = totalStakeAgg._sum.stake || 0;
  const totalPaidOut = revenueAgg._sum.stake || 0;

  res.json({
    users,
    activeBets,
    totalStake,
    revenue: totalStake - totalPaidOut
  });
});

router.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true, username: true, role: true, status: true, balance: true, currency: true, managerId: true, createdAt: true,
      manager: { select: { id: true, username: true } },
      _count: { select: { managedUsers: true } }
    }
  });
  res.json(users);
});

router.post('/users', async (req, res) => {
  const { username, password, initialBalance, role, managerId } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(400).json({ error: 'Username already exists' });

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: hash,
      role: role || 'PLAYER',
      balance: initialBalance || 0,
      managerId: managerId || null
    }
  });
  res.json(user);
});

router.patch('/users/:id', async (req, res) => {
  const { username, password, role, managerId } = req.body;
  const userId = req.params.id;

  const data: any = {};
  if (username) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing && existing.id !== userId) return res.status(400).json({ error: 'Username already exists' });
    data.username = username;
  }
  if (password) data.passwordHash = await bcrypt.hash(password, 10);
  if (role && ['ADMIN', 'MANAGER', 'PLAYER'].includes(role)) data.role = role;
  if (managerId !== undefined) data.managerId = managerId;

  const user = await prisma.user.update({ where: { id: userId }, data });
  res.json(user);
});

router.delete('/users/:id', async (req, res) => {
  const userId = req.params.id;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'ADMIN') return res.status(400).json({ error: 'Cannot delete admin accounts' });

  await prisma.$transaction(async (tx) => {
    if (target.role === 'MANAGER') {
      const managedUsers = await tx.user.findMany({ where: { managerId: userId } });
      for (const mu of managedUsers) {
        await tx.ticketLine.deleteMany({ where: { ticket: { userId: mu.id } } });
        await tx.ticket.deleteMany({ where: { userId: mu.id } });
        await tx.transaction.deleteMany({ where: { userId: mu.id } });
      }
      await tx.user.deleteMany({ where: { managerId: userId } });
    }

    await tx.ticketLine.deleteMany({ where: { ticket: { userId } } });
    await tx.ticket.deleteMany({ where: { userId } });
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });

  res.json({ success: true });
});

router.patch('/users/:id/status', async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { status: req.body.status }
  });
  res.json(user);
});

router.post('/users/:id/deposit', async (req, res) => {
  const result = await WalletService.deposit(req.params.id, req.body.amount, 'Admin deposit');
  res.json(result);
});

router.post('/users/:id/withdraw', async (req, res) => {
  try {
    const result = await WalletService.withdraw(req.params.id, req.body.amount, 'Admin withdrawal');
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/tickets', async (req, res) => {
  const tickets = await prisma.ticket.findMany({ 
    include: { user: true, lines: true }, 
    take: 100,
    orderBy: { placedAt: 'desc' }
  });
  res.json(tickets);
});

router.post('/tickets/:id/revert', async (req, res) => {
  const ticketId = req.params.id;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { user: true }
  });

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
  if (ticket.status !== 'PENDING') return res.status(400).json({ error: 'Only pending tickets can be reverted' });
  if (!ticket.userId) return res.status(400).json({ error: 'Cannot revert guest tickets' });

  await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: ticket.userId! },
      data: { balance: { increment: ticket.stake } }
    });

    await tx.ticket.update({
      where: { id: ticketId },
      data: { status: 'REVERTED', settledAt: new Date() }
    });

    await tx.ticketLine.updateMany({
      where: { ticketId },
      data: { status: 'VOID' }
    });

    await tx.transaction.create({
      data: {
        userId: ticket.userId!,
        amount: ticket.stake,
        type: 'TICKET_REVERT',
        referenceId: ticketId,
        balanceAfter: updatedUser.balance,
        description: 'Ticket reverted by admin'
      }
    });
  });

  res.json({ success: true, refunded: ticket.stake });
});

router.get('/matches', async (req, res) => {
  const matches = await prisma.match.findMany({ 
    include: { 
      tournament: true,
      markets: { include: { outcomes: true } }
    },
    orderBy: { startTime: 'asc' }
  });
  res.json(matches);
});

router.patch('/matches/:id/suspend', async (req, res) => {
  const match = await prisma.match.update({
    where: { id: req.params.id },
    data: { isSuspended: req.body.isSuspended }
  });
  res.json(match);
});

router.patch('/markets/:id/suspend', async (req, res) => {
  const market = await prisma.market.update({
    where: { id: req.params.id },
    data: { status: req.body.status }
  });
  res.json(market);
});

router.patch('/outcomes/:id/odds', async (req, res) => {
  const outcome = await prisma.outcome.update({
    where: { id: req.params.id },
    data: { odds: req.body.odds }
  });
  res.json(outcome);
});

router.post('/matches/:id/settle', async (req, res) => {
  await BetSettler.settleMatch(req.params.id, req.body.homeScore, req.body.awayScore);
  res.json({ success: true });
});

export default router;
