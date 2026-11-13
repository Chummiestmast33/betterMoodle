import type { SyncEnv } from './sync/engine';

export interface Env extends SyncEnv {
  ASSETS?: Fetcher;
}
