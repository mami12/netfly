import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { WalletService } from '../services/walletService';
import { AuthRequest, auth, requireManager } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get all users managed by this manager
router.get('/users', auth, requireManager, async (req: AuthRequest, res) => {
  const users = await prisma.user.findMany({
    where: { managerId: req.user!.userId },
    select: { id: true, username: true, role: true, status: true, balance: true, currency: true, createdAt: true }
  });
  res.json(users);
});

// Create a new player under this manager
router.post('/users', auth, requireManager, async (req: AuthRequest, res) => {
  const { username, password, initialBalance } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return res.status(400).json({ error: 'Username already exists' });

  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: hash,
      role: 'PLAYER',
      balance: initialBalance || 0,
      managerId: req.user!.userId
    }
  });
  res.json(user);
});

// Update user (username, password, role)
router.patch('/users/:id', auth, requireManager, async (req: AuthRequest, res) => {
  const { username, password, role } = req.body;
  const userId = req.params.id;

  // Verify this user belongs to this manager
  const target = await prisma.user.findFirst({
    where: { id: userId, managerId: req.user!.userId }
  });
  if (!target) return res.status(404).json({ error: 'User not found or not managed by you' });

  const data: any = {};
  if (username) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing && existing.id !== userId) return res.status(400).json({ error: 'Username already exists' });
    data.username = username;
  }
  if (password) data.passwordHash = await bcrypt.hash(password, 10);
  if (role && ['PLAYER', 'MANAGER'].includes(role)) data.role = role;

  const user = await prisma.user.update({ where: { id: userId }, data });
  res.json(user);
});

// Delete a user (only players, not managers)
router.delete('/users/:id', auth, requireManager, async (req: AuthRequest, res) => {
  const userId = req.params.id;

  const target = await prisma.user.findFirst({
    where: { id: userId, managerId: req.user!.userId }
  });
  if (!target) return res.status(404).json({ error: 'User not found or not managed by you' });
  if (target.role === 'MANAGER' || target.role === 'ADMIN') {
    return res.status(400).json({ error: 'Cannot delete managers or admins' });
  }

  // Delete related data first
  await prisma.$transaction(async (tx) => {
    await tx.ticketLine.deleteMany({ where: { ticket: { userId } } });
    await tx.ticket.deleteMany({ where: { userId } });
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.user.delete({ where: { id: userId } });
  });

  res.json({ success: true });
});

// Change user status (ban/freeze/activate)
router.patch('/users/:id/status', auth, requireManager, async (req: AuthRequest, res) => {
  const userId = req.params.id;
  const { status } = req.body;

  const target = await prisma.user.findFirst({
    where: { id: userId, managerId: req.user!.userId }
  });
  if (!target) return res.status(404).json({ error: 'User not found or not managed by you' });

  const user = await prisma.user.update({
    where: { id: userId },
    data: { status }
  });
  res.json(user);
});

// Deposit to a managed user
router.post('/users/:id/deposit', auth, requireManager, async (req: AuthRequest, res) => {
  const userId = req.params.id;
  const amount = parseFloat(req.body.amount) || 0;

  const target = await prisma.user.findFirst({
    where: { id: userId, managerId: req.user!.userId }
  });
  if (!target) return res.status(404).json({ error: 'User not found or not managed by you' });

  const result = await WalletService.deposit(userId, amount, `Manager deposit by ${req.user!.username}`);
  res.json(result);
});

// Withdraw from a managed user
router.post('/users/:id/withdraw', auth, requireManager, async (req: AuthRequest, res) => {
  const userId = req.params.id;
  const amount = parseFloat(req.body.amount) || 0;

  const target = await prisma.user.findFirst({
    where: { id: userId, managerId: req.user!.userId }
  });
  if (!target) return res.status(404).json({ error: 'User not found or not managed by you' });

  try {
    const result = await WalletService.withdraw(userId, amount, `Manager withdrawal by ${req.user!.username}`);
    res.json(result);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Get tickets of managed users
router.get('/tickets', auth, requireManager, async (req: AuthRequest, res) => {
  const tickets = await prisma.ticket.findMany({
    where: { user: { managerId: req.user!.userId } },
    include: { user: { select: { username: true } }, lines: true },
    take: 100,
    orderBy: { placedAt: 'desc' }
  });
  res.json(tickets);
});

// Revert a ticket (refund stake, mark as REVERTED)
router.post('/tickets/:id/revert', auth, requireManager, async (req: AuthRequest, res) => {
  const ticketId = req.params.id;

  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      user: { managerId: req.user!.userId }
    },
    include: { user: true }
  });

  if (!ticket) return res.status(404).json({ error: 'Ticket not found or not managed by you' });
  if (ticket.status !== 'PENDING') return res.status(400).json({ error: 'Only pending tickets can be reverted' });
  if (!ticket.userId) return res.status(400).json({ error: 'Cannot revert guest tickets' });

  await prisma.$transaction(async (tx) => {
    // Refund the stake to the user
    const updatedUser = await tx.user.update({
      where: { id: ticket.userId! },
      data: { balance: { increment: ticket.stake } }
    });

    // Mark ticket as REVERTED
    await tx.ticket.update({
      where: { id: ticketId },
      data: { status: 'REVERTED', settledAt: new Date() }
    });

    // Update all lines to VOID
    await tx.ticketLine.updateMany({
      where: { ticketId },
      data: { status: 'VOID' }
    });

    // Create transaction record
    await tx.transaction.create({
      data: {
        userId: ticket.userId!,
        amount: ticket.stake,
        type: 'TICKET_REVERT',
        referenceId: ticketId,
        balanceAfter: updatedUser.balance,
        description: `Ticket reverted by ${req.user!.username}`
      }
    });
  });

  res.json({ success: true, refunded: ticket.stake });
});

export default router;