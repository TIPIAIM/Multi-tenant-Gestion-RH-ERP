export type TenantSlugAvailability = {
  slug: string;
  available: boolean;
  reason: "AVAILABLE" | "RESERVED" | "ALREADY_USED";
};

export type SelfRegisterTenantInput = {
  organization: {
    name: string;
    legalName: string;
    slug: string;
    contactPhone?: string;
    address?: string;
  };
  administrator: {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
  };
  branding?: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
  termsAccepted: boolean;
  website?: string;
};

export type SelfRegisterTenantResult = {
  tenant: {
    id: string;
    name: string;
    legalName: string;
    slug: string;
    status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    branding: {
      primaryColor: string;
      secondaryColor: string;
      accentColor: string;
      logoUrl?: string;
    };
  };
  administrator: {
    id: string;
    fullName: string;
    email: string;
    role: "TENANT_ADMIN";
  };
  onboarding: {
    nextStep: "LOGIN";
    settingsWillInitializeOnFirstAccess: true;
  };
};
