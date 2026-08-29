import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  apiStatus,
  createMobileApiClient,
  requireApiData,
} from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import type { Kitchen } from '@/lib/format';
import {
  clearStoredKitchenId,
  getStoredKitchenId,
  setStoredKitchenId,
} from '@/lib/kitchen-storage';

type SessionUser = {
  id: string;
  name: string;
  email: string;
};

type AuthKitchenContextValue = {
  bootstrapping: boolean;
  user: SessionUser | null;
  kitchens: Kitchen[];
  kitchenId: string | null;
  kitchensLoading: boolean;
  refreshSession: () => Promise<void>;
  refreshKitchens: () => Promise<void>;
  selectKitchen: (id: string) => Promise<void>;
  createKitchen: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthKitchenContext = createContext<AuthKitchenContextValue | null>(null);

export function AuthKitchenProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const [kitchensLoading, setKitchensLoading] = useState(false);

  const refreshSession = useCallback(async () => {
    const { data, error } = await authClient.getSession();
    if (error || !data?.user) {
      setUser(null);
      return;
    }
    setUser({
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
    });
  }, []);

  const refreshKitchens = useCallback(async () => {
    if (!user) {
      setKitchens([]);
      setKitchenId(null);
      return;
    }
    setKitchensLoading(true);
    try {
      const client = createMobileApiClient();
      const result = await client.GET('/api/kitchens');
      if (apiStatus(result) === 401) {
        setUser(null);
        setKitchens([]);
        setKitchenId(null);
        await clearStoredKitchenId();
        return;
      }
      const list: Kitchen[] = requireApiData(
        result,
        'Nie udało się pobrać listy kuchni.',
      );
      setKitchens(list);
      const stored = await getStoredKitchenId();
      const next =
        list.find((k: Kitchen) => k.id === stored)?.id ?? list[0]?.id ?? null;
      setKitchenId(next);
      if (next) {
        await setStoredKitchenId(next);
      } else {
        await clearStoredKitchenId();
      }
    } finally {
      setKitchensLoading(false);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshSession();
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSession]);

  useEffect(() => {
    if (!user) {
      setKitchens([]);
      setKitchenId(null);
      return;
    }
    void refreshKitchens();
  }, [user, refreshKitchens]);

  const selectKitchen = useCallback(
    async (id: string) => {
      await setStoredKitchenId(id);
      setKitchenId(id);
      await queryClient.cancelQueries();
      queryClient.clear();
    },
    [queryClient],
  );

  const createKitchen = useCallback(
    async (name: string) => {
      const client = createMobileApiClient();
      const result = await client.POST('/api/kitchens', {
        body: { name },
      });
      const data = requireApiData(result, 'Nie udało się utworzyć kuchni.');
      await selectKitchen(data.id);
      await refreshKitchens();
    },
    [refreshKitchens, selectKitchen],
  );

  const signOut = useCallback(async () => {
    await authClient.signOut();
    await clearStoredKitchenId();
    setUser(null);
    setKitchens([]);
    setKitchenId(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({
      bootstrapping,
      user,
      kitchens,
      kitchenId,
      kitchensLoading,
      refreshSession,
      refreshKitchens,
      selectKitchen,
      createKitchen,
      signOut,
    }),
    [
      bootstrapping,
      user,
      kitchens,
      kitchenId,
      kitchensLoading,
      refreshSession,
      refreshKitchens,
      selectKitchen,
      createKitchen,
      signOut,
    ],
  );

  return (
    <AuthKitchenContext.Provider value={value}>
      {children}
    </AuthKitchenContext.Provider>
  );
}

export function useAuthKitchen(): AuthKitchenContextValue {
  const ctx = useContext(AuthKitchenContext);
  if (!ctx) {
    throw new Error('useAuthKitchen poza AuthKitchenProvider.');
  }
  return ctx;
}
