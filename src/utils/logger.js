/**
 * Enhanced logging utilities for Accessibility Testing Framework
 */

class Logger {
  constructor() {
    this.debugMode = process.env.A11Y_DEBUG === 'true';
    this.logFile = process.env.A11Y_LOG_FILE || 'a11y-test.log';
    this.startTime = Date.now();
  }

  /**
   * Format timestamp for logging
   * @returns {string}
   */
  getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Format log message with timestamp and level
   * @param {string} level
   * @param {string} message
   * @param {any} data
   * @returns {string}
   */
  formatMessage(level, message, data = null) {
    const timestamp = this.getTimestamp();
    const duration = Date.now() - this.startTime;
    let formatted = `[${timestamp}] [${duration}ms] ${level}: ${message}`;

    if (data) {
      formatted += ` ${JSON.stringify(data, null, 2)}`;
    }

    return formatted;
  }

  /**
   * Write to console and optionally to file
   * @param {string} level
   * @param {string} message
   * @param {any} data
   */
  write(level, message, data = null) {
    const formatted = this.formatMessage(level, message, data);

    // Console output
    switch (level.toUpperCase()) {
      case 'ERROR':
        console.error(`❌ ${message}`);
        break;
      case 'WARN':
        console.warn(`⚠️  ${message}`);
        break;
      case 'INFO':
        console.log(`ℹ️  ${message}`);
        break;
      case 'SUCCESS':
        console.log(`✅ ${message}`);
        break;
      case 'DEBUG':
        if (this.debugMode) {
          console.log(`🔍 ${message}`);
        }
        break;
      default:
        console.log(message);
    }

    // File output
    if (this.logFile) {
      try {
        require('fs').appendFileSync(this.logFile, formatted + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error.message);
      }
    }
  }

  /**
   * Log error message
   * @param {string} message
   * @param {any} data
   */
  error(message, data = null) {
    this.write('ERROR', message, data);
  }

  /**
   * Log warning message
   * @param {string} message
   * @param {any} data
   */
  warn(message, data = null) {
    this.write('WARN', message, data);
  }

  /**
   * Log info message
   * @param {string} message
   * @param {any} data
   */
  info(message, data = null) {
    this.write('INFO', message, data);
  }

  /**
   * Log success message
   * @param {string} message
   * @param {any} data
   */
  success(message, data = null) {
    this.write('SUCCESS', message, data);
  }

  /**
   * Log debug message (only in debug mode)
   * @param {string} message
   * @param {any} data
   */
  debug(message, data = null) {
    if (this.debugMode) {
      this.write('DEBUG', message, data);
    }
  }

  /**
   * Start timing an operation
   * @param {string} operation
   * @returns {function} Timer function
   */
  startTimer(operation) {
    const start = Date.now();
    this.debug(`Started: ${operation}`);

    return () => {
      const duration = Date.now() - start;
      this.debug(`Completed: ${operation} (${duration}ms)`);
      return duration;
    };
  }

  /**
   * Create progress indicator
   * @param {string} operation
   * @param {number} total
   * @returns {Object} Progress functions
   */
  createProgress(operation, total) {
    let current = 0;
    const startTime = Date.now();

    return {
      increment: (step = 1) => {
        current += step;
        const percent = Math.round((current / total) * 100);
        const elapsed = Date.now() - startTime;
        const eta = current > 0 ? Math.round((elapsed / current) * (total - current)) : 0;

        process.stdout.write(`\r${operation}: ${current}/${total} (${percent}%) - ETA: ${eta}ms`);
      },
      complete: () => {
        const totalTime = Date.now() - startTime;
        console.log(`\n${operation} completed in ${totalTime}ms`);
      }
    };
  }
}

// Export singleton instance
module.exports = new Logger();
