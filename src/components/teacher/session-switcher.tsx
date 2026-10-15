'use client';

import { Select } from '@/components/ui/field';
import type { TeacherDTO } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Mock session control: in a deployment this portal would be gated by SSO;
 * for the local build an admin can impersonate any provisioned teacher to see
 * the exact dashboard that teacher gets. The choice is stored in a cookie so
 * server-rendered navigation stays consistent across reloads.
 */
export function SessionSwitcher({
  teachers,
  activeTeacherId,
}: {
  teachers: TeacherDTO[];
  activeTeacherId: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(activeTeacherId ?? teachers[0]?.id ?? '');

  if (teachers.length === 0) return null;

  function onChange(next: string) {
    setValue(next);
    document.cookie = `actingTeacherId=${next}; path=/; max-age=${60 * 60 * 24 * 30}`;
    router.refresh();
  }

  return (
    <label className="hidden items-center gap-2 lg:flex">
      <span className="text-2xs text-ink-faint">Acting as</span>
      <Select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Select acting teacher"
        className="h-9 w-44 text-xs"
      >
        {teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.name}
          </option>
        ))}
      </Select>
    </label>
  );
}
