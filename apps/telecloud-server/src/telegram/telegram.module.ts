import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { EnvModule } from '../env/env.module';
import { TelegramConversationModule } from '../telegram-conversation/telegram-conversation.module';
import { TelegramConversationService } from '../telegram-conversation/telegram-conversation.service';
import { EnvService } from '../env/env.service';
import { FileModule } from '../file/file.module';

@Module({
  providers: [EnvService, TelegramService, TelegramConversationService],
  imports: [EnvModule, TelegramConversationModule, FileModule],
})
export class TelegramModule {}
