import { AlertsDock } from '@/components/live/alerts-dock';
import { AuditLog } from '@/components/admin/audit-log';
import { AppShell } from '@/components/shell/app-shell';
import { adminNavItems } from '@/components/shell/admin-nav';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Audit Log' };

/** Admin page: global alert history (data loaded client-side with filters). */
export default function AdminAuditPage() {
  return (
    <AppShell
      portal="admin"
      title="Audit log"
      description="School-wide health and stress alert history"
      nav={adminNavItems()}
      actions={<AlertsDock />}
    >
      <AuditLog />
    </AppShell>
  );
}
