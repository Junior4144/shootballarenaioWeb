import { test, expect } from '@playwright/test';
import { emptySnapshot } from '@shootball/protocol';
import { createActor } from '@shootball/shared/content';

// Presentation fixtures exercise the real HUD renderer without waiting five
// minutes or adding debug controls to the production game/server.
for (const width of [1366, 390]) {
  for (const outcome of ['win', 'loss', 'draw', 'empty'] as const) {
    test(`pixel results ${outcome} at ${width}px`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.setViewportSize({ width, height: width === 390 ? 844 : 768 });
      await page.route('**/src/main.ts', route => route.fulfill({
        contentType: 'application/javascript', body: "import '/src/style.css';",
      }));
      await page.goto('/');
      const state = emptySnapshot();
      state.players = [Object.assign(createActor('local'), { health: 100 })];
      state.match.phase = 'results';
      state.match.remaining = 7;
      state.match.winnerIds = outcome === 'win' ? ['local'] : outcome === 'loss' ? ['rival'] : outcome === 'draw' ? ['local', 'rival'] : [];
      state.match.standings = outcome === 'empty' ? [] : Array.from({ length: 8 }, (_, i) => ({
        id: i === 0 ? (outcome === 'loss' ? 'rival' : 'local') : i === 1 ? (outcome === 'loss' ? 'local' : 'rival') : `guest-${i}`,
        points: 1000 - i * 100, kills: 8 - i, botKills: i, deaths: i,
      }));
      await page.evaluate(async snapshot => {
        const modulePath = '/src/game/ArenaHud.ts';
        const { ArenaHud } = await import(modulePath);
        new ArenaHud().render(snapshot, 'local');
      }, state);
      await expect(page.locator('#results')).toBeVisible();
      await expect(page.locator('#results')).toHaveAttribute('data-outcome', outcome);
      await expect(page.locator('#winner')).toHaveText(outcome === 'win' ? 'VICTORY!' : outcome === 'loss' ? 'GUEST riva wins!' : outcome === 'draw' ? 'Draw!' : 'No winner this round');
      await expect(page.locator('#rematch')).toHaveText('Next round in 7s');
      await expect(page.locator('#final-standings li')).toHaveCount(outcome === 'empty' ? 0 : 8);
      if (outcome !== 'empty') await expect(page.locator('#final-standings .local')).toContainText('YOU');
      const style = await page.locator('#results').evaluate(node => ({
        border: getComputedStyle(node).borderTopWidth,
        background: getComputedStyle(node).backgroundColor,
        radius: getComputedStyle(node).borderRadius,
        overflow: node.scrollWidth > node.clientWidth + 1,
      }));
      expect(style).toEqual({ border: '2px', background: 'rgb(17, 35, 46)', radius: '0px', overflow: false });
      await page.screenshot({ path: testInfo.outputPath('results.png'), fullPage: true });
      if (outcome !== 'empty') {
        await page.locator('#final-standings li').last().scrollIntoViewIfNeeded();
        await expect(page.locator('#final-standings li').last()).toBeInViewport();
      }
      expect(errors).toEqual([]);
    });
  }
}
