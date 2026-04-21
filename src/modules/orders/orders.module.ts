import { Module } from "@nestjs/common";
import { MerchantsModule } from "../merchants/merchants.module.js";
import { OrdersService } from "./orders.service.js";

@Module({
  imports: [MerchantsModule],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
