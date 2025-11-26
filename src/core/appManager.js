const { _electron: electron } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const logger = require('../utils/logger');
const asyncUtils = require('../utils/asyncUtils');

/**
 * Electron Application Manager
 */
class AppManager {
  constructor(config) {
    this.config = config;
    this.electronApp = null;
    this.mainWindow = null;
  }

  /**
   * Clean up existing processes
   * @returns {Promise<void>}
   */
  async cleanupProcesses() {
    const timer = logger.startTimer('Process cleanup');

    try {
      logger.info('Cleaning up existing processes...');

      // Try to kill by process name
      try {
        execSync(`taskkill /F /IM "${this.config.processName}"`, {
          stdio: 'ignore',
          timeout: 5000
        });
        logger.info('Successfully terminated existing processes');
      } catch (error) {
        // Process might not exist, which is fine
        logger.debug('No existing processes to clean up');
      }

      // Additional cleanup time
      await asyncUtils.delay(2000);

      timer();
    } catch (error) {
      logger.warn('Process cleanup encountered issues:', error.message);
      timer();
    }
  }

  /**
   * Launch Electron application
   * @returns {Promise<import('playwright').ElectronApplication>}
   */
  async launchApp() {
    const timer = logger.startTimer('App launch');

    try {
      // Validate executable exists
      if (!fs.existsSync(this.config.exePath)) {
        throw new Error(`Executable not found: ${this.config.exePath}`);
      }

      logger.info(`Launching application: ${this.config.exePath}`);

      // Prepare launch options
      const launchOptions = {
        executablePath: this.config.exePath,
        timeout: this.config.timeout,
        args: this.config.electronArgs || []
      };

      // Add additional args if needed
      if (this.config.debug) {
        launchOptions.args.push('--remote-debugging-port=9222');
      }

      this.electronApp = await electron.launch(launchOptions);
      logger.success('Application launched successfully');

      timer();
      return this.electronApp;
    } catch (error) {
      logger.error('Failed to launch application:', error.message);
      timer();
      throw error;
    }
  }

  /**
   * Get main window with retry
   * @param {import('playwright').ElectronApplication} app
   * @returns {Promise<import('playwright').Page>}
   */
  async getMainWindow(app = this.electronApp) {
    if (!app) {
      throw new Error('Application not launched');
    }

    const timer = logger.startTimer('Get main window');

    try {
      logger.debug('Waiting for main window...');

      const window = await asyncUtils.retry(
        async () => {
          const windows = app.windows();
          if (windows.length === 0) {
            throw new Error('No windows available');
          }
          return windows[0]; // First window is typically the main window
        },
        {
          maxAttempts: 5,
          baseDelay: 1000,
          retryCondition: (error) => error.message.includes('No windows available')
        }
      );

      // Wait for window to be ready
      await asyncUtils.poll(
        async () => {
          try {
            const title = await window.title();
            return title && title.length > 0;
          } catch {
            return false;
          }
        },
        { timeout: 10000, timeoutMessage: 'Window ready timeout' }
      );

      const title = await window.title();
      logger.success(`Main window ready: "${title}"`);

      this.mainWindow = window;
      timer();
      return window;
    } catch (error) {
      logger.error('Failed to get main window:', error.message);
      timer();
      throw error;
    }
  }

  /**
   * Close application gracefully
   * @returns {Promise<void>}
   */
  async closeApp() {
    const timer = logger.startTimer('App shutdown');

    try {
      if (this.electronApp) {
        logger.info('Closing application...');

        // Try graceful close first
        try {
          await asyncUtils.withTimeout(
            this.electronApp.close(),
            10000,
            'App close timeout'
          );
        } catch (error) {
          logger.warn('Graceful close failed, forcing termination...');

          // Force kill if graceful close fails
          try {
            execSync(`taskkill /F /IM "${this.config.processName}"`, {
              stdio: 'ignore',
              timeout: 5000
            });
          } catch (forceError) {
            logger.error('Force termination also failed:', forceError.message);
          }
        }

        this.electronApp = null;
        this.mainWindow = null;

        logger.success('Application closed');
      } else {
        logger.debug('No application to close');
      }

      timer();
    } catch (error) {
      logger.error('Error during app shutdown:', error.message);
      timer();
    }
  }

  /**
   * Restart application
   * @returns {Promise<import('playwright').Page>}
   */
  async restartApp() {
    await this.closeApp();
    await this.cleanupProcesses();
    const app = await this.launchApp();
    return this.getMainWindow(app);
  }

  /**
   * Check if application is running
   * @returns {boolean}
   */
  isRunning() {
    return this.electronApp !== null;
  }

  /**
   * Get application info
   * @returns {Object}
   */
  getInfo() {
    return {
      running: this.isRunning(),
      exePath: this.config.exePath,
      processName: this.config.processName,
      hasWindow: this.mainWindow !== null
    };
  }

  /**
   * Take emergency screenshot if something goes wrong
   * @param {string} reason
   * @returns {Promise<string|null>}
   */
  async emergencyScreenshot(reason = 'emergency') {
    if (!this.mainWindow) return null;

    try {
      const filename = `emergency-${reason}-${Date.now()}.png`;
      await this.mainWindow.screenshot({ path: filename });
      logger.info(`Emergency screenshot saved: ${filename}`);
      return filename;
    } catch (error) {
      logger.error('Failed to take emergency screenshot:', error.message);
      return null;
    }
  }
}

module.exports = AppManager;
