import { Test, TestingModule } from '@nestjs/testing';
import { PhoneVerificationService } from '../phone-verification/phone-verification.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PhoneVerificationService', () => {
  let service: PhoneVerificationService;
  let prismaService: PrismaService;

  const mockPhoneCheckResult = {
    phoneNumber: '+21698123456',
    isValid: true,
    trustScore: 75,
    riskLevel: 'medium',
    successfulOrders: 5,
    rtoCount: 1,
    spamReports: 2,
    notSpamReports: 3,
    lastVerifiedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhoneVerificationService,
        {
          provide: PrismaService,
          useValue: {
            order: {
              count: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            spamPhone: {
              count: jest.fn(),
              findFirst: jest.fn(),
            },
            transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PhoneVerificationService>(PhoneVerificationService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('check()', () => {
    it('should return trust data for valid phone number', async () => {
      const phoneNumber = '+21698123456';

      // Mock successful orders count
      (prismaService.order.count as jest.Mock).mockResolvedValue(5);
      (prismaService.spamPhone.count as jest.Mock).mockResolvedValue(2);

      const result = await service.check(phoneNumber);

      expect(result).toBeDefined();
      expect(result.trustScore).toBeGreaterThanOrEqual(0);
      expect(result.trustScore).toBeLessThanOrEqual(100);
      expect(result.riskLevel).toMatch(/low|medium|high|critical/);
      expect(result.phoneNumber).toBe(phoneNumber);
    });

    it('should calculate higher risk for spam-reported numbers', async () => {
      const phoneNumber = '+21698123456';

      (prismaService.order.count as jest.Mock).mockResolvedValue(1);
      (prismaService.spamPhone.count as jest.Mock).mockResolvedValue(5);

      const result = await service.check(phoneNumber);

      expect(result.riskLevel).toBe('high');
      expect(result.trustScore).toBeLessThan(50);
    });

    it('should handle international format with +216', async () => {
      const phoneNumber = '+21698123456';
      (prismaService.order.count as jest.Mock).mockResolvedValue(10);
      (prismaService.spamPhone.count as jest.Mock).mockResolvedValue(0);

      const result = await service.check(phoneNumber);

      expect(result.successfulOrders).toBe(10);
      expect(result.spamReports).toBe(0);
      expect(result.trustScore).toBeGreaterThan(70);
    });

    it('should handle local format without country code', async () => {
      const phoneNumber = '98123456'; // Without +216 prefix
      (prismaService.order.count as jest.Mock).mockResolvedValue(3);
      (prismaService.spamPhone.count as jest.Mock).mockResolvedValue(1);

      const result = await service.check(phoneNumber);

      expect(result).toBeDefined();
      expect(result.trustScore).toBeGreaterThan(0);
    });
  });
});
