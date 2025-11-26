const { createHtmlReport } = require('axe-html-reporter');
const BaseReporter = require('./baseReporter');
const fileUtils = require('../utils/fileUtils');
const path = require('path');

/**
 * HTML Report Generator using axe-html-reporter
 */
class HtmlReporter extends BaseReporter {
  constructor(config) {
    super(config);
    this.projectKey = 'Accessibility Test Suite';
  }

  async generateReport(data, options = {}) {
    const {
      projectKey = this.projectKey,
      includeExtraChecks = true,
      customTitle = 'Accessibility Test Report'
    } = options;

    try {
      // Prepare axe results for HTML report
      const axeResults = this.prepareAxeResults(data);

      // Generate HTML report
      const reportDir = this.config.reportDir;
      fileUtils.ensureDir(reportDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `accessibility-report-${timestamp}.html`;

      createHtmlReport({
        results: axeResults,
        options: {
          projectKey,
          outputDir: reportDir,
          reportFileName: filename,
        }
      });

      const reportPath = path.join(reportDir, filename);

      // Generate enhanced report if extra checks are included
      let enhancedReportPath = null;
      if (includeExtraChecks && data.extraResults) {
        enhancedReportPath = await this.generateEnhancedReport(data, filename);
      }

      return {
        success: true,
        reportPath,
        enhancedReportPath,
        format: this.getFormat(),
        totalViolations: axeResults.violations?.length || 0,
        totalPages: data.axeResults?.length || 0
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
   * Prepare axe results for HTML reporting
   * @param {Object} data
   * @returns {Object}
   */
  prepareAxeResults(data) {
    if (!data.axeResults || data.axeResults.length === 0) {
      return {
        violations: [],
        passes: [],
        incomplete: [],
        inapplicable: []
      };
    }

    // Aggregate all results
    const aggregated = {
      violations: [],
      passes: [],
      incomplete: [],
      inapplicable: []
    };

    data.axeResults.forEach(pageResult => {
      if (pageResult.violations) {
        // Add page identifier to each violation
        const violationsWithPage = pageResult.violations.map(violation => ({
          ...violation,
          page: pageResult.url || pageResult.pageName || 'Unknown Page'
        }));
        aggregated.violations.push(...violationsWithPage);
      }

      if (pageResult.passes) {
        aggregated.passes.push(...pageResult.passes);
      }

      if (pageResult.incomplete) {
        aggregated.incomplete.push(...pageResult.incomplete);
      }

      if (pageResult.inapplicable) {
        aggregated.inapplicable.push(...pageResult.inapplicable);
      }
    });

    return aggregated;
  }

  /**
   * Generate enhanced HTML report with extra checks
   * @param {Object} data
   * @param {string} baseFilename
   * @returns {Promise<string>}
   */
  async generateEnhancedReport(data, baseFilename) {
    try {
      const enhancedHtml = this.buildEnhancedHtml(data);
      const enhancedFilename = baseFilename.replace('.html', '-enhanced.html');
      const enhancedPath = path.join(this.config.reportDir, enhancedFilename);

      const success = fileUtils.safeWriteFile(enhancedPath, enhancedHtml);

      if (success) {
        return enhancedPath;
      }
    } catch (error) {
      logger.warn('Failed to generate enhanced report:', error.message);
    }

    return null;
  }

  /**
   * Build enhanced HTML content
   * @param {Object} data
   * @returns {string}
   */
  buildEnhancedHtml(data) {
    const title = 'Enhanced Accessibility Test Report';
    const timestamp = new Date().toISOString();

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        ${this.getEnhancedStyles()}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>${title}</h1>
            <div class="meta">
                <p>Generated: ${timestamp}</p>
                <p>Pages Tested: ${data.axeResults?.length || 0}</p>
            </div>
        </header>

        <main>
            ${this.buildSummarySection(data)}
            ${this.buildAxeSection(data)}
            ${this.buildExtraChecksSection(data)}
            ${this.buildScreenshotsSection(data)}
        </main>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Get enhanced CSS styles
   * @returns {string}
   */
  getEnhancedStyles() {
    return `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        header h1 { margin-bottom: 10px; }
        .meta { opacity: 0.8; font-size: 0.9em; }
        .section { background: white; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .section-header { background: #3498db; color: white; padding: 15px; border-radius: 8px 8px 0 0; }
        .section-content { padding: 20px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .metric { background: #ecf0f1; padding: 15px; border-radius: 6px; text-align: center; }
        .metric .value { font-size: 2em; font-weight: bold; color: #e74c3c; }
        .metric.positive .value { color: #27ae60; }
        .issue { background: #fff5f5; border-left: 4px solid #e74c3c; padding: 10px; margin: 10px 0; }
        .screenshot { max-width: 200px; height: auto; border: 1px solid #ddd; border-radius: 4px; }
        .check-result { margin: 10px 0; padding: 10px; border-radius: 4px; }
        .check-result.success { background: #d5f4e6; border-left: 4px solid #27ae60; }
        .check-result.error { background: #fdeaea; border-left: 4px solid #e74c3c; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; font-weight: 600; }
        .severity-critical { color: #e74c3c; }
        .severity-high { color: #e67e22; }
        .severity-medium { color: #f39c12; }
        .severity-low { color: #27ae60; }
    `;
  }

  /**
   * Build summary section
   * @param {Object} data
   * @returns {string}
   */
  buildSummarySection(data) {
    const axeResults = data.axeResults || [];
    const totalViolations = axeResults.reduce((sum, r) => sum + (r.violations?.length || 0), 0);
    const totalPages = axeResults.length;

    return `
        <section class="section">
            <div class="section-header">
                <h2>📊 Test Summary</h2>
            </div>
            <div class="section-content">
                <div class="summary-grid">
                    <div class="metric ${totalViolations === 0 ? 'positive' : ''}">
                        <div class="value">${totalViolations}</div>
                        <div>Total Violations</div>
                    </div>
                    <div class="metric positive">
                        <div class="value">${totalPages}</div>
                        <div>Pages Tested</div>
                    </div>
                    <div class="metric">
                        <div class="value">${data.extraResults?.length || 0}</div>
                        <div>Extra Checks</div>
                    </div>
                </div>
            </div>
        </section>
    `;
  }

  /**
   * Build axe results section
   * @param {Object} data
   * @returns {string}
   */
  buildAxeSection(data) {
    const axeResults = data.axeResults || [];

    let content = '<div class="section-content">';

    if (axeResults.length === 0) {
      content += '<p>No axe results available.</p>';
    } else {
      axeResults.forEach(pageResult => {
        const violations = pageResult.violations || [];
        content += `
            <h3>Page: ${pageResult.url || pageResult.pageName || 'Unknown'}</h3>
            <p>Violations: ${violations.length}</p>
        `;

        if (violations.length > 0) {
          content += '<table>';
          content += '<tr><th>Rule</th><th>Impact</th><th>Elements</th><th>Description</th></tr>';

          violations.slice(0, 10).forEach(violation => {
            content += `
                <tr>
                    <td>${violation.id || 'Unknown'}</td>
                    <td class="severity-${violation.impact || 'medium'}">${violation.impact || 'medium'}</td>
                    <td>${violation.nodes?.length || 0}</td>
                    <td>${violation.description || 'No description'}</td>
                </tr>
            `;
          });

          content += '</table>';
        }
      });
    }

    content += '</div>';
    return `<section class="section"><div class="section-header"><h2>🔍 Axe Core Results</h2></div>${content}</section>`;
  }

  /**
   * Build extra checks section
   * @param {Object} data
   * @returns {string}
   */
  buildExtraChecksSection(data) {
    const extraResults = data.extraResults || [];

    let content = '<div class="section-content">';

    if (extraResults.length === 0) {
      content += '<p>No extra check results available.</p>';
    } else {
      extraResults.forEach(pageResult => {
        content += `<h3>${pageResult.page || 'Unknown Page'}</h3>`;

        // Color contrast
        if (pageResult.contrast) {
          const contrast = pageResult.contrast;
          content += `<div class="check-result ${contrast.error ? 'error' : 'success'}">`;
          content += `<strong>Color Contrast:</strong> ${contrast.error || `${contrast.violations?.length || 0} violations`}`;
          content += '</div>';
        }

        // Keyboard focus
        if (pageResult.keyboardFocus) {
          const focus = pageResult.keyboardFocus;
          content += `<div class="check-result ${focus.error ? 'error' : 'success'}">`;
          content += `<strong>Keyboard Focus:</strong> ${focus.error || `${focus.problems?.length || 0} issues found`}`;
          content += '</div>';
        }

        // Zoom test
        if (pageResult.zoom) {
          const zoom = pageResult.zoom;
          content += `<div class="check-result ${zoom.error ? 'error' : 'success'}">`;
          content += `<strong>Zoom Test:</strong> ${zoom.error || `Max zoom: ${zoom.maxZoom || 'unknown'}`}`;
          content += '</div>';
        }
      });
    }

    content += '</div>';
    return `<section class="section"><div class="section-header"><h2>🔧 Additional Checks</h2></div>${content}</section>`;
  }

  /**
   * Build screenshots section
   * @param {Object} data
   * @returns {string}
   */
  buildScreenshotsSection(data) {
    const screenshots = data.screenshots || [];

    let content = '<div class="section-content">';

    if (screenshots.length === 0) {
      content += '<p>No screenshots available.</p>';
    } else {
      content += `<p>Found ${screenshots.length} screenshot(s):</p>`;
      screenshots.forEach(screenshot => {
        const filename = path.basename(screenshot);
        content += `<img src="${filename}" alt="Screenshot" class="screenshot">`;
      });
    }

    content += '</div>';
    return `<section class="section"><div class="section-header"><h2>📸 Screenshots</h2></div>${content}</section>`;
  }

  getFormat() {
    return 'html';
  }

  getExtensions() {
    return ['.html'];
  }

  getDescription() {
    return 'Generates comprehensive HTML accessibility reports';
  }
}

module.exports = HtmlReporter;
