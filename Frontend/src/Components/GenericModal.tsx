import { Info, TriangleAlert, CircleAlert, X } from 'lucide-react';
import Button from './Button';

export interface ModalProps {
  title: string;
  subtitle?: string;
  description: string;
  type: 'info' | 'warning' | 'error';
  onClose: () => void;
}

export default function GenericModal({ title, subtitle, description, type, onClose }: ModalProps) {
  // Define icon and colors based on type
  const getTypeStyles = () => {
    switch (type) {
      case 'info':
        return {
          icon: <Info className="text-info" size={20} />,
          tile: 'bg-info/10 ring-info/20',
        };
      case 'warning':
        return {
          icon: <TriangleAlert className="text-warning" size={20} />,
          tile: 'bg-warning/10 ring-warning/20',
        };
      case 'error':
        return {
          icon: <CircleAlert className="text-error" size={20} />,
          tile: 'bg-error/10 ring-error/20',
        };
      default:
        return {
          icon: <Info className="text-info" size={20} />,
          tile: 'bg-info/10 ring-info/20',
        };
    }
  };

  const { icon, tile } = getTypeStyles();

  return (
    <>
      {/* Header */}
      <div className="modal-header pb-5 border-b">
        <div className="flex items-center">
          <span
            className={`mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${tile}`}
          >
            {icon}
          </span>
          <h2 className="mb-0 pr-8 text-base-content">{title}</h2>
        </div>
        {subtitle && <p className="mt-3 text-sm text-screen-muted">{subtitle}</p>}
        <Button
          variant="ghost"
          icon
          className="absolute right-4 top-4 z-10"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X aria-hidden="true" size={20} />
        </Button>
      </div>

      <div className={`modal-body py-2 mt-4`}>
        <div className="text-screen-muted whitespace-pre-line">{description}</div>
      </div>
    </>
  );
}
