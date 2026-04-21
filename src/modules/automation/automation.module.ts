import { Module } from "@nestjs/common";
import { MerchantsModule } from "../merchants/merchants.module.js";
import { PhoneVerificationModule } from "../phone-verification/phone-verification.module.js";
import { AutomationService } from "./automation.service.js";

@Module({
  imports: [MerchantsModule, PhoneVerificationModule],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
