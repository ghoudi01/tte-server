import { Module } from "@nestjs/common";
import { PhoneVerificationService } from "./phone-verification.service.js";

@Module({
  providers: [PhoneVerificationService],
  exports: [PhoneVerificationService],
})
export class PhoneVerificationModule {}
