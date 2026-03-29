'use client';

import { ReactNode } from 'react';
import { HeaderProvider } from '@/app/contexts/HeaderContext';

function LayoutContent({ children }: { children: ReactNode }) {
  return (
    <div className="h-full">
      {children}
    </div>
  );
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <HeaderProvider>
      <LayoutContent>{children}</LayoutContent>
    </HeaderProvider>
  );
}