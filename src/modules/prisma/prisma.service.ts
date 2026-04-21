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

  async $disconnect() {
    await this.client.$disconnect();
  }
}
