import { Test, TestingModule } from '@nestjs/testing';
import { MerchantsService } from '../merchants/merchants.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';

describe('MerchantsService', () => {
  let service: MerchantsService;
  let prismaService: PrismaService;

  const mockMerchant = {
    id: 'merchant-123',
    userId: 'user-456',
    businessName: 'Test Store',
    email: 'store@example.com',
    phone: '+21691234567',
    apiKey: 'tte_abc123def456',
    status: 'active',
    creditsBalance: 100,
    autoValidationEnabled: true,
    whatsappValidationEnabled: true,
    autoShippingSelectionEnabled: true,
    trustThresholdForDeposit: 40,
    defaultShippingCompany: 'Rapid-Poste',
    productTypes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantsService,
        {
          provide: PrismaService,
          useValue: {
            merchant: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<MerchantsService>(MerchantsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('create', () => {
    it('should create a new merchant with unique API key', async () => {
      const userId = 'user-456';
      const input = {
        businessName: 'Test Store',
        email: 'store@example.com',
        phone: '+21691234567',
        city: 'Tunis',
        address: '123 Main St',
      };

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: userId,
        email: input.email,
      });
      (prismaService.merchant.findFirst as jest.Mock).mockResolvedValue(null);

      const generatedKey = `tte_${Math.random().toString(36).substring(2)}`;
      (prismaService.merchant.create as jest.Mock).mockResolvedValue({
        ...mockMerchant,
        id: 'merchant-123',
        apiKey: generatedKey,
        userId,
      });

      const result = await service.create(userId, input);

      expect(prismaService.merchant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessName: input.businessName,
            email: input.email,
            phone: input.phone,
            city: input.city,
            address: input.address,
            userId,
            apiKey: expect.stringMatching(/^tte_[a-zA-Z0-9]+$/),
          }),
        })
      );

      expect(result.apiKey).toMatch(/^tte_[a-zA-Z0-9]+$/);
    });

    it('should throw ConflictException if merchant already exists for user', async () => {
      const userId = 'user-456';
      const input = {
        businessName: 'Test Store',
        email: 'store@example.com',
      };

      (prismaService.merchant.findFirst as jest.Mock).mockResolvedValue(mockMerchant);

      await expect(service.create(userId, input)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getProfile', () => {
    it('should return merchant profile by userId', async () => {
      const userId = 'user-456';
      (prismaService.merchant.findFirst as jest.Mock).mockResolvedValue(mockMerchant);

      const result = await service.getProfile(userId);

      expect(result).toEqual(mockMerchant);
    });

    it('should return null when merchant not found', async () => {
      (prismaService.merchant.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.getProfile('nonexistent-user');

      expect(result).toBeNull();
    });
  });

  describe('regenerateApiKey', () => {
    it('should generate a new API key', async () => {
      const userId = 'user-456';
      const merchantId = 'merchant-123';

      (prismaService.merchant.findFirst as jest.Mock).mockResolvedValue(mockMerchant);
      (prismaService.merchant.update as jest.Mock).mockResolvedValue({
        ...mockMerchant,
        apiKey: 'tte_newkey456',
      });

      const result = await service.regenerateApiKey(userId);

      expect(prismaService.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: merchantId },
          data: { apiKey: expect.stringMatching(/^tte_[a-zA-Z0-9]+$/) },
        })
      );

      expect(result.apiKey).toMatch(/^tte_[a-zA-Z0-9]+$/);
    });

    it('should throw NotFoundException if merchant not found', async () => {
      (prismaService.merchant.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.regenerateApiKey('nonexistent-user')).rejects.toThrow();
    });
  });
});
