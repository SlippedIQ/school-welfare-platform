'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/feedback';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useLiveFeed } from '@/hooks/use-live-feed';
import { api } from '@/lib/client';
import { deriveSection } from '@/lib/format';
import { heartRateBand, type ClassroomDTO, type LiveStudentDTO, type StudentDTO } from '@/lib/types';
import { Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

interface StudentsManagerProps {
  students: StudentDTO[];
  classrooms: ClassroomDTO[];
}

interface StudentFormValues {
  fullName: string;
  admissionNo: string;
  classroomId: string;
  age: string;
  guardianContact: string;
  baselineHeartRate: string;
}

const EMPTY_FORM: StudentFormValues = {
  fullName: '',
  admissionNo: '',
  classroomId: '',
  age: '',
  guardianContact: '',
  baselineHeartRate: '75',
};

/** Full CRUD data table for student records with live readings inline. */
export function StudentsManager({ students, classrooms }: StudentsManagerProps) {
  const router = useRouter();
  const toast = useToast();
  const { snapshot } = useLiveFeed();

  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StudentDTO | null>(null);
  const [deleting, setDeleting] = useState<StudentDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const liveById = useMemo(() => {
    const map = new Map<string, LiveStudentDTO>();
    for (const entry of snapshot?.students ?? []) map.set(entry.studentId, entry);
    return map;
  }, [snapshot]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return students;
    return students.filter((student) =>
      [
        student.fullName,
        student.admissionNo,
        student.gradeClass,
        student.guardianContact,
        student.classroomName ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [students, query]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(student: StudentDTO) {
    setEditing(student);
    setFormOpen(true);
  }

  async function handleSubmit(values: StudentFormValues) {
    setBusy(true);
    const payload = {
      fullName: values.fullName.trim(),
      admissionNo: values.admissionNo.trim(),
      classroomId: values.classroomId || null,
      age: Number(values.age),
      guardianContact: values.guardianContact.trim(),
      baselineHeartRate: Number(values.baselineHeartRate),
    };

    try {
      if (editing) {
        await api<StudentDTO>(`/api/students/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(`${payload.fullName} updated`);
      } else {
        await api<StudentDTO>('/api/students', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`${payload.fullName} enrolled`);
      }
      setFormOpen(false);
      setEditing(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save student');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/students/${deleting.id}`, { method: 'DELETE' });
      toast.success(`${deleting.fullName} removed`);
      setDeleting(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove student');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Student records</h2>
          <p className="text-xs text-ink-muted">
            {students.length} enrolled student{students.length === 1 ? '' : 's'} ·{' '}
            {classrooms.length} section{classrooms.length === 1 ? '' : 's'}
          </p>
        </div>
        <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
          Add student
        </Button>
      </div>

      <Card>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, admission no, guardian…"
              aria-label="Search students"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <span className="ml-auto text-2xs tabular text-ink-faint">
            {filtered.length} shown
          </span>
        </div>

        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-muted text-left text-2xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Section</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-3 py-2 font-medium">Guardian</th>
                <th className="px-3 py-2 font-medium">Baseline</th>
                <th className="px-3 py-2 font-medium">Live</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((student) => {
                const live = liveById.get(student.id);
                const online = live?.sensorStatus === 'ONLINE';
                const band = online
                  ? heartRateBand(live!.heartRate, student.baselineHeartRate)
                  : 'NORMAL';

                return (
                  <tr key={student.id} className="group transition-colors hover:bg-surface-muted/60">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink">{student.fullName}</p>
                      <p className="font-mono text-2xs text-ink-faint">{student.admissionNo}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge tone="neutral">{student.gradeClass}</Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular text-ink-muted">{student.age}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-muted">
                      {student.guardianContact}
                    </td>
                    <td className="px-3 py-2.5 tabular text-ink-muted">
                      {student.baselineHeartRate} BPM
                    </td>
                    <td className="px-3 py-2.5">
                      {online && live ? (
                        <span className="flex items-center gap-2">
                          <span className="font-medium tabular text-ink">{live.heartRate}</span>
                          <Badge
                            tone={
                              band === 'CRITICAL'
                                ? 'danger'
                                : band === 'ELEVATED'
                                  ? 'warning'
                                  : 'success'
                            }
                          >
                            {band === 'NORMAL' ? 'Normal' : band === 'ELEVATED' ? 'Elevated' : 'Critical'}
                          </Badge>
                        </span>
                      ) : (
                        <Badge tone="muted">Sensor offline</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil className="h-3.5 w-3.5" />}
                          onClick={() => openEdit(student)}
                          aria-label={`Edit ${student.fullName}`}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => setDeleting(student)}
                          aria-label={`Remove ${student.fullName}`}
                          className="text-rose-500 hover:text-rose-600"
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={query ? 'No students match your search' : 'No students enrolled yet'}
            description={
              query
                ? 'Try a different name, admission number or guardian contact.'
                : 'Add your first student to start receiving live biometric readings.'
            }
            action={
              query ? null : (
                <Button size="sm" variant="primary" onClick={openCreate}>
                  Add student
                </Button>
              )
            }
          />
        ) : null}
      </Card>

      <StudentFormModal
        open={formOpen}
        student={editing}
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
        title="Remove student"
        description={
          deleting
            ? `${deleting.fullName} (${deleting.admissionNo}) will be permanently deleted.`
            : undefined
        }
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      >
        <p className="text-sm text-ink-muted">
          Their biometric history, alert flags and observation notes will also be removed. This
          cannot be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create / edit form                                                         */
/* -------------------------------------------------------------------------- */

interface StudentFormModalProps {
  open: boolean;
  student: StudentDTO | null;
  classrooms: ClassroomDTO[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: StudentFormValues) => void | Promise<void>;
}

function StudentFormModal({
  open,
  student,
  classrooms,
  busy,
  onClose,
  onSubmit,
}: StudentFormModalProps) {
  const [values, setValues] = useState<StudentFormValues>(() =>
    student ? fromStudent(student) : EMPTY_FORM,
  );
  const [touched, setTouched] = useState(false);

  // Reset the form whenever the dialog opens for a different target.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}:${student?.id ?? 'create'}`;
  if (key !== lastKey) {
    setLastKey(key);
    setTouched(false);
    setValues(student ? fromStudent(student) : EMPTY_FORM);
  }

  const errors = validateStudentForm(values);
  const showErrors = touched;

  function set<K extends keyof StudentFormValues>(field: K, value: StudentFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
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
      title={student ? 'Edit student' : 'Enroll student'}
      description={
        student
          ? 'Update the record; the section label is derived automatically.'
          : 'Biometric baselines seed the simulation and threshold policy.'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            form="student-form"
            type="submit"
            disabled={busy}
            onClick={() => setTouched(true)}
          >
            {busy ? 'Saving…' : student ? 'Save changes' : 'Enroll student'}
          </Button>
        </>
      }
    >
      <form id="student-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={showErrors ? errors.fullName : null} className="sm:col-span-2">
          <Input
            value={values.fullName}
            onChange={(event) => set('fullName', event.target.value)}
            placeholder="e.g. Aarav Mehta"
            invalid={showErrors && Boolean(errors.fullName)}
          />
        </Field>

        <Field label="Admission number" error={showErrors ? errors.admissionNo : null}>
          <Input
            value={values.admissionNo}
            onChange={(event) => set('admissionNo', event.target.value)}
            placeholder="ADM-2025-0001"
            invalid={showErrors && Boolean(errors.admissionNo)}
          />
        </Field>

        <Field
          label="Section"
          error={showErrors ? errors.classroomId : null}
          hint={
            values.classroomId
              ? `Stored as “${deriveSection(
                  classrooms.find((classroom) => classroom.id === values.classroomId)?.className ??
                    '',
                )}”`
              : 'Determines the class dashboard this student appears on.'
          }
        >
          <Select
            value={values.classroomId}
            onChange={(event) => set('classroomId', event.target.value)}
            invalid={showErrors && Boolean(errors.classroomId)}
          >
            <option value="">Select a section…</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.className}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Age" error={showErrors ? errors.age : null}>
          <Input
            type="number"
            min={3}
            max={21}
            value={values.age}
            onChange={(event) => set('age', event.target.value)}
            placeholder="14"
            invalid={showErrors && Boolean(errors.age)}
          />
        </Field>

        <Field label="Baseline heart rate" error={showErrors ? errors.baselineHeartRate : null}>
          <Input
            type="number"
            min={40}
            max={140}
            value={values.baselineHeartRate}
            onChange={(event) => set('baselineHeartRate', event.target.value)}
            invalid={showErrors && Boolean(errors.baselineHeartRate)}
          />
        </Field>

        <Field
          label="Guardian contact"
          error={showErrors ? errors.guardianContact : null}
          className="sm:col-span-2"
        >
          <Input
            value={values.guardianContact}
            onChange={(event) => set('guardianContact', event.target.value)}
            placeholder="+91 98200 00000"
            invalid={showErrors && Boolean(errors.guardianContact)}
          />
        </Field>
      </form>
    </Modal>
  );
}

function fromStudent(student: StudentDTO): StudentFormValues {
  return {
    fullName: student.fullName,
    admissionNo: student.admissionNo,
    classroomId: student.classroomId ?? '',
    age: String(student.age),
    guardianContact: student.guardianContact,
    baselineHeartRate: String(student.baselineHeartRate),
  };
}

/** Mirrors the server-side zod rules for immediate feedback. */
function validateStudentForm(values: StudentFormValues): Partial<Record<keyof StudentFormValues, string>> {
  const errors: Partial<Record<keyof StudentFormValues, string>> = {};

  if (values.fullName.trim().length < 2) errors.fullName = 'Enter the full name';
  if (values.admissionNo.trim().length < 3) errors.admissionNo = 'Enter an admission number';
  if (!values.classroomId) errors.classroomId = 'Select a section';

  const age = Number(values.age);
  if (!Number.isInteger(age) || age < 3 || age > 21) errors.age = 'Age must be 3–21';

  const baseline = Number(values.baselineHeartRate);
  if (!Number.isInteger(baseline) || baseline < 40 || baseline > 140) {
    errors.baselineHeartRate = 'Baseline must be 40–140 BPM';
  }

  if (values.guardianContact.trim().length < 7) {
    errors.guardianContact = 'Enter a valid contact number';
  }

  return errors;
}
