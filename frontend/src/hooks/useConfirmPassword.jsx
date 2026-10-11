import { useCallback, useRef, useState } from 'react';
import ConfirmPasswordModal from '../components/common/ConfirmPasswordModal';

/**
 * Asks the signed-in person to type their password again before something sensitive happens
 * (exporting a report). The check is made by the server, which also writes it to the audit log.
 *
 *   const { askPassword, passwordModal } = useConfirmPassword();
 *   askPassword('Export report "Monthly Attendance Summary"', () => downloadTheFile());
 *   return <>{...}{passwordModal}</>;
 */
export function useConfirmPassword() {
  const [purpose, setPurpose] = useState(null);
  const action = useRef(null);

  const askPassword = useCallback((why, then) => {
    action.current = then;
    setPurpose(why);
  }, []);

  const close = useCallback(() => {
    action.current = null;
    setPurpose(null);
  }, []);

  const passwordModal = (
    <ConfirmPasswordModal
      purpose={purpose}
      onClose={close}
      onConfirmed={() => {
        const run = action.current;
        close();
        run?.();
      }}
    />
  );

  return { askPassword, passwordModal };
}
