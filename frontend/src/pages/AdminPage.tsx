import { useState } from 'react';
import Header from '../components/Layout/Header';
import AdminDashboard from '../components/Admin/AdminDashboard';
import UserManagement from '../components/Admin/UserManagement';
import MatchControl from '../components/Admin/MatchControl';
import TicketAudit from '../components/Admin/TicketAudit';
import { useLanguage } from '../context/LanguageContext';

export default function AdminPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'dashboard' | 'users' | 'matches' | 'tickets'>('dashboard');

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      <Header />
      <div className="bg-secondary border-b border-tertiary px-4 sm:px-6 overflow-x-auto scrollbar-none">
        <div className="flex gap-4 sm:gap-8 whitespace-nowrap min-w-max">
          {['dashboard', 'users', 'matches', 'tickets'].map(tabId => (
            <button 
              key={tabId}
              onClick={() => setTab(tabId as any)}
              className={`py-3.5 sm:py-4 text-xs sm:text-sm font-semibold capitalize transition ${tab === tabId ? 'text-accent-green border-b-2 border-accent-green' : 'text-text-secondary hover:text-white'}`}
            >
              {t(`admin.${tabId}`)}
            </button>
          ))}
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {tab === 'dashboard' && <AdminDashboard />}
        {tab === 'users' && <UserManagement />}
        {tab === 'matches' && <MatchControl />}
        {tab === 'tickets' && <TicketAudit />}
      </div>
    </div>
  );
}
