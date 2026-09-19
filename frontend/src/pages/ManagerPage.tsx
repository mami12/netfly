import { useState, useEffect } from 'react';
import Header from '../components/Layout/Header';
import { useLanguage } from '../context/LanguageContext';
import { apiClient } from '../api/client';
import { User, Ticket } from '../types';
import { 
  Plus, ShieldAlert, CheckCircle, Ban, ArrowDownRight, ArrowUpRight, 
  Trash2, Edit3, RotateCcw, Users as UsersIcon, Ticket as TicketIcon,
  ChevronDown, ChevronUp, Wallet, TrendingUp, CheckCircle2, XCircle, Clock, Filter, Award,
  Percent, Scale, AlertCircle, Coins
} from 'lucide-react';
import { formatMoney, formatProfitLoss, translateStatus, translateTicketType } from '../utils/format';
import { marketLabel, outcomeLabel } from '../utils/labels';

interface CommissionTier {
  stake: number;
  count: number;
  commission: number;
  rate: number;
}

interface ManagerStats {
  managerBalance: number;
  totalPlayers: number;
  totalPlayerBalance: number;
  totalPlayedFunds: number;
  totalWonFunds: number;
  totalLostFunds: number;
  netDifference: number;
  isPlus: boolean;
  totalTickets: number;
  commission: {
    single: CommissionTier;
    double: CommissionTier;
    multi: CommissionTier;
    totalCommission: number;
  };
  cashDebt: {
    amount: number;
    direction: 'MANAGER_OWES_ADMIN' | 'ADMIN_OWES_MANAGER';
    status: string;
  };
}

