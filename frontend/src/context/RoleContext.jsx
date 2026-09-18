import { createContext, useContext, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const { user } = useAuth();
  const currentRole = user?.role || 'Employee';
  const permissions = useMemo(() => user?.permissions || [], [user?.permissions]);

  const getRoleDetails = useCallback(() => ({
    name: currentRole,
    permissions,
  }), [currentRole, permissions]);
  const hasPermission = useCallback((permission) => permissions.includes(permission), [permissions]);

  // Memoized so every useRole() consumer app-wide doesn't re-render on every
  // unrelated render of whatever happens to sit above it in the tree.
  const value = useMemo(
    () => ({ currentRole, getRoleDetails, hasPermission, permissions }),
    [currentRole, getRoleDetails, hasPermission, permissions]
  );

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  );
}

export const useRole = () => {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
};
