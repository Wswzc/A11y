const logger = require('../utils/logger');
const asyncUtils = require('../utils/asyncUtils');

/**
 * Base class for all accessibility checkers
 */
class BaseChecker {
  constructor(config) {
    this.config = config;
    this.name = this.constructor.name;
  }

  /**
   * Run the checker
   * @param {import('playwright').Page} page
   * @param {string} pageName
   * @param {Object} options
   * @returns {Promise<Object>} Check results
   */
  async run(page, pageName, options = {}) {
    const timer = logger.startTimer(`${this.name} check for ${pageName}`);

    try {
      logger.debug(`Running ${this.name} check on ${pageName}`);

      const result = await this.executeCheck(page, pageName, options);

      // Add metadata
      result.checker = this.name;
      result.pageName = pageName;
      result.timestamp = Date.now();
      result.success = !result.error;

      logger.debug(`${this.name} check completed for ${pageName}`);
      timer();

      return result;
    } catch (error) {
      logger.error(`${this.name} check failed for ${pageName}:`, error.message);

      const errorResult = {
        checker: this.name,
        pageName,
        timestamp: Date.now(),
        success: false,
        error: error.message,
        details: []
      };

      timer();
      return errorResult;
    }
  }

  /**
   * Execute the actual check (to be implemented by subclasses)
   * @param {import('playwright').Page} page
   * @param {string} pageName
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async executeCheck(page, pageName, options = {}) {
    throw new Error(`${this.name}: executeCheck must be implemented by subclass`);
  }

  /**
   * Validate check options
   * @param {Object} options
   * @returns {boolean}
   */
  validateOptions(options) {
    return true; // Default implementation
  }

  /**
   * Get checker description
   * @returns {string}
   */
  getDescription() {
    return `${this.name} accessibility checker`;
  }

  /**
   * Check if this checker is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return true; // Default to enabled
  }

  /**
   * Get checker priority (lower number = higher priority)
   * @returns {number}
   */
  getPriority() {
    return 5; // Default priority
  }
}

module.exports = BaseChecker;
