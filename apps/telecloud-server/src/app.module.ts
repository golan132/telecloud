import { Module } from '@nestjs/common';
import { TelegramModule } from './telegram/telegram.module';
import { EnvModule } from './env/env.module';
import { TelegramConversationModule } from './telegram-conversation/telegram-conversation.module';
import { FileModule } from './file/file.module';

@Module({
  imports: [TelegramModule, EnvModule, TelegramConversationModule, FileModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
