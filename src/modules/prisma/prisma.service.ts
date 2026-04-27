import { INestApplication, Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService implements OnModuleInit {
  private readonly client = new PrismaClient();

  async onModuleInit() {
    await this.client.$connect();
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on("beforeExit", () => app.close());
  }

  async healthCheck() {
    await this.client.$queryRaw`SELECT 1`;
  }

  get user() {
    return this.client.user;
  }

  get merchant() {
    return this.client.merchant;
  }

  get order() {
    return this.client.order;
  }

  get spamPhone() {
    return this.client.spamPhone;
  }

  get orderFeedback() {
    return this.client.orderFeedback;
  }

  get report() {
    return this.client.report;
  }

  get webhookSubscription() {
    return this.client.webhookSubscription;
  }

  get webhookQueue() {
    return this.client.webhookQueue;
  }

  get webhookDeliveryLog() {
    return this.client.webhookDeliveryLog;
  }

  get webhookSignature() {
    return this.client.webhookSignature;
  }

  async $disconnect() {
    await this.client.$disconnect();
  }
}
