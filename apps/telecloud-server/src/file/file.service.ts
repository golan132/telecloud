import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { UploadedFileMetadata } from '../telegram/types';
import { imageExtensions } from '../telegram/constants';
import { forEach, some } from 'lodash/fp';
import { EnvService } from '../env/env.service';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

@Injectable()
export class FileService {
  private uploadedFilesPath = path.resolve('uploadedFiles.json.gz');
  private uploadedFilesMetadata: UploadedFileMetadata[] = [];

  constructor(private readonly envService: EnvService) {
    this.loadUploadedFilesMetadata();

    process.on('SIGINT', () => {
      console.log(
        '🛑 FileService: Saving metadata before shutdown (SIGINT)...'
      );
      this.saveUploadedFilesMetadata().then(() => process.exit(0));
    });

    process.on('SIGTERM', () => {
      console.log(
        '🛑 FileService: Saving metadata before shutdown (SIGTERM)...'
      );
      this.saveUploadedFilesMetadata().then(() => process.exit(0));
    });
  }

  formatFileCaption(filePath: string, date: string): string {
    return `Path: ${filePath}\nDate: ${date}`;
  }

  async loadUploadedFilesMetadata(): Promise<void> {
    if (fs.existsSync(this.uploadedFilesPath)) {
      try {
        const compressedData = fs.readFileSync(this.uploadedFilesPath);
        const decompressedData = await gunzip(Uint8Array.from(compressedData));
        this.uploadedFilesMetadata = JSON.parse(
          decompressedData.toString('utf-8')
        );
        console.log(
          `Loaded ${this.uploadedFilesMetadata.length} uploaded files metadata.`
        );
      } catch (err) {
        console.log(
          "Failed to load uploaded files metadata, didn't load any files. creating new file."
        );
      }
    }
  }

  async saveUploadedFilesMetadata(): Promise<void> {
    try {
      const jsonData = JSON.stringify(this.uploadedFilesMetadata, null, 2);
      const dataBuffer = Buffer.from(jsonData, 'utf-8');
      const compressedData = await gzip(Uint8Array.from(dataBuffer));
      fs.writeFileSync(this.uploadedFilesPath, Uint8Array.from(compressedData));
    } catch (err) {
      console.error('Failed to save uploaded files metadata:', err);
    }
  }

  isFileUploaded(filePath: string): boolean {
    return some({ filePath }, this.uploadedFilesMetadata);
  }

  addUploadedFileMetadata(metadata: UploadedFileMetadata): void {
    this.uploadedFilesMetadata.push(metadata);
  }

  getUploadedFilesMetadata(): UploadedFileMetadata[] {
    return this.uploadedFilesMetadata;
  }

  scanDirectoryForImages(drivePath: string): string[] {
    const files: string[] = [];

    const walk = (dir: string) => {
      let items: fs.Dirent[];
      try {
        items = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        console.warn(`Skipping inaccessible directory: ${dir}`);
        return;
      }

      forEach((item) => {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          walk(fullPath);
        } else if (
          some((ext) => item.name.toLowerCase().endsWith(ext), imageExtensions)
        ) {
          files.push(fullPath);
        }
      }, items);
    };

    walk(drivePath);
    return files;
  }

  getFileInfo(filePath: string): {
    relativePath: string;
    gregorianDate: string;
    caption: string;
  } {
    const stats = fs.statSync(filePath);
    const modifiedDate = stats.mtime;
    const gregorianDate = `${modifiedDate.getDate()}/${
      modifiedDate.getMonth() + 1
    }/${modifiedDate.getFullYear()}`;

    const relativePath = filePath.replace(/^F:\\/i, '').replace(/\\/g, '/');
    const caption = this.formatFileCaption(relativePath, gregorianDate);

    return { relativePath, gregorianDate, caption };
  }

  getUnuploadedFiles(drivePath: string): string[] {
    const allFiles = this.scanDirectoryForImages(drivePath);
    return allFiles.filter((file) => !this.isFileUploaded(file));
  }

  ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  createWriteStream(filePath: string): fs.WriteStream {
    const outputDir = path.dirname(filePath);
    this.ensureDirectoryExists(outputDir);
    return fs.createWriteStream(filePath);
  }

  getRestoreOutputPath(): string {
    return this.envService.get('RESTORE_OUTPUT_PATH') || 'restored';
  }

  getRestoreFilePath(relativePath: string): string {
    const baseRestorePath = this.getRestoreOutputPath();
    return path.join(baseRestorePath, ...relativePath.split('/'));
  }

  hasFilesToRestore(): boolean {
    return this.uploadedFilesMetadata.length > 0;
  }
}
