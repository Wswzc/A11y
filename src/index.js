#!/usr/bin/env node

/**
 * Enhanced Accessibility Testing Framework
 * Main entry point with improved architecture and error handling
 */

const ConfigManager = require('./config/config');
const TestEngine = require('./core/testEngine');
const logger = require('./utils/logger');
const { program } = require('commander');
const path = require('path');
const fs = require('fs');

// Initialize configuration
const config = ConfigManager;

// Setup CLI
program
  .name('a11y-test-suite')
  .description('Enhanced Accessibility Testing Framework')
  .version('2.0.0')
  .option('-c, --config <file>', 'configuration file path')
  .option('-p, --pages <file>', 'pages configuration file path')
  .option('-o, --output <dir>', 'output directory')
  .option('-f, --format <formats>', 'report formats (comma-separated)', 'html,json')
  .option('-v, --verbose', 'verbose logging')
  .option('--debug', 'debug mode')
  .option('--dry-run', 'validate configuration without running tests')
  .option('--sequential', 'run tests sequentially (default: concurrent)')
  .option('--continue-on-error', 'continue testing even if individual pages fail')
  .option('--no-reports', 'skip report generation')
  .option('--no-extra-checks', 'skip additional accessibility checks')
  .option('--timeout <ms>', 'timeout for operations', parseInt)
  .option('--concurrency <n>', 'maximum concurrent operations', parseInt, 3);

program.parse();
const options = program.opts();

// Configure logging
if (options.verbose || options.debug) {
  config.updateConfig({ debug: true });
}

// Load configuration files if specified
if (options.config) {
  loadConfigFile(options.config);
}

if (options.pages) {
  loadPagesFile(options.pages);
}

// Apply CLI options to config
applyCliOptions(options);

