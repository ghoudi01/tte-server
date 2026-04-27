import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('OrdersService', () => {
  let service: OrdersService;
  let prismaService: PrismaService;

  const mockMerchantId = 'merchant-123';
  const mockOrderId = 1;

  const mockOrder = {
    id: mockOrderId,
    merchantId: mockMerchantId,
    phoneNumber: '+21698123456',
    clientName: 'Ahmed Ben Ali',
    orderAmount: 599.99,
    trustScore: 85,
    riskLevel: 'low',
    verificationStatus: 'verified',
    orderStatus: 'placed',
    pointsEarned: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: {
            order: {
              create: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
              count: jest.fn(),
            },
            creditTransaction: {
              create: jest.fn(),
            },
            merchant: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('createFromPlugin', () => {
    it('should create an order from plugin data', async () => {
      const input = {
        phoneNumber: '+21698123456',
        orderAmount: 150.0,
        orderId: 'PLUGIN-001',
        source: 'shopify',
        clientName: 'Test Customer',
        trustScore: 80,
        riskLevel: 'low',
        verificationStatus: 'verified',
        orderStatus: 'placed',
      };

      (prismaService.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: mockMerchantId,
        creditsBalance: 100,
      });
      (prismaService.order.create as jest.Mock).mockResolvedValue({
        ...mockOrder,
        ...input,
        id: mockOrderId,
      });

      const result = await service.createFromPlugin(mockMerchantId, input);

      expect(prismaService.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phoneNumber: input.phoneNumber,
            orderAmount: input.orderAmount,
            externalOrderId: input.orderId,
            sourcePlugin: input.source,
            trustScore: input.trustScore,
            merchantId: mockMerchantId,
          }),
        })
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(mockOrderId);
    });

    it('should deduct credits for order creation', async () => {
      const input = {
        phoneNumber: '+21698123456',
        orderAmount: 150.0,
        source: 'api',
      };

      (prismaService.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: mockMerchantId,
        creditsBalance: 100,
      });
      (prismaService.order.create as jest.Mock).mockResolvedValue(mockOrder);

      await service.createFromPlugin(mockMerchantId, input);

      expect(prismaService.creditTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: mockMerchantId,
            type: 'spend',
            amount: -5,
            reason: 'order_check',
          }),
        })
      );
    });
  });

  describe('updateStatus', () => {
    it('should update order status successfully', async () => {
      const updateData = { status: 'verified' as const };

      (prismaService.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prismaService.order.update as jest.Mock).mockResolvedValue({
        ...mockOrder,
        orderStatus: updateData.status,
      });

      const result = await service.updateStatus(mockOrderId, updateData);

      expect(result.orderStatus).toBe(updateData.status);
    });

    it('should throw NotFoundException when order does not exist', async () => {
      (prismaService.order.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateStatus(99999, { status: 'verified' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addFeedback', () => {
    it('should add feedback to order and award credits', async () => {
      const feedbackData = {
        orderId: mockOrderId,
        rating: 5,
        comment: 'Excellent service',
        category: 'delivery',
      };

      (prismaService.order.findUnique as jest.Mock).mockResolvedValue(mockOrder);
      (prismaService.order.update as jest.Mock).mockResolvedValue({
        ...mockOrder,
        feedbacks: [],
      });

      const result = await service.addFeedback(mockMerchantId, feedbackData);

      expect(prismaService.creditTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: mockMerchantId,
            type: 'earn',
            amount: 2,
            reason: 'feedback_accepted',
          }),
        })
      );

      expect(result).toBeDefined();
      expect(result.rating).toBe(feedbackData.rating);
    });
  });
});
