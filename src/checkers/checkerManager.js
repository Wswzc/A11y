const ColorContrastChecker = require('./colorContrastChecker');
const KeyboardFocusChecker = require('./keyboardFocusChecker');
const ZoomChecker = require('./zoomChecker');
const AccessibilityTreeChecker = require('./accessibilityTreeChecker');
const logger = require('../utils/logger');
const asyncUtils = require('../utils/asyncUtils');

/**
 * Manager for all accessibility checkers
 */
class CheckerManager {
  constructor(config) {
    this.config = config;
    this.checkers = this.initializeCheckers();
  }

  /**
   * Initialize all available checkers
   * @returns {Array<BaseChecker>}
   */
  initializeCheckers() {
    return [
      new ColorContrastChecker(this.config),
      new KeyboardFocusChecker(this.config),
      new ZoomChecker(this.config),
      new AccessibilityTreeChecker(this.config)
    ].filter(checker => checker.isEnabled());
  }

  /**
   * Run all enabled checkers
   * @param {import('playwright').Page} page
   * @param {string} pageName
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async runAllChecks(page, pageName, options = {}) {
    const timer = logger.startTimer(`All checks for ${pageName}`);

    logger.info(`Running ${this.checkers.length} accessibility checks on ${pageName}`);

    const results = {
      pageName,
      timestamp: Date.now(),
      checks: {},
      summary: {
        totalChecks: this.checkers.length,
        passed: 0,
        failed: 0,
        errors: 0
      }
    };

    // Sort checkers by priority
    const sortedCheckers = this.checkers.sort((a, b) => a.getPriority() - b.getPriority());

    // Run checks concurrently if configured
    const concurrency = this.config.maxConcurrency || 3;

    if (concurrency > 1) {
      const checkTasks = sortedCheckers.map(checker => () =>
        this.runSingleCheck(checker, page, pageName, options)
      );

      const checkResults = await asyncUtils.concurrentLimit(checkTasks, concurrency);

      checkResults.forEach((result, index) => {
        const checker = sortedCheckers[index];
        this.processCheckResult(results, checker.name, result);
      });
    } else {
      // Run sequentially
      for (const checker of sortedCheckers) {
        const result = await this.runSingleCheck(checker, page, pageName, options);
        this.processCheckResult(results, checker.name, result);
      }
    }

    // Generate final summary
    results.summary.duration = timer();
    results.summary.successRate = results.summary.totalChecks > 0 ?
      Math.round((results.summary.passed / results.summary.totalChecks) * 100) : 0;

    logger.info(`Completed all checks for ${pageName}: ${results.summary.passed}/${results.summary.totalChecks} passed`);

    return results;
  }

  /**
   * Run a single checker
   * @param {BaseChecker} checker
   * @param {import('playwright').Page} page
   * @param {string} pageName
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async runSingleCheck(checker, page, pageName, options = {}) {
    try {
      return await checker.run(page, pageName, options);
    } catch (error) {
      logger.error(`Checker ${checker.name} failed:`, error.message);
      return {
        checker: checker.name,
        pageName,
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Process and store check result
   * @param {Object} results
   * @param {string} checkerName
   * @param {Object} result
   */
  processCheckResult(results, checkerName, result) {
    results.checks[checkerName] = result;

    if (result.success === false) {
      if (result.error) {
        results.summary.errors++;
      } else {
        results.summary.failed++;
      }
    } else {
      results.summary.passed++;
    }
  }

  /**
   * Run specific checkers only
   * @param {Array<string>} checkerNames
   * @param {import('playwright').Page} page
   * @param {string} pageName
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async runSpecificChecks(checkerNames, page, pageName, options = {}) {
    const targetCheckers = this.checkers.filter(checker =>
      checkerNames.includes(checker.name)
    );

    if (targetCheckers.length === 0) {
      logger.warn(`No matching checkers found for: ${checkerNames.join(', ')}`);
      return { error: 'No matching checkers found' };
    }

    logger.info(`Running ${targetCheckers.length} specific checks: ${checkerNames.join(', ')}`);

    const results = {
      pageName,
      timestamp: Date.now(),
      checks: {},
      summary: {
        totalChecks: targetCheckers.length,
        passed: 0,
        failed: 0,
        errors: 0
      }
    };

    for (const checker of targetCheckers) {
      const result = await this.runSingleCheck(checker, page, pageName, options);
      this.processCheckResult(results, checker.name, result);
    }

    results.summary.successRate = results.summary.totalChecks > 0 ?
      Math.round((results.summary.passed / results.summary.totalChecks) * 100) : 0;

    return results;
  }

  /**
   * Get information about available checkers
   * @returns {Array<Object>}
   */
  getAvailableCheckers() {
    return this.checkers.map(checker => ({
      name: checker.name,
      description: checker.getDescription(),
      priority: checker.getPriority(),
      enabled: checker.isEnabled()
    }));
  }

  /**
   * Enable or disable specific checkers
   * @param {Object} config - { checkerName: enabled }
   */
  configureCheckers(config) {
    Object.entries(config).forEach(([name, enabled]) => {
      const checker = this.checkers.find(c => c.name === name);
      if (checker) {
        // Note: This assumes checkers have a way to be disabled
        // In a real implementation, you might want to add an enabled property
        logger.debug(`${enabled ? 'Enabled' : 'Disabled'} checker: ${name}`);
      }
    });
  }

  /**
   * Get checker by name
   * @param {string} name
   * @returns {BaseChecker|null}
   */
  getChecker(name) {
    return this.checkers.find(checker => checker.name === name) || null;
  }

  /**
   * Add custom checker
   * @param {BaseChecker} checker
   */
  addChecker(checker) {
    if (checker && typeof checker.run === 'function') {
      this.checkers.push(checker);
      logger.info(`Added custom checker: ${checker.name}`);
    } else {
      logger.error('Invalid checker provided');
    }
  }

  /**
   * Remove checker by name
   * @param {string} name
   * @returns {boolean}
   */
  removeChecker(name) {
    const index = this.checkers.findIndex(checker => checker.name === name);
    if (index !== -1) {
      this.checkers.splice(index, 1);
      logger.info(`Removed checker: ${name}`);
      return true;
    }
    return false;
  }
}

module.exports = CheckerManager;
