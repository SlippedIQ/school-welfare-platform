'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client';
import type { ClassroomDTO, TeacherDTO } from '@/lib/types';
import { Check, Pencil, Plus, Trash2, UserCog } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface TeachersManagerProps {
  teachers: TeacherDTO[];
  classrooms: ClassroomDTO[];
}

interface TeacherFormValues {
  name: string;
  email: string;
  assignedClassIds: string[];
}

const EMPTY_FORM: TeacherFormValues = { name: '', email: '', assignedClassIds: [] };

/** Teacher provisioning with per-section assignment. */
export function TeachersManager({ teachers, classrooms }: TeachersManagerProps) {
  const router = useRouter();
  const toast = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherDTO | null>(null);
  const [deleting, setDeleting] = useState<TeacherDTO | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(values: TeacherFormValues) {
    setBusy(true);
    const payload = {
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      assignedClassIds: values.assignedClassIds,
    };

    try {
      if (editing) {
        await api<TeacherDTO>(`/api/teachers/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(`${payload.name} updated`);
      } else {
        await api<TeacherDTO>('/api/teachers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`${payload.name} provisioned`);
      }
      setFormOpen(false);
      setEditing(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save teacher');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/teachers/${deleting.id}`, { method: 'DELETE' });
      toast.success(`${deleting.name} removed`);
      setDeleting(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove teacher');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Teacher accounts</h2>
          <p className="text-xs text-ink-muted">
            Section assignments control which class dashboards each teacher can open
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Add teacher
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-muted text-left text-2xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2 font-medium">Teacher</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Assigned sections</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {teachers.map((teacher) => (
                <tr key={teacher.id} className="group transition-colors hover:bg-surface-muted/60">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-ink">{teacher.name}</p>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">{teacher.email}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {teacher.assignedClasses.length === 0 ? (
                        <Badge tone="muted">None</Badge>
                      ) : (
                        teacher.assignedClasses.map((classroom) => (
                          <Badge key={classroom.id} tone="info">
                            {classroom.className}
                          </Badge>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        aria-label={`Edit ${teacher.name}`}
                        onClick={() => {
                          setEditing(teacher);
                          setFormOpen(true);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        aria-label={`Remove ${teacher.name}`}
                        className="text-rose-500 hover:text-rose-600"
                        onClick={() => setDeleting(teacher)}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {teachers.length === 0 ? (
          <EmptyState
            icon={<UserCog className="h-5 w-5" />}
            title="No teacher accounts"
            description="Provision teachers and assign them to sections to populate the teacher portal."
          />
        ) : null}
      </Card>

      <TeacherFormModal
        open={formOpen}
        teacher={editing}
        classrooms={classrooms}
        busy={busy}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remove teacher"
        description={
          deleting ? `${deleting.name} (${deleting.email}) will lose portal access.` : undefined
        }
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      >
        <p className="text-sm text-ink-muted">
          Observation notes they authored are kept for the audit trail.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create / edit form                                                         */
/* -------------------------------------------------------------------------- */

interface TeacherFormModalProps {
  open: boolean;
  teacher: TeacherDTO | null;
  classrooms: ClassroomDTO[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: TeacherFormValues) => void | Promise<void>;
}

function TeacherFormModal({
  open,
  teacher,
  classrooms,
  busy,
  onClose,
  onSubmit,
}: TeacherFormModalProps) {
  const [values, setValues] = useState<TeacherFormValues>(() =>
    teacher ? fromTeacher(teacher) : EMPTY_FORM,
  );
  const [touched, setTouched] = useState(false);

  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}:${teacher?.id ?? 'create'}`;
  if (key !== lastKey) {
    setLastKey(key);
    setTouched(false);
    setValues(teacher ? fromTeacher(teacher) : EMPTY_FORM);
  }

  const errors = validateTeacherForm(values);
  const showErrors = touched;

  function set<K extends keyof TeacherFormValues>(field: K, value: TeacherFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function toggleClassroom(classroomId: string) {
    setValues((current) => ({
      ...current,
      assignedClassIds: current.assignedClassIds.includes(classroomId)
        ? current.assignedClassIds.filter((id) => id !== classroomId)
        : [...current.assignedClassIds, classroomId],
    }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length > 0) return;
    void onSubmit(values);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={teacher ? 'Edit teacher' : 'Provision teacher'}
      description="Assign the sections this teacher should see in their portal."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="teacher-form"
            disabled={busy}
            onClick={() => setTouched(true)}
          >
            {busy ? 'Saving…' : teacher ? 'Save changes' : 'Provision'}
          </Button>
        </>
      }
    >
      <form id="teacher-form" onSubmit={submit} className="grid gap-4">
        <Field label="Name" error={showErrors ? errors.name : null}>
          <Input
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            placeholder="Ananya Rao"
            invalid={showErrors && Boolean(errors.name)}
          />
        </Field>

        <Field label="Email" error={showErrors ? errors.email : null}>
          <Input
            type="email"
            value={values.email}
            onChange={(event) => set('email', event.target.value)}
            placeholder="ananya.rao@school.edu"
            className="font-mono text-xs"
            invalid={showErrors && Boolean(errors.email)}
          />
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-muted">Assigned sections</p>
          {classrooms.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-xs text-ink-faint">
              Add sections under Classrooms &amp; cameras first.
            </p>
          ) : (
            <div className="grid gap-1.5 rounded-md border border-line p-2 sm:grid-cols-2">
              {classrooms.map((classroom) => {
                const checked = values.assignedClassIds.includes(classroom.id);
                return (
                  <label
                    key={classroom.id}
                    className={
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ' +
                      (checked ? 'bg-accent-subtle text-ink' : 'text-ink-muted hover:bg-surface-muted')
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleClassroom(classroom.id)}
                      className="sr-only"
                    />
                    <span
                      className={
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ' +
                        (checked
                          ? 'border-accent bg-accent text-white'
                          : 'border-line-strong bg-white')
                      }
                    >
                      {checked ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span className="truncate">{classroom.className}</span>
                  </label>
                );
              })}
            </div>
          )}
          <p className="mt-1 text-2xs text-ink-faint">
            {values.assignedClassIds.length} section
            {values.assignedClassIds.length === 1 ? '' : 's'} selected
          </p>
        </div>
      </form>
    </Modal>
  );
}

function fromTeacher(teacher: TeacherDTO): TeacherFormValues {
  return {
    name: teacher.name,
    email: teacher.email,
    assignedClassIds: [...teacher.assignedClassIds],
  };
}

function validateTeacherForm(
  values: TeacherFormValues,
): Partial<Record<keyof TeacherFormValues, string>> {
  const errors: Partial<Record<keyof TeacherFormValues, string>> = {};

  if (values.name.trim().length < 2) errors.name = 'Enter the teacher name';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    errors.email = 'Enter a valid email address';
  }

  return errors;
}
