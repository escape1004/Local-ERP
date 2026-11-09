import type { ReactNode } from 'react';

type GateCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
};

export function GateCard({ title, description, children, className = 'max-w-5xl' }: GateCardProps) {
  return (
    <div className={`w-full rounded-2xl border border-gray-700 bg-discord-sidebar/95 shadow-2xl ${className}`}>
      <div className="border-b border-gray-700 px-8 py-6">
        <h2 className="text-2xl font-semibold text-white">{title}</h2>
        <p className="mt-2 text-sm text-discord-muted">{description}</p>
      </div>
      <div className="p-8">{children}</div>
    </div>
  );
}
