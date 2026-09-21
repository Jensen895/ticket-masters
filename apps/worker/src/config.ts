export interface WorkerConfig {
  redisUrl: string;
  refreshDeadlineMs: number;
  concurrency: number;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return {
    redisUrl: environment.REDIS_URL ?? "redis://localhost:6379",
    refreshDeadlineMs: Number(environment.REFRESH_DEADLINE_MS ?? 8000),
    concurrency: Number(environment.WORKER_CONCURRENCY ?? 20),
  };
}
