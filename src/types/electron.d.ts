export {};

declare global {
  interface Window {
    olyr: {
      app: { name: string };
      setup: {
        getStatus: () => Promise<SetupStatus>;
        complete: (input: SetupInput) => Promise<SetupStatus>;
      };
      auth: {
        login: (input: LoginInput) => Promise<LoginResult>;
        logout: (sessionId: string) => Promise<void>;
      };
    };
  }

  interface SetupInput {
    businessName: string; businessPhone: string; currency: string;
    storeName: string; storeAddress: string; adminName: string;
    adminEmail: string; password: string;
  }

  interface SetupStatus {
    isSetupComplete: boolean;
    business?: { id: string; name: string; phone: string; currency: string };
    store?: { id: string; name: string; address: string } | null;
    user?: { id: string; name: string; email: string; role: string } | null;
  }

  interface LoginInput { email: string; password: string; }

  interface LoginResult {
    sessionId: string;
    expiresAt: string;
    user: { id: string; name: string; email: string; role: string };
    business: { id: string; name: string; currency: string };
    store: { id: string; name: string; address: string };
  }
}
