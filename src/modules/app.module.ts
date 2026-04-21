import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module.js";
import { AutomationModule } from "./automation/automation.module.js";
import { MerchantsModule } from "./merchants/merchants.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PhoneVerificationModule } from "./phone-verification/phone-verification.module.js";
import { PluginApiModule } from "./plugin-api/plugin-api.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    MerchantsModule,
    OrdersModule,
    PhoneVerificationModule,
    AutomationModule,
    PluginApiModule,
  ],
})
export class AppModule {}
