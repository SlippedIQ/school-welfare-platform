'use client';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** Body copy explaining the consequences of confirming. */
  children?: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Shared destructive-action confirmation used by every admin CRUD flow. */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Delete',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      {children ?? null}
    </Modal>
  );
}
