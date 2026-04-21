import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module.js";
import { PhoneVerificationModule } from "../phone-verification/phone-verification.module.js";
import { PluginApiController } from "./plugin-api.controller.js";
import { TteController } from "./tte.controller.js";

@Module({
  imports: [OrdersModule, PhoneVerificationModule],
  controllers: [PluginApiController, TteController],
})
export class PluginApiModule {}
