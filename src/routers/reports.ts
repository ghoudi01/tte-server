import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";
import { services } from "../trpc/services.js";

const reportTypeSchema = z.enum(["delivered", "returned", "rto", "accepted", "rejected", "pending", "fraud", "complaint", "delivery_issue", "other", "urgent", "success"]);
const reportStatusSchema = z.enum(["pending", "accepted", "rejected"]);

const createReportInput = z.object({
  clientName: z.string().optional(),
  phoneNumber: z.string(),
  externalOrderId: z.string().optional(),
  amount: z.number().optional(),
  reportType: reportTypeSchema,
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
  weight: z.number().optional(),
  clientAddress: z.string().optional(),
  city: z.string().optional(),
  orderDate: z.string().datetime().optional(),
  productDescription: z.string().optional(),
  notes: z.string().optional(),
});

const updateReportInput = createReportInput.extend({
  status: reportStatusSchema.optional(),
}).partial();

export const reportsRouter = router({
  create: protectedProcedure
    .input(createReportInput)
    .mutation(async ({ ctx, input }) => {
      const merchant = await services.merchants.getProfile(ctx.user!.id);
      if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      const report = await services.prisma.report.create({
        data: {
          ...input,
          merchantId: merchant.id,
          orderDate: input.orderDate ? new Date(input.orderDate) : undefined,
        },
      });
      return report;
    }),

  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(10),
      cursor: z.number().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const merchant = await services.merchants.getProfile(ctx.user!.id);
      if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      const limit = input?.limit ?? 10;
      const cursor = input?.cursor;

      const reports = await services.prisma.report.findMany({
        where: { merchantId: merchant.id },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
      });

      const hasMore = reports.length > limit;
      const items = hasMore ? reports.slice(0, -1) : reports;
      const nextCursor = hasMore ? items[items.length - 1].id : undefined;

      return { items, nextCursor };
    }),

  get: protectedProcedure
    .input(z.object({ reportId: z.number() }))
    .query(async ({ ctx, input }) => {
      const merchant = await services.merchants.getProfile(ctx.user!.id);
      if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      const report = await services.prisma.report.findFirst({
        where: {
          id: input.reportId,
          merchantId: merchant.id,
        },
      });

      if (!report) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      }

      return report;
    }),

  update: protectedProcedure
    .input(z.object({
      reportId: z.number(),
      data: updateReportInput,
    }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await services.merchants.getProfile(ctx.user!.id);
      if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      const report = await services.prisma.report.findFirst({
        where: {
          id: input.reportId,
          merchantId: merchant.id,
        },
      });

      if (!report) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      }

      const updated = await services.prisma.report.update({
        where: { id: input.reportId },
        data: {
          ...input.data,
          orderDate: input.data.orderDate ? new Date(input.data.orderDate) : undefined,
        },
      });

      return updated;
    }),
});
