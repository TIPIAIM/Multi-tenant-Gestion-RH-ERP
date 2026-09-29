import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loginRequest,
  logoutRequest,
  restoreSessionRequest,
  type AuthenticatedUser,
  type LoginInput,
} from "./auth.api";

type AuthContextValue = {
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  login: (input: LoginInput) => Promise<AuthenticatedUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_BOOTSTRAP_TIMEOUT_MS = 10_000;

/**
 * Empêche l'interface de rester bloquée indéfiniment si l'API ne répond pas.
 * Le timeout ne produit pas d'erreur visible : il considère simplement
 * qu'aucune session n'a pu être restaurée et laisse afficher la page Login.
 */
async function restoreSessionWithTimeout(): Promise<AuthenticatedUser | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      restoreSessionRequest(),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), SESSION_BOOTSTRAP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    /**
     * IMPORTANT :
     * Ne pas protéger cet effet avec un useRef "hasRestoredSession".
     *
     * En React 18/19 avec StrictMode en développement, React exécute
     * volontairement :
     *
     *   setup -> cleanup -> setup
     *
     * Si le premier cleanup annule la mise à jour puis qu'un useRef empêche
     * le second setup de s'exécuter, setIsBootstrapping(false) n'est jamais
     * appelé et l'application reste figée sur le loader.
     */
    let active = true;

    const bootstrapSession = async (): Promise<void> => {
      try {
        const restoredUser = await restoreSessionWithTimeout();

        if (active) {
          setUser(restoredUser);
        }
      } catch (error) {
        /**
         * Une absence de session, un cookie expiré ou une indisponibilité
         * ponctuelle de l'API ne doit jamais bloquer le rendu de l'application.
         */
        if (active) {
          setUser(null);
        }

        if (import.meta.env.DEV) {
          console.warn(
            "[RH] Restauration de session impossible. Affichage de la connexion.",
            error,
          );
        }
      } finally {
        /**
         * C'est la garantie principale :
         * chaque exécution active du bootstrap libère toujours le routeur.
         */
        if (active) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (input: LoginInput): Promise<AuthenticatedUser> => {
      const authenticatedUser = await loginRequest(input);

      setUser(authenticatedUser);
      setIsBootstrapping(false);

      return authenticatedUser;
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      setIsBootstrapping(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isBootstrapping,
      login,
      logout,
    }),
    [user, isBootstrapping, login, logout],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth doit être utilisé dans AuthProvider.");
  }

  return context;
}
