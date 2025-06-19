import { plainToInstance } from 'class-transformer';
import { IsString, validateSync } from 'class-validator';
import { isEmpty } from 'lodash/fp';

export class EnvVars {
  @IsString()
  TELEGRAM_BOT_TOKENS!: string;

  @IsString()
  STORAGE_CHANNEL_IDS!: string;

  @IsString()
  RESTORE_OUTPUT_PATH!: string;

  @IsString()
  ADMIN_CHAT_ID!: string;

  @IsString()
  CHAT_IDS!: string;

  @IsString()
  DEFAULT_DRIVE_PATH!: string;
}

export const validate = (config: Record<string, unknown>): EnvVars => {
  const validatedConfig = plainToInstance(EnvVars, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (!isEmpty(errors)) throw new Error(errors.toString());

  return validatedConfig;
};
