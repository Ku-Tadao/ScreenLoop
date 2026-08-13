import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

interface ModalOptions {
  size?: ModalSize;
  /** @deprecated Use size: '3xl' instead. */
  wide?: boolean;
}

interface ModalContextType {
  openModal: (content: ReactNode, options?: ModalOptions) => void;
  closeModal: () => void;
  isModalOpen: boolean;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm w-full',
  md: 'max-w-md w-full',
  lg: 'max-w-lg w-full',
  xl: 'max-w-xl w-full',
  '2xl': 'max-w-2xl w-full',
  '3xl': 'max-w-3xl w-full',
};

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const modalRef = useRef<HTMLDialogElement>(null);
  const [modalContent, setModalContent] = useState<ReactNode>(null);
  const [sizeClass, setSizeClass] = useState('');
  const cleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modalGenerationRef = useRef(0);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Track if the initial mousedown started on the backdrop
  const backdropMouseDownRef = useRef<boolean>(false);

  const clearPendingCleanup = useCallback(() => {
    if (cleanupTimerRef.current !== null) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
  }, []);

  const openModal = (content: ReactNode, options?: ModalOptions) => {
    clearPendingCleanup();
    modalGenerationRef.current += 1;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    setModalContent(content);
    const resolvedSize: ModalSize | undefined =
      options?.size ?? (options?.wide ? '3xl' : undefined);
    setSizeClass(resolvedSize ? SIZE_CLASS[resolvedSize] : '');
    requestAnimationFrame(() => {
      if (modalRef.current && !modalRef.current.open) modalRef.current.showModal();
    });
  };

  const finishClose = useCallback(() => {
    clearPendingCleanup();
    const closingGeneration = modalGenerationRef.current;
    cleanupTimerRef.current = setTimeout(() => {
      if (closingGeneration !== modalGenerationRef.current) return;
      setModalContent(null);
      setSizeClass('');
      cleanupTimerRef.current = null;
    }, 150);
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  }, [clearPendingCleanup]);

  const closeModal = useCallback(() => {
    if (modalRef.current?.open) modalRef.current.close();
    else finishClose();
  }, [finishClose]);

  useEffect(
    () => () => {
      clearPendingCleanup();
    },
    [clearPendingCleanup],
  );

  const isModalOpen = modalContent !== null;

  return (
    <ModalContext.Provider value={{ openModal, closeModal, isModalOpen }}>
      {children}
      {modalContent && (
        <dialog
          ref={modalRef}
          className="modal modal-bottom sm:modal-middle"
          aria-label="Dialog"
          onCancel={(event) => {
            event.preventDefault();
            closeModal();
          }}
          onClose={finishClose}
          onMouseDown={(e) => {
            // Only mark as backdrop interaction if the mousedown started on the dialog backdrop
            backdropMouseDownRef.current = e.target === modalRef.current;
          }}
          onClick={(e) => {
            // Close only if both mousedown and click occurred on the backdrop
            if (e.target === modalRef.current && backdropMouseDownRef.current) {
              backdropMouseDownRef.current = false;
              closeModal();
            } else {
              backdropMouseDownRef.current = false;
            }
          }}
        >
          <div
            className={`modal-box max-h-[90vh] bg-base-300 ${sizeClass}`}
            onClick={(e) => e.stopPropagation()}
          >
            {modalContent}
          </div>
          <form
            method="dialog"
            className="modal-backdrop"
            onMouseDown={() => {
              // Mark that interaction started on the backdrop overlay
              backdropMouseDownRef.current = true;
            }}
            onClick={() => {
              // Close only if interaction started on backdrop (prevents drag-out closes)
              if (backdropMouseDownRef.current) {
                backdropMouseDownRef.current = false;
                closeModal();
              }
            }}
          >
            <button aria-label="Close dialog">close</button>
          </form>
        </dialog>
      )}
    </ModalContext.Provider>
  );
};

export const useModal = (): ModalContextType => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
