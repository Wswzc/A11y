const BaseReporter = require('./baseReporter');
const fileUtils = require('../utils/fileUtils');

/**
 * JSON Report Generator
 */
class JsonReporter extends BaseReporter {
  async generateReport(data, options = {}) {
    const {
      pretty = true,
      includeMetadata = true,
      compress = false
    } = options;

    try {
      // Prepare data for JSON export
      const jsonData = this.prepareJsonData(data, includeMetadata);

      // Generate JSON string
      const jsonString = pretty && !compress ?
        JSON.stringify(jsonData, null, 2) :
        JSON.stringify(jsonData);

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `accessibility-report-${timestamp}.json`;

      // Save to file
      const filePath = await this.saveToFile(jsonString, filename);

      return {
        success: true,
        filePath,
        format: this.getFormat(),
        size: jsonString.length,
        compressed: compress,
        pretty: pretty && !compress
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        format: this.getFormat()
      };
    }
  }

  /**
   * Prepare data for JSON export
   * @param {Object} data
   * @param {boolean} includeMetadata
   * @returns {Object}
   */
  prepareJsonData(data, includeMetadata = true) {
    const jsonData = {
      ...data
    };

    if (includeMetadata) {
      jsonData._metadata = {
        generatedAt: new Date().toISOString(),
        generator: 'Accessibility Test Suite',
        version: '2.0.0',
        format: 'accessibility-report-json',
        totalPages: data.axeResults?.length || 0,
        totalExtraChecks: data.extraResults?.length || 0,
        totalScreenshots: data.screenshots?.length || 0
      };
    }

    // Add calculated fields
    if (data.axeResults) {
      jsonData.summary = jsonData.summary || {};
      jsonData.summary.axeStats = this.calculateAxeStats(data.axeResults);
    }

    if (data.extraResults) {
      jsonData.summary.extraStats = this.calculateExtraStats(data.extraResults);
    }

    return jsonData;
  }

  /**
   * Calculate axe statistics
   * @param {Array} axeResults
   * @returns {Object}
   */
  calculateAxeStats(axeResults) {
    const stats = {
      totalPages: axeResults.length,
      totalViolations: 0,
      totalPasses: 0,
      totalIncomplete: 0,
      totalInapplicable: 0,
      violationsByImpact: {},
      violationsByRule: {},
      pagesWithViolations: 0,
      pagesWithoutViolations: 0
    };

    axeResults.forEach(pageResult => {
      const violations = pageResult.violations || [];
      const passes = pageResult.passes || [];
      const incomplete = pageResult.incomplete || [];
      const inapplicable = pageResult.inapplicable || [];

      stats.totalViolations += violations.length;
      stats.totalPasses += passes.length;
      stats.totalIncomplete += incomplete.length;
      stats.totalInapplicable += inapplicable.length;

      if (violations.length > 0) {
        stats.pagesWithViolations++;
      } else {
        stats.pagesWithoutViolations++;
      }

      // Count by impact
      violations.forEach(violation => {
        const impact = violation.impact || 'unknown';
        stats.violationsByImpact[impact] = (stats.violationsByImpact[impact] || 0) + 1;

        const rule = violation.id || 'unknown';
        stats.violationsByRule[rule] = (stats.violationsByRule[rule] || 0) + 1;
      });
    });

    // Calculate averages
    stats.averageViolationsPerPage = stats.totalPages > 0 ?
      Math.round((stats.totalViolations / stats.totalPages) * 100) / 100 : 0;

    stats.averagePassesPerPage = stats.totalPages > 0 ?
      Math.round((stats.totalPasses / stats.totalPages) * 100) / 100 : 0;

    return stats;
  }

  /**
   * Calculate extra checks statistics
   * @param {Array} extraResults
   * @returns {Object}
   */
  calculateExtraStats(extraResults) {
    const stats = {
      totalPages: extraResults.length,
      checks: {}
    };

    // Initialize check types
    const checkTypes = ['contrast', 'keyboardFocus', 'zoom', 'accessibilityTree'];

    checkTypes.forEach(checkType => {
      stats.checks[checkType] = {
        total: 0,
        successful: 0,
        failed: 0,
        errors: 0,
        averageScore: 0
      };
    });

    extraResults.forEach(pageResult => {
      checkTypes.forEach(checkType => {
        if (pageResult[checkType]) {
          const check = pageResult[checkType];
          stats.checks[checkType].total++;

          if (check.error) {
            stats.checks[checkType].errors++;
          } else if (check.success === false) {
            stats.checks[checkType].failed++;
          } else {
            stats.checks[checkType].successful++;

            // Calculate score if available
            if (typeof check.score === 'number') {
              stats.checks[checkType].averageScore += check.score;
            }
          }
        }
      });
    });

    // Calculate averages
    checkTypes.forEach(checkType => {
      const check = stats.checks[checkType];
      if (check.total > 0) {
        check.averageScore = Math.round((check.averageScore / check.total) * 100) / 100;
        check.successRate = Math.round((check.successful / check.total) * 100);
      }
    });

    return stats;
  }

  /**
   * Generate summary report
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async generateSummaryReport(data) {
    const summary = {
      timestamp: new Date().toISOString(),
      totalPages: data.axeResults?.length || 0,
      totalViolations: 0,
      totalIssues: 0,
      pages: []
    };

    if (data.axeResults) {
      data.axeResults.forEach(page => {
        const violations = page.violations || [];
        summary.totalViolations += violations.length;

        summary.pages.push({
          name: page.url || page.pageName,
          violations: violations.length,
          criticalIssues: violations.filter(v => v.impact === 'critical').length,
          seriousIssues: violations.filter(v => v.impact === 'serious').length,
          moderateIssues: violations.filter(v => v.impact === 'moderate').length,
          minorIssues: violations.filter(v => v.impact === 'minor').length
        });
      });
    }

    if (data.extraResults) {
      summary.totalIssues += data.extraResults.reduce((sum, page) => {
        return sum + (page.keyboardFocus?.problems?.length || 0);
      }, 0);
    }

    const jsonString = JSON.stringify(summary, null, 2);
    const filename = `accessibility-summary-${Date.now()}.json`;
    const filePath = await this.saveToFile(jsonString, filename);

    return {
      success: true,
      filePath,
      format: 'json-summary',
      summary
    };
  }

  getFormat() {
    return 'json';
  }

  getExtensions() {
    return ['.json'];
  }

  getDescription() {
    return 'Generates detailed JSON accessibility reports';
  }
}

module.exports = JsonReporter;
