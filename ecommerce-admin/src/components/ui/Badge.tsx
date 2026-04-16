interface BadgeProps {
  text: string;
  tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

const toneClassMap: Record<NonNullable<BadgeProps['tone']>, string> = {
  success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300',
  warning: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300',
  danger: 'bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-red-300',
  info: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-300',
  neutral: 'bg-gray-100 text-gray-600 dark:bg-zinc-700 dark:text-zinc-200',
};

export function Badge({ text, tone = 'neutral' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClassMap[tone]}`}
    >
      {text}
    </span>
  );
}
