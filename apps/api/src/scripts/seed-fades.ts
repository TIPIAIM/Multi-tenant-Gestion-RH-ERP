import {
    connectDatabase,
    disconnectDatabase,
  } from "../config/database.js";
  import { seedFadesTenant } from "../modules/tenants/tenant.service.js";
  
  async function run(): Promise<void> {
    try {
      await connectDatabase();
  
      const tenant = await seedFadesTenant();
  
      console.log(
        `Tenant initialisé : ${tenant.name} (${tenant.slug})`,
      );
    } catch (error) {
      console.error("Échec de l'initialisation FADES :", error);
      process.exitCode = 1;
    } finally {
      await disconnectDatabase();
    }
  }
  
  void run();