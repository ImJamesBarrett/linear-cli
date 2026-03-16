export type OutputFormat = "human" | "json";

export interface GlobalCliOptions {
  allowPartialData: boolean;
  format: OutputFormat | null;
  headers: string[];
  profile: string | null;
  publicFileUrlsExpireIn: number | null;
  verbose: boolean;
}

export interface RuntimeContext {
  cwd: string;
  globalOptions: GlobalCliOptions;
  startedAt: Date;
}
