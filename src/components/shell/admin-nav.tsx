import { UnreadAlertBadge } from '@/components/live/unread-badge';
import { Cctv, GraduationCap, LayoutGrid, ScrollText, UserCog } from 'lucide-react';

/** Sidebar navigation for the admin portal (server-rendered per page). */
export function adminNavItems() {
  return [
    {
      label: 'Overview',
      href: '/admin',
      icon: <LayoutGrid className="h-4 w-4" />,
      badge: <UnreadAlertBadge />,
    },
    {
      label: 'Students',
      href: '/admin/students',
      icon: <GraduationCap className="h-4 w-4" />,
    },
    {
      label: 'Classrooms & cameras',
      href: '/admin/classrooms',
      icon: <Cctv className="h-4 w-4" />,
    },
    {
      label: 'Teachers',
      href: '/admin/teachers',
      icon: <UserCog className="h-4 w-4" />,
    },
    {
      label: 'Audit log',
      href: '/admin/audit',
      icon: <ScrollText className="h-4 w-4" />,
    },
  ];
}
