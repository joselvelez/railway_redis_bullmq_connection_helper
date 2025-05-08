# BullMQ Redis Connection Factory for Railway

This document explains the functionality of the `createBullMqConnection` factory. This factory is responsible for creating and configuring the Redis connection used by BullMQ in your NestJS application, with specific considerations for different environments, particularly when deploying to services like Railway.

## Overview

The `createBullMqConnection` factory dynamically configures the IORedis connection options based on the `NODE_ENV` environment variable. It differentiates between local development (`development`) and other environments (e.g., staging, production).

-   **Local Development (`NODE_ENV === 'development'`)**: It uses the `REDIS_URL_PUBLIC` environment variable. This is typically a Redis instance accessible from your local machine, potentially an external service or a local Docker container. It supports `redis:` and `rediss:` protocols, enabling TLS connections if specified.
-   **Production/Other Environments**: It uses the `REDIS_URL_PRIVATE` environment variable. This is often an internal Redis service URL provided by platforms like Railway, which might be on a private network. It defaults to IPv4/IPv6 dual-stack lookup for the Redis host.

In both cases, the factory parses the Redis URL (hostname, port, username, password) and sets `maxRetriesPerRequest: null` for IORedis, which means BullMQ will keep retrying failed commands indefinitely until they succeed.

## Functionality Details

### `createBullMqConnection(configService: ConfigService): IORedis`

-   **Parameter**:
    -   `configService: ConfigService`: An instance of NestJS `ConfigService` used to retrieve environment variables.
-   **Returns**:
    -   `IORedis`: An instance of `IORedis` configured with the appropriate connection options.
-   **Throws**:
    -   `Error`: If the required environment variable (`REDIS_URL_PUBLIC` or `REDIS_URL_PRIVATE`) is not defined.

### Environment-Specific Logic:

1.  **Determine Environment**:
    ```typescript
    const isLocal = process.env.NODE_ENV === 'development';
    ```

2.  **Local Development (`isLocal === true`)**:
    -   Retrieves `REDIS_URL_PUBLIC` from `configService`.
    -   Parses the URL using `new URL()`.
    -   Constructs `RedisOptions`:
        -   `host`: Parsed hostname.
        -   `port`: Parsed port number.
        -   `username`: Parsed username (if any).
        -   `password`: Parsed password (if any).
        -   `tls`: Configured if the protocol is `rediss:`, with `servername` set to the hostname.
        -   `maxRetriesPerRequest: null`.
    -   Logs the connection details (Host, Port, TLS status).

3.  **Production/Other Environments (`isLocal === false`)**:
    -   Retrieves `REDIS_URL_PRIVATE` from `configService`.
    -   Parses the URL using `new URL()`.
    -   Constructs `RedisOptions`:
        -   `host`: Parsed hostname.
        -   `port`: Parsed port number.
        -   `family: 0`: Enables IPv4/IPv6 dual-stack lookup for the hostname. This can be important for compatibility with various network configurations, including those on platforms like Railway.
        -   `username`: Parsed username (if any).
        -   `password`: Parsed password (if any).
        -   `maxRetriesPerRequest: null`.
    -   Logs the connection details (Host, Port).

## Environment Variables

The factory relies on the following environment variables, which should be set in your `.env` file or your deployment environment:

-   `NODE_ENV`: Specifies the current environment (e.g., `development`, `production`).
-   `REDIS_URL_PUBLIC`: The full Redis connection string for local development.
    -   Example: `redis://username:password@localhost:6379` or `rediss://:password@your-redis-provider.com:port`
