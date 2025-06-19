import { Injectable } from '@nestjs/common';
import { ConfigService, Path, PathValue } from '@nestjs/config';
import { EnvVars } from './env.validation';

@Injectable()
export class EnvService {
  constructor(private readonly configService: ConfigService<EnvVars>) {}

  get<P extends Path<EnvVars>, R = PathValue<EnvVars, P>>(propertyPath: P): R {
    return this.configService.get(propertyPath, { infer: true })!;
  }
}
