#!/usr/bin/env node

/**
 * Test script for the new modular accessibility testing architecture
 * This script validates that all components work together correctly
 */

const ConfigManager = require('./src/config/config');
const TestEngine = require('./src/core/testEngine');
const AxeScanner = require('./src/core/axeScanner');
const CheckerManager = require('./src/checkers/checkerManager');
const ReportManager = require('./src/reporters/reportManager');
const logger = require('./src/utils/logger');
const asyncUtils = require('./src/utils/asyncUtils');
const fileUtils = require('./src/utils/fileUtils');
const path = require('path');

class ArchitectureTester {
  constructor() {
    this.results = {
      tests: [],
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  /**
   * Run all architecture tests
   */
  async runAllTests() {
    console.log('🧪 Testing Enhanced Accessibility Testing Framework Architecture\n');

    try {
      // Test 1: Configuration Management
      await this.testConfiguration();

      // Test 2: Core Components
      await this.testCoreComponents();

      // Test 3: Checkers
      await this.testCheckers();

      // Test 4: Reporters
      await this.testReporters();

      // Test 5: Utilities
      await this.testUtilities();

      // Test 6: Integration Test
      await this.testIntegration();

      this.showSummary();

    } catch (error) {
      console.error('💥 Test suite failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Test configuration management
   */
  async testConfiguration() {
    console.log('📋 Testing Configuration Management...');

    try {
      // Test config loading
      const config = ConfigManager;
      this.assert(config.validate(), 'Configuration validation failed');

      // Test pages loading
      const pages = config.getPagesToScan();
      this.assert(Array.isArray(pages), 'Pages should be an array');
      this.assert(pages.length > 0, 'Should have at least one page configured');

      // Test config updates
      const originalTimeout = config.getConfig().timeout;
      config.updateConfig({ timeout: 99999 });
      this.assert(config.getConfig().timeout === 99999, 'Config update failed');
      config.updateConfig({ timeout: originalTimeout }); // Restore

      this.pass('Configuration Management');
    } catch (error) {
      this.fail('Configuration Management', error);
    }
  }

  /**
   * Test core components
   */
  async testCoreComponents() {
    console.log('⚙️  Testing Core Components...');

    try {
      const config = ConfigManager.getConfig();

      // Test AxeScanner
      const scanner = new AxeScanner(config);
      this.assert(typeof scanner.ensureAxeInjected === 'function', 'AxeScanner missing ensureAxeInjected method');

      // Test CheckerManager
      const checkerManager = new CheckerManager(config);
      const checkers = checkerManager.getAvailableCheckers();
      this.assert(Array.isArray(checkers), 'Should return array of checkers');
      this.assert(checkers.length > 0, 'Should have at least one checker');

      // Test ReportManager
      const reportManager = new ReportManager(config);
      const reporters = reportManager.getAvailableReporters();
      this.assert(Array.isArray(reporters), 'Should return array of reporters');
      this.assert(reporters.length > 0, 'Should have at least one reporter');

      this.pass('Core Components');
    } catch (error) {
      this.fail('Core Components', error);
    }
  }

  /**
   * Test checkers functionality
   */
  async testCheckers() {
    console.log('🔍 Testing Checkers...');

    try {
      const config = ConfigManager.getConfig();
      const checkerManager = new CheckerManager(config);

      // Test checker info
      const checkers = checkerManager.getAvailableCheckers();
      checkers.forEach(checker => {
        this.assert(checker.name, `Checker missing name: ${JSON.stringify(checker)}`);
        this.assert(checker.description, `Checker missing description: ${checker.name}`);
        this.assert(typeof checker.priority === 'number', `Checker missing priority: ${checker.name}`);
      });

      this.pass('Checkers');
    } catch (error) {
      this.fail('Checkers', error);
    }
  }

  /**
   * Test reporters functionality
   */
  async testReporters() {
    console.log('📊 Testing Reporters...');

    try {
      const config = ConfigManager.getConfig();
      const reportManager = new ReportManager(config);

      // Test reporter info
      const reporters = reportManager.getAvailableReporters();
      reporters.forEach(reporter => {
        this.assert(reporter.name, `Reporter missing name: ${JSON.stringify(reporter)}`);
        this.assert(reporter.format, `Reporter missing format: ${reporter.name}`);
        this.assert(Array.isArray(reporter.extensions), `Reporter missing extensions: ${reporter.name}`);
      });

      // Test data validation
      const validResult = reportManager.validateReportData({ timestamp: Date.now() });
      this.assert(validResult.valid === true, 'Valid data should pass validation');

      const invalidResult = reportManager.validateReportData("not an object");
      this.assert(invalidResult.valid === false, 'Invalid data type should fail validation');

      this.pass('Reporters');
    } catch (error) {
      this.fail('Reporters', error);
    }
  }

  /**
   * Test utility functions
   */
  async testUtilities() {
    console.log('🛠️  Testing Utilities...');

    try {
      // Test async utilities
      const delayResult = await asyncUtils.measureTime(() => asyncUtils.delay(20), 'delay test');
      this.assert(delayResult.duration >= 20, 'Delay should take at least specified time');

      // Test file utilities
      const testDir = 'test-temp-dir';
      this.assert(fileUtils.ensureDir(testDir), 'Should create directory');
      this.assert(fileUtils.ensureDir(testDir), 'Should handle existing directory');

      const testFile = path.join(testDir, 'test.txt');
      this.assert(fileUtils.safeWriteFile(testFile, 'test content'), 'Should write file');

      const readContent = fileUtils.safeReadJson(testFile, null);
      this.assert(readContent === null, 'Should return default for non-JSON file');

      // Cleanup
      require('fs').rmSync(testDir, { recursive: true, force: true });

      this.pass('Utilities');
    } catch (error) {
      this.fail('Utilities', error);
    }
  }

  /**
   * Test integration between components
   */
  async testIntegration() {
    console.log('🔗 Testing Integration...');

    try {
      const config = ConfigManager.getConfig();

      // Create test engine
      const testEngine = new TestEngine(config);

      // Test engine status
      const status = testEngine.getStatus();
      this.assert(typeof status.isRunning === 'boolean', 'Should have running status');
      this.assert(status.config, 'Should have config in status');

      // Test dry-run mode (without actually running tests)
      // This validates that all components can be initialized together

      this.pass('Integration');
    } catch (error) {
      this.fail('Integration', error);
    }
  }

  /**
   * Assert a condition
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  /**
   * Record a passed test
   */
  pass(testName) {
    console.log(`   ✅ ${testName}`);
    this.results.tests.push({ name: testName, status: 'passed' });
    this.results.passed++;
  }

  /**
   * Record a failed test
   */
  fail(testName, error) {
    console.log(`   ❌ ${testName}: ${error.message}`);
    this.results.tests.push({ name: testName, status: 'failed', error: error.message });
    this.results.failed++;
    this.results.errors.push(error);
  }

  /**
   * Show test summary
   */
  showSummary() {
    console.log('\n📊 Test Results Summary:');
    console.log('='.repeat(50));
    console.log(`Total Tests: ${this.results.tests.length}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);

    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.tests
        .filter(test => test.status === 'failed')
        .forEach(test => {
          console.log(`   • ${test.name}: ${test.error}`);
        });
    }

    const success = this.results.failed === 0;
    console.log(`\n${success ? '🎉 All tests passed!' : '💥 Some tests failed!'}`);

    if (!success) {
      process.exit(1);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new ArchitectureTester();
  tester.runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = ArchitectureTester;
