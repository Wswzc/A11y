const axeCore = require('axe-core');
const asyncUtils = require('../utils/asyncUtils');
const logger = require('../utils/logger');

/**
 * Legacy axe scanner that mirrors the original test_exe.js behavior.
 * Used as a fallback when the modern scanner fails.
 */
class LegacyScanner {
  constructor(config) {
    this.config = config;
  }

  /**
   * Run legacy axe scan exactly like the original script.
   * @param {import('playwright').Page} page
   * @param {string} pageName
   * @returns {Promise<import('../types').AxeResults>}
   */
  async scanPage(page, pageName) {
    logger.debug(`(Legacy) scanning page ${pageName}`);
    try {
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3000);

      await this.injectAxe(page);

      const results = await page.evaluate(async () => {
        return await window.axe.run(document, {});
      });

      results.url = pageName;
      results.timestamp = Date.now();
      results.pageName = pageName;
      return results;
    } catch (error) {
      logger.error(`Legacy scanner failed on ${pageName}:`, error.message);
      throw error;
    }
  }

  async injectAxe(page) {
    const injected = await page.evaluate(() => window.axe !== undefined);
    if (injected) return;

    await page.evaluate((source) => {
      const script = document.createElement('script');
      script.textContent = source;
      document.head.appendChild(script);
    }, axeCore.source);

    await asyncUtils.delay(100);
  }
}

module.exports = LegacyScanner;