-   `REDIS_URL_PRIVATE`: The full Redis connection string for production/other environments (e.g., Railway's internal Redis service URL).
    -   Example: `redis://:password@private-redis-hostname.railway.internal:port`

## Sample Implementation

### 1. Using the Factory in a NestJS Module (e.g., `app.module.ts`)

This is the primary way the `createBullMqConnection` factory is intended to be used. It's passed to the `BullModule.forRootAsync` configuration.

```typescript
// src/app.module.ts
import { Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
// ... other imports
import { createBullMqConnection } from './common/factories/bullmq-connection-options.factory'; // Adjust path as needed

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // ... other modules

    BullModule.forRootAsync({
      imports: [ConfigModule], // Ensure ConfigModule is imported if not global or available in this context
      useFactory: (configService: ConfigService) => {
        // The factory is used here to provide the connection options
        return {
          connection: createBullMqConnection(configService),
          // You can add other BullModule default options here if needed
          // defaultJobOptions: {
          //   attempts: 3,
          //   backoff: {
          //     type: 'exponential',
          //     delay: 1000,
          //   },
          // },
        };
      },
      inject: [ConfigService], // Inject ConfigService for the factory
    }),

    // ... BullBoardModule, other application modules
  ],
  // ... controllers, providers
})
export class AppModule {
  // ... (Optional: constructor logging as in your example)
  private readonly logger = new Logger(AppModule.name);
  constructor(private configService: ConfigService) {
    this.logger.log('AppModule initialized.');
    this.logger.log(
      `DIAGNOSTIC - NODE_ENV: ${this.configService.get<string>('NODE_ENV')}`,
    );
    // Note: Calling createBullMqConnection here directly in the constructor,
    // as seen in your original AppModule, is generally for diagnostic purposes
    // or if you need an immediate connection instance for some setup logic
    // outside of BullModule. For BullModule itself, the useFactory above is the standard way.
    // If called here, it creates a separate connection instance that isn't necessarily
    // used by BullModule unless explicitly passed, which is not the case with forRootAsync.
    // For BullModule, the connection is managed internally via useFactory.
    // createBullMqConnection(this.configService); // This call in your AppModule constructor can be for diagnostics.
  }
}
```

### 2. Role in `main.ts`

The `createBullMqConnection` factory is **not directly called or instantiated within `main.ts`** for the purpose of configuring BullMQ. Instead, `main.ts` is responsible for:

1.  **Bootstrapping the Application**: It creates the NestJS application instance using `NestFactory.create()`, which initializes the `AppModule`.
2.  **Environment Loading**: NestJS, through `ConfigModule.forRoot()`, loads environment variables (from `.env` files or system variables) which become accessible via the `ConfigService`.

When `AppModule` is initialized, its `BullModule.forRootAsync` configuration is processed. The `useFactory` function within it is then called by NestJS's dependency injection system, which provides the `ConfigService` instance. This `ConfigService` instance, now populated with environment variables, is used by `createBullMqConnection` to get the Redis URLs.

Here's a conceptual representation of the flow:

```
main.ts (Bootstrap)
    |
    ---> NestFactory.create(AppModule)
            |
            ---> AppModule (Initializes)
                    |
                    ---> ConfigModule.forRoot() (Loads .env variables)
                    |
                    ---> BullModule.forRootAsync()
                            |
                            ---> useFactory(configService)
                                    |
                                    ---> createBullMqConnection(configService)
                                            |
                                            ---> Reads REDIS_URL_PUBLIC / REDIS_URL_PRIVATE
                                            |
                                            ---> Returns IORedis connection for BullMQ
```

So, while `main.ts` doesn't directly use the factory, it sets up the environment and initiates the module loading process that leads to the factory's execution.

The instance of `createBullMqConnection` called in the `AppModule` constructor in your provided code:
```typescript
// In AppModule constructor
createBullMqConnection(this.configService);
```
This call is separate from the `BullModule`'s connection. It creates an IORedis instance and logs connection details, which is useful for diagnostics during application startup to confirm that Redis is accessible with the current configuration. However, this specific instance isn't automatically used by `BullModule` when `forRootAsync` is employed; `BullModule` gets its connection from its own `useFactory`.

## Conclusion

The `createBullMqConnection` factory provides a clean and environment-aware way to configure BullMQ's Redis connection. By centralizing this logic, it simplifies module setup and adapts to different deployment scenarios, especially when working with services like Railway that provide distinct public and private network access to resources like Redis. 
