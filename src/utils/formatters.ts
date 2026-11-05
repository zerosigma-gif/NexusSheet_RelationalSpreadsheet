import { ColumnType } from '../types/spreadsheet';

export function formatCellValue(value: any, type: ColumnType, currencyCode = 'IDR'): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  switch (type) {
    case 'currency': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      if (currencyCode === 'IDR') {
        return new Intl.NumberFormat('id-ID', {
          style: 'currency',
          currency: 'IDR',
          maximumFractionDigits: 0,
        }).format(num);
      }
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
      }).format(num);
    }

    case 'number': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      return new Intl.NumberFormat('id-ID').format(num);
    }

    case 'percentage': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      return `${num.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
    }

    case 'date': {
      if (!value) return '—';
      try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return String(value);
        return d.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      } catch {
        return String(value);
      }
    }

    case 'boolean': {
      return value ? 'Ya' : 'Tidak';
    }

    case 'rating': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      return `★ ${num.toFixed(1)}`;
    }

    default:
      return String(value);
  }
}

export const CATEGORY_PALETTES: Record<string, { bg: string; text: string; border: string }> = {
  'Identifikasi': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
  'Relasi Entitas': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  'Finansial & Volume': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'Logistik & Waktu': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'Status & Operasional': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  'Profil & Identitas': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  'Klasifikasi Pasar': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  'Geografis': { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  'Komersial & Biaya': { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  'Gudang & Inventaris': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  'Mutu & Supplier': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  'Default': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
};

export function getCategoryBadgeStyle(categoryName: string) {
  return CATEGORY_PALETTES[categoryName] || CATEGORY_PALETTES['Default'];
}
