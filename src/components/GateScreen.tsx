import type { HTMLAttributes, ReactNode } from 'react';

type GateScreenProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function GateScreen({ children, className = '', ...props }: GateScreenProps) {
  return (
    <div {...props} className={`gate-screen ${className}`.trim()}>
      <div className="relative z-10 flex w-full justify-center">
        {children}
      </div>
    </div>
  );
}
