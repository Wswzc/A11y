const logger = require('../utils/logger');
const fileUtils = require('../utils/fileUtils');

/**
 * Base class for all report generators
 */
class BaseReporter {
  constructor(config) {
    this.config = config;
    this.name = this.constructor.name;
  }

  /**
   * Generate report
   * @param {Object} data - Report data
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Report result
   */
  async generate(data, options = {}) {
    const timer = logger.startTimer(`${this.name} report generation`);

    try {
      logger.debug(`Generating ${this.name} report`);

      const result = await this.generateReport(data, options);

      // Add metadata
      result.generatedBy = this.name;
      result.generatedAt = new Date().toISOString();
      result.format = this.getFormat();

      timer();
      return result;
    } catch (error) {
      logger.error(`${this.name} report generation failed:`, error.message);
      timer();

      return {
        success: false,
        error: error.message,
        generatedBy: this.name,
        generatedAt: new Date().toISOString(),
        format: this.getFormat()
      };
    }
  }

  /**
   * Generate the actual report (to be implemented by subclasses)
   * @param {Object} data
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async generateReport(data, options = {}) {
    throw new Error(`${this.name}: generateReport must be implemented by subclass`);
  }

  /**
   * Get report format
   * @returns {string}
   */
  getFormat() {
    return 'unknown';
  }

  /**
   * Get supported file extensions
   * @returns {Array<string>}
   */
  getExtensions() {
    return [];
  }

  /**
   * Validate report data
   * @param {Object} data
   * @returns {boolean}
   */
  validateData(data) {
    return data && typeof data === 'object';
  }

  /**
   * Get reporter description
   * @returns {string}
   */
  getDescription() {
    return `${this.name} reporter`;
  }

  /**
   * Check if reporter is enabled
   * @returns {boolean}
   */
  isEnabled() {
    return true;
  }

  /**
   * Save report to file
   * @param {string} content
   * @param {string} filename
   * @param {string} directory
   * @returns {Promise<string>} File path
   */
  async saveToFile(content, filename, directory = this.config.reportDir) {
    const filePath = fileUtils.generateUniqueFilename(filename, this.getExtensions()[0]);
    const fullPath = `${directory}/${filePath}`;

    const success = fileUtils.safeWriteFile(fullPath, content);

    if (success) {
      logger.info(`Report saved: ${fullPath} (${fileUtils.getFileSize(fullPath)})`);
      return fullPath;
    } else {
      throw new Error(`Failed to save report to ${fullPath}`);
    }
  }
}

module.exports = BaseReporter;
