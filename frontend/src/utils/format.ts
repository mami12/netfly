// Utility for Albanian currency formatting and translations
// 1 EUR = 100 Lek

export function formatMoney(amount: number = 0, showEur = true): string {
  const isNegative = amount < 0;
  const abs = Math.abs(amount || 0);

  // If whole number, no decimal! e.g. 100 Lek, 10,000 Lek
  const hasDecimals = (abs % 1 !== 0) && (abs.toFixed(2).slice(-2) !== '00');

  let lekStr = '';
  if (hasDecimals) {
    const fixed = abs.toFixed(2);
    const [intPart, decPart] = fixed.split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    lekStr = `${isNegative ? '-' : ''}${formattedInt}.${decPart} Lek`;
  } else {
    const formattedInt = Math.round(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    lekStr = `${isNegative ? '-' : ''}${formattedInt} Lek`;
  }

  if (showEur) {
    const eurVal = amount / 100;
    const eurAbs = Math.abs(eurVal);
    const eurHasDecimals = (eurAbs % 1 !== 0) && (eurAbs.toFixed(2).slice(-2) !== '00');
    let eurStr = '';

    if (eurHasDecimals) {
      const eFixed = eurAbs.toFixed(2);
      const [eInt, eDec] = eFixed.split('.');
      const formattedEurInt = eInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      eurStr = `${eurVal < 0 ? '-' : ''}${formattedEurInt}.${eDec} €`;
    } else {
      const formattedEurInt = Math.round(eurAbs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      eurStr = `${eurVal < 0 ? '-' : ''}${formattedEurInt} €`;
    }

    return `${lekStr} (${eurStr})`;
  }

  return lekStr;
}

export function formatProfitLoss(diff: number = 0): {
  text: string;
  isPlus: boolean;
  statusText: string;
  colorClass: string;
} {
  const isPlus = diff >= 0;
  const formatted = formatMoney(Math.abs(diff), true);
  const prefix = isPlus ? '+' : '-';
  const statusText = isPlus ? 'në PLUS (Fitim)' : 'në MINUS (Humbje)';
  const colorClass = isPlus ? 'text-accent-green' : 'text-rose-400';

  return {
    text: `${prefix}${formatted}`,
    isPlus,
    statusText,
    colorClass
  };
}

export function translateStatus(status: string): { label: string; color: string } {
  switch (status?.toUpperCase()) {
    case 'ACTIVE':
      return { label: 'Aktiv', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    case 'FROZEN':
      return { label: 'I Ngrirë', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    case 'BANNED':
      return { label: 'I Bllokuar', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' };
    case 'PENDING':
      return { label: 'Në Pritje', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    case 'WON':
      return { label: 'Fituese', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    case 'LOST':
      return { label: 'Humbëse', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' };
    case 'REVERTED':
      return { label: 'Anuluar / Kthyer', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
    case 'VOID':
      return { label: 'E Pavlefshme', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
    case 'SUSPENDED':
      return { label: 'E Mbyllur', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' };
    case 'LIVE':
      return { label: 'Në Lojë (Live)', color: 'bg-rose-500 text-white animate-pulse border-transparent' };
    case 'PREMATCH':
      return { label: 'Para Ndeshje', color: 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' };
    case 'ENDED':
      return { label: 'Përfunduar', color: 'bg-tertiary text-text-secondary border-tertiary' };
    case 'CANCELLED':
      return { label: 'Anuluar', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
    default:
      return { label: status || '', color: 'bg-tertiary text-text-secondary border-tertiary' };
  }
}

export function translateRole(role: string): string {
  switch (role?.toUpperCase()) {
    case 'ADMIN': return 'Administrator';
    case 'MANAGER': return 'Menaxher';
    case 'PLAYER': return 'Lojtar';
    default: return role;
  }
}

export function translateTicketType(type: string): string {
  switch (type?.toUpperCase()) {
    case 'SINGLE': return 'Teke';
    case 'COMBO': return 'Kombinuar';
    case 'SYSTEM': return 'Sistem';
    default: return type;
  }
}
