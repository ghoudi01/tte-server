import { z } from "zod";
import { protectedProcedure, router } from "../trpc.js";

const roadmapFeatures = [
  {
    id: "webhooks",
    title: "Webhook System",
    status: "foundation",
    capabilities: ["HMAC signatures", "retry policy", "delivery dashboard"],
  },
  {
    id: "multi-channel-verification",
    title: "Multi-Channel Verification",
    status: "foundation",
    capabilities: ["WhatsApp", "SMS fallback", "email templates"],
  },
  {
    id: "analytics",
    title: "Real-Time Analytics",
    status: "foundation",
    capabilities: ["live feed", "exports", "scheduled reports"],
  },
  {
    id: "billing",
    title: "Subscription Billing",
    status: "foundation",
    capabilities: ["tiers", "usage billing", "invoices"],
  },
  {
    id: "rbac",
    title: "Team Management",
    status: "foundation",
    capabilities: ["invitations", "roles", "audit logs"],
  },
  {
    id: "support",
    title: "Support And Disputes",
    status: "foundation",
    capabilities: ["tickets", "false-positive disputes", "knowledge base"],
  },
  {
    id: "ml-fraud",
    title: "ML Fraud Scoring",
    status: "foundation",
    capabilities: ["model versions", "feature importance", "human review"],
  },
  {
    id: "marketplace",
    title: "Developer Marketplace",
    status: "foundation",
    capabilities: ["submissions", "reviews", "developer analytics"],
  },
  {
    id: "sdks",
    title: "SDKs",
    status: "foundation",
    capabilities: ["TypeScript", "PHP", "Python"],
  },
] as const;

export const roadmapRouter = router({
  listFeatures: protectedProcedure.query(() => roadmapFeatures),
  updateFeatureStatus: protectedProcedure
    .input(
      z.object({
        featureId: z.string(),
        status: z.enum(["foundation", "in_progress", "beta", "available"]),
      })
    )
    .mutation(({ input }) => ({
      success: true,
      featureId: input.featureId,
      status: input.status,
    })),
});
