import type { CSSProperties, ReactNode } from 'react';

type GateCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function GateCard({ title, description, children, className = 'w-full max-w-5xl', style }: GateCardProps) {
  return (
    <div className={`rounded-2xl border border-gray-700 bg-discord-sidebar/95 shadow-2xl ${className}`} style={style}>
      <div className="border-b border-gray-700 px-8 py-6">
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm text-discord-muted">{description}</p>
      </div>
      <div className="p-8">{children}</div>
    </div>
  );
}
