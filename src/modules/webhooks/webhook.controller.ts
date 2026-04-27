import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, SetMetadata } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

const Public = () => SetMetadata('isPublic', true);

@Controller('api/webhooks')
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  
  @Get('stats')
  async getStats() {
    return { subscriptions: 0, activeSubscriptions: 0, totalDeliveries: 0, successRate: 0, recentFailures: 0 };
  }

  @Get('subscriptions')
  async listSubscriptions() {
    return { subscriptions: [] };
  }

  @Post('subscriptions')
  async createSubscription(@Body() dto: any) {
    return {
      success: true,
      subscription: {
        id: 'new',
        eventTypes: dto.eventTypes || [],
        url: dto.url,
        isActive: true,
        createdAt: new Date(),
      },
      message: 'Created',
    };
  }

  @Put('subscriptions/:id')
  async updateSubscription(@Param('id') id: string, @Body() dto: any) {
    return { success: true, subscription: { id, ...dto } };
  }

  @Delete('subscriptions/:id')
  async deleteSubscription(@Param('id') id: string) {
    return { success: true, message: 'Deleted' };
  }

  @Post('test')
  async testWebhook(@Body() dto: any) {
    return { success: true, destinationUrl: dto.url, responseStatus: 200 };
  }

  @Get('delivery-logs')
  async getDeliveryLogs(
    @Query('subscriptionId') subscriptionId?: string,
    @Query('success') success?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return {
      logs: [],
      total: 0,
      page: parseInt(page || '1'),
      pageSize: parseInt(pageSize || '20'),
      totalPages: 0,
    };
  }

  @Public()
  @Post('receive/:merchantId')
  async receiveWebhook(@Param('merchantId') merchantId: string, @Body() payload: any) {
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(8)}`;
    return { received: true, eventId, message: 'Queued' };
  }
}
