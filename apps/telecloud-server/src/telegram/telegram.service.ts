import { Injectable } from '@nestjs/common';
import TelegramBot, { Message } from 'node-telegram-bot-api';
import axios from 'axios';
import { EnvService } from '../env/env.service';
import { TelegramConversationService } from '../telegram-conversation/telegram-conversation.service';
import { FileService } from '../file/file.service';
import {
  PROGRESS_REPORT_INTERVAL_MS,
  DEFAULT_DRIVE_PATH,
  DEFAULT_RETRY_AFTER_SECONDS,
  MAX_RETRY_ATTEMPTS,
  NETWORK_RETRY_DELAY_MS,
} from './constants';
import { UploadResult, UploadStats } from './types';
import * as fs from 'graceful-fs';

@Injectable()
export class TelegramService {
  private bots: TelegramBot[] = [];
  private currentBotIndex = 0;
  private storageChannels: (string | number)[] = [];
  private uploadStats: UploadStats = {
    startTime: 0,
    totalFiles: 0,
    uploadedFiles: 0,
    lastReportTime: 0,
    filesUploadedSinceLastReport: 0,
  };
  private progressInterval: NodeJS.Timeout | null = null;
  private adminChatId: string | number;

  constructor(
    private readonly envService: EnvService,
    private readonly conversationService: TelegramConversationService,
    private readonly fileService: FileService
  ) {
    this.initializeBots();
    this.setupProcessHandlers();
  }

  private initializeBots() {
    const tokens = this.envService.get('TELEGRAM_BOT_TOKENS').split(',');
    this.bots = tokens.map(
      (token) => new TelegramBot(token.trim(), { polling: true })
    );
    this.bots.forEach((bot) => this.setupListeners(bot));

    this.storageChannels = this.envService
      .get('STORAGE_CHANNEL_IDS')
      .split(',')
      .map((id) => id.trim());

    this.adminChatId = this.envService.get('ADMIN_CHAT_ID');
  }

