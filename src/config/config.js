const path = require('path');
const fs = require('fs');

/**
 * Configuration management for Accessibility Testing Framework
 */
class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from environment variables and defaults
   * @returns {import('../types').AppConfig}
   */
  loadConfig() {
    const defaultConfig = {
      exePath: path.join('C:', 'Program Files', 'Lenovo', 'Smart Meeting', 'Lenovo Smart Meeting.exe'),
      reportDir: 'axe-reports',
      processName: 'Lenovo Smart Meeting.exe',
      timeout: 60000,
      electronArgs: ['--no-sandbox', '--disable-gpu'],
      axeOptions: {
        rules: {},
        runOnly: [],
        reporter: 'v2'
      },
      screenshotsDir: 'a11y-issues/screenshots',
      maxConcurrency: 3,
      retryAttempts: 2,
      waitTimeout: 3000,
      debug: false
    };

    // Override with environment variables
    const envConfig = {
      exePath: process.env.A11Y_EXE_PATH || defaultConfig.exePath,
      reportDir: process.env.A11Y_REPORT_DIR || defaultConfig.reportDir,
      processName: process.env.A11Y_PROCESS_NAME || defaultConfig.processName,
      timeout: parseInt(process.env.A11Y_TIMEOUT) || defaultConfig.timeout,
      electronArgs: process.env.A11Y_ELECTRON_ARGS ?
        process.env.A11Y_ELECTRON_ARGS.split(',') : defaultConfig.electronArgs,
      screenshotsDir: process.env.A11Y_SCREENSHOTS_DIR || defaultConfig.screenshotsDir,
      maxConcurrency: parseInt(process.env.A11Y_MAX_CONCURRENCY) || defaultConfig.maxConcurrency,
      retryAttempts: parseInt(process.env.A11Y_RETRY_ATTEMPTS) || defaultConfig.retryAttempts,
      waitTimeout: parseInt(process.env.A11Y_WAIT_TIMEOUT) || defaultConfig.waitTimeout,
      debug: process.env.A11Y_DEBUG === 'true' || defaultConfig.debug
    };

    // Load axe options from file if exists
    const axeConfigPath = process.env.A11Y_AXE_CONFIG || 'axe-config.json';
    if (fs.existsSync(axeConfigPath)) {
      try {
        const axeConfig = JSON.parse(fs.readFileSync(axeConfigPath, 'utf8'));
        envConfig.axeOptions = { ...defaultConfig.axeOptions, ...axeConfig };
      } catch (error) {
        console.warn('Failed to load axe config file:', error.message);
      }
    }

    return { ...defaultConfig, ...envConfig };
  }

  /**
   * Get pages to scan configuration
   * @returns {Array<import('../types').PageConfig>}
   */
  getPagesToScan() {
    const defaultPages = [
      { name: '首页', selector: 'a[href="#/main"]' },
      { name: '历史记录', selector: 'a[href="#/historyList"]' },
      { name: '如何使用', selector: 'button[aria-label*="how to use"]' },
      { name: '用户中心', selector: 'button[aria-label*="user center"]' }
    ];

    // Try to load from config file
    const pagesConfigPath = process.env.A11Y_PAGES_CONFIG || 'pages-config.json';
    if (fs.existsSync(pagesConfigPath)) {
      try {
        const pagesConfig = JSON.parse(fs.readFileSync(pagesConfigPath, 'utf8'));
        return pagesConfig.pages || defaultPages;
      } catch (error) {
        console.warn('Failed to load pages config file:', error.message);
      }
    }

    return defaultPages;
  }

  /**
   * Get current configuration
   * @returns {import('../types').AppConfig}
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param {Partial<import('../types').AppConfig>} updates
   */
  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Validate configuration
   * @returns {boolean}
   */
  validate() {
    const required = ['exePath', 'reportDir', 'processName'];
    for (const key of required) {
      if (!this.config[key]) {
        console.error(`Missing required configuration: ${key}`);
        return false;
      }
    }

    if (!fs.existsSync(this.config.exePath)) {
      console.warn(`Executable not found: ${this.config.exePath}`);
      // Don't fail validation for missing exe, as it might be installed later
    }

    return true;
  }

  /**
   * Save current configuration to file
   * @param {string} filePath
   */
  saveToFile(filePath = 'a11y-config.json') {
    try {
      fs.writeFileSync(filePath, JSON.stringify(this.config, null, 2), 'utf8');
      console.log(`Configuration saved to: ${filePath}`);
    } catch (error) {
      console.error('Failed to save configuration:', error.message);
    }
  }
}

// Export singleton instance
module.exports = new ConfigManager();
