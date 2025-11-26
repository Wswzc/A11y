/**
 * Asynchronous utilities for Accessibility Testing Framework
 */

class AsyncUtils {
  /**
   * Retry function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {Object} options - Retry options
   * @returns {Promise<any>}
   */
  async retry(fn, options = {}) {
    const {
      maxAttempts = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      backoffFactor = 2,
      retryCondition = () => true
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        // Don't retry if condition not met
        if (!retryCondition(error)) {
          throw error;
        }

        if (attempt === maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);

        await this.delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * Simple delay function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Timeout wrapper for promises
   * @param {Promise} promise - Promise to wrap
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {string} timeoutMessage - Timeout error message
   * @returns {Promise}
   */
  withTimeout(promise, timeoutMs, timeoutMessage = 'Operation timed out') {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      )
    ]);
  }

  /**
   * Execute functions concurrently with limit
   * @param {Array<Function>} tasks - Array of async functions
   * @param {number} concurrency - Maximum concurrent executions
   * @returns {Promise<Array>} Results array
   */
  async concurrentLimit(tasks, concurrency = 3) {
    if (!Array.isArray(tasks) || tasks.length === 0) return [];
    if (concurrency <= 0) concurrency = 1;

    const results = [];
    const executing = new Set();

    for (const taskFn of tasks) {
      const wrappedTask = (typeof taskFn === 'function') ? taskFn : () => taskFn;
      const promise = Promise.resolve().then(() => wrappedTask());

      results.push(promise);
      executing.add(promise);

      const cleanUp = () => executing.delete(promise);
      promise.then(cleanUp).catch(cleanUp);

      if (executing.size >= concurrency) {
        await Promise.race(executing);
      }
    }

    return Promise.all(results);
  }

  /**
   * Poll function until condition is met
   * @param {Function} conditionFn - Function that returns boolean
   * @param {Object} options - Poll options
   * @returns {Promise}
   */
  async poll(conditionFn, options = {}) {
    const {
      interval = 100,
      timeout = 10000,
      timeoutMessage = 'Polling timed out'
    } = options;

    const startTime = Date.now();

    while (true) {
      if (await conditionFn()) {
        return;
      }

      if (Date.now() - startTime > timeout) {
        throw new Error(timeoutMessage);
      }

      await this.delay(interval);
    }
  }

  /**
   * Wait for page to be ready (combines multiple wait strategies)
   * @param {import('playwright').Page} page
   * @param {Object} options
   * @returns {Promise}
   */
  async waitForPageReady(page, options = {}) {
    const {
      domContentLoaded = true,
      networkIdle = false,
      timeout = 30000
    } = options;

    const promises = [];

    if (domContentLoaded) {
      promises.push(page.waitForLoadState('domcontentloaded'));
    }

    if (networkIdle) {
      promises.push(page.waitForLoadState('networkidle'));
    }

    // Always wait a bit for dynamic content
    promises.push(this.delay(options.minWait || 1000));

    await Promise.all(promises);
  }

  /**
   * Safe locator click with retry
   * @param {import('playwright').Locator} locator
   * @param {Object} options
   * @returns {Promise}
   */
  async safeClick(locator, options = {}) {
    const {
      timeout = 5000,
      retries = 2,
      waitForVisible = true
    } = options;

    return this.retry(async () => {
      if (waitForVisible) {
        await locator.waitFor({ timeout });
      }

      await locator.click();
      await this.delay(500); // Brief pause after click
    }, {
      maxAttempts: retries + 1,
      baseDelay: 1000
    });
  }

  /**
   * Measure execution time of async function
   * @param {Function} fn - Async function to measure
   * @param {string} label - Optional label for logging
   * @returns {Promise<{result: any, duration: number}>}
   */
  async measureTime(fn, label = 'operation') {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      console.log(`${label} completed in ${duration}ms`);
      return { result, duration };
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`${label} failed after ${duration}ms:`, error.message);
      throw error;
    }
  }
}

module.exports = new AsyncUtils();
