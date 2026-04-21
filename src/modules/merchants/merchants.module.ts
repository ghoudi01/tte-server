import { Module } from "@nestjs/common";
import { MerchantsService } from "./merchants.service.js";

@Module({
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}