export default function ManagerPage() {
  const { t, tm } = useLanguage();

  /** Emrat e tregjeve/opsioneve vijne ne anglisht nga feed-i -> etiketa shqip. */
  const lineMarket = (name?: string) => marketLabel(name || '', t, tm);
  const lineOutcome = (name?: string, market?: string, matchName?: string) =>
    outcomeLabel(name || '', { marketName: market, teams: String(matchName || '').split(/\s+vs\s+/i) });
  const [tab, setTab] = useState<'users' | 'commission' | 'difference' | 'tickets'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<ManagerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState<'deposit' | 'withdraw' | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [amount, setAmount] = useState('');

  // Ticket inspection & filter state
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Create form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [initialBalance, setInitialBalance] = useState('0');

  // Edit form
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');

  const fetchStats = async () => {
    try {
      const res = await apiClient.get('/manager/stats');
      setStats(res.data);
    } catch (e) {
      console.error('Failed to fetch manager stats', e);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/manager/users');
      setUsers(res.data);
      fetchStats();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (filterUserId) params.userId = filterUserId;
      if (filterStatus && filterStatus !== 'ALL') params.status = filterStatus;
      
      const res = await apiClient.get('/manager/tickets', { params });
      setTickets(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (tab === 'tickets') fetchTickets();
    else fetchUsers();
  }, [tab, filterUserId, filterStatus]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const initBal = parseFloat(initialBalance) || 0;
    if (stats && initBal > stats.managerBalance) {
      alert(`Fondet e pamjaftueshme në llogarinë tuaj! Keni vetëm ${formatMoney(stats.managerBalance, false)}.`);
      return;
    }

    try {
      await apiClient.post('/manager/users', {
        username,
        password,
        initialBalance: initBal
      });
      setShowCreateModal(false);
      setUsername('');
      setPassword('');
      setInitialBalance('0');
      fetchUsers();
      alert('Llogaria e lojtarit u krijua me sukses dhe fondet u zbritën nga llogaria juaj!');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Krijimi i lojtarit dështoi');
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      const data: any = {};
      if (editUsername && editUsername !== selectedUser.username) data.username = editUsername;
      if (editPassword) data.password = editPassword;
      if (Object.keys(data).length > 0) {
        await apiClient.patch(`/manager/users/${selectedUser.id}`, data);
      }
      setShowEditModal(false);
      setSelectedUser(null);
      setEditUsername('');
      setEditPassword('');
      fetchUsers();
      alert('Të dhënat e lojtarit u përditësuan me sukses!');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Përditësimi dështoi');
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`A je i sigurt që dëshiron të fshish lojtarin "${username}"? Kjo do të heqë llogarinë dhe të gjitha skedinat.`)) return;
    try {
      await apiClient.delete(`/manager/users/${userId}`);
      fetchUsers();
      alert('Lojtari u fshi me sukses!');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Fshirja e lojtarit dështoi');
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    try {
      await apiClient.patch(`/manager/users/${userId}/status`, { status: newStatus });
      fetchUsers();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Ndryshimi i statusit dështoi');
    }
  };

  const handleBalanceAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !showBalanceModal) return;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      alert('Vendosni një shumë të vlefshme');
      return;
    }

    if (showBalanceModal === 'deposit' && stats && val > stats.managerBalance) {
      alert(`Fondet e pamjaftueshme në llogarinë tuaj! Keni vetëm ${formatMoney(stats.managerBalance, false)}.`);
      return;
    }

    try {
      const endpoint = `/manager/users/${selectedUser.id}/${showBalanceModal}`;
      await apiClient.post(endpoint, { amount: val });
      setShowBalanceModal(null);
      setSelectedUser(null);
      setAmount('');
      fetchUsers();
      alert(showBalanceModal === 'deposit' 
        ? `Depozitimi u krye me sukses! ${formatMoney(val, false)} u zbritën nga llogaria juaj.`
        : `Tërheqja u krye me sukses! ${formatMoney(val, false)} u shtuan në llogarinë tuaj.`
      );
    } catch (e: any) {
      alert(e.response?.data?.error || 'Veprimi me bilancin dështoi');
    }
  };

  const handleRevertTicket = async (ticketId: string) => {
    if (!confirm('A jeni të sigurt që dëshironi të ktheni këtë skedinë? Shuma e bastit do t\'i kthehet menjëherë lojtarit.')) return;
    try {
      const res = await apiClient.post(`/manager/tickets/${ticketId}/revert`);
      alert(`Skedina u kthye me sukses! ${formatMoney(res.data.refunded, false)} iu rimbursuan lojtarit.`);
      fetchTickets();
      fetchStats();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Dështoi kthimi i skedinës');
    }
  };

  const openBalanceModal = (u: any, action: 'deposit' | 'withdraw') => {
    setSelectedUser(u);
    setShowBalanceModal(action);
    setAmount('');
  };

  const openEditModal = (u: any) => {
    setSelectedUser(u);
    setEditUsername(u.username);
    setEditPassword('');
    setShowEditModal(true);
  };

  const viewUserTickets = (userId: string) => {
    setFilterUserId(userId);
    setTab('tickets');
  };

  const pl = formatProfitLoss(stats?.netDifference ?? 0);
  const managerBal = stats?.managerBalance ?? 0;
  const isManagerPlus = managerBal >= 0;

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      <Header />
      
      {/* POSITION BANNER & FINANCIAL SUMMARY */}
      <div className="bg-secondary border-b border-tertiary px-4 sm:px-6 py-4 sm:py-5">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-white">Paneli i Menaxhimit të Lojtarëve</h2>
              <p className="text-text-secondary text-xs mt-0.5">
                Menaxho lojtarët, fondet e tyre, komisionet sipas përqindjes dhe llogarinë tënde financiare
              </p>
            </div>
            <div className="flex items-center gap-2 bg-primary px-3.5 py-1.5 rounded-xl border border-tertiary text-xs font-bold text-accent-yellow">
              <span>Kursi zyrtar: <strong>1 € = 100 Lek</strong></span>
            </div>
          </div>

          {/* MANAGER BALANCE & CASH DEBT NOTIFICATION BANNER */}
          <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg ${
            isManagerPlus 
              ? 'bg-blue-950/20 border-blue-500/40' 
              : 'bg-rose-950/20 border-rose-500/40'
          }`}>
            <div className="flex items-center gap-3.5">
              <div className={`p-3 rounded-xl ${isManagerPlus ? 'bg-blue-500/20 text-blue-400' : 'bg-rose-500/20 text-rose-400'}`}>
                <Wallet size={26} />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase text-text-secondary">Llogaria / Bilanci i Menaxherit</div>
                <div className={`text-2xl font-black ${isManagerPlus ? 'text-blue-400' : 'text-rose-400'}`}>
                  {isManagerPlus ? '+' : ''}{formatMoney(managerBal, true)}
                </div>
              </div>
            </div>

            <div className="bg-primary/80 border border-tertiary/80 p-3 rounded-xl max-w-xl text-xs space-y-1">
              <div className="font-bold text-white flex items-center gap-1.5">
                <Coins size={14} className={isManagerPlus ? 'text-blue-400' : 'text-rose-400'} />
                Statusi i Detyrimit Kesh me Administratorin:
              </div>
              <div className="text-text-secondary text-[11px]">
                {isManagerPlus ? (
                  <span>
                    <strong className="text-blue-400">Ju i keni detyrim Adminit {formatMoney(managerBal, true)}</strong> kesh në dorë (nga humbjet e mbledhura të lojtarëve).
                  </span>
                ) : (
                  <span>
                    <strong className="text-rose-400">Admini ju ka detyrim juve {formatMoney(Math.abs(managerBal), true)}</strong> kesh në dorë për të shlyer klientët fitues.
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* HOUSE PROFIT / LOSS BANNER */}
          <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            pl.isPlus 
              ? 'bg-emerald-950/20 border-emerald-500/40' 
              : 'bg-rose-950/20 border-rose-500/40'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${pl.isPlus ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {pl.isPlus ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-text-secondary">Diferenca e Shtëpisë / Menaxherit</div>
                <div className={`text-base font-black ${pl.colorClass}`}>
                  Ju jeni {pl.text} {pl.statusText}
                </div>
              </div>
            </div>

            <div className="text-xs text-text-secondary sm:text-right">
              <div>Fonde të Luajtura: <strong>{formatMoney(stats?.totalPlayedFunds ?? 0, false)}</strong> &bull; Fitimet e Lojtarëve: <strong>{formatMoney(stats?.totalWonFunds ?? 0, false)}</strong></div>
            </div>
          </div>

          {/* 4 PRIMARY METRIC CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="bg-primary/70 border border-tertiary rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-text-secondary uppercase">Fonde të Luajtura</div>
                <div className="text-lg font-black text-accent-yellow mt-1">
                  {formatMoney(stats?.totalPlayedFunds ?? 0, true)}
                </div>
              </div>
              <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                <TrendingUp size={20} />
              </div>
            </div>

            <div className="bg-primary/70 border border-tertiary rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-text-secondary uppercase">Fitimet e Lojtarëve</div>
                <div className="text-lg font-black text-emerald-400 mt-1">
                  {formatMoney(stats?.totalWonFunds ?? 0, true)}
                </div>
              </div>
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                <Award size={20} />
              </div>
            </div>

            <div className="bg-primary/70 border border-tertiary rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-text-secondary uppercase">Humbjet e Lojtarëve</div>
                <div className="text-lg font-black text-rose-400 mt-1">
                  {formatMoney(stats?.totalLostFunds ?? 0, true)}
                </div>
              </div>
              <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg">
                <ShieldAlert size={20} />
              </div>
            </div>

            <div className="bg-primary/70 border border-tertiary rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold text-text-secondary uppercase">Komisioni Total (%)</div>
                <div className="text-lg font-black text-accent-green mt-1">
                  {formatMoney(stats?.commission?.totalCommission ?? 0, true)}
                </div>
              </div>
              <div className="p-2 bg-emerald-500/10 text-accent-green rounded-lg">
                <Percent size={20} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-3 sm:pt-5">
        <div className="flex border-b border-tertiary gap-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setTab('users')}
            className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition whitespace-nowrap ${
              tab === 'users'
                ? 'border-accent-green text-white'
                : 'border-transparent text-text-secondary hover:text-white'
            }`}
          >
            <UsersIcon size={18} />
            Menaxhimi i Lojtarëve ({users.length})
          </button>

          <button
            onClick={() => setTab('commission')}
            className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition whitespace-nowrap ${
              tab === 'commission'
                ? 'border-accent-green text-white'
                : 'border-transparent text-text-secondary hover:text-white'
            }`}
          >
            <Percent size={18} className="text-accent-yellow" />
            % (Përqindja & Komisionet)
          </button>

          <button
            onClick={() => setTab('difference')}
            className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition whitespace-nowrap ${
              tab === 'difference'
                ? 'border-accent-green text-white'
                : 'border-transparent text-text-secondary hover:text-white'
            }`}
          >
            <Scale size={18} className="text-accent-blue" />
            Diferenca (Llogaria Financiare)
          </button>

          <button
            onClick={() => setTab('tickets')}
            className={`flex items-center gap-2 pb-3 px-4 font-bold text-sm border-b-2 transition whitespace-nowrap ${
              tab === 'tickets'
                ? 'border-accent-green text-white'
                : 'border-transparent text-text-secondary hover:text-white'
            }`}
          >
            <TicketIcon size={18} />
            Auditimi i Skedinave ({tickets.length})
          </button>
        </div>
      </div>

      {/* TAB CONTENT */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 flex-1">

        {/* 1. USERS MANAGEMENT TAB */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Lista e Lojtarëve nën Menaxhim</h3>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-sm transition shadow-lg shadow-accent-green/20"
              >
                <Plus size={16} /> Krijo Lojtar të Ri
              </button>
            </div>

            <div className="bg-secondary rounded-xl border border-tertiary overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-text-secondary">
                  <thead className="bg-primary/50 text-[11px] uppercase tracking-wider text-text-secondary border-b border-tertiary">
                    <tr>
                      <th className="p-4">Lojtari</th>
                      <th className="p-4">Statusi</th>
                      <th className="p-4 text-right">Bilanci Aktual</th>
                      <th className="p-4 text-right">Fonde të Luajtura</th>
                      <th className="p-4 text-right">Fitimet e Lojtarit</th>
                      <th className="p-4 text-right">Diferenca</th>
                      <th className="p-4 text-center">Skedina</th>
                      <th className="p-4 text-right">Veprime</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tertiary">
                    {loading ? (
                      <tr><td colSpan={8} className="p-8 text-center text-text-secondary">Duke ngarkuar lojtarët...</td></tr>
                    ) : users.length === 0 ? (
                      <tr><td colSpan={8} className="p-8 text-center text-text-secondary">Nuk keni krijuar ende asnjë lojtar.</td></tr>
                    ) : (
                      users.map(u => {
                        const userPl = formatProfitLoss(u.netDifference);
                        const statusObj = translateStatus(u.status);

                        return (
                          <tr key={u.id} className="hover:bg-primary/30 transition">
                            <td className="p-4">
                              <div className="font-bold text-white text-base">{u.username}</div>
                              <div className="text-[11px] text-text-secondary">Krijuar: {new Date(u.createdAt).toLocaleDateString()}</div>
                            </td>
                            <td className="p-4">
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusObj.color}`}>
                                {statusObj.label}
                              </span>
                            </td>
                            <td className="p-4 text-right font-bold text-accent-green text-base">
                              {formatMoney(u.balance, true)}
                            </td>
                            <td className="p-4 text-right font-bold text-accent-yellow">
                              {formatMoney(u.totalPlayedFunds, true)}
                            </td>
                            <td className="p-4 text-right font-bold text-emerald-400">
                              {formatMoney(u.totalWonFunds, true)}
                            </td>
                            <td className="p-4 text-right">
                              <span className={`font-black ${userPl.colorClass}`}>
                                {userPl.text}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => viewUserTickets(u.id)}
                                className="px-2.5 py-1 bg-tertiary hover:bg-tertiary/80 text-white rounded text-xs font-bold transition"
                              >
                                {u.totalTickets} Skedina
                              </button>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => openBalanceModal(u, 'deposit')}
                                  className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition"
                                  title="Depozito Fonde (Zbriten nga llogaria juaj)"
                                >
                                  <ArrowDownRight size={16} />
                                </button>
                                <button
                                  onClick={() => openBalanceModal(u, 'withdraw')}
                                  className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition"
                                  title="Tërhiq Fonde (Shtohen në llogarinë tuaj)"
                                >
                                  <ArrowUpRight size={16} />
                                </button>
                                <button
                                  onClick={() => handleStatusChange(u.id, u.status === 'ACTIVE' ? 'FROZEN' : 'ACTIVE')}
                                  className={`p-1.5 rounded-lg transition ${
                                    u.status === 'ACTIVE' 
                                      ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400' 
                                      : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400'
                                  }`}
                                  title={u.status === 'ACTIVE' ? 'Pezullo' : 'Aktivizo'}
                                >
                                  {u.status === 'ACTIVE' ? <Ban size={16} /> : <CheckCircle size={16} />}
                                </button>
                                <button
                                  onClick={() => openEditModal(u)}
                                  className="p-1.5 bg-tertiary hover:bg-tertiary/80 text-text-secondary hover:text-white rounded-lg transition"
                                  title="Ndrysho të Dhënat"
                                >
                                  <Edit3 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u.id, u.username)}
                                  className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition"
                                  title="Fshi Lojtarin"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 2. COMMISSION TAB ("%") */}
        {tab === 'commission' && (
          <div className="space-y-6">
            <div className="bg-secondary p-5 rounded-2xl border border-tertiary space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-accent-yellow/20 text-accent-yellow rounded-xl">
                  <Percent size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Tabela e Përqindjeve & Komisioneve të Menaxherit (%)</h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Komisioni i llogaritur automatikisht për çdo skedinë: <strong>3% për 1 ndeshje (teke)</strong>, <strong>5% për 2 ndeshje</strong>, dhe <strong>7% për 3 ndeshje e sipër</strong>.
                  </p>
                </div>
              </div>

              {/* TIER STATS GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
                <div className="bg-primary/80 border border-tertiary rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-text-secondary uppercase">1 Ndeshje (Teke - 3%)</span>
                    <span className="text-xs font-mono font-bold bg-accent-yellow/20 text-accent-yellow px-2 py-0.5 rounded">3%</span>
                  </div>
                  <div className="text-lg font-black text-white mt-2">
                    {formatMoney(stats?.commission?.single?.stake ?? 0, true)}
                  </div>
                  <div className="text-xs font-bold text-accent-green mt-1">
                    Komisioni: +{formatMoney(stats?.commission?.single?.commission ?? 0, true)} ({stats?.commission?.single?.count ?? 0} skedina)
                  </div>
                </div>

                <div className="bg-primary/80 border border-tertiary rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-text-secondary uppercase">2 Ndeshje (5%)</span>
                    <span className="text-xs font-mono font-bold bg-accent-blue/20 text-accent-blue px-2 py-0.5 rounded">5%</span>
                  </div>
                  <div className="text-lg font-black text-white mt-2">
                    {formatMoney(stats?.commission?.double?.stake ?? 0, true)}
                  </div>
                  <div className="text-xs font-bold text-accent-green mt-1">
                    Komisioni: +{formatMoney(stats?.commission?.double?.commission ?? 0, true)} ({stats?.commission?.double?.count ?? 0} skedina)
                  </div>
                </div>

                <div className="bg-primary/80 border border-tertiary rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-text-secondary uppercase">3+ Ndeshje (Kombinuar - 7%)</span>
                    <span className="text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">7%</span>
                  </div>
                  <div className="text-lg font-black text-white mt-2">
                    {formatMoney(stats?.commission?.multi?.stake ?? 0, true)}
                  </div>
                  <div className="text-xs font-bold text-accent-green mt-1">
                    Komisioni: +{formatMoney(stats?.commission?.multi?.commission ?? 0, true)} ({stats?.commission?.multi?.count ?? 0} skedina)
                  </div>
                </div>
              </div>

              {/* TOTAL COMMISSION BANNER */}
              <div className="p-3.5 bg-emerald-950/25 border border-emerald-500/40 rounded-xl flex items-center justify-between">
                <span className="text-xs uppercase font-bold text-text-secondary">Totali i Komisionit të Fituar nga Menaxheri:</span>
                <span className="text-xl font-black text-accent-green">
                  +{formatMoney(stats?.commission?.totalCommission ?? 0, true)}
                </span>
              </div>
            </div>

            {/* DETAILED COMMISSION TABLE BY USER */}
            <div className="bg-secondary rounded-xl border border-tertiary overflow-hidden shadow-xl">
              <div className="p-4 border-b border-tertiary flex justify-between items-center">
                <h4 className="font-bold text-white text-base">Komisionet sipas Lojtarëve</h4>
                <span className="text-xs text-text-secondary">Shuma e luajtur dhe përqindja e fituar për çdo lojtar</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-text-secondary">
                  <thead className="bg-primary/50 text-[11px] uppercase tracking-wider text-text-secondary border-b border-tertiary">
                    <tr>
                      <th className="p-4">Lojtari</th>
                      <th className="p-4 text-right">1 Ndeshje (3%)</th>
                      <th className="p-4 text-right">2 Ndeshje (5%)</th>
                      <th className="p-4 text-right">3+ Ndeshje (7%)</th>
                      <th className="p-4 text-right">Totali i Luajtur</th>
                      <th className="p-4 text-right text-accent-green">Komisioni Total (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tertiary">
                    {users.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-text-secondary">Nuk ka të dhëna lojtarësh.</td></tr>
                    ) : (
                      users.map(u => (
                        <tr key={u.id} className="hover:bg-primary/30 transition">
                          <td className="p-4">
                            <div className="font-bold text-white text-base">{u.username}</div>
                            <div className="text-[11px] text-text-secondary">{u.totalTickets} skedina</div>
                          </td>
                          <td className="p-4 text-right">
                            <div className="text-white font-bold">{formatMoney(u.singleStake, false)}</div>
                            <div className="text-xs text-accent-yellow font-medium">+{formatMoney(u.singleCommission, false)}</div>
                          </td>
                          <td className="p-4 text-right">
                            <div className="text-white font-bold">{formatMoney(u.doubleStake, false)}</div>
                            <div className="text-xs text-accent-blue font-medium">+{formatMoney(u.doubleCommission, false)}</div>
                          </td>
                          <td className="p-4 text-right">
                            <div className="text-white font-bold">{formatMoney(u.multiStake, false)}</div>
                            <div className="text-xs text-emerald-400 font-medium">+{formatMoney(u.multiCommission, false)}</div>
                          </td>
                          <td className="p-4 text-right font-bold text-white text-base">
                            {formatMoney(u.totalPlayedFunds, true)}
                          </td>
                          <td className="p-4 text-right font-black text-accent-green text-base">
                            +{formatMoney(u.totalCommission, true)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. DIFFERENCE & FINANCIAL OBLIGATION TAB ("Diferenca") */}
        {tab === 'difference' && (
          <div className="space-y-6">
            <div className="bg-secondary p-5 rounded-2xl border border-tertiary space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-accent-blue/20 text-accent-blue rounded-xl">
                  <Scale size={22} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Tabela e Diferencës & Llogarisë Financiare</h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Raporti i saktë financiar: Fondet e marra nga Admini, Humbjet e lojtarëve (+ në arkë), dhe Fitimet e lojtarëve (- nga arka).
                  </p>
                </div>
              </div>

              {/* FINANCIAL STATUS OVERVIEW CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-primary/80 border border-tertiary rounded-xl p-4 space-y-1">
                  <div className="text-xs font-bold text-text-secondary uppercase">Skedina të Humbura nga Lojtarët (+)</div>
                  <div className="text-xl font-black text-rose-400">
                    +{formatMoney(stats?.totalLostFunds ?? 0, true)}
                  </div>
                  <div className="text-[11px] text-text-secondary">Para të mbledhura në arkë (Detyrim për t'ia dorëzuar Adminit)</div>
                </div>

                <div className="bg-primary/80 border border-tertiary rounded-xl p-4 space-y-1">
                  <div className="text-xs font-bold text-text-secondary uppercase">Skedina të Fituara nga Lojtarët (-)</div>
                  <div className="text-xl font-black text-emerald-400">
                    -{formatMoney(stats?.totalWonFunds ?? 0, true)}
                  </div>
                  <div className="text-[11px] text-text-secondary">Pagesa të zbritura nga llogaria juaj për fituesit</div>
                </div>

                <div className="bg-primary/80 border border-tertiary rounded-xl p-4 space-y-1">
                  <div className="text-xs font-bold text-text-secondary uppercase">Llogaria Përfundimtare e Menaxherit</div>
                  <div className={`text-xl font-black ${isManagerPlus ? 'text-blue-400' : 'text-rose-400'}`}>
                    {isManagerPlus ? '+' : ''}{formatMoney(managerBal, true)}
                  </div>
                  <div className="text-[11px] text-text-secondary">
                    {isManagerPlus ? 'Detyrim kesh ndaj Adminit' : 'Admini ju detyrohet kesh në dorë'}
                  </div>
                </div>
              </div>

              {/* CASH DEBT INSTRUCTION BOX */}
              <div className={`p-4 rounded-xl border flex items-center gap-3.5 ${
                isManagerPlus ? 'bg-blue-950/20 border-blue-500/40' : 'bg-rose-950/20 border-rose-500/40'
              }`}>
                <div className={`p-2.5 rounded-xl ${isManagerPlus ? 'bg-blue-500/20 text-blue-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  <Coins size={24} />
                </div>
                <div className="text-sm">
                  {isManagerPlus ? (
                    <div>
                      <strong className="text-white block mb-0.5">Detyrimi Juaj Kesh:</strong>
                      <span className="text-text-secondary">
                        Llogaria juaj është në plus me <strong className="text-blue-400">{formatMoney(managerBal, true)}</strong>. Ju duhet t'i dorëzoni këtë shumë kesh në dorë Administratorit.
                      </span>
                    </div>
                  ) : (
                    <div>
                      <strong className="text-white block mb-0.5">Detyrimi i Administratorit Kesh:</strong>
                      <span className="text-text-secondary">
                        Llogaria juaj ka kaluar në minus me <strong className="text-rose-400">{formatMoney(Math.abs(managerBal), true)}</strong> sepse klientët kanë fituar më shumë se fondet. Administratori do t'ju japë këtë shumë kesh në dorë për të paguar klientët fitues.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* FINANCIAL DIFFERENCE TABLE PER USER */}
            <div className="bg-secondary rounded-xl border border-tertiary overflow-hidden shadow-xl">
              <div className="p-4 border-b border-tertiary flex justify-between items-center">
                <h4 className="font-bold text-white text-base">Pasqyra Financiare e Diferencës sipas Lojtarëve</h4>
                <span className="text-xs text-text-secondary">Fitimi dhe humbja neto për çdo lojtar</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-text-secondary">
                  <thead className="bg-primary/50 text-[11px] uppercase tracking-wider text-text-secondary border-b border-tertiary">
                    <tr>
                      <th className="p-4">Lojtari</th>
                      <th className="p-4 text-right">Bilanci Aktual</th>
                      <th className="p-4 text-right">Fonde të Luajtura</th>
                      <th className="p-4 text-right">Fitimet e Lojtarit</th>
                      <th className="p-4 text-right">Humbjet e Lojtarit</th>
                      <th className="p-4 text-right">Diferenca e Menaxherit (+/-)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-tertiary">
                    {users.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-text-secondary">Nuk ka të dhëna lojtarësh.</td></tr>
                    ) : (
                      users.map(u => {
                        const userPl = formatProfitLoss(u.netDifference);
                        return (
                          <tr key={u.id} className="hover:bg-primary/30 transition">
                            <td className="p-4 font-bold text-white text-base">{u.username}</td>
                            <td className="p-4 text-right font-bold text-accent-green">{formatMoney(u.balance, true)}</td>
                            <td className="p-4 text-right font-bold text-accent-yellow">{formatMoney(u.totalPlayedFunds, true)}</td>
                            <td className="p-4 text-right font-bold text-emerald-400">{formatMoney(u.totalWonFunds, true)}</td>
                            <td className="p-4 text-right font-bold text-rose-400">{formatMoney(u.totalLostFunds, true)}</td>
                            <td className="p-4 text-right">
                              <span className={`font-black text-base ${userPl.colorClass}`}>
                                {userPl.text}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 4. TICKETS INSPECTION TAB */}
        {tab === 'tickets' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary p-4 rounded-xl border border-tertiary">
              <div className="flex items-center gap-2">
                <TicketIcon size={18} className="text-accent-green" />
                <h3 className="font-bold text-white text-base">Inspektimi i Skedinave të Lojtarëve</h3>
              </div>

              <div className="flex items-center gap-3">
                {/* Filter by User */}
                <select
                  value={filterUserId}
                  onChange={e => setFilterUserId(e.target.value)}
                  className="bg-primary border border-tertiary rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent-green"
                >
                  <option value="">Të gjithë lojtarët</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>

                {/* Filter by Status */}
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="bg-primary border border-tertiary rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent-green"
                >
                  <option value="ALL">Të gjitha statuset</option>
                  <option value="PENDING">Në Pritje</option>
                  <option value="WON">Fituese</option>
                  <option value="LOST">Humbëse</option>
                  <option value="REVERTED">Të Kthyera</option>
                </select>

                <button
                  onClick={fetchTickets}
                  className="px-3 py-1.5 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg text-xs font-bold transition"
                >
                  Rifresko
                </button>
              </div>
            </div>

            <div className="bg-secondary rounded-xl border border-tertiary shadow-xl overflow-hidden">
              {loading ? (
                <div className="p-12 text-center text-text-secondary">Duke ngarkuar skedinat...</div>
              ) : tickets.length === 0 ? (
                <div className="p-12 text-center text-text-secondary flex flex-col items-center gap-2">
                  <TicketIcon size={32} className="opacity-30" />
                  Nuk u gjet asnjë skedinë me këto kritere.
                </div>
              ) : (
                <div className="divide-y divide-tertiary">
                  {tickets.map(t => {
                    const isExpanded = expandedTicketId === t.id;
                    const statusObj = translateStatus(t.status);

                    return (
                      <div key={t.id} className="p-4 hover:bg-primary/30 transition">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className={`p-2.5 rounded-xl flex items-center justify-center ${
                              t.status === 'WON' ? 'bg-emerald-500/20 text-emerald-400' :
                              t.status === 'LOST' ? 'bg-rose-500/20 text-rose-400' :
                              t.status === 'REVERTED' ? 'bg-purple-500/20 text-purple-400' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                              {t.status === 'WON' && <CheckCircle2 size={20} />}
                              {t.status === 'LOST' && <XCircle size={20} />}
                              {t.status === 'REVERTED' && <RotateCcw size={20} />}
                              {t.status === 'PENDING' && <Clock size={20} />}
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-white text-base">
                                  Skedinë #{t.id.substring(0, 8)}
                                </span>
                                {t.bookingCode && (
                                  <span className="text-xs bg-accent-blue/20 text-accent-blue font-mono px-2 py-0.5 rounded font-bold">
                                    Kodi: {t.bookingCode}
                                  </span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                                  t.status === 'WON' ? 'bg-emerald-500/20 text-emerald-400' :
                                  t.status === 'LOST' ? 'bg-rose-500/20 text-rose-400' :
                                  t.status === 'REVERTED' ? 'bg-purple-500/20 text-purple-400' : 'bg-amber-500/20 text-amber-400'
                                }`}>
                                  {statusObj.label}
                                </span>
                              </div>

                              <div className="text-xs text-text-secondary mt-1 flex items-center gap-3">
                                <span>Lojtari: <strong className="text-white">{(t as any).user?.username || 'Vizitor'}</strong></span>
                                <span>&bull;</span>
                                <span>Lloji: <strong className="text-accent-yellow uppercase">{translateTicketType(t.ticketType)}</strong></span>
                                <span>&bull;</span>
                                <span>Koeficienti: <strong className="text-white">{t.totalOdds.toFixed(2)}</strong></span>
                                <span>&bull;</span>
                                <span>Vendosur: {new Date(t.placedAt).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-6">
                            <div className="text-right">
                              <div className="text-xs text-text-secondary">Shuma / Fitimi Potencial</div>
                              <div className="text-sm font-bold text-white">
                                {formatMoney(t.stake, false)} &rarr; <span className="text-accent-green text-base">{formatMoney(t.potentialPayout, false)}</span>
                              </div>
                            </div>

                            {t.status === 'PENDING' && (
                              <button
                                onClick={() => handleRevertTicket(t.id)}
                                className="px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                                title="Kthe skedinën dhe rimburso lojtarin"
                              >
                                <RotateCcw size={14} /> Kthe
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedTicketId(isExpanded ? null : t.id)}
                              className="p-2 bg-tertiary hover:bg-tertiary/80 text-text-secondary hover:text-white rounded-lg transition"
                              title="Shiko ndeshjet e luajtura"
                            >
                              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </button>
                          </div>
                        </div>

                        {/* EXPANDED MATCHES INSPECTION */}
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-tertiary/60 space-y-2">
                            <div className="text-xs font-bold uppercase text-text-secondary tracking-wider mb-2">
                              Ndeshjet e Luajtura ({t.lines?.length || 0})
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {t.lines?.map((line: any) => (
                                <div key={line.id} className="bg-primary p-3 rounded-lg border border-tertiary flex justify-between items-center text-xs">
                                  <div className="space-y-0.5">
                                    <div className="text-text-secondary font-medium">{line.matchName}</div>
                                    <div className="font-semibold text-white">
                                      {lineMarket(line.marketName)}:{' '}
                                      <span className="text-accent-green font-bold">
                                        {lineOutcome(line.outcomeName, line.marketName, line.matchName)}
                                      </span>
                                    </div>
                                    {line.match && (
                                      <div className="text-[10px] text-text-secondary">
                                        Statusi: <strong className="text-accent-blue">{line.match.status}</strong> 
                                        {line.match.status === 'LIVE' || line.match.status === 'ENDED' ? ` (${line.match.homeScore} - ${line.match.awayScore})` : ''}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-right">
                                    <span className="font-black text-white px-2 py-0.5 bg-secondary rounded border border-tertiary">
                                      {line.oddsAtPlacement?.toFixed(2) || line.odds?.toFixed(2)}
                                    </span>
                                    <div className="mt-1 font-bold text-[10px] uppercase">
                                      <span className={
                                        line.status === 'WON' ? 'text-emerald-400' :
                                        line.status === 'LOST' ? 'text-rose-400' : 'text-amber-400'
                                      }>
                                        {line.status === 'WON' ? 'FITUESE' : line.status === 'LOST' ? 'HUMBËSE' : 'NË PRITJE'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-1">Krijo Lojtar të Ri</h3>
            <p className="text-xs text-text-secondary mb-4">
              Lojtari do të lidhet automatikisht me llogarinë tuaj të menaxherit.
            </p>

            <div className="p-3 bg-primary/80 border border-tertiary rounded-xl mb-4 text-xs">
              <div className="text-text-secondary">Fondet tuaja të disponueshme:</div>
              <div className="text-base font-black text-blue-400">
                {formatMoney(stats?.managerBalance ?? 0, true)}
              </div>
              <div className="text-[11px] text-accent-yellow mt-0.5">
                Shuma e bilancit fillestar do të zbritet nga llogaria juaj!
              </div>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">Emri i Përdoruesit</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="p.sh. lojtar1"
                  required
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">Fjalëkalimi</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">Bilanci Fillestar (Lek)</label>
                <input
                  type="number"
                  value={initialBalance}
                  onChange={e => setInitialBalance(e.target.value)}
                  min="0"
                  max={stats?.managerBalance ?? 0}
                  step="1"
                  placeholder="0"
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green text-sm font-bold"
                />
                {stats && parseFloat(initialBalance) > stats.managerBalance && (
                  <div className="text-rose-400 text-xs mt-1 font-bold">
                    Kjo shumë tejkalon bilancin tuaj të disponueshëm ({formatMoney(stats.managerBalance, false)})!
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-sm transition"
                >
                  Anulo
                </button>
                <button
                  type="submit"
                  disabled={stats ? parseFloat(initialBalance) > stats.managerBalance : false}
                  className="flex-1 py-3 bg-accent-green hover:bg-emerald-600 disabled:opacity-50 text-primary font-bold rounded-lg text-sm transition shadow-lg shadow-accent-green/20"
                >
                  Krijo Lojtarin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BALANCE MODAL (DEPOSIT / WITHDRAW) */}
      {showBalanceModal && selectedUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-1">
              {showBalanceModal === 'deposit' ? 'Depozito te Lojtari' : 'Tërhiq nga Lojtari'}
            </h3>
            <p className="text-xs text-text-secondary mb-4">
              Lojtari: <strong className="text-white">{selectedUser.username}</strong> &bull; Bilanci i lojtarit: <strong className="text-accent-green">{formatMoney(selectedUser.balance, false)}</strong>
            </p>

            {showBalanceModal === 'deposit' && (
              <div className="p-3 bg-primary/80 border border-tertiary rounded-xl mb-4 text-xs">
                <div className="text-text-secondary">Fondet tuaja të disponueshme:</div>
                <div className="text-base font-black text-blue-400">
                  {formatMoney(stats?.managerBalance ?? 0, true)}
                </div>
                <div className="text-[11px] text-accent-yellow mt-0.5">
                  Kjo shumë do të zbritet nga llogaria juaj e menaxherit.
                </div>
              </div>
            )}

            <form onSubmit={handleBalanceAction} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">Shuma (Lek)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  min="1"
                  max={showBalanceModal === 'deposit' ? (stats?.managerBalance ?? undefined) : selectedUser.balance}
                  step="1"
                  required
                  placeholder="p.sh. 500"
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green text-lg font-bold"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBalanceModal(null)}
                  className="flex-1 py-3 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-sm transition"
                >
                  Anulo
                </button>
                <button
                  type="submit"
                  className={`flex-1 py-3 font-bold rounded-lg text-sm transition shadow-lg ${
                    showBalanceModal === 'deposit'
                      ? 'bg-accent-green hover:bg-emerald-600 text-primary shadow-accent-green/20'
                      : 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                  }`}
                >
                  {showBalanceModal === 'deposit' ? 'Konfirmo Depozitën' : 'Konfirmo Tërheqjen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-1">Përditëso Lojtarin</h3>
            <p className="text-xs text-text-secondary mb-4">
              Përditëso emrin e përdoruesit ose vendos fjalëkalim të ri.
            </p>
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">Emri i Përdoruesit</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={e => setEditUsername(e.target.value)}
                  required
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1.5">Fjalëkalim i Ri (opsionale)</label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={e => setEditPassword(e.target.value)}
                  placeholder="Lëre bosh për ta mbajtur"
                  className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green text-sm"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-sm transition"
                >
                  Anulo
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-accent-green hover:bg-emerald-600 text-primary font-bold rounded-lg text-sm transition shadow-lg shadow-accent-green/20"
                >
                  Ruaj Ndryshimet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}