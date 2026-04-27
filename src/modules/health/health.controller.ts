import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const startedAt = Date.now();
    try {
      await this.prisma.healthCheck();
      return {
        status: "ok",
        database: "ok",
        uptimeSeconds: Math.round(process.uptime()),
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "error",
        database: "unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  }
}
