import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FileService } from './file.service';
import { EnvModule } from '../env/env.module';

@Module({
  imports: [EnvModule],
  providers: [FileService],
  exports: [FileService],
})
export class FileModule {}
