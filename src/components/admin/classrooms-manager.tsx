'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useLiveFeed } from '@/hooks/use-live-feed';
import { api } from '@/lib/client';
import type { ClassroomDTO, LiveStreamDTO } from '@/lib/types';
import { Cctv, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

interface ClassroomsManagerProps {
  classrooms: ClassroomDTO[];
}

interface ClassroomFormValues {
  className: string;
  nasId: string;
  streamUrl: string;
}

const EMPTY_FORM: ClassroomFormValues = { className: '', nasId: '', streamUrl: '' };

/** Section registry: maps each class to its NAS identifier and stream gateway. */
export function ClassroomsManager({ classrooms }: ClassroomsManagerProps) {
  const router = useRouter();
  const toast = useToast();
  const { snapshot } = useLiveFeed();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClassroomDTO | null>(null);
  const [deleting, setDeleting] = useState<ClassroomDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const streams = useMemo(() => {
    const map = new Map<string, LiveStreamDTO>();
    for (const stream of snapshot?.streams ?? []) map.set(stream.classroomId, stream);
    return map;
  }, [snapshot]);

  async function handleSubmit(values: ClassroomFormValues) {
    setBusy(true);
    const payload = {
      className: values.className.trim(),
      nasId: values.nasId.trim(),
      streamUrl: values.streamUrl.trim(),
    };

    try {
      if (editing) {
        await api<ClassroomDTO>(`/api/classrooms/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(`${payload.className} updated`);
      } else {
        await api<ClassroomDTO>('/api/classrooms', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`${payload.className} added`);
      }
      setFormOpen(false);
      setEditing(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save section');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/classrooms/${deleting.id}`, { method: 'DELETE' });
      toast.success(`${deleting.className} removed`);
      setDeleting(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove section');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Classrooms &amp; cameras</h2>
          <p className="text-xs text-ink-muted">
            NAS / NVR routing for each section&apos;s security cameras
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
          Add section
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {classrooms.map((classroom) => {
          const stream = streams.get(classroom.id) ?? null;
          const configured = classroom.streamUrl.trim().length > 0;

          return (
            <Card key={classroom.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Cctv className="h-4 w-4 shrink-0 text-ink-faint" />
                    <h3 className="truncate text-sm font-semibold text-ink">
                      {classroom.className}
                    </h3>
                  </div>
                  <p className="mt-1 font-mono text-xs text-ink-muted">
                    NAS ID · <span className="text-ink">{classroom.nasId}</span>
                  </p>
                  <p className="mt-0.5 truncate font-mono text-2xs text-ink-faint">
                    {configured ? classroom.streamUrl : 'No stream gateway configured'}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {!configured ? (
                    <Badge tone="muted">Unconfigured</Badge>
                  ) : stream?.online ? (
                    <Badge tone="success" dot>
                      Live · {stream.latencyMs} ms
                    </Badge>
                  ) : (
                    <Badge tone="warning" dot>
                      Reconnecting
                    </Badge>
                  )}
                  <span className="inline-flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      aria-label={`Edit ${classroom.className}`}
                      onClick={() => {
                        setEditing(classroom);
                        setFormOpen(true);
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      aria-label={`Remove ${classroom.className}`}
                      className="text-rose-500 hover:text-rose-600"
                      onClick={() => setDeleting(classroom)}
                    />
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                <span className="text-2xs text-ink-faint">Students</span>
                <Badge tone="neutral">{classroom.studentCount}</Badge>
                <span className="ml-auto text-2xs text-ink-faint">
                  {classroom.teacherIds.length} teacher
                  {classroom.teacherIds.length === 1 ? '' : 's'} assigned
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {classrooms.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Cctv className="h-5 w-5" />}
            title="No sections configured"
            description="Add a section and map it to its NAS identifier and stream gateway path."
          />
        </Card>
      ) : null}

      <ClassroomFormModal
        open={formOpen}
        classroom={editing}
        busy={busy}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remove section"
        description={
          deleting ? `${deleting.className} and its camera mapping will be deleted.` : undefined
        }
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      >
        <p className="text-sm text-ink-muted">
          Sections with enrolled students are protected — reassign or remove the students first.
          Teacher assignments are released automatically.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create / edit form                                                         */
/* -------------------------------------------------------------------------- */

interface ClassroomFormModalProps {
  open: boolean;
  classroom: ClassroomDTO | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: ClassroomFormValues) => void | Promise<void>;
}

function ClassroomFormModal({
  open,
  classroom,
  busy,
  onClose,
  onSubmit,
}: ClassroomFormModalProps) {
  const [values, setValues] = useState<ClassroomFormValues>(() =>
    classroom ? fromClassroom(classroom) : EMPTY_FORM,
  );
  const [touched, setTouched] = useState(false);

  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}:${classroom?.id ?? 'create'}`;
  if (key !== lastKey) {
    setLastKey(key);
    setTouched(false);
    setValues(classroom ? fromClassroom(classroom) : EMPTY_FORM);
  }

  const errors = validateClassroomForm(values);
  const showErrors = touched;

  function set<K extends keyof ClassroomFormValues>(field: K, value: ClassroomFormValues[K]) {
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
      title={classroom ? 'Edit section' : 'Add section'}
      description="The NAS ID identifies the recorder channel used by the live camera panel."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="classroom-form"
            disabled={busy}
            onClick={() => setTouched(true)}
          >
            {busy ? 'Saving…' : classroom ? 'Save changes' : 'Add section'}
          </Button>
        </>
      }
    >
      <form id="classroom-form" onSubmit={submit} className="grid gap-4">
        <Field label="Class name" error={showErrors ? errors.className : null}>
          <Input
            value={values.className}
            onChange={(event) => set('className', event.target.value)}
            placeholder="Grade 9-A"
            invalid={showErrors && Boolean(errors.className)}
          />
        </Field>

        <Field
          label="NAS / NVR identifier"
          error={showErrors ? errors.nasId : null}
          hint="Printed on the recorder, e.g. NAS-NVR-01."
        >
          <Input
            value={values.nasId}
            onChange={(event) => set('nasId', event.target.value)}
            placeholder="NAS-NVR-01"
            className="font-mono"
            invalid={showErrors && Boolean(errors.nasId)}
          />
        </Field>

        <Field
          label="Stream gateway path"
          error={showErrors ? errors.streamUrl : null}
          hint="rtsp:// host, http(s) HLS manifest, or a gateway path. Leave blank if unconfigured."
        >
          <Input
            value={values.streamUrl}
            onChange={(event) => set('streamUrl', event.target.value)}
            placeholder="rtsp://10.0.4.11:554/ch/9a/main"
            className="font-mono text-xs"
            invalid={showErrors && Boolean(errors.streamUrl)}
          />
        </Field>
      </form>
    </Modal>
  );
}

function fromClassroom(classroom: ClassroomDTO): ClassroomFormValues {
  return {
    className: classroom.className,
    nasId: classroom.nasId,
    streamUrl: classroom.streamUrl,
  };
}

function validateClassroomForm(
  values: ClassroomFormValues,
): Partial<Record<keyof ClassroomFormValues, string>> {
  const errors: Partial<Record<keyof ClassroomFormValues, string>> = {};

  if (values.className.trim().length < 3) errors.className = 'Enter the class name';
  if (values.nasId.trim().length < 3) errors.nasId = 'Enter the NAS identifier';

  const stream = values.streamUrl.trim();
  const validStream =
    stream === '' ||
    stream.startsWith('rtsp://') ||
    stream.startsWith('http://') ||
    stream.startsWith('https://') ||
    stream.startsWith('/');
  if (!validStream) {
    errors.streamUrl = 'Use rtsp://, http(s):// or a path starting with /';
  }

  return errors;
}
