import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class SanitizationPipe implements PipeTransform<any> {
  transform(value: any, _metadata: ArgumentMetadata) {
    if (!value || typeof value !== 'object') {
      return value;
    }

    const sanitize = (obj: any): any => {
      if (obj === null || typeof obj !== 'object') {
        return typeof obj === 'string' ? this.sanitizeString(obj) : obj;
      }

      if (Array.isArray(obj)) {
        return obj.map((item) => sanitize(item));
      }

      const result: any = {};
      for (const [key, val] of Object.entries(obj)) {
        result[key] = sanitize(val);
      }
      return result;
    };

    return sanitize(value);
  }

  private sanitizeString(str: string): string {
    let sanitized = str;

    // Remove HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');

    // Remove script and event handler XSS vectors
    sanitized = sanitized.replace(
      /(javascript:|on\w+\s*=|<\s*script|<\s*img\s*onerror|<\s*iframe|<\s*object)/gi,
      '',
    );

    return sanitized.trim();
  }
}
