import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    // Public routes skip auth
    const isPublic = 
      this.reflector.get<boolean>('public', context.getHandler()) ||
      this.reflector.get<boolean>('public', context.getClass());
    
    if (isPublic) {
      return true;
    }

    // Check for user in request (set by auth middleware)
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Invalid or missing authentication token');
    }

    return true;
  }
}
