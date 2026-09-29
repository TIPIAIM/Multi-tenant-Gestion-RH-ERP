import type { AuthContext } from "../modules/auth/auth.types.js";
import type { TenantDocument } from "../modules/tenants/tenant.types.js";
import type { UserDocument } from "../modules/users/user.types.ts";

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantDocument;
      user?: UserDocument;
      auth?: AuthContext;
    }
  }
}

export {};
