const BaseChecker = require('./baseChecker');
const AxeScanner = require('../core/axeScanner');

/**
 * Color Contrast Checker using axe-core
 */
class ColorContrastChecker extends BaseChecker {
  constructor(config) {
    super(config);
    this.axeScanner = new AxeScanner(config);
  }

  async executeCheck(page, pageName, options = {}) {
    try {
      const results = await this.axeScanner.scanTargeted(
        page,
        pageName,
        { type: 'rule', values: ['color-contrast'] }
      );

      // Process results
      const processedResults = {
        violations: results.violations || [],
        passes: results.passes || [],
        totalViolations: results.violations?.length || 0,
        totalPasses: results.passes?.length || 0
      };

      // Add severity classification
      processedResults.violations.forEach(violation => {
        violation.severity = this.classifySeverity(violation);
      });

      return processedResults;
    } catch (error) {
      return {
        error: error.message,
        violations: [],
        passes: [],
        totalViolations: 0,
        totalPasses: 0
      };
    }
  }

  /**
   * Classify severity of contrast violations
   * @param {Object} violation
   * @returns {string}
   */
  classifySeverity(violation) {
    // Extract contrast ratio from failure summary if available
    const summary = violation.description || '';
    const ratioMatch = summary.match(/contrast ratio of ([\d.]+)/);

    if (ratioMatch) {
      const ratio = parseFloat(ratioMatch[1]);

      // WCAG AA standards
      if (ratio < 3.0) return 'critical'; // Well below minimum
      if (ratio < 4.5) return 'high';     // Below normal text requirement
      if (ratio < 7.0) return 'medium';   // Below large text requirement
    }

    return 'medium'; // Default classification
  }

  getDescription() {
    return 'Checks color contrast ratios against WCAG guidelines';
  }

  getPriority() {
    return 1; // High priority - color contrast is fundamental
  }
}

module.exports = ColorContrastChecker;