// Main execution function
async function main() {
  try {
    logger.info('🎯 Enhanced Accessibility Testing Framework v2.0.0');
    logger.info('=' .repeat(60));

    // Validate configuration
    if (!config.validate()) {
      logger.error('❌ Configuration validation failed');
      process.exit(1);
    }

    // Dry run mode
    if (options.dryRun) {
      logger.info('🔍 Dry run mode - validating configuration only');
      logger.info('✅ Configuration is valid');

      // Show configuration summary
      showConfigSummary();
      return;
    }

    // Create test engine
    const mergedConfig = {
      ...config.getConfig(),
      getPagesToScan: () => config.getPagesToScan()
    };

    const testEngine = new TestEngine(mergedConfig);

    // Show test plan
    showTestPlan(testEngine);

    // Run test suite
    const results = await testEngine.runTestSuite({
      concurrency: options.sequential ? 1 : (options.concurrency || 3),
      continueOnError: options.continueOnError,
      skipReports: options.noReports,
      skipExtraChecks: options.noExtraChecks
    });

    // Show results summary
    showResultsSummary(results);

    // Exit with appropriate code
    process.exit(results.success ? 0 : 1);

  } catch (error) {
    logger.error('💥 Fatal error:', error.message);
    if (options.debug) {
      logger.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

/**
 * Load configuration from file
 * @param {string} configPath
 */
function loadConfigFile(configPath) {
  try {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.updateConfig(configData);

    logger.info(`✅ Loaded configuration from: ${configPath}`);
  } catch (error) {
    logger.error(`Failed to load configuration file: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Load pages configuration from file
 * @param {string} pagesPath
 */
function loadPagesFile(pagesPath) {
  try {
    if (!fs.existsSync(pagesPath)) {
      throw new Error(`Pages file not found: ${pagesPath}`);
    }

    const pagesData = JSON.parse(fs.readFileSync(pagesPath, 'utf8'));
    const pages = pagesData.pages || pagesData;

    if (!Array.isArray(pages)) {
      throw new Error('Pages configuration must contain an array of pages');
    }

    // Override pages in config
    config.getConfig().getPagesToScan = () => pages;

    logger.info(`✅ Loaded pages configuration from: ${pagesPath}`);
  } catch (error) {
    logger.error(`Failed to load pages file: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Apply CLI options to configuration
 * @param {Object} options
 */
function applyCliOptions(options) {
  const updates = {};

  if (options.output) {
    updates.reportDir = path.resolve(options.output);
  }

  if (options.timeout) {
    updates.timeout = options.timeout;
  }

  if (options.concurrency) {
    updates.maxConcurrency = options.concurrency;
  }

  if (options.debug) {
    updates.debug = true;
  }

  if (Object.keys(updates).length > 0) {
    config.updateConfig(updates);
  }
}

/**
 * Show configuration summary
 */
function showConfigSummary() {
  const cfg = config.getConfig();

  console.log('\n📋 Configuration Summary:');
  console.log('-'.repeat(40));
  console.log(`📁 Executable: ${cfg.exePath}`);
  console.log(`📂 Reports: ${cfg.reportDir}`);
  console.log(`🔄 Process: ${cfg.processName}`);
  console.log(`⏱️  Timeout: ${cfg.timeout}ms`);
  console.log(`⚡ Concurrency: ${cfg.maxConcurrency}`);
  console.log(`🐛 Debug: ${cfg.debug ? 'enabled' : 'disabled'}`);

  const pages = config.getPagesToScan();
  console.log(`📄 Pages to scan: ${pages.length}`);
  pages.forEach(page => {
    console.log(`   • ${page.name}: ${page.selector}`);
  });
}

/**
 * Show test execution plan
 * @param {TestEngine} testEngine
 */
function showTestPlan(testEngine) {
  const cfg = config.getConfig();
  const pages = config.getPagesToScan();

  console.log('\n🚀 Test Execution Plan:');
  console.log('-'.repeat(40));
  console.log(`📄 Pages: ${pages.length}`);
  console.log(`🔍 Checks: axe-core + additional checks`);
  console.log(`📊 Reports: ${options.format}`);
  console.log(`⚡ Mode: ${options.sequential ? 'sequential' : 'concurrent'}`);

  if (options.noExtraChecks) {
    console.log('⚠️  Extra checks disabled');
  }

  if (options.noReports) {
    console.log('⚠️  Report generation disabled');
  }
}

/**
 * Show results summary
 * @param {Object} results
 */
function showResultsSummary(results) {
  console.log('\n📊 Test Results Summary:');
  console.log('='.repeat(50));

  const status = results.success ? '✅ PASSED' : '❌ FAILED';
  console.log(`Status: ${status}`);

  if (results.duration) {
    console.log(`Duration: ${Math.round(results.duration / 1000)}s`);
  }

  console.log(`Pages Scanned: ${results.axeResults?.length || 0}`);
  console.log(`Extra Checks: ${results.extraResults?.length || 0}`);
  console.log(`Screenshots: ${results.screenshots?.length || 0}`);
  console.log(`Errors: ${results.errors?.length || 0}`);
  console.log(`Warnings: ${results.warnings?.length || 0}`);

  // Violations summary
  const totalViolations = results.axeResults?.reduce((sum, page) =>
    sum + (page.violations?.length || 0), 0) || 0;
  console.log(`Total Violations: ${totalViolations}`);

  // Reports
  if (results.reports) {
    console.log('\n📄 Generated Reports:');
    Object.entries(results.reports).forEach(([format, report]) => {
      if (report.success && report.filePath) {
        console.log(`   ${format.toUpperCase()}: ${report.filePath}`);
      }
    });
  }

  if (results.errors?.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.slice(0, 5).forEach((error, i) => {
      console.log(`   ${i + 1}. [${error.phase}] ${error.message}`);
    });

    if (results.errors.length > 5) {
      console.log(`   ... and ${results.errors.length - 5} more`);
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.warn('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.warn('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run main function
main().catch(error => {
  logger.error('Unhandled error:', error);
  process.exit(1);
});
