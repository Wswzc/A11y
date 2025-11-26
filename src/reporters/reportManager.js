const HtmlReporter = require('./htmlReporter');
const JsonReporter = require('./jsonReporter');
const logger = require('../utils/logger');
const asyncUtils = require('../utils/asyncUtils');

/**
 * Manager for all report generators
 */
class ReportManager {
  constructor(config) {
    this.config = config;
    this.reporters = this.initializeReporters();
  }

  /**
   * Initialize all available reporters
   * @returns {Array<BaseReporter>}
   */
  initializeReporters() {
    return [
      new HtmlReporter(this.config),
      new JsonReporter(this.config)
    ].filter(reporter => reporter.isEnabled());
  }

  /**
   * Generate all enabled reports
   * @param {Object} data - Report data
   * @param {Object} options - Generation options
   * @returns {Promise<Object>}
   */
  async generateAllReports(data, options = {}) {
    const timer = logger.startTimer('All report generation');

    const {
      formats = ['html', 'json'],
      includeExtraChecks = true,
      generateSummary = false
    } = options;

    logger.info(`Generating ${formats.length} report formats`);

    const results = {
      timestamp: Date.now(),
      reports: {},
      summary: {
        totalReports: formats.length,
        successful: 0,
        failed: 0
      }
    };

    // Generate reports concurrently
    const reportPromises = formats.map(format =>
      this.generateReport(format, data, options)
    );

    const reportResults = await asyncUtils.concurrentLimit(reportPromises, 2);

    // Process results
    formats.forEach((format, index) => {
      const result = reportResults[index];
      results.reports[format] = result;

      if (result.success) {
        results.summary.successful++;
      } else {
        results.summary.failed++;
      }
    });

    // Generate summary if requested
    if (generateSummary && results.summary.successful > 0) {
      try {
        const jsonReporter = this.getReporter('json');
        if (jsonReporter && jsonReporter.generateSummaryReport) {
          results.summaryReport = await jsonReporter.generateSummaryReport(data);
        }
      } catch (error) {
        logger.warn('Failed to generate summary report:', error.message);
      }
    }

    results.duration = timer();
    results.success = results.summary.failed === 0;

    logger.info(`Report generation completed: ${results.summary.successful}/${results.summary.totalReports} successful`);

    return results;
  }

  /**
   * Generate specific report format
   * @param {string} format - Report format (html, json)
   * @param {Object} data - Report data
   * @param {Object} options - Generation options
   * @returns {Promise<Object>}
   */
  async generateReport(format, data, options = {}) {
    const reporter = this.getReporter(format);

    if (!reporter) {
      const error = `Unknown report format: ${format}`;
      logger.error(error);
      return {
        success: false,
        format,
        error,
        timestamp: Date.now()
      };
    }

    try {
      logger.debug(`Generating ${format} report`);
      const result = await reporter.generate(data, options);

      if (result.success) {
        logger.success(`${format.toUpperCase()} report generated successfully`);
      } else {
        logger.error(`${format.toUpperCase()} report generation failed:`, result.error);
      }

      return result;
    } catch (error) {
      logger.error(`Unexpected error generating ${format} report:`, error.message);
      return {
        success: false,
        format,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get reporter by format
   * @param {string} format
   * @returns {BaseReporter|null}
   */
  getReporter(format) {
    return this.reporters.find(reporter =>
      reporter.getFormat() === format ||
      reporter.constructor.name.toLowerCase().includes(format)
    ) || null;
  }

  /**
   * Get information about available reporters
   * @returns {Array<Object>}
   */
  getAvailableReporters() {
    return this.reporters.map(reporter => ({
      name: reporter.constructor.name,
      format: reporter.getFormat(),
      description: reporter.getDescription(),
      extensions: reporter.getExtensions(),
      enabled: reporter.isEnabled()
    }));
  }

  /**
   * Add custom reporter
   * @param {BaseReporter} reporter
   */
  addReporter(reporter) {
    if (reporter && typeof reporter.generate === 'function') {
      this.reporters.push(reporter);
      logger.info(`Added custom reporter: ${reporter.constructor.name}`);
    } else {
      logger.error('Invalid reporter provided');
    }
  }

  /**
   * Remove reporter by format
   * @param {string} format
   * @returns {boolean}
   */
  removeReporter(format) {
    const index = this.reporters.findIndex(reporter => reporter.getFormat() === format);
    if (index !== -1) {
      const removed = this.reporters.splice(index, 1)[0];
      logger.info(`Removed reporter: ${removed.constructor.name}`);
      return true;
    }
    return false;
  }

  /**
   * Validate report data
   * @param {Object} data
   * @returns {Object} Validation result
   */
  validateReportData(data) {
    const result = {
      valid: true,
      errors: [],
      warnings: []
    };

    if (!data) {
      result.valid = false;
      result.errors.push('Report data is null or undefined');
      return result;
    }

    if (typeof data !== 'object') {
      result.valid = false;
      result.errors.push('Report data must be an object');
      return result;
    }

    // Check for required fields - actually none are strictly required for basic validation
    if (!data.timestamp) {
      result.warnings.push('Missing timestamp in report data');
    }

    if (!data.axeResults && !data.extraResults) {
      result.warnings.push('No test results found in report data');
    }

    if (data.axeResults && !Array.isArray(data.axeResults)) {
      result.errors.push('axeResults must be an array');
      result.valid = false;
    }

    if (data.extraResults && !Array.isArray(data.extraResults)) {
      result.errors.push('extraResults must be an array');
      result.valid = false;
    }

    return result;
  }
}

module.exports = ReportManager;