  private setupProcessHandlers() {
    const cleanup = () => {
      console.log('🛑 Gracefully shutting down TelegramService...');
      this.stopProgressTracking();
      process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  private cleanupResources() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private startProgressTracking(totalFiles: number) {
    this.uploadStats = {
      startTime: Date.now(),
      totalFiles,
      uploadedFiles: 0,
      lastReportTime: Date.now(),
      filesUploadedSinceLastReport: 0,
    };

    this.sendProgressReport();
    this.progressInterval = setInterval(
      () => this.sendProgressReport(),
      PROGRESS_REPORT_INTERVAL_MS
    );
  }

  private stopProgressTracking() {
    this.cleanupResources();
    this.sendFinalReport();
  }

  private async sendProgressReport() {
    const now = Date.now();
    const elapsedTimeMs = now - this.uploadStats.startTime;
    const elapsedTimeMinutes = elapsedTimeMs / (1000 * 60);

    const filesSinceLastReport = this.uploadStats.filesUploadedSinceLastReport;
    const uploadRate = filesSinceLastReport / (PROGRESS_REPORT_INTERVAL_MS / (1000 * 60));

    const remainingFiles = this.uploadStats.totalFiles - this.uploadStats.uploadedFiles;
    const estimatedRemainingTime = remainingFiles / uploadRate;
    const progressPercent = (this.uploadStats.uploadedFiles / this.uploadStats.totalFiles) * 100;

    const message = [
      `Upload Progress Report:`,
      `✅ Uploaded: ${this.uploadStats.uploadedFiles} of ${this.uploadStats.totalFiles} (${progressPercent.toFixed(1)}%)`,
      `⏱️ Elapsed: ${elapsedTimeMinutes.toFixed(1)} minutes`,
      `📈 Rate: ${uploadRate.toFixed(1)} files/minute`,
      `⏳ Estimated time remaining: ${estimatedRemainingTime.toFixed(1)} minutes`,
    ].join('\n');

    try {
      await this.sendMessage(this.adminChatId, message);
    } catch (error) {
      console.error('Failed to send progress report:', error);
    }

    this.uploadStats.filesUploadedSinceLastReport = 0;
    this.uploadStats.lastReportTime = now;
  }

  private async sendFinalReport() {
    try {
      const totalElapsedTimeMs = Date.now() - this.uploadStats.startTime;
      const totalElapsedTimeMinutes = totalElapsedTimeMs / (1000 * 60);
      const averageUploadRate = this.uploadStats.uploadedFiles / totalElapsedTimeMinutes;

      const finalReportMessage = [
        '🏁 Upload Complete!',
        `✅ Total Uploaded: ${this.uploadStats.uploadedFiles} files`,
        `⏱️ Total Time: ${totalElapsedTimeMinutes.toFixed(1)} minutes`,
        `📈 Average Rate: ${averageUploadRate.toFixed(1)} files/minute`,
      ].join('\n');

      await this.sendMessage(this.adminChatId, finalReportMessage);
    } catch (error) {
      console.error('Error sending final report:', error);
    }
  }

  private incrementUploadCount() {
    this.uploadStats.uploadedFiles++;
    this.uploadStats.filesUploadedSinceLastReport++;
  }

  private getNextBot(): TelegramBot {
    const bot = this.bots[this.currentBotIndex];
    this.currentBotIndex = (this.currentBotIndex + 1) % this.bots.length;
    return bot;
  }

  private setupListeners(bot: TelegramBot): void {
    bot.on('message', async (msg: Message) => {
      try {
        await this.handleIncomingMessage(bot, msg);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    });
  }

  private async handleIncomingMessage(bot: TelegramBot, msg: Message) {
    const chatId = msg.chat.id;
    const expectedChatIds = this.envService
      .get('CHAT_IDS')
      .split(',')
      .map((id) => id.trim());

    if (!expectedChatIds.includes(chatId.toString())) {
      console.log(`Ignoring unauthorized chatId: ${chatId}`);
      return;
    }

    if (msg.forward_from_chat?.id) {
      return this.handleForwardedMessage(bot, chatId, msg);
    }

    if (msg.text) {
      return this.handleTextMessage(bot, chatId, msg);
    }

    if (msg.document || msg.photo) {
      return this.forwardFileToChannels(msg);
    }
  }

  private async handleForwardedMessage(
    bot: TelegramBot,
    chatId: number,
    msg: Message
  ) {
    const response = this.conversationService.handleForwardedMessage(
      chatId,
      msg.forward_from_chat.id
    );

    await bot.sendMessage(chatId, response.text, {
      parse_mode: 'Markdown',
      ...(response.reply_markup && { reply_markup: response.reply_markup }),
    });
  }

  private async handleTextMessage(
    bot: TelegramBot,
    chatId: number,
    msg: Message
  ) {
    const response = this.conversationService.handleMessage(chatId, msg.text);
    await bot.sendMessage(chatId, response.text, {
      parse_mode: 'Markdown',
      ...(response.reply_markup && { reply_markup: response.reply_markup }),
    });

    if (msg.text === '📤 Upload From Drive') {
      await this.handleUploadFromDrive(chatId);
    } else if (msg.text === '📥 Restore Images') {
      await this.handleRestoreImages(chatId);
    }
  }

  private async handleUploadFromDrive(chatId: number): Promise<void> {
    try {
      await this.scanAndUploadImagesFromDrive();
      await this.sendMessage(chatId, '✅ Upload complete.');
    } catch (error) {
      console.error('Error during upload from drive:', error);
      await this.sendMessage(chatId, '❌ Upload failed.');
    }
  }

  private async handleRestoreImages(chatId: number): Promise<void> {
    try {
      await this.sendMessage(chatId, '⏳ Starting restore...');
      await this.restoreImagesFromSavedMetadata();
      await this.sendMessage(chatId, '✅ Restore complete.');
    } catch (error) {
      console.error('Error during restore:', error);
      await this.sendMessage(chatId, '❌ Restore failed.');
    }
  }

  private async forwardFileToChannels(msg: Message): Promise<void> {
    const chatId = msg.chat.id;

    try {
      const channels =
        this.conversationService.getStorageChannelIds() || this.storageChannels;

      if (!channels.length) {
        await this.sendMessage(
          chatId,
          '⚠️ No storage channels registered yet.'
        );
        return;
      }

      for (const channelId of channels) {
        const bot = this.getNextBot();
        if (msg.document) {
          await bot.sendDocument(channelId, msg.document.file_id);
        } else if (msg.photo?.length) {
          const bestPhoto = msg.photo[msg.photo.length - 1];
          await bot.sendPhoto(channelId, bestPhoto.file_id);
        }
      }

      await this.sendMessage(
        chatId,
        '📤 File sent to cloud storage channel(s).'
      );
    } catch (error) {
      console.error('Error forwarding file to channel:', error);
      await this.sendMessage(chatId, '❌ Failed to forward file.');
    }
  }

  private async sendPhotoToChannels(
    filePath: string,
    caption: string,
    channels: (string | number)[]
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const channelId of channels) {
      const bot = this.getNextBot();
      const photoStream = fs.createReadStream(filePath);

      const sentMsg = await bot.sendPhoto(channelId, photoStream, { caption });

      if (!sentMsg.photo?.length) {
        throw new Error('No photo info returned from sendPhoto');
      }

      const bestPhoto = sentMsg.photo[sentMsg.photo.length - 1];
      results.push({
        file_id: bestPhoto.file_id,
        channelId,
      });

      console.log(`✅ Uploaded: ${filePath} to channel ${channelId}`);
    }

    return results;
  }

  private async sendVideoToChannels(
    filePath: string,
    caption: string,
    channels: (string | number)[]
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const channelId of channels) {
      const bot = this.getNextBot();
      const videoStream = fs.createReadStream(filePath);

      const sentMsg = await bot.sendVideo(channelId, videoStream, {
        caption,
        supports_streaming: true,
      });

      if (!sentMsg.video) {
        throw new Error('No video info returned from sendVideo');
      }

      results.push({
        file_id: sentMsg.video.file_id,
        channelId,
      });

      console.log(`✅ Uploaded video: ${filePath} to channel ${channelId}`);
    }

    return results;
  }

  private async sendDocumentToChannels(
    filePath: string,
    caption: string,
    channels: (string | number)[]
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const channelId of channels) {
      const bot = this.getNextBot();
      const documentStream = fs.createReadStream(filePath);

      const sentMsg = await bot.sendDocument(channelId, documentStream, {
        caption,
      });

      if (!sentMsg.document) {
        throw new Error('No document info returned from sendDocument');
      }

      results.push({
        file_id: sentMsg.document.file_id,
        channelId,
      });

      console.log(`✅ Uploaded document: ${filePath} to channel ${channelId}`);
    }

    return results;
  }

