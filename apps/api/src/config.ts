export interface ApiConfig {
  port: number;
  host: string;
  webOrigin: string;
  redisUrl: string;
  queueDriver: "memory" | "redis";
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: Number(environment.API_PORT ?? 4000),
    host: environment.API_HOST ?? "0.0.0.0",
    webOrigin: environment.WEB_ORIGIN ?? "http://localhost:3000",
    redisUrl: environment.REDIS_URL ?? "redis://localhost:6379",
    queueDriver: environment.QUEUE_DRIVER === "redis" ? "redis" : "memory",
  };
}
