import IORedis, { RedisOptions } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { URL } from 'url';

export function createBullMqConnection(configService: ConfigService): IORedis {
  const isLocal = process.env.NODE_ENV === 'development';

  if (isLocal) {
    const redisUrlString = configService.get<string>('REDIS_URL_PUBLIC');
    if (!redisUrlString) {
      throw new Error(
        'REDIS_URL_PUBLIC is not defined in environment variables.',
      );
    }

    const redisUrl = new URL(redisUrlString);

    const options: RedisOptions = {
      host: redisUrl.hostname,
      port: Number(redisUrl.port),
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
      tls:
        redisUrl.protocol === 'rediss:'
          ? { servername: redisUrl.hostname }
          : undefined,
      maxRetriesPerRequest: null,
    };

    Logger.log(
      `Using EXTERNAL Redis connection (Host: ${options.host}, Port: ${options.port}, TLS: ${!!options.tls})`,
    );

    return new IORedis(options);
  } else {
    const redisUrlString = configService.get<string>('REDIS_URL_PRIVATE');
    if (!redisUrlString) {
      throw new Error(
        'REDIS_URL_PRIVATE is not defined in environment variables.',
      );
    }

    const redisUrl = new URL(redisUrlString);

    const options: RedisOptions = {
      host: redisUrl.hostname,
      port: Number(redisUrl.port),
      family: 0, // IPv4/IPv6 Dual Stack Lookup
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
      maxRetriesPerRequest: null,
    };

    Logger.log(
      `Using INTERNAL Redis connection (Host: ${options.host}, Port: ${options.port})`,
    );

    return new IORedis(options);
  }
}
