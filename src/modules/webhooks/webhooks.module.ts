import { Module } from '@nestjs/common';
import { WebhooksController } from './webhook.controller.js';
import { WebhookService } from './webhook.service.js';

@Module({
  imports: [],
  controllers: [WebhooksController],
  providers: [WebhookService],
  exports: [WebhookService],
})
export class WebhooksModule {}
