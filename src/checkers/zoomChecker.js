const BaseChecker = require('./baseChecker');

/**
 * Zoom and Responsive Design Checker
 */
class ZoomChecker extends BaseChecker {
  constructor(config) {
    super(config);
    this.zoomLevels = [1.0, 1.25, 1.5, 2.0]; // Common zoom levels
  }

  async executeCheck(page, pageName, options = {}) {
    const {
      zoomLevels = this.zoomLevels,
      maxZoom = 2.0,
      checkOverflow = true,
      checkLayout = true
    } = options;

    const results = {
      zoomTests: [],
      layoutIssues: [],
      overflowIssues: []
    };

    try {
      for (const zoomLevel of zoomLevels) {
        if (zoomLevel > maxZoom) continue;

        const zoomResult = await this.testZoomLevel(page, zoomLevel);
        results.zoomTests.push(zoomResult);

        // Check for layout issues
        if (checkLayout && zoomResult.layoutBroken) {
          results.layoutIssues.push({
            zoomLevel,
            ...zoomResult.layoutData
          });
        }

        // Check for overflow issues
        if (checkOverflow && zoomResult.overflow) {
          results.overflowIssues.push({
            zoomLevel,
            ...zoomResult.overflowData
          });
        }
      }

      // Summary
      results.summary = {
        totalTests: results.zoomTests.length,
        layoutIssuesCount: results.layoutIssues.length,
        overflowIssuesCount: results.overflowIssues.length,
        maxZoomTested: Math.max(...zoomLevels.filter(z => z <= maxZoom)),
        recommendedZoomSupport: this.calculateRecommendedZoom(results)
      };

      return results;
    } catch (error) {
      return {
        error: error.message,
        zoomTests: [],
        layoutIssues: [],
        overflowIssues: [],
        summary: { totalTests: 0, layoutIssuesCount: 0, overflowIssuesCount: 0 }
      };
    }
  }

  /**
   * Test a specific zoom level
   * @param {import('playwright').Page} page
   * @param {number} zoomLevel
   * @returns {Promise<Object>}
   */
  async testZoomLevel(page, zoomLevel) {
    try {
      // Apply zoom
      await page.evaluate((zoom) => {
        document.body.style.zoom = zoom.toString();
      }, zoomLevel);

      // Wait for rendering
      await new Promise(resolve => setTimeout(resolve, 500));

      // Measure layout
      const layoutData = await page.evaluate(() => {
        const body = document.body;
        const html = document.documentElement;

        return {
          bodyScrollWidth: body.scrollWidth,
          bodyScrollHeight: body.scrollHeight,
          bodyClientWidth: body.clientWidth,
          bodyClientHeight: body.clientHeight,
          htmlScrollWidth: html.scrollWidth,
          htmlScrollHeight: html.scrollHeight,
          htmlClientWidth: html.clientWidth,
          htmlClientHeight: html.clientHeight,
          windowInnerWidth: window.innerWidth,
          windowInnerHeight: window.innerHeight,
          hasHorizontalScrollbar: body.scrollWidth > window.innerWidth,
          hasVerticalScrollbar: body.scrollHeight > window.innerHeight
        };
      });

      // Check for overflow
      const overflow = layoutData.bodyScrollWidth > layoutData.windowInnerWidth + 10 ||
                      layoutData.bodyScrollHeight > layoutData.windowInnerHeight + 10;

      // Check for layout breaks (elements going off-screen inappropriately)
      const layoutBroken = await this.checkLayoutBreakage(page, layoutData);

      // Reset zoom
      await page.evaluate(() => {
        document.body.style.zoom = '';
      });

      return {
        zoomLevel,
        success: true,
        layoutData,
        overflow,
        overflowData: overflow ? {
          excessWidth: Math.max(0, layoutData.bodyScrollWidth - layoutData.windowInnerWidth),
          excessHeight: Math.max(0, layoutData.bodyScrollHeight - layoutData.windowInnerHeight)
        } : null,
        layoutBroken,
        layoutBreakageData: layoutBroken ? await this.getLayoutBreakageDetails(page) : null
      };

    } catch (error) {
      // Reset zoom even on error
      try {
        await page.evaluate(() => {
          document.body.style.zoom = '';
        });
      } catch (resetError) {
        // Ignore reset errors
      }

      return {
        zoomLevel,
        success: false,
        error: error.message,
        overflow: false,
        layoutBroken: false
      };
    }
  }

  /**
   * Check if layout is broken at current zoom
   * @param {import('playwright').Page} page
   * @param {Object} layoutData
   * @returns {Promise<boolean>}
   */
  async checkLayoutBreakage(page, layoutData) {
    try {
      // Check for elements that are significantly off-screen
      const breakageData = await page.evaluate(() => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Find elements that are mostly off-screen
        const offScreenElements = Array.from(document.querySelectorAll('*'))
          .filter(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);

            // Skip hidden elements
            if (style.display === 'none' || style.visibility === 'hidden') return false;

            // Check if element is significantly off-screen
            const offScreenX = rect.right < -50 || rect.left > viewportWidth + 50;
            const offScreenY = rect.bottom < -50 || rect.top > viewportHeight + 50;

            return offScreenX || offScreenY;
          });

        return {
          offScreenElementsCount: offScreenElements.length,
          totalElements: document.querySelectorAll('*').length,
          significantBreakage: offScreenElements.length > 5 // Arbitrary threshold
        };
      });

      return breakageData.significantBreakage;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get detailed layout breakage information
   * @param {import('playwright').Page} page
   * @returns {Promise<Object>}
   */
  async getLayoutBreakageDetails(page) {
    try {
      return await page.evaluate(() => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const brokenElements = Array.from(document.querySelectorAll('*'))
          .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.right < -50 || rect.left > viewportWidth + 50 ||
                   rect.bottom < -50 || rect.top > viewportHeight + 50;
          })
          .slice(0, 10) // Limit for performance
          .map(el => ({
            tagName: el.tagName.toLowerCase(),
            id: el.id,
            className: el.className,
            rect: el.getBoundingClientRect(),
            text: el.textContent?.substring(0, 50)
          }));

        return {
          brokenElements,
          viewport: { width: viewportWidth, height: viewportHeight }
        };
      });
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Calculate recommended zoom support level
   * @param {Object} results
   * @returns {Object}
   */
  calculateRecommendedZoom(results) {
    const successfulZooms = results.zoomTests
      .filter(test => test.success && !test.overflow && !test.layoutBroken)
      .map(test => test.zoomLevel);

    const maxSuccessfulZoom = successfulZooms.length > 0 ? Math.max(...successfulZooms) : 1.0;

    return {
      maxSupportedZoom: maxSuccessfulZoom,
      supports200Percent: maxSuccessfulZoom >= 2.0,
      supports150Percent: maxSuccessfulZoom >= 1.5,
      supports125Percent: maxSuccessfulZoom >= 1.25,
      meetsWCAG: maxSuccessfulZoom >= 2.0 // WCAG requires 200% zoom support
    };
  }

  getDescription() {
    return 'Tests page layout and responsiveness at different zoom levels';
  }

  getPriority() {
    return 3; // Medium priority - important but not as critical as contrast/focus
  }
}

module.exports = ZoomChecker;
