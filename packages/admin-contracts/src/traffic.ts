export const TRAFFIC_RANGES = { '1h': { seconds: 3600, bucket: 60 }, '24h': { seconds: 86400, bucket: 900 }, '7d': { seconds: 604800, bucket: 3600 }, '30d': { seconds: 2592000, bucket: 21600 } } as const;
export type TrafficRange = keyof typeof TRAFFIC_RANGES;
export type TrafficSource = 'game' | 'website';
export type TrafficPoint = {
  at: string; samples: number; players: number | null; guests: number | null;
  accounts: number | null; rooms: number | null; peak: number | null;
  joins: number | null; completed: number | null;
  views?: number | null; sessions?: number | null;
};
export type TrafficHistory = {
  range: TrafficRange; generatedAt: string; bucketSeconds: number;
  current: TrafficPoint[]; previous: TrafficPoint[]; latestSampleAt: string | null;
  retentionDays: number;
  source: TrafficSource;
};
export function trafficSummary(points: TrafficPoint[], bucketSeconds: number) {
  const samples = points.reduce((sum, p) => sum + p.samples, 0);
  return {
    average: samples ? points.reduce((sum, p) => sum + (p.players ?? 0) * p.samples, 0) / samples : null,
    peak: samples ? Math.max(...points.map(p => p.peak ?? 0)) : null,
    joins: points.some(p => p.joins !== null) ? points.reduce((sum, p) => sum + (p.joins ?? 0), 0) : null,
    coverage: points.length ? Math.min(100, samples / (points.length * bucketSeconds / 60) * 100) : 0,
  };
}
