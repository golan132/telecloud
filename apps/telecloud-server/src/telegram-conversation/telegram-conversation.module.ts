import { Module } from '@nestjs/common';
import { TelegramConversationService } from './telegram-conversation.service';

@Module({
  providers: [TelegramConversationService],
  exports: [TelegramConversationModule],
})
export class TelegramConversationModule {}
