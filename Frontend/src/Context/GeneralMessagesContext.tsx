import { createContext, ReactNode, useCallback, useEffect } from 'react';
import {
  isShowModalMessage,
  isStorageWarningMessage,
  isRecoveryPromptMessage,
  ModalMessage,
  StorageWarningMessage,
  RecoveryPromptMessage,
} from '../Models/WebSocketMessages';
import { useModal } from './ModalContext';
import GenericModal from '../Components/GenericModal';
import ConfirmationModal from '../Components/ConfirmationModal';
import RecoveryModal from '../Components/RecoveryModal';
import { sendMessageToBackend } from '../Utils/MessageUtils';

const GeneralMessagesContext = createContext<undefined>(undefined);

export function GeneralMessagesProvider({ children }: { children: ReactNode }) {
  const { openModal, closeModal } = useModal();

  const openGenericModal = useCallback(
    (modalData: ModalMessage) => {
      openModal(
        <GenericModal
          title={modalData.title}
          subtitle={modalData.subtitle}
          description={modalData.description}
          type={modalData.type}
          onClose={closeModal}
        />,
      );
    },
    [closeModal, openModal],
  );

  const openStorageWarningModal = useCallback(
    (warningData: StorageWarningMessage) => {
      openModal(
        <ConfirmationModal
          title={warningData.title}
          description={warningData.description}
          confirmText={warningData.confirmText}
          cancelText={warningData.cancelText}
          onConfirm={() => {
            sendMessageToBackend('StorageWarningConfirm', {
              warningId: warningData.warningId,
              confirmed: true,
              action: warningData.action,
              actionData: warningData.actionData,
            });
            closeModal();
          }}
          onCancel={() => {
            sendMessageToBackend('StorageWarningConfirm', {
              warningId: warningData.warningId,
              confirmed: false,
              action: warningData.action,
              actionData: warningData.actionData,
            });
            closeModal();
          }}
        />,
      );
    },
    [closeModal, openModal],
  );

  const openRecoveryPromptModal = useCallback(
    (recoveryData: RecoveryPromptMessage) => {
      openModal(<RecoveryModal files={recoveryData.files} onClose={closeModal} />);
    },
    [closeModal, openModal],
  );

  useEffect(() => {
    const handleWebSocketMessage = (event: CustomEvent<any>) => {
      const message = event.detail;

      if (isShowModalMessage(message)) openGenericModal(message.content);
      if (isStorageWarningMessage(message)) openStorageWarningModal(message.content);
      if (isRecoveryPromptMessage(message)) openRecoveryPromptModal(message.content);
    };

    window.addEventListener('websocket-message', handleWebSocketMessage as EventListener);
    return () =>
      window.removeEventListener('websocket-message', handleWebSocketMessage as EventListener);
  }, [openGenericModal, openRecoveryPromptModal, openStorageWarningModal]);

  return (
    <GeneralMessagesContext.Provider value={undefined}>{children}</GeneralMessagesContext.Provider>
  );
}
