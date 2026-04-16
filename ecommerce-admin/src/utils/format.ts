export function formatNumber(value: number): string {
  return value.toLocaleString('tr-TR');
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number): string {
  return `%${value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`;
}
