import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum, Min, Max } from 'class-validator';

export enum QuickServiceType {
  ENGINE_WONT_START = 'engine_wont_start',
  OIL_CHANGE = 'oil_change',
  BRAKES = 'brakes',
  DIAGNOSTICS = 'diagnostics',
  URGENT = 'urgent',
  SUSPENSION = 'suspension',
  ELECTRICAL = 'electrical',
  OTHER = 'other',
}

export class QuickRequestDto {
  @IsEnum(QuickServiceType)
  serviceType: QuickServiceType;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  @IsOptional()
  @IsBoolean()
  mobileRequired?: boolean;
}
