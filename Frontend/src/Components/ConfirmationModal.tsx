import { TriangleAlert, X } from 'lucide-react';
import Button from './Button';

export interface ConfirmationModalProps {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationModal({
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  return (
    <>
      {/* Header */}
      <div className="modal-header pb-5 border-b">
        <div className="flex items-center">
          <span className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 ring-1 ring-warning/20">
            <TriangleAlert className="text-warning" size={20} />
          </span>
          <h2 className="mb-0 pr-8 text-base-content">{title}</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon
          className="absolute right-4 top-4 z-10"
          onClick={onCancel}
          aria-label="Close confirmation"
        >
          <X aria-hidden="true" size={20} />
        </Button>
      </div>

      <div className="modal-body py-2 mt-4">
        <div className="text-screen-muted whitespace-pre-line">{description}</div>
      </div>

      {/* Footer with buttons */}
      <div className="modal-action mt-6 flex justify-end gap-3">
        <Button variant="primary" onClick={onCancel}>
          {cancelText}
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmText}
        </Button>
      </div>
    </>
  );
}
