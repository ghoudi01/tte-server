import { IsArray, IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateWebhookSubscriptionDto {
  @IsArray()
  @IsString({ each: true })
  eventTypes!: string[];

  @IsUrl()
  @MaxLength(512)
  url!: string;
}

export class UpdateWebhookSubscriptionDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventTypes?: string[];

  @IsOptional()
  @IsUrl()
  @MaxLength(512)
  url?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestWebhookDto {
  @IsUrl()
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  eventType?: string;
}
