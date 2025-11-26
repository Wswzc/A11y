const AxeScanner = require('./axeScanner');
const AppManager = require('./appManager');
const CheckerManager = require('../checkers/checkerManager');
const ReportManager = require('../reporters/reportManager');
const logger = require('../utils/logger');
const asyncUtils = require('../utils/asyncUtils');
const fileUtils = require('../utils/fileUtils');

/**
 * Enhanced Accessibility Test Engine
 */
class TestEngine {
  constructor(config) {
    this.config = config;
    this.axeScanner = new AxeScanner(config);
    this.legacyScanner = new (require('./legacyScanner'))(config);
    this.appManager = new AppManager(config);
    this.checkerManager = new CheckerManager(config);
    this.reportManager = new ReportManager(config);

    this.testResults = {
      timestamp: null,
      axeResults: [],
      extraResults: [],
      screenshots: [],
      config: { ...config },
      errors: [],
      warnings: []
    };

    this.isRunning = false;
  }

  /**
   * Run complete accessibility test suite
   * @param {Object} options - Test options
   * @returns {Promise<Object>} Test results
   */
  async runTestSuite(options = {}) {
    const timer = logger.startTimer('Complete accessibility test suite');

    if (this.isRunning) {
      throw new Error('Test suite is already running');
    }

    this.isRunning = true;
    this.testResults.timestamp = Date.now();

    try {
      logger.info('🚀 Starting Accessibility Test Suite');
      logger.info(`📋 Configuration: ${JSON.stringify(this.config, null, 2)}`);

      // Phase 1: Setup and app launch
      await this.setupPhase(options);

      // Phase 2: Page navigation and scanning
      await this.scanningPhase(options);

      // Phase 3: Report generation
      await this.reportingPhase(options);

      // Phase 4: Cleanup
      await this.cleanupPhase(options);

      this.testResults.duration = timer();
      this.testResults.success = this.testResults.errors.length === 0;

      logger.success(`✅ Test suite completed successfully in ${this.testResults.duration}ms`);
      logger.info(`📊 Results: ${this.testResults.axeResults.length} pages scanned, ${this.testResults.errors.length} errors`);

      return { ...this.testResults };

    } catch (error) {
      this.testResults.duration = timer();
      this.testResults.success = false;
      this.testResults.errors.push({
        phase: 'unknown',
        message: error.message,
        stack: error.stack,
        timestamp: Date.now()
      });

      logger.error('❌ Test suite failed:', error.message);

      // Attempt emergency cleanup
      try {
        await this.appManager.closeApp();
      } catch (cleanupError) {
        logger.error('Emergency cleanup failed:', cleanupError.message);
      }

      return { ...this.testResults };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Setup phase: Clean up, launch app, validate configuration
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async setupPhase(options = {}) {
    const timer = logger.startTimer('Setup phase');

    try {
      logger.info('🔧 Setup Phase: Preparing test environment');

      // Validate configuration
      if (!this.validateConfiguration()) {
        throw new Error('Configuration validation failed');
      }

      // Clean up old processes
      await this.appManager.cleanupProcesses();

      // Ensure output directories exist
      fileUtils.ensureDir(this.config.reportDir);
      fileUtils.ensureDir(this.config.screenshotsDir);

      // Clean old files if configured
      if (options.cleanOldFiles !== false) {
        fileUtils.cleanOldFiles(this.config.reportDir, 30 * 24 * 60 * 60 * 1000); // 30 days
        fileUtils.cleanOldFiles(this.config.screenshotsDir, 7 * 24 * 60 * 60 * 1000); // 7 days
      }

      // Launch application
      await this.appManager.launchApp();

      timer();
      logger.success('Setup phase completed successfully');
    } catch (error) {
      timer();
      this.logError('setup', error);
      throw error;
    }
  }

  /**
   * Scanning phase: Navigate pages and run all checks
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async scanningPhase(options = {}) {
    const timer = logger.startTimer('Scanning phase');

    try {
      logger.info('🔍 Scanning Phase: Testing accessibility across pages');

      const pages = this.config.getPagesToScan();
      const {
        concurrency = this.config.maxConcurrency || 1,
        continueOnError = true
      } = options;

      if (pages.length === 0) {
        throw new Error('No pages configured for scanning');
      }

      logger.info(`📄 Will scan ${pages.length} page(s) with concurrency ${concurrency}`);

      // Get main window
      const mainWindow = await this.appManager.getMainWindow();

      if (concurrency === 1) {
        // Sequential processing
        for (const page of pages) {
          try {
            await this.processPage(mainWindow, page, options);
          } catch (error) {
            this.logError('page_scan', error, { page: page.name });
            if (!continueOnError) throw error;
          }
        }
      } else {
        // Concurrent processing
        const pageTasks = pages.map(page =>
          () => this.processPage(mainWindow, page, options).catch(error => {
            this.logError('page_scan', error, { page: page.name });
            return null; // Return null on error to continue
          })
        );

        await asyncUtils.concurrentLimit(pageTasks, concurrency);
      }

      timer();
      logger.success(`Scanning phase completed: ${this.testResults.axeResults.length} pages processed`);
    } catch (error) {
      timer();
      this.logError('scanning', error);
      throw error;
    }
  }

  /**
   * Process a single page: navigate, scan, run checks
   * @param {import('playwright').Page} window
   * @param {Object} pageConfig
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async processPage(window, pageConfig, options = {}) {
    const pageTimer = logger.startTimer(`Processing page: ${pageConfig.name}`);

    try {
      logger.info(`📄 Processing page: ${pageConfig.name} (${pageConfig.selector})`);

      // Navigate to page
      await this.navigateToPage(window, pageConfig);

      // Run axe scan
      const axeResult = await this.runAxeScan(window, pageConfig);
      this.testResults.axeResults.push(axeResult);

      // Run additional checks
      const extraResult = await this.runExtraChecks(window, pageConfig, options);
      this.testResults.extraResults.push(extraResult);

      // Collect screenshots
      if (extraResult.keyboardFocus?.problems?.length > 0) {
        const screenshots = extraResult.keyboardFocus.screenshots || [];
        this.testResults.screenshots.push(...screenshots);
      }

      pageTimer();
      logger.success(`✅ Page ${pageConfig.name} processed successfully`);
    } catch (error) {
      pageTimer();
      this.logError('page_processing', error, { page: pageConfig.name, selector: pageConfig.selector });
      throw error;
    }
  }

  /**
   * Navigate to a specific page
   * @param {import('playwright').Page} window
   * @param {Object} pageConfig
   * @returns {Promise<void>}
   */
  async navigateToPage(window, pageConfig) {
    const { selector, options = {} } = pageConfig;
    const { timeout = this.config.timeout, waitForNavigation = true } = options;

    try {
      logger.debug(`Navigating to page: ${pageConfig.name}`);

      // Click navigation element
      await asyncUtils.safeClick(window.locator(selector), {
        timeout,
        retries: this.config.retryAttempts
      });

      // Wait for navigation if enabled
      if (waitForNavigation) {
        await asyncUtils.waitForPageReady(window, {
          domContentLoaded: true,
          minWait: this.config.waitTimeout
        });
      }

      // Additional wait for dynamic content
      await asyncUtils.delay(500);

      logger.debug(`Successfully navigated to: ${pageConfig.name}`);
    } catch (error) {
      // Try to take emergency screenshot
      const screenshot = await this.appManager.emergencyScreenshot(`nav-error-${pageConfig.name}`);
      if (screenshot) {
        this.testResults.warnings.push({
          type: 'navigation_screenshot',
          page: pageConfig.name,
          file: screenshot,
          message: 'Emergency screenshot taken during navigation failure'
        });
      }
      throw error;
    }
  }

  /**
   * Run axe scan on current page
   * @param {import('playwright').Page} window
   * @param {Object} pageConfig
   * @returns {Promise<Object>}
   */
  async runAxeScan(window, pageConfig) {
    try {
      const modernResult = await this.axeScanner.scanPage(window, pageConfig.name);
      if (!modernResult || modernResult.error) {
        throw new Error(modernResult?.error || 'Modern axe scan returned no data');
      }
      return modernResult;
    } catch (error) {
      logger.warn(`Modern axe scan failed for ${pageConfig.name}: ${error.message}. Falling back to legacy logic.`);
      try {
        const legacyResult = await this.legacyScanner.scanPage(window, pageConfig.name);
        legacyResult.usedLegacyFallback = true;
        return legacyResult;
      } catch (legacyError) {
        logger.error(`Legacy axe scan also failed for ${pageConfig.name}:`, legacyError.message);
        return {
          violations: [],
          passes: [],
          incomplete: [],
          inapplicable: [],
          url: pageConfig.name,
          timestamp: Date.now(),
          pageName: pageConfig.name,
          error: legacyError.message,
          failedFallback: true
        };
      }
    }
  }

  /**
   * Run additional accessibility checks
   * @param {import('playwright').Page} window
   * @param {Object} pageConfig
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async runExtraChecks(window, pageConfig, options = {}) {
    return this.checkerManager.runAllChecks(window, pageConfig.name, options);
  }

  /**
   * Reporting phase: Generate all reports
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async reportingPhase(options = {}) {
    const timer = logger.startTimer('Reporting phase');

    try {
      logger.info('📊 Reporting Phase: Generating accessibility reports');

      const reportOptions = {
        includeExtraChecks: true,
        generateSummary: true,
        ...options.reportOptions
      };

      const reportResults = await this.reportManager.generateAllReports(
        this.testResults,
        reportOptions
      );

      if (reportResults.success) {
        logger.success('All reports generated successfully');

        // Store report paths in results
        this.testResults.reports = reportResults.reports;
        this.testResults.summaryReport = reportResults.summaryReport;
      } else {
        const failedCount = reportResults.summary?.failed || 0;
        logger.warn(`${failedCount} report(s) failed to generate`);
        this.testResults.warnings.push({
          type: 'report_generation',
          message: `${failedCount} report(s) failed to generate`
        });
      }

      timer();
    } catch (error) {
      timer();
      this.logError('reporting', error);
      // Don't throw - reporting failures shouldn't stop the test suite
    }
  }

  /**
   * Cleanup phase: Close app, cleanup resources
   * @param {Object} options
   * @returns {Promise<void>}
   */
  async cleanupPhase(options = {}) {
    const timer = logger.startTimer('Cleanup phase');

    try {
      logger.info('🧹 Cleanup Phase: Closing application and cleaning up');

      await this.appManager.closeApp();

      // Additional cleanup
      if (options.cleanupTempFiles !== false) {
        // Could add more cleanup logic here
      }

      timer();
      logger.success('Cleanup completed successfully');
    } catch (error) {
      timer();
      this.logError('cleanup', error);
      // Don't throw during cleanup
    }
  }

  /**
   * Validate configuration
   * @returns {boolean}
   */
  validateConfiguration() {
    const validation = this.reportManager.validateReportData({}); // Basic validation

    if (!validation.valid) {
      validation.errors.forEach(error => {
        logger.error('Configuration validation error:', error);
      });
      return false;
    }

    // Check required config properties
    const required = ['exePath', 'reportDir', 'processName'];
    for (const prop of required) {
      if (!this.config[prop]) {
        logger.error(`Missing required configuration: ${prop}`);
        return false;
      }
    }

    // Validate pages configuration
    const pages = this.config.getPagesToScan();
    if (!Array.isArray(pages) || pages.length === 0) {
      logger.error('No pages configured for scanning');
      return false;
    }

    return true;
  }

  /**
   * Log error with context
   * @param {string} phase
   * @param {Error} error
   * @param {Object} context
   */
  logError(phase, error, context = {}) {
    const errorInfo = {
      phase,
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      ...context
    };

    this.testResults.errors.push(errorInfo);

    logger.error(`[${phase.toUpperCase()}] ${error.message}`, context);
    if (this.config.debug) {
      logger.error('Stack trace:', error.stack);
    }
  }

  /**
   * Get test status
   * @returns {Object}
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      timestamp: this.testResults.timestamp,
      pagesProcessed: this.testResults.axeResults.length,
      errors: this.testResults.errors.length,
      warnings: this.testResults.warnings.length,
      config: this.config
    };
  }

  /**
   * Stop running test suite (graceful shutdown)
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.isRunning) return;

    logger.warn('Stopping test suite...');
    await this.cleanupPhase();
    this.isRunning = false;
  }
}

module.exports = TestEngine;
