import * as FileSystem from 'expo-file-system/legacy';

export type TestLogCategory =
  | 'translation-race'
  | 'asteroid-shooter'
  | 'memory-match'
  | 'wager'
  | 'elo-matchmaking';

export interface LogEntry {
  ts: string;
  msg: string;
  data?: Record<string, unknown>;
}

export interface TestLogSession {
  category: TestLogCategory;
  sessionId: string;
  startedAt: string;
  entries: LogEntry[];
  stats?: object;
}

const FLUSH_INTERVAL_MS = 5000;
const FLUSH_THRESHOLD = 15;

export function createTestLogger(category: TestLogCategory) {
  const sessionId =
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const startedAt = new Date().toISOString();
  const entries: LogEntry[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  function getFilePath(): string {
    const dir = FileSystem.documentDirectory;
    if (!dir) return '';
    const timestamp = startedAt.replace(/[:.]/g, '-').slice(0, 19);
    return `${dir}test-logs/${category}/${timestamp}_${sessionId}.json`;
  }

  async function ensureDir(): Promise<string | null> {
    const dir = FileSystem.documentDirectory;
    if (!dir) return null;
    const baseDir = `${dir}test-logs/${category}`;
    try {
      await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
      return baseDir;
    } catch {
      return null;
    }
  }

  async function flush(stats?: object): Promise<void> {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    const dir = await ensureDir();
    if (!dir || entries.length === 0) return;

    const payload: TestLogSession = {
      category,
      sessionId,
      startedAt,
      entries: [...entries],
      stats: stats || undefined,
    };

    const filePath = getFilePath();
    if (!filePath) return;

    try {
      await FileSystem.writeAsStringAsync(
        filePath,
        JSON.stringify(payload, null, 2)
      );
    } catch (e) {
      console.warn('testLogger flush failed:', e);
    }
  }

  function log(msg: string, data?: Record<string, unknown>): void {
    entries.push({
      ts: new Date().toISOString(),
      msg,
      data,
    });

    if (entries.length >= FLUSH_THRESHOLD) {
      flush().catch(() => {});
    } else if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flush().catch(() => {});
      }, FLUSH_INTERVAL_MS);
    }
  }

  async function endSession(stats?: object): Promise<void> {
    await flush(stats);
  }

  return { log, endSession, flush, entries };
}

export function getTestLogPath(): string {
  const dir = FileSystem.documentDirectory;
  return dir ? `${dir}test-logs/` : '';
}
