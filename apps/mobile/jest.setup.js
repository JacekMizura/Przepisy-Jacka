jest.mock('expo-secure-store', () => {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    getItemAsync: jest.fn(async (key) => map.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => {
      map.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      map.delete(key);
    }),
  };
});

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    getCookie: jest.fn(async () => ''),
    getSession: jest.fn(async () => ({ data: null, error: null })),
    signIn: { email: jest.fn() },
    signUp: { email: jest.fn() },
    signOut: jest.fn(async () => undefined),
    useSession: () => ({ data: null, isPending: false, error: null }),
  },
}));

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3001';
