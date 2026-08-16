import { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const { user } = useAuth();
  const currentRole = user?.role || 'Employee';
  const permissions = user?.permissions || [];

  const getRoleDetails = () => ({
    name: currentRole,
    permissions,
  });
  const hasPermission = (permission) => permissions.includes(permission);

  return (
    <RoleContext.Provider value={{ currentRole, getRoleDetails, hasPermission, permissions }}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
};
