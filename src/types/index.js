/**
 * Type definitions for Accessibility Testing Framework
 */

/**
 * @typedef {Object} AxeResults
 * @property {Array} violations - Accessibility violations found
 * @property {Array} passes - Passed accessibility checks
 * @property {Array} incomplete - Incomplete accessibility checks
 * @property {Array} inapplicable - Inapplicable accessibility checks
 * @property {string} [url] - Page URL or identifier
 * @property {number} [timestamp] - Timestamp when results were generated
 */

/**
 * @typedef {Object} PageConfig
 * @property {string} name - Page name for display
 * @property {string} selector - CSS selector to navigate to page
 * @property {Object} [options] - Additional navigation options
 */

/**
 * @typedef {Object} AppConfig
 * @property {string} exePath - Path to executable
 * @property {string} reportDir - Report output directory
 * @property {string} processName - Process name for cleanup
 * @property {number} [timeout] - Timeout for operations
 * @property {Array<string>} [electronArgs] - Additional Electron arguments
 * @property {Object} [axeOptions] - Axe-core configuration options
 */

/**
 * @typedef {Object} FocusCheckResult
 * @property {string} tag - HTML tag name
 * @property {string|null} role - ARIA role
 * @property {string|null} aria - ARIA label or labelledby
 * @property {string} text - Element text content
 * @property {boolean} focused - Whether element received focus
 * @property {string|null} outline - CSS outline/box-shadow
 * @property {string} selector - CSS selector for element
 * @property {string} [error] - Error message if check failed
 */

/**
 * @typedef {Object} KeyboardFocusResult
 * @property {Array<FocusCheckResult>} details - All focus check results
 * @property {Array<FocusCheckResult>} problems - Elements with focus issues
 * @property {string} [error] - Error message if check failed
 */

/**
 * @typedef {Object} ExtraChecksResult
 * @property {string} page - Page name
 * @property {AxeResults} contrast - Color contrast check results
 * @property {Object} accessibilityTree - Accessibility tree snapshot
 * @property {KeyboardFocusResult} keyboardFocus - Keyboard focus check results
 * @property {Object} zoom - Zoom test results
 */

/**
 * @typedef {Object} TestResults
 * @property {Array<AxeResults>} axeResults - Axe-core results for each page
 * @property {Array<ExtraChecksResult>} extraResults - Additional check results
 * @property {Object} aggregated - Aggregated results across all pages
 * @property {Array<string>} screenshots - Paths to saved screenshots
 * @property {number} timestamp - Test execution timestamp
 * @property {Object} config - Test configuration used
 */

/**
 * @typedef {Object} ReportOptions
 * @property {string} projectKey - Project identifier
 * @property {string} outputDir - Output directory
 * @property {string} reportFileName - Report filename
 * @property {boolean} [includeExtra] - Include extra checks in report
 * @property {boolean} [generateJson] - Generate JSON report
 * @property {boolean} [generateHtml] - Generate HTML report
 */

module.exports = {};
