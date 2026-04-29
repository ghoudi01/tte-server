
import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  IsArray,
  ValidateNested,
  IsObject,
  IsEmail,
  IsInt,
  IsBoolean,
} from "class-validator";

const TUNISIA_PHONE_PATTERN = /^(?:\+?216)?[24579]\d{7}$/;

// ========== Base DTOs (must be first) ==========

export class AddressDto {
  @IsString()
  street!: string;

  @IsString()
  city!: string;

  @IsString()
  region!: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsString()
  country!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsString()
  addressType?: 'home' | 'work' | 'other';
}

export class PhoneCheckDto {
  @IsString()
  @Matches(TUNISIA_PHONE_PATTERN, {
    message: "phoneNumber must be a valid Tunisian phone number",
  })
  phoneNumber!: string;
}

export class SendOtpDto extends PhoneCheckDto {}

// ========== Enhanced DTOs ==========

export class EnhancedCustomerDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  @IsEmail()
  email?: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional()
  @IsString()
  registrationDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalPreviousOrders?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalLifetimeValue?: number;

  @IsOptional()
  @IsString()
  loyaltyTier?: string;
}

export class OrderItemDto {
  @IsString()
  productId!: string;

  @IsString()
  productName!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsNumber()
  @Min(0)
  total!: number;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;
}

export class CreateEnhancedOrderDto {
  @IsString()
  orderId!: string;

  @IsString()
  phoneNumber!: string;

  @IsNumber()
  @Min(0)
  orderAmount!: number;

  @IsString()
  paymentMethod!: 'cod' | 'card' | 'transfer' | 'wallet' | 'other';

  @IsOptional()
  @ValidateNested()
  @Type(() => EnhancedCustomerDto)
  customer?: EnhancedCustomerDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @IsOptional()
  @IsString()
  customerEmail?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  customerAccountAgeMonths?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  previousOrdersWithMerchant?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customerLifetimeValue?: number;

  @IsOptional()
  @IsString()
  paymentMethodRaw?: string;

  @IsOptional()
  @IsString()
  shippingMethod?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingCost?: number;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  checkoutSessionId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  platformRiskScore?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platformFlags?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  checkoutDurationSeconds?: number;

  @IsOptional()
  @IsString()
  storeCategory?: string;

  @IsOptional()
  @IsString()
  timeOfDay?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  @IsOptional()
  @IsString()
  sourcePlatform?: string;

  @IsOptional()
  @IsString()
  externalOrderId?: string;
}

export class CreatePluginOrderDto {
  @IsOptional()
  @IsString()
  @Matches(TUNISIA_PHONE_PATTERN, {
    message: "phoneNumber must be a valid Tunisian phone number",
  })
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(TUNISIA_PHONE_PATTERN, {
    message: "phone must be a valid Tunisian phone number",
  })
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  orderAmount?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  orderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sourcePlatform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  // Enhanced fields
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items?: OrderItemDto[];

  @IsOptional()
  @IsString()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  shippingMethod?: string;

  @IsOptional()
  @IsNumber()
  shippingCost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  platformRiskScore?: number;
}


export class CheckOrderDto {
  @IsString()
  @Matches(TUNISIA_PHONE_PATTERN, {
    message: "phone must be a valid Tunisian phone number",
  })
  phone!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;
}

export class OrderFeedbackDto {
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(1)
  orderId!: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;
}

export class SpamPhoneDto {
  @IsString()
  @Matches(TUNISIA_PHONE_PATTERN, {
    message: "phoneNumber must be a valid Tunisian phone number",
  })
  phoneNumber!: string;

  @IsOptional()
  @IsIn(["spam", "not_spam"])
  verdict?: "spam" | "not_spam";

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(1)
  orderId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;
}

export class PluginReportDto {
  @IsString()
  @Matches(TUNISIA_PHONE_PATTERN, {
    message: "phoneNumber must be a valid Tunisian phone number",
  })
  phoneNumber!: string;

  @IsString()
  @MaxLength(50)
  reportType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalOrderId?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
