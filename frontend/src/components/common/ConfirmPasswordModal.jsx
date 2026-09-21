import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Button from '../ui/Button';
import { authService } from '../../services/api';

export default function ConfirmPasswordModal({ purpose, onClose, onConfirmed }) {
  return (
    <Modal isOpen={Boolean(purpose)} onClose={onClose} title="Confirm it's you" size="sm">
      {/* Remounted for each request, so the password field always starts empty */}
      {purpose && <PasswordForm key={purpose} purpose={purpose} onClose={onClose} onConfirmed={onConfirmed} />}
    </Modal>
  );
}

function PasswordForm({ purpose, onClose, onConfirmed }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authService.confirmPassword(password, purpose);
      onConfirmed();
    } catch (err) {
      setError(err?.response?.data?.errors?.password?.[0] || err?.response?.data?.message || 'Could not check the password. Try again.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg bg-blue-50 px-3 py-2.5 text-[13px] text-blue-800">
        <ShieldCheck size={18} className="mt-0.5 shrink-0" />
        <p>
          <strong>{purpose}</strong> takes data out of the system, so please type your password again.
          This check is recorded in the Audit Logs.
        </p>
      </div>
      <Input
        label="Your password"
        type="password"
        autoFocus
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={busy}>Confirm</Button>
      </div>
    </form>
  );
}
