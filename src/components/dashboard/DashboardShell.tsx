'use client';

import { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export interface DashboardShellProps {
  brandName: string;
  lastUpdated: string | null;
  children: ReactNode;
}

export function DashboardShell({
  brandName,
  lastUpdated,
  children,
}: DashboardShellProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar onBatchComplete={() => router.refresh()} />
      <div className="ml-[200px] flex min-h-screen flex-col">
        <Header brandName={brandName} lastUpdated={lastUpdated} />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1400px] p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
