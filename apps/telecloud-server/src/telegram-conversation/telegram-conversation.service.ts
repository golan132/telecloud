import { Injectable } from '@nestjs/common';
import { CONVERSATION_STATE, HELP_TEXT, KEYBOARD } from './constants';
import { UserContext, BotResponse } from './types';

@Injectable()
export class TelegramConversationService {
  private userContexts = new Map<number, UserContext>();
  private storageChannelIds = new Set<number>();

  getContext(chatId: number): UserContext {
    if (!this.userContexts.has(chatId)) {
      this.userContexts.set(chatId, { state: CONVERSATION_STATE.Idle });
    }
    return this.userContexts.get(chatId)!;
  }

  resetContext(chatId: number): void {
    this.userContexts.set(chatId, { state: CONVERSATION_STATE.Idle });
  }

  getStorageChannelIds(): number[] {
    return [...this.storageChannelIds];
  }

  addChannelId(id: number): void {
    this.storageChannelIds.add(id);
  }

  handleMessage(chatId: number, message: string): BotResponse {
    const context = this.getContext(chatId);

    switch (context.state) {
      case CONVERSATION_STATE.Idle:
        if (message === '/start') {
          return {
            text: `Welcome! What do you want to do?`,
            reply_markup: {
              keyboard: KEYBOARD,
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          };
        }

        if (message === 'Add Cloud Storage Channel') {
          context.state = CONVERSATION_STATE.WaitingForChannelForward;
          return {
            text: `🔗 Please forward a message from the private channel you want to use for storage.`,
            reply_markup: { remove_keyboard: true },
          };
        }

        if (message === '📤 Upload From Drive') {
          return {
            text: '⏳ Scanning drive and uploading images...',
            reply_markup: { remove_keyboard: true },
          };
        }

        if (message === '📥 Restore Images') {
          return {
            text: '⏳ Restoring images from your cloud storage...',
            reply_markup: { remove_keyboard: true },
          };
        }

        if (message === 'Help') {
          return {
            text: HELP_TEXT,
            reply_markup: { remove_keyboard: true },
          };
        }

        return { text: `Please use the keyboard options or type /start.` };

      case CONVERSATION_STATE.WaitingForChannelForward:
        return {
          text: `❌ Please forward a message from the channel — not type a message.\nTry again.`,
        };

      default:
        this.resetContext(chatId);
        return {
          text: 'Unexpected state. Resetting. Type /start to begin.',
        };
    }
  }

  handleForwardedMessage(
    chatId: number,
    forwardedFromChatId: number
  ): BotResponse {
    const context = this.getContext(chatId);

    if (context.state === CONVERSATION_STATE.WaitingForChannelForward) {
      this.addChannelId(forwardedFromChatId);
      this.resetContext(chatId);
      return {
        text: `✅ Channel registered! ID: \`${forwardedFromChatId}\`\nAll future uploads will be forwarded to this channel.`,
        reply_markup: { remove_keyboard: true },
      };
    }

    return {
      text: `✅ Got forwarded message, but not expecting it. No action taken.`,
    };
  }
}
