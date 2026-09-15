import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import { 
  Users, TrendingUp, DollarSign, Wallet, ArrowDownRight, ArrowUpRight, 
  Award, ShieldAlert, Percent, Scale, Coins 
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { formatMoney, formatProfitLoss } from '../../utils/format';

interface ManagerStat {
  managerId: string;
  managerUsername: string;
  managerBalance: number;
  playerCount: number;
  totalBalance: number;
  totalPlayed: number;
  totalWon: number;
  totalLost: number;
  netDifference: number;
  singleStake: number;
  singleCommission: number;
  doubleStake: number;
  doubleCommission: number;
  multiStake: number;
  multiCommission: number;
  totalCommission: number;
  cashDebt: {
    amount: number;
    direction: string;
    status: string;
  };
}

interface Stats {
  totalUsers: number;
  totalPlayers: number;
  totalManagers: number;
  activeBets: number;
  activeStake: number;
  totalPlayed: number;
  totalWon: number;
  totalLost: number;
  netDifference: number;
  totalBalances: number;
  totalCommission: number;
  commission: {
    single: { stake: number; commission: number; rate: number };
    double: { stake: number; commission: number; rate: number };
    multi: { stake: number; commission: number; rate: number };
    totalCommission: number;
  };
  managerBreakdown: ManagerStat[];
}

export default function AdminDashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'difference' | 'commission'>('difference');

  const fetchStats = () => {
    setLoading(true);
    apiClient.get('/admin/stats')
      .then(res => setStats(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading || !stats) {
    return (
      <div className="p-12 text-center text-text-secondary bg-secondary rounded-xl m-6 border border-tertiary">
        {t('common.loading')}
      </div>
    );
  }

  const pl = formatProfitLoss(stats.netDifference);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER & EXCHANGE RATE NOTICE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary p-5 rounded-2xl border border-tertiary shadow-lg">
        <div>
          <h2 className="text-2xl font-black text-white">Pasqyra Financiare e Platformës</h2>
          <p className="text-text-secondary text-xs mt-1">
            Statistikat e përgjithshme, llogaritë e menaxherëve, detyrimet kesh dhe komisionet sipas përqindjes
          </p>
        </div>
        <div className="flex items-center gap-2 bg-primary px-3.5 py-2 rounded-xl border border-tertiary text-xs font-bold text-accent-yellow">
          <span>Kursi zyrtar i llogaritjes: <strong>1 € = 100 Lek</strong></span>
        </div>
      </div>

      {/* OVERALL POSITION BANNER */}
      <div className={`p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl ${
        pl.isPlus 
          ? 'bg-emerald-950/20 border-emerald-500/40' 
          : 'bg-rose-950/20 border-rose-500/40'
      }`}>
        <div className="flex items-center gap-3.5">
          <div className={`p-3 rounded-xl ${pl.isPlus ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
            {pl.isPlus ? <ArrowUpRight size={28} /> : <ArrowDownRight size={28} />}
          </div>
          <div>
            <div className="text-xs uppercase font-bold text-text-secondary">Pozicioni Financiar i Platformës</div>
            <div className={`text-2xl font-black ${pl.colorClass}`}>
              Platforma është {pl.text} {pl.statusText}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 text-right">
          <div>
            <div className="text-xs text-text-secondary">Baste Aktive në Pritje</div>
            <div className="text-base font-bold text-white">
              {stats.activeBets} skedina ({formatMoney(stats.activeStake, true)})
            </div>
          </div>
          <div>
            <div className="text-xs text-text-secondary">Bilanci Total i Lojtarëve</div>
            <div className="text-base font-bold text-accent-green">
              {formatMoney(stats.totalBalances, true)}
            </div>
          </div>
        </div>
      </div>

      {/* 4 PRIMARY METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-secondary p-5 rounded-xl border border-tertiary shadow-md flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-text-secondary uppercase">Fonde të Luajtura Gjithsej</div>
            <div className="text-xl font-black text-accent-yellow mt-1.5">
              {formatMoney(stats.totalPlayed, true)}
            </div>
            <div className="text-[11px] text-text-secondary mt-1">Shuma e plotë e basteve</div>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="bg-secondary p-5 rounded-xl border border-tertiary shadow-md flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-text-secondary uppercase">Fitimet e Lojtarëve</div>
            <div className="text-xl font-black text-emerald-400 mt-1.5">
              {formatMoney(stats.totalWon, true)}
            </div>
            <div className="text-[11px] text-text-secondary mt-1">Shuma e paguar nga shtëpia</div>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <Award size={22} />
          </div>
        </div>

        <div className="bg-secondary p-5 rounded-xl border border-tertiary shadow-md flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-text-secondary uppercase">Humbjet e Lojtarëve</div>
            <div className="text-xl font-black text-rose-400 mt-1.5">
              {formatMoney(stats.totalLost, true)}
            </div>
            <div className="text-[11px] text-text-secondary mt-1">Baste të humbura nga lojtarët</div>
          </div>
          <div className="p-3 bg-rose-500/10 text-rose-400 rounded-xl">
            <ShieldAlert size={22} />
          </div>
        </div>

        <div className="bg-secondary p-5 rounded-xl border border-tertiary shadow-md flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-text-secondary uppercase">Komisionet e Menaxherëve (%)</div>
            <div className="text-xl font-black text-accent-green mt-1.5">
              {formatMoney(stats.totalCommission, true)}
            </div>
            <div className="text-[11px] text-text-secondary mt-1">Totali i përqindjeve të paguara</div>
          </div>
          <div className="p-3 bg-emerald-500/10 text-accent-green rounded-xl">
            <Percent size={22} />
          </div>
        </div>
      </div>

      {/* TWO SECTIONS / TABS: "Diferenca" & "%" */}
      <div className="flex border-b border-tertiary gap-2 overflow-x-auto scrollbar-none whitespace-nowrap pb-0.5">
        <button
          onClick={() => setActiveTab('difference')}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition ${
            activeTab === 'difference'
              ? 'border-accent-green text-white'
              : 'border-transparent text-text-secondary hover:text-white'
          }`}
        >
          <Scale size={18} className="text-accent-blue" />
          Tabela "Diferenca" (Llogaritë & Detyrimet Kesh)
        </button>

        <button
          onClick={() => setActiveTab('commission')}
          className={`flex items-center gap-2 pb-3 px-4 font-bold text-xs sm:text-sm border-b-2 transition ${
            activeTab === 'commission'
              ? 'border-accent-green text-white'
              : 'border-transparent text-text-secondary hover:text-white'
          }`}
        >
          <Percent size={18} className="text-accent-yellow" />
          Tabela "%" (Përqindja e Ndeshjeve & Komisionet)
        </button>
      </div>

      {/* 1. DIFFERENCE TABLE (Llogaria Financiare & Detyrimet Kesh me Menaxherët) */}
      {activeTab === 'difference' && (
        <div className="bg-secondary rounded-2xl border border-tertiary shadow-xl overflow-hidden space-y-4 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-tertiary/70 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Scale size={18} className="text-accent-blue" />
                Tabela e Diferencës & Llogarive Financiare sipas Menaxherëve
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Nëse llogaria e menaxherit është në <strong>PLUS</strong>, menaxheri duhet t'i dorëzojë kesh adminit. Nëse është në <strong>MINUS</strong>, admini duhet t'i japë kesh menaxherit për të paguar lojtarët fitues.
              </p>
            </div>
            <button 
              onClick={fetchStats}
              className="px-3.5 py-1.5 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg text-xs font-semibold self-start sm:self-auto transition"
            >
              Rifresko
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-text-primary text-xs">
              <thead className="bg-tertiary/50 uppercase text-[11px] text-text-secondary">
                <tr>
                  <th className="p-3.5">Menaxheri</th>
                  <th className="p-3.5">Lojtarë</th>
                  <th className="p-3.5">Llogaria / Bilanci i Menaxherit</th>
                  <th className="p-3.5">Detyrimi Kesh</th>
                  <th className="p-3.5 text-accent-yellow">Fonde të Luajtura</th>
                  <th className="p-3.5 text-emerald-400">Fitimet e Lojtarëve</th>
                  <th className="p-3.5 text-rose-400">Humbjet e Lojtarëve</th>
                  <th className="p-3.5 text-right">Diferenca e Shtëpisë (+/-)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tertiary/60">
                {stats.managerBreakdown?.map((m, idx) => {
                  const mgrPl = formatProfitLoss(m.netDifference);
                  const isMgrBalPlus = m.managerBalance >= 0;

                  return (
                    <tr key={idx} className="hover:bg-primary/40 transition">
                      <td className="p-3.5 font-bold text-white flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full bg-accent-blue/20 text-accent-blue flex items-center justify-center font-bold text-xs uppercase">
                          {m.managerUsername.substring(0, 2)}
                        </span>
                        {m.managerUsername}
                      </td>
                      <td className="p-3.5 font-semibold text-white">
                        {m.playerCount} lojtarë
                      </td>
                      <td className="p-3.5">
                        <span className={`font-black text-sm ${isMgrBalPlus ? 'text-blue-400' : 'text-rose-400'}`}>
                          {isMgrBalPlus ? '+' : ''}{formatMoney(m.managerBalance, true)}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {m.managerId === 'direct' ? (
                          <span className="text-text-secondary">Nuk aplikohet</span>
                        ) : isMgrBalPlus ? (
                          <span className="text-blue-400 font-bold text-[11px] bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                            Menaxheri &rarr; Adminit: {formatMoney(m.managerBalance, false)}
                          </span>
                        ) : (
                          <span className="text-rose-400 font-bold text-[11px] bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                            Admini &rarr; Menaxherit: {formatMoney(Math.abs(m.managerBalance), false)}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-black text-accent-yellow">
                        {formatMoney(m.totalPlayed, true)}
                      </td>
                      <td className="p-3.5 font-bold text-emerald-400">
                        {formatMoney(m.totalWon, true)}
                      </td>
                      <td className="p-3.5 font-bold text-rose-400">
                        {formatMoney(m.totalLost, true)}
                      </td>
                      <td className="p-3.5 text-right">
                        <span className={`px-2.5 py-1 rounded-lg font-black text-xs inline-flex items-center gap-1 ${
                          mgrPl.isPlus 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}>
                          {mgrPl.text} {mgrPl.statusText}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. COMMISSION TABLE ("%") */}
      {activeTab === 'commission' && (
        <div className="bg-secondary rounded-2xl border border-tertiary shadow-xl overflow-hidden space-y-4 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-tertiary/70 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Percent size={18} className="text-accent-yellow" />
                Tabela "%" e Komisioneve sipas Ndeshjeve për çdo Menaxher
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Ndarja e komisioneve: <strong>1 ndeshje (3%)</strong>, <strong>2 ndeshje (5%)</strong>, <strong>3+ ndeshje (7%)</strong>.
              </p>
            </div>
            <button 
              onClick={fetchStats}
              className="px-3.5 py-1.5 bg-tertiary hover:bg-tertiary/80 text-white rounded-lg text-xs font-semibold self-start sm:self-auto transition"
            >
              Rifresko
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-text-primary text-xs">
              <thead className="bg-tertiary/50 uppercase text-[11px] text-text-secondary">
                <tr>
                  <th className="p-3.5">Menaxheri</th>
                  <th className="p-3.5">Lojtarë</th>
                  <th className="p-3.5 text-right">1 Ndeshje (3%)</th>
                  <th className="p-3.5 text-right">2 Ndeshje (5%)</th>
                  <th className="p-3.5 text-right">3+ Ndeshje (7%)</th>
                  <th className="p-3.5 text-right">Totali i Luajtur</th>
                  <th className="p-3.5 text-right text-accent-green">Komisioni Total (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-tertiary/60">
                {stats.managerBreakdown?.map((m, idx) => (
                  <tr key={idx} className="hover:bg-primary/40 transition">
                    <td className="p-3.5 font-bold text-white flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-accent-yellow/20 text-accent-yellow flex items-center justify-center font-bold text-xs uppercase">
                        {m.managerUsername.substring(0, 2)}
                      </span>
                      {m.managerUsername}
                    </td>
                    <td className="p-3.5 font-semibold text-white">
                      {m.playerCount} lojtarë
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="text-white font-bold">{formatMoney(m.singleStake, false)}</div>
                      <div className="text-xs text-accent-yellow font-medium">+{formatMoney(m.singleCommission, false)}</div>
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="text-white font-bold">{formatMoney(m.doubleStake, false)}</div>
                      <div className="text-xs text-accent-blue font-medium">+{formatMoney(m.doubleCommission, false)}</div>
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="text-white font-bold">{formatMoney(m.multiStake, false)}</div>
                      <div className="text-xs text-emerald-400 font-medium">+{formatMoney(m.multiCommission, false)}</div>
                    </td>
                    <td className="p-3.5 text-right font-black text-white text-sm">
                      {formatMoney(m.totalPlayed, true)}
                    </td>
                    <td className="p-3.5 text-right font-black text-accent-green text-sm">
                      +{formatMoney(m.totalCommission, true)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}