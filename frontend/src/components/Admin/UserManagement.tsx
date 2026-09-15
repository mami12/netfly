import { useState, useEffect } from 'react';
import { apiClient } from '../../api/client';
import { User } from '../../types';
import { Plus, ShieldAlert, CheckCircle, Ban, ArrowDownRight, ArrowUpRight, Trash2, Edit3, Users as UsersIcon } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatMoney, formatProfitLoss, translateRole, translateStatus } from '../../utils/format';

export default function UserManagement() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState<'deposit' | 'withdraw' | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  
  // New User Form State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [initialBalance, setInitialBalance] = useState('100');
  const [role, setRole] = useState('PLAYER');
  const [managerId, setManagerId] = useState('');

  // Edit User Form State
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editManagerId, setEditManagerId] = useState('');

  const managers = users.filter(u => u.role === 'MANAGER');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/admin/users');
      setUsers(res.data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/admin/users', {
        username,
        password,
        initialBalance: parseFloat(initialBalance) || 0,
        role,
        managerId: role === 'PLAYER' ? managerId || null : null
      });
      setShowCreateModal(false);
      setUsername('');
      setPassword('');
      setInitialBalance('100');
      setRole('PLAYER');
      setManagerId('');
      fetchUsers();
      alert('Përdoruesi u krijua me sukses!');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Krijimi i përdoruesit dështoi');
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      const data: any = {};
      if (editUsername && editUsername !== selectedUser.username) data.username = editUsername;
      if (editPassword) data.password = editPassword;
      if (editRole && editRole !== selectedUser.role) data.role = editRole;
      if (editManagerId !== undefined) data.managerId = editManagerId || null;

      if (Object.keys(data).length > 0) {
        await apiClient.patch(`/admin/users/${selectedUser.id}`, data);
      }
      setShowEditModal(false);
      setSelectedUser(null);
      setEditUsername('');
      setEditPassword('');
      setEditRole('');
      setEditManagerId('');
      fetchUsers();
      alert('Përdoruesi u përditësua me sukses!');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Përditësimi dështoi');
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`A je i sigurt që dëshiron të fshish përdoruesin "${username}"? Ky veprim heq llogarinë dhe të gjitha të dhënat e lidhura.`)) return;
    try {
      await apiClient.delete(`/admin/users/${userId}`);
      fetchUsers();
      alert('Përdoruesi u fshi me sukses!');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Fshirja dështoi');
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    try {
      await apiClient.patch(`/admin/users/${userId}/status`, { status: newStatus });
      fetchUsers();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Përditësimi i statusit dështoi');
    }
  };

  const handleBalanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !amount) return;
    try {
      const val = parseFloat(amount);
      if (showBalanceModal === 'deposit') {
        await apiClient.post(`/admin/users/${selectedUser.id}/deposit`, { amount: val });
      } else {
        await apiClient.post(`/admin/users/${selectedUser.id}/withdraw`, { amount: val });
      }
      setShowBalanceModal(null);
      setSelectedUser(null);
      setAmount('');
      fetchUsers();
      alert('Bilanci u përditësua me sukses!');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Transaksioni dështoi');
    }
  };

  const openEditModal = (u: User) => {
    setSelectedUser(u);
    setEditUsername(u.username);
    setEditPassword('');
    setEditRole(u.role);
    setEditManagerId(u.managerId || '');
    setShowEditModal(true);
  };

  const filteredUsers = selectedManagerId
    ? users.filter(u => u.managerId === selectedManagerId)
    : users;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
      case 'MANAGER': return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
      default: return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Menaxhimi i të Gjithë Përdoruesve</h2>
          <p className="text-text-secondary text-xs mt-0.5">
            Krijo dhe kontrollo llogaritë e administratorëve, menaxherëve dhe lojtarëve
          </p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-accent-green hover:bg-emerald-600 text-primary px-4 py-2.5 rounded-lg font-bold flex items-center gap-2 transition shadow-lg shadow-accent-green/20 text-xs"
        >
          <Plus size={16} /> Krijo Përdorues të Ri
        </button>
      </div>

      {/* FILTER BY MANAGER */}
      {managers.length > 0 && (
        <div className="flex items-center gap-2.5 bg-secondary p-3 rounded-xl border border-tertiary">
          <UsersIcon size={16} className="text-accent-blue" />
          <span className="text-xs font-bold text-text-secondary">Filtro sipas Menaxherit:</span>
          <select
            value={selectedManagerId}
            onChange={e => setSelectedManagerId(e.target.value)}
            className="bg-primary border border-tertiary rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-accent-green"
          >
            <option value="">Të Gjithë Përdoruesit ({users.length})</option>
            {managers.map(m => (
              <option key={m.id} value={m.id}>
                {m.username} ({m._count?.managedUsers || 0} lojtarë)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* USERS TABLE */}
      <div className="bg-secondary rounded-xl border border-tertiary shadow-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-text-secondary">Duke ngarkuar llogaritë...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-text-primary text-xs">
              <thead className="bg-tertiary/60 uppercase text-[11px] text-text-secondary">
                <tr>
                  <th className="p-3.5">Përdoruesi</th>
                  <th className="p-3.5">Roli</th>
                  <th className="p-3.5">Statusi</th>
                  <th className="p-3.5">Bilanci</th>
                  <th className="p-3.5 text-accent-yellow">Fonde të Luajtura</th>
                  <th className="p-3.5 text-emerald-400">Fitimet</th>
                  <th className="p-3.5">Diferenca</th>
                  <th className="p-3.5">Menaxheri</th>
                  <th className="p-3.5 text-right">Veprimet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tertiary">
                {filteredUsers.map(u => {
                  const st = translateStatus(u.status);
                  const userPl = formatProfitLoss(((u as any).totalPlayed ?? 0) - ((u as any).totalWon ?? 0));

                  return (
                    <tr key={u.id} className="hover:bg-primary/40 transition">
                      <td className="p-3.5 font-bold text-white flex items-center gap-2">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs uppercase ${
                          u.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-400' :
                          u.role === 'MANAGER' ? 'bg-amber-500/20 text-amber-400' : 'bg-accent-blue/20 text-accent-blue'
                        }`}>
                          {u.username.substring(0, 2)}
                        </span>
                        {u.username}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${getRoleBadge(u.role)}`}>
                          {translateRole(u.role)}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1 ${st.color}`}>
                          {u.status === 'ACTIVE' && <CheckCircle size={11} />}
                          {u.status === 'FROZEN' && <ShieldAlert size={11} />}
                          {u.status === 'BANNED' && <Ban size={11} />}
                          {st.label}
                        </span>
                      </td>
                      <td className="p-3.5 text-sm font-bold text-white">
                        {formatMoney(u.balance, true)}
                      </td>
                      <td className="p-3.5 text-sm font-black text-accent-yellow">
                        {u.role === 'PLAYER' ? formatMoney((u as any).totalPlayed ?? 0, true) : '-'}
                      </td>
                      <td className="p-3.5 text-sm font-bold text-emerald-400">
                        {u.role === 'PLAYER' ? formatMoney((u as any).totalWon ?? 0, true) : '-'}
                      </td>
                      <td className="p-3.5">
                        {u.role === 'PLAYER' ? (
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            userPl.isPlus ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            {userPl.text}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-3.5 text-xs text-text-secondary">
                        {u.manager?.username ? (
                          <span className="font-bold text-amber-400">{u.manager.username}</span>
                        ) : u.role === 'MANAGER' ? (
                          <span className="font-bold text-white">{u._count?.managedUsers || 0} lojtarë</span>
                        ) : (
                          <span className="text-text-secondary italic">I Pavarur</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button 
                            onClick={() => { setSelectedUser(u); setShowBalanceModal('deposit'); }}
                            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold flex items-center gap-1"
                            title="Shto Kredi (Depozito)"
                          >
                            <ArrowUpRight size={13} /> Shto
                          </button>
                          <button 
                            onClick={() => { setSelectedUser(u); setShowBalanceModal('withdraw'); }}
                            className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg text-xs font-bold flex items-center gap-1"
                            title="Tërheq Kredi"
                          >
                            <ArrowDownRight size={13} /> Tërheq
                          </button>
                          <button 
                            onClick={() => openEditModal(u)}
                            className="p-1.5 bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue rounded-lg text-xs font-bold flex items-center gap-1"
                            title="Modifiko të Dhënat"
                          >
                            <Edit3 size={13} />
                          </button>
                          {u.role !== 'ADMIN' && (
                            <>
                              {u.status === 'ACTIVE' ? (
                                <button 
                                  onClick={() => handleStatusChange(u.id, 'FROZEN')}
                                  className="px-2 py-1 bg-tertiary hover:bg-amber-500/20 text-text-secondary hover:text-amber-400 rounded-lg text-[11px] font-bold"
                                  title="Ngrì llogarinë"
                                >
                                  Ngrì
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleStatusChange(u.id, 'ACTIVE')}
                                  className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-[11px] font-bold"
                                  title="Aktivizo llogarinë"
                                >
                                  Aktivizo
                                </button>
                              )}
                              {u.status !== 'BANNED' && (
                                <button 
                                  onClick={() => handleStatusChange(u.id, 'BANNED')}
                                  className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-[11px] font-bold"
                                  title="Blloko llogarinë"
                                >
                                  Blloko
                                </button>
                              )}
                              <button 
                                onClick={() => handleDeleteUser(u.id, u.username)}
                                className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-bold"
                                title="Fshij llogarinë"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white">Krijo Llogari të Re</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">Përdoruesi (Username)</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent-green" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">FjaLekalimi</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent-green" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">Roli i Llogarisë</label>
                <select value={role} onChange={e => setRole(e.target.value)} className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent-green">
                  <option value="PLAYER">Lojtar (Baste)</option>
                  <option value="MANAGER">Menaxher (Sub-Admin)</option>
                  <option value="ADMIN">Administrator Kryesor</option>
                </select>
              </div>
              {role === 'PLAYER' && managers.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">Lidhe me Menaxher (Referral)</label>
                  <select value={managerId} onChange={e => setManagerId(e.target.value)} className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent-green">
                    <option value="">Pa Menaxher (Lojtar i Pavarur)</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.id}>{m.username}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">Bilanci Fillestar (Lek)</label>
                <input type="number" value={initialBalance} onChange={e => setInitialBalance(e.target.value)} min="0" step="1" required className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent-green" />
              </div>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 py-2.5 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-xs transition">Anulo</button>
                <button type="submit" className="flex-1 py-2.5 bg-accent-green hover:bg-emerald-600 text-primary rounded-lg font-bold text-xs transition shadow-lg shadow-accent-green/20">Krijo Llogarinë</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white">Modifiko Përdoruesin: {selectedUser.username}</h3>
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">Përdoruesi</label>
                <input type="text" value={editUsername} onChange={e => setEditUsername(e.target.value)} required className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent-green" />
              </div>
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">FjaLekalimi i Ri (Lëre bosh nëse s'do ta ndryshosh)</label>
                <input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Lëre bosh..." className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent-green" />
              </div>
              {selectedUser.role !== 'ADMIN' && (
                <div>
                  <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">Roli</label>
                  <select value={editRole} onChange={e => setEditRole(e.target.value)} className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent-green">
                    <option value="PLAYER">Lojtar</option>
                    <option value="MANAGER">Menaxher</option>
                  </select>
                </div>
              )}
              {editRole === 'PLAYER' && managers.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">Menaxheri Përgjegjës</label>
                  <select value={editManagerId} onChange={e => setEditManagerId(e.target.value)} className="w-full bg-primary border border-tertiary rounded-lg p-2.5 text-white text-sm focus:outline-none focus:border-accent-green">
                    <option value="">Pa Menaxher (I Pavarur)</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.id}>{m.username}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 py-2.5 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-xs transition">Anulo</button>
                <button type="submit" className="flex-1 py-2.5 bg-accent-green hover:bg-emerald-600 text-primary rounded-lg font-bold text-xs transition shadow-lg shadow-accent-green/20">Ruaj Ndryshimet</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BALANCE MODAL */}
      {showBalanceModal && selectedUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-secondary border border-tertiary rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-white capitalize">
              {showBalanceModal === 'deposit' ? 'Shto Kredi (Depozito)' : 'Tërheq Kredi'}
            </h3>
            <p className="text-xs text-text-secondary">
              Përdoruesi: <strong className="text-white">{selectedUser.username}</strong> | Bilanci aktual: <strong className="text-accent-green">{formatMoney(selectedUser.balance, true)}</strong>
            </p>
            <form onSubmit={handleBalanceSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-text-secondary uppercase block mb-1">Shuma (Lek)</label>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="1" step="1" required autoFocus className="w-full bg-primary border border-tertiary rounded-lg p-3 text-white focus:outline-none focus:border-accent-green text-lg font-bold" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowBalanceModal(null)} className="flex-1 py-2.5 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg font-semibold text-xs transition">Anulo</button>
                <button type="submit" className={`flex-1 py-2.5 rounded-lg font-bold text-xs transition ${showBalanceModal === 'deposit' ? 'bg-accent-green hover:bg-emerald-600 text-primary' : 'bg-amber-500 hover:bg-amber-600 text-primary'}`}>
                  {showBalanceModal === 'deposit' ? 'Konfirmo Shtimin' : 'Konfirmo Tërheqjen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}