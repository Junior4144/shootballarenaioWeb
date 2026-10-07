import posthog from './posthog';

type PlayerType = 'guest' | 'account';
type MatchOutcome = 'empty' | 'draw' | 'win' | 'loss';

// This module is the sole source of application log records exported to PostHog.
export const posthogLogs = {
  arenaMatchConnected(playerType: PlayerType): void {
    posthog.logger.info('arena match connected', {
      event: 'arena_match_connected',
      player_type: playerType,
    });
  },
  arenaMatchLeft(playerType: PlayerType): void {
    posthog.logger.info('arena match left', {
      event: 'arena_match_left',
      player_type: playerType,
    });
  },
  arenaMatchCompleted(playerType: PlayerType, outcome: MatchOutcome, durationSeconds: number): void {
    posthog.logger.info('arena match completed', {
      event: 'arena_match_completed',
      player_type: playerType,
      outcome,
      match_duration_seconds: durationSeconds,
    });
  },
};
