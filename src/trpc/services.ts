import { AuthService } from "../modules/auth/auth.service.js";
import { AutomationService } from "../modules/automation/automation.service.js";
import { MerchantsService } from "../modules/merchants/merchants.service.js";
import { OrdersService } from "../modules/orders/orders.service.js";
import { PhoneVerificationService } from "../modules/phone-verification/phone-verification.service.js";
import { PrismaService } from "../modules/prisma/prisma.service.js";

const prisma = new PrismaService();
const merchants = new MerchantsService(prisma);
const phoneVerification = new PhoneVerificationService(prisma);
const orders = new OrdersService(prisma, merchants);
const auth = new AuthService(prisma);
const automation = new AutomationService(merchants, phoneVerification);

export const services = {
  prisma,
  auth,
  merchants,
  orders,
  phoneVerification,
  automation,
};
