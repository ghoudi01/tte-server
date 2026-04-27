import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  async transform(value: any, { metatype, type }: ArgumentMetadata) {
    if (!metatype || type === 'body') {
      // For body parameters, use class-validator with DTOs
      if (metatype && type === 'body') {
        const errors = await validate(plainToInstance(metatype, value));
        if (errors.length > 0) {
          const formattedErrors = errors.map((error) => ({
            property: error.property,
            constraints: error.constraints,
          }));
          throw new BadRequestException({
            message: 'Validation failed',
            errors: formattedErrors,
          });
        }
      }
      return value;
    }
    return value;
  }
}
