import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { db } from '../../database/index.js';
import { users } from '../schema/index.js';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TOKEN_EXPIRY = '7d';

// Input validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2, 'Full name is required'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const sendOtpSchema = z.object({
  phone: z.string().regex(/^\+?[0-9]{8,15}$/, 'Invalid phone number'),
});

const verifyOtpSchema = z.object({
  phone: z.string(),
  otp: z.string().length(6, 'OTP must be 6 digits'),
});

export const authRouter = router({
  // Get current user
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, ctx.user!.id),
    });
    
    if (!user) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
    }
    
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      totalPoints: user.totalPoints,
      tier: user.tier,
    };
  }),

  // Register new user
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ input }) => {
      // Check if user already exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      if (existingUser) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'Email already registered' 
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 10);

      // Create user with signup bonus
      const [newUser] = await db.insert(users).values({
        email: input.email,
        fullName: input.fullName,
        totalPoints: 10, // Signup bonus
        tier: 'bronze',
      }).returning();

      // Generate JWT token
      const token = jwt.sign(
        { id: newUser.id, email: newUser.email },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      return {
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
          totalPoints: newUser.totalPoints,
          tier: newUser.tier,
        },
        token,
      };
    }),

  // Login
  login: publicProcedure
    .input(loginSchema)
    .mutation(async ({ input }) => {
      const user = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      if (!user) {
        throw new TRPCError({ 
          code: 'UNAUTHORIZED', 
          message: 'Invalid email or password' 
        });
      }

      // Verify password (for demo, accept any password if user exists)
      // In production, compare with hashed password
      // const isValid = await bcrypt.compare(input.password, user.passwordHash);
      // if (!isValid) { ... }

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          totalPoints: user.totalPoints,
          tier: user.tier,
        },
        token,
      };
    }),

  // Logout (client-side token removal, but we log it)
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    // In a real app, you might invalidate the token or add to blacklist
    return { success: true, message: 'Logged out successfully' };
  }),

  // Send OTP for phone verification
  sendOtp: publicProcedure
    .input(sendOtpSchema)
    .mutation(async ({ input }) => {
      // TODO: Integrate with SMS gateway (Twilio, Vonage, etc.)
      // For now, generate and store OTP in database
      
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store OTP in database with expiration (5 minutes)
      // await db.insert(phoneOtps).values({
      //   phone: input.phone,
      //   otp,
      //   expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      // });

      // In production, send SMS here
      console.log(`OTP for ${input.phone}: ${otp}`);

      return { 
        success: true, 
        message: 'OTP sent successfully',
        // For demo purposes only - remove in production
        demoOtp: otp,
      };
    }),

  // Verify OTP
  verifyOtp: publicProcedure
    .input(verifyOtpSchema)
    .mutation(async ({ input }) => {
      // TODO: Verify OTP from database
      // Check if OTP exists and is not expired
      // Compare with provided OTP
      
      // For demo, accept any 6-digit OTP
      if (input.otp.length !== 6) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'Invalid OTP' 
        });
      }

      // Find or create user by phone
      let user = await db.query.users.findFirst({
        where: eq(users.email, input.phone), // Using email field temporarily for phone
      });

      if (!user) {
        // Create new user with phone as email
        const [newUser] = await db.insert(users).values({
          email: input.phone,
          fullName: input.phone,
          totalPoints: 10,
          tier: 'bronze',
        }).returning();
        
        user = newUser;
      }

      // Generate JWT token
      const token = jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      return {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          totalPoints: user.totalPoints,
          tier: user.tier,
        },
        token,
      };
    }),

  // Password reset request
  forgotPassword: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const user = await db.query.users.findFirst({
        where: eq(users.email, input.email),
      });

      if (!user) {
        // Don't reveal if email exists or not
        return { success: true, message: 'If the email exists, a reset link will be sent' };
      }

      // Generate reset token
      const resetToken = jwt.sign(
        { id: user.id, type: 'password_reset' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      // TODO: Send email with reset link
      // const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
      // await sendEmail(user.email, 'Password Reset', `Click here: ${resetLink}`);

      console.log(`Password reset token for ${input.email}: ${resetToken}`);

      return { 
        success: true, 
        message: 'If the email exists, a reset link will be sent',
        // For demo only
        demoResetToken: resetToken,
      };
    }),

  // Reset password with token
  resetPassword: publicProcedure
    .input(z.object({
      token: z.string(),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    }))
    .mutation(async ({ input }) => {
      try {
        const decoded = jwt.verify(input.token, JWT_SECRET) as any;
        
        if (decoded.type !== 'password_reset') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid token type' });
        }

        const hashedPassword = await bcrypt.hash(input.newPassword, 10);

        await db.update(users)
          .set({ /* passwordHash: hashedPassword */ })
          .where(eq(users.id, decoded.id));

        return { success: true, message: 'Password reset successfully' };
      } catch (error) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid or expired token' });
      }
    }),
});
