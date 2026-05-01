import type { Metadata } from 'next';
import './globals.css';
import ThemeRegistry from '@/components/ThemeRegistry';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'School Planner',
  description: 'Smart school schedule planner with Google Sheets, PowerSchool & Classroom integration',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ThemeRegistry>
          <AppShell>{children}</AppShell>
        </ThemeRegistry>
      </body>
    </html>
  );
}