  private async downloadFileFromTelegram(
    fileId: string
  ): Promise<NodeJS.ReadableStream> {
    const bot = this.getNextBot();
    const file = await bot.getFile(fileId);
    const url = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;

    const response = await axios.get(url, { responseType: 'stream' });
    return response.data;
  }

  private async handleUploadWithRetry(
    filePath: string,
    caption: string,
    channels: (string | number)[]
  ): Promise<UploadResult[]> {
    const maxRetries = MAX_RETRY_ATTEMPTS;
    const retryDelay = NETWORK_RETRY_DELAY_MS;
    const backoff = (attempt: number) => Math.min(attempt * retryDelay, 30_000);

    const upload = async (attempt: number) => {
      try {
        const ext = filePath.toLowerCase();

        if (
          ext.endsWith('.jpg') ||
          ext.endsWith('.jpeg') ||
          ext.endsWith('.png')
        ) {
          return await this.sendPhotoToChannels(filePath, caption, channels);
        } else if (
          ext.endsWith('.mp4') ||
          ext.endsWith('.mov') ||
          ext.endsWith('.avi')
        ) {
          return await this.sendVideoToChannels(filePath, caption, channels);
        } else {
          return await this.sendDocumentToChannels(filePath, caption, channels);
        }
      } catch (error) {
        if (this.isRateLimitError(error)) {
          const waitTime =
            error.response?.parameters?.retry_after || backoff(attempt);
          console.warn(
            `⏳ Rate limit exceeded. Waiting ${waitTime}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        } else if (this.isNetworkError(error)) {
          console.warn('🌐 Network issue. Retrying in 10 seconds...');
          await new Promise((resolve) =>
            setTimeout(resolve, backoff(attempt))
          );
        } else {
          console.error(`❌ Failed to send ${filePath}:`, error.message);
          throw error;
        }
      }
    };

    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await upload(attempt);
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          throw new Error(
            `Failed after ${maxRetries} retries for file ${filePath}`
          );
        }
      }
    }
  }

  private isRateLimitError(error: any): boolean {
    return error.response?.statusCode === 429;
  }

  private isNetworkError(error: any): boolean {
    return error.code === 'ENOTFOUND' || error.code === 'ECONNRESET';
  }

  async sendMessage(chatId: string | number, message: string): Promise<void> {
    try {
      await this.bots[0].sendMessage(chatId, message);
    } catch (error) {
      console.error('Error sending message to Telegram:', error);
    }
  }

  async scanAndUploadImagesFromDrive(
    drivePath: string = DEFAULT_DRIVE_PATH,
    maxConcurrency: number = this.bots.length * 2
  ): Promise<void> {
    const files = this.fileService.getUnuploadedFiles(drivePath);
    console.log(`📁 Found ${files.length} files to upload from ${drivePath}`);
    this.startProgressTracking(files.length);

    const queue = [...files];
    const workers: Promise<void>[] = [];

    for (let i = 0; i < maxConcurrency; i++) {
      workers.push(
        (async () => {
          while (queue.length > 0) {
            const filePath = queue.shift();
            if (!filePath) break;

            const { relativePath, caption } =
              this.fileService.getFileInfo(filePath);

            if (!this.fileService.isFileUploaded(relativePath)) {
              try {
                const results = await this.handleUploadWithRetry(
                  filePath,
                  caption,
                  this.storageChannels
                );
                this.processUploadResults(results, relativePath, caption);

                await this.fileService.saveUploadedFilesMetadata();
              } catch (error) {
                console.error(`❌ Upload failed for ${relativePath}:`, error);
              }
            } else {
              this.incrementUploadCount();
            }
          }
        })()
      );
    }
    await Promise.allSettled(workers);
    this.stopProgressTracking();
  }

  private processUploadResults(
    results: UploadResult[],
    relativePath: string,
    caption: string
  ) {
    results.forEach(({ file_id, channelId }) => {
      this.fileService.addUploadedFileMetadata({
        filePath: relativePath,
        file_id,
        caption,
        channelId,
      });
      this.incrementUploadCount();
    });
  }

  async restoreImagesFromSavedMetadata(): Promise<void> {
    if (!this.fileService.hasFilesToRestore()) {
      console.log('No uploaded files metadata found. Nothing to restore.');
    }

    const metadata = this.fileService.getUploadedFilesMetadata();
    for (const meta of metadata) {
      try {
        await this.restoreSingleFile(meta);
      } catch (error) {
        console.error(`Failed to restore file ${meta.filePath}:`, error);
      }
    }
  }

  private async restoreSingleFile(meta: any) {
    const outputPath = this.fileService.getRestoreFilePath(meta.filePath);
    const fileStream = await this.downloadFileFromTelegram(meta.file_id);
    const writer = this.fileService.createWriteStream(outputPath);

    await new Promise<void>((resolve, reject) => {
      let error: Error | null = null;

      writer.on('error', (err) => {
        error = err;
        writer.close();
        reject(err);
      });

      writer.on('close', () => {
        if (!error) resolve();
      });

      fileStream.pipe(writer);
    });

    console.log(`✅ Restored file to ${outputPath}`);
  }
}
