import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { Menu, X, Wallet, LogOut, Shield, Users, Ticket as TicketIcon, Globe } from 'lucide-react';
import { formatMoney } from '../../utils/format';

export default function Header() {
  const { user, logout } = useAuth();
  const { t, lang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-secondary border-b border-tertiary text-text-primary sticky top-0 z-40 shadow-md">
      <div className="h-16 flex items-center justify-between px-4 sm:px-6">
        {/* LOGO */}
        <div 
          className="text-xl font-black text-accent-green cursor-pointer flex items-center gap-2 tracking-wider" 
          onClick={() => { navigate('/'); setMobileMenuOpen(false); }}
        >
          <span>NETFLY</span>
          <span className="text-white text-xs px-2 py-0.5 bg-primary rounded font-bold border border-tertiary">SPORT</span>
        </div>
        
        {/* DESKTOP NAV */}
        <div className="hidden md:flex items-center gap-5">
          {/* Language Switcher */}
          <div className="flex items-center gap-1.5 bg-primary border border-tertiary rounded-lg px-2.5 py-1">
            <Globe size={14} className="text-text-secondary" />
            <select
              value={lang}
              onChange={e => setLanguage(e.target.value as any)}
              className="bg-transparent text-xs text-text-primary focus:outline-none cursor-pointer font-semibold"
            >
              <option value="al" className="bg-secondary">Shqip</option>
              <option value="en" className="bg-secondary">English</option>
              <option value="de" className="bg-secondary">Deutsch</option>
              <option value="fr" className="bg-secondary">Français</option>
            </select>
          </div>

          {user && (
            <>
              {user.role === 'ADMIN' && (
                <button 
                  onClick={() => navigate('/admin')}
                  className="flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-white transition py-1 px-2.5 rounded-lg hover:bg-primary"
                >
                  <Shield size={15} className="text-accent-blue" />
                  {t('nav.admin')}
                </button>
              )}
              {user.role === 'MANAGER' && (
                <button 
                  onClick={() => navigate('/manager')}
                  className="flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-white transition py-1 px-2.5 rounded-lg hover:bg-primary"
                >
                  <Users size={15} className="text-accent-yellow" />
                  {t('manager.my_users')}
                </button>
              )}
              {user.role === 'PLAYER' && (
                <button 
                  onClick={() => navigate('/my-bets')}
                  className="flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-white transition py-1 px-2.5 rounded-lg hover:bg-primary"
                >
                  <TicketIcon size={15} className="text-accent-green" />
                  {t('nav.myBets')}
                </button>
              )}
              
              {/* BALANCE DISPLAY */}
              <div className="flex items-center gap-2 bg-primary/90 px-3 py-1.5 rounded-xl border border-tertiary shadow-sm">
                <Wallet size={15} className="text-accent-yellow" />
                <span className="font-black text-sm text-accent-yellow">
                  {formatMoney(user.balance, true)}
                </span>
              </div>

              <button 
                onClick={() => { logout(); navigate('/login'); }} 
                className="flex items-center gap-1 text-xs font-bold text-rose-400 hover:text-rose-300 py-1.5 px-2.5 rounded-lg hover:bg-rose-500/10 transition"
              >
                <LogOut size={14} />
                {t('nav.logout')}
              </button>
            </>
          )}
        </div>

        {/* MOBILE USER BALANCE & HAMBURGER */}
        <div className="flex md:hidden items-center gap-2.5">
          {user && (
            <div className="flex items-center gap-1.5 bg-primary px-2.5 py-1 rounded-lg border border-tertiary">
              <Wallet size={13} className="text-accent-yellow" />
              <span className="font-bold text-xs text-accent-yellow">
                {formatMoney(user.balance, false)}
              </span>
            </div>
          )}

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 bg-primary border border-tertiary rounded-lg text-text-secondary hover:text-white focus:outline-none"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* MOBILE DROPDOWN MENU */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-secondary border-t border-tertiary px-4 py-4 space-y-3 shadow-2xl animate-in slide-in-from-top duration-200">
          {user && (
            <div className="p-3 bg-primary rounded-xl border border-tertiary flex items-center justify-between">
              <div>
                <div className="text-xs text-text-secondary">Përdoruesi:</div>
                <div className="text-sm font-bold text-white">{user.username}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-text-secondary">Bilanci:</div>
                <div className="text-sm font-black text-accent-yellow">
                  {formatMoney(user.balance, true)}
                </div>
              </div>
            </div>
          )}

          {/* Mobile Navigation Links */}
          <div className="space-y-1">
            {user?.role === 'ADMIN' && (
              <button
                onClick={() => { navigate('/admin'); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-primary text-white font-bold text-sm transition"
              >
                <Shield size={18} className="text-accent-blue" />
                {t('nav.admin')}
              </button>
            )}

            {user?.role === 'MANAGER' && (
              <button
                onClick={() => { navigate('/manager'); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-primary text-white font-bold text-sm transition"
              >
                <Users size={18} className="text-accent-yellow" />
                {t('manager.my_users')}
              </button>
            )}

            {user?.role === 'PLAYER' && (
              <button
                onClick={() => { navigate('/my-bets'); setMobileMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-primary text-white font-bold text-sm transition"
              >
                <TicketIcon size={18} className="text-accent-green" />
                {t('nav.myBets')}
              </button>
            )}
          </div>

          {/* Language Switcher on Mobile */}
          <div className="pt-2 border-t border-tertiary flex items-center justify-between text-xs">
            <span className="text-text-secondary font-bold">Gjuha:</span>
            <div className="flex gap-1.5">
              {[
                { code: 'al', label: 'Shqip' },
                { code: 'en', label: 'English' },
                { code: 'de', label: 'Deutsch' },
                { code: 'fr', label: 'Français' }
              ].map(item => (
                <button
                  key={item.code}
                  onClick={() => setLanguage(item.code as any)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition ${
                    lang === item.code 
                      ? 'bg-accent-green text-primary' 
                      : 'bg-primary text-text-secondary hover:text-white border border-tertiary'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Logout on Mobile */}
          {user && (
            <div className="pt-2 border-t border-tertiary">
              <button
                onClick={() => { logout(); navigate('/login'); setMobileMenuOpen(false); }}
                className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold rounded-lg text-sm flex items-center justify-center gap-2 transition"
              >
                <LogOut size={16} />
                {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}