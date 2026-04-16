const palette = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-fuchsia-500',
  'bg-amber-500',
  'bg-indigo-500',
  'bg-cyan-500',
  'bg-rose-500',
];

interface AvatarProps {
  initials: string;
  index?: number;
}

export function Avatar({ initials, index = 0 }: AvatarProps) {
  const color = palette[index % palette.length];
  return (
    <div className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-semibold text-white ${color}`}>
      {initials}
    </div>
  );
}
