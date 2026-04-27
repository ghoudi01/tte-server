import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('register', () => {
    it('should create a new user with valid data', async () => {
      const input = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        phone: '+21698123456',
      };

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prismaService.user.create as jest.Mock).mockResolvedValue({
        id: '123',
        email: input.email,
        fullName: input.name,
        phone: input.phone,
        totalPoints: 0,
        tier: 'bronze',
      });

      const result = await service.register(input);

      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: input.email.toLowerCase(),
          fullName: input.name,
          phone: input.phone?.trim(),
          passwordHash: expect.any(String),
        },
      });
      expect(result).toBeDefined();
      expect(result.email).toBe(input.email.toLowerCase());
    });

    it('should throw ConflictException when email already exists', async () => {
      const input = {
        email: 'existing@example.com',
        password: 'SecurePass123!',
      };

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: '123',
        email: input.email,
      });

      await expect(service.register(input)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('should return user with valid credentials', async () => {
      const input = {
        email: 'test@example.com',
        password: 'SecurePass123!',
      };

      const hashedPassword = await bcrypt.hash(input.password, 10);

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: '123',
        email: input.email,
        passwordHash: hashedPassword,
        fullName: 'Test User',
      });

      const result = await service.login(input);

      expect(result).toBeDefined();
      expect(result.id).toBe('123');
      expect(result.email).toBe(input.email.toLowerCase());
    });

    it('should throw UnauthorizedException with invalid password', async () => {
      const input = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      const hashedPassword = await bcrypt.hash('CorrectPassword123!', 10);

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: '123',
        email: input.email,
        passwordHash: hashedPassword,
      });

      await expect(service.login(input)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      const input = {
        email: 'nonexistent@example.com',
        password: 'SomePassword',
      };

      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.login(input)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('me', () => {
    it('should return user by id', async () => {
      const userId = '123';
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: userId,
        email: 'test@example.com',
        fullName: 'Test User',
      });

      const result = await service.me(userId);

      expect(result).toBeDefined();
      expect(result.id).toBe(userId);
    });

    it('should return null when user not found', async () => {
      const userId = 'nonexistent';
      (prismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.me(userId);

      expect(result).toBeNull();
    });
  });
});
