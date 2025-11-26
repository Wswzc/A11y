const axeCore = require('axe-core');
const logger = require('../utils/logger');
const asyncUtils = require('../utils/asyncUtils');

/**
 * Enhanced Axe Scanner with improved stability and features
 */
class AxeScanner {
  constructor(config) {
    this.config = config;
    this.axeInjected = false;
  }

  /**
   * Ensure axe-core is injected into the page
   * @param {import('playwright').Page} page
   * @returns {Promise<boolean>}
   */
  async ensureAxeInjected(page) {
    if (this.axeInjected) {
      const isStillInjected = await page.evaluate(() => !!window.axe);
      if (isStillInjected) return true;
    }

    try {
      logger.debug('Injecting axe-core script...');

      await page.evaluate((source) => {
        const script = document.createElement('script');
        script.textContent = source;
        script.setAttribute('data-a11y-test', 'axe-core');
        document.head.appendChild(script);
      }, axeCore.source);

      // Verify injection
      await asyncUtils.poll(
        () => page.evaluate(() => !!window.axe),
        { timeout: 5000, timeoutMessage: 'Axe injection timeout' }
      );

      this.axeInjected = true;
      logger.debug('Axe-core injected successfully');
      return true;
    } catch (error) {
      logger.error('Failed to inject axe-core:', error.message);
      return false;
    }
  }

  /**
   * Run axe scan on page
   * @param {import('playwright').Page} page
   * @param {string} pageName
   * @param {Object} options
   * @returns {Promise<import('../types').AxeResults>}
   */
  async scanPage(page, pageName, options = {}) {
    const timer = logger.startTimer(`Axe scan for ${pageName}`);

    try {
      // Ensure axe is injected
      const injected = await this.ensureAxeInjected(page);
      if (!injected) {
        throw new Error('Failed to inject axe-core');
      }

      // Wait for page to be ready
      await asyncUtils.waitForPageReady(page, {
        domContentLoaded: true,
        minWait: this.config.waitTimeout
      });

      // Prepare axe options
      const axeOptions = {
        ...this.config.axeOptions,
        ...options
      };

      logger.info(`Starting axe scan for page: ${pageName}`);

      // Run axe scan with timeout
      const results = await asyncUtils.withTimeout(
        page.evaluate(async (options) => {
          return await window.axe.run(document, options);
        }, axeOptions),
        this.config.timeout,
        `Axe scan timeout for ${pageName}`
      );

      // Add metadata
      results.url = pageName;
      results.timestamp = Date.now();
      results.pageName = pageName;

      logger.info(`Axe scan completed for ${pageName}: ${results.violations.length} violations`);

      timer();
      return results;
    } catch (error) {
      logger.error(`Axe scan failed for ${pageName}:`, error.message);
      timer();

      // Return partial results on failure
      return {
        violations: [],
        passes: [],
        incomplete: [],
        inapplicable: [],
        url: pageName,
        timestamp: Date.now(),
        pageName,
        error: error.message
      };
    }
  }

  /**
   * Run targeted axe scan (e.g., only color contrast)
   * @param {import('playwright').Page} page
   * @param {string} pageName
   * @param {Object} runOnly - Axe runOnly configuration
   * @returns {Promise<import('../types').AxeResults>}
   */
  async scanTargeted(page, pageName, runOnly) {
    return this.scanPage(page, pageName, { runOnly });
  }

  /**
   * Get axe version information
   * @param {import('playwright').Page} page
   * @returns {Promise<Object>}
   */
  async getAxeInfo(page) {
    try {
      if (!await this.ensureAxeInjected(page)) {
        return null;
      }

      return await page.evaluate(() => ({
        version: window.axe.version,
        rules: Object.keys(window.axe.getRules()),
        supportedRules: window.axe.getRules().length
      }));
    } catch (error) {
      logger.error('Failed to get axe info:', error.message);
      return null;
    }
  }

  /**
   * Validate axe configuration
   * @param {Object} config
   * @returns {boolean}
   */
  validateConfig(config) {
    // Basic validation - could be enhanced
    return typeof config === 'object' && config !== null;
  }

  /**
   * Reset injection state (useful for new pages/windows)
   */
  reset() {
    this.axeInjected = false;
  }
}

module.exports = AxeScanner;
