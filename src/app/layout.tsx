import type { Metadata } from 'next';
import { LiveFeedProvider } from '@/hooks/use-live-feed';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'School Welfare Platform',
    template: '%s · School Welfare Platform',
  },
  description:
    'Student welfare monitoring: biometric health signals, stress flags and classroom camera integration.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LiveFeedProvider>
          <ToastProvider>{children}</ToastProvider>
        </LiveFeedProvider>
      </body>
    </html>
  );
}
