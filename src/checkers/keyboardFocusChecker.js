const BaseChecker = require('./baseChecker');
const asyncUtils = require('../utils/asyncUtils');
const fileUtils = require('../utils/fileUtils');
const path = require('path');

/**
 * Keyboard Focus and Navigation Checker
 */
class KeyboardFocusChecker extends BaseChecker {
  constructor(config) {
    super(config);
    this.screenshotCount = 0;
  }

  async executeCheck(page, pageName, options = {}) {
    const {
      takeScreenshots = true,
      maxElements = 50,
      focusTimeout = 2000
    } = options;

    try {
      const results = await page.evaluate(this.getFocusCheckScript(), {
        maxElements,
        focusTimeout
      });

      // Process results
      const processedResults = {
        elements: results.elements || [],
        totalElements: results.elements?.length || 0,
        focusableElements: results.elements?.filter(el => el.focused !== null).length || 0,
        visibleFocusableElements: results.elements?.filter(el => el.visible).length || 0
      };

      // Identify problems
      processedResults.problems = this.identifyProblems(processedResults.elements);

      // Take screenshots if enabled and problems found
      if (takeScreenshots && processedResults.problems.length > 0) {
        processedResults.screenshots = await this.takeProblemScreenshots(
          page,
          processedResults.problems,
          pageName
        );
      }

      return processedResults;
    } catch (error) {
      return {
        error: error.message,
        elements: [],
        totalElements: 0,
        focusableElements: 0,
        visibleFocusableElements: 0,
        problems: [],
        screenshots: []
      };
    }
  }

  /**
   * Get the focus checking script to run in browser
   * @returns {Function}
   */
  getFocusCheckScript() {
    return ({ maxElements, focusTimeout }) => {
      // CSS selector for interactive elements
      const selector = `
        a[href], button, input:not([type="hidden"]), textarea, select,
        [role="button"], [role="link"], [role="tab"], [role="menuitem"],
        [tabindex]:not([tabindex="-1"])
      `;

      const elements = Array.from(document.querySelectorAll(selector))
        .slice(0, maxElements) // Limit for performance
        .filter(el => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);

          // Check if element is visible
          return rect.width > 0 && rect.height > 0 &&
                 style.display !== 'none' &&
                 style.visibility !== 'hidden' &&
                 style.opacity !== '0';
        });

      const results = [];

      elements.forEach((el, index) => {
        try {
          // Save original styles
          const originalOutline = el.style.outline;
          const originalBoxShadow = el.style.boxShadow;

          // Attempt to focus
          el.focus();

          // Wait a bit for focus to take effect
          const startTime = Date.now();
          while (Date.now() - startTime < focusTimeout / 10) {
            // Small delay loop
          }

          const computedStyle = window.getComputedStyle(el);
          const isFocused = document.activeElement === el;

          // Check for visible focus indicators
          const hasVisibleFocus = this.hasVisibleFocusIndicator(computedStyle);

          // Generate unique selector
          const uniqueSelector = this.generateUniqueSelector(el);

          results.push({
            index,
            tagName: el.tagName.toLowerCase(),
            role: el.getAttribute('role'),
            ariaLabel: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby'),
            text: (el.textContent || el.value || '').trim().substring(0, 100),
            visible: true,
            focused: isFocused,
            hasVisibleFocus,
            outline: computedStyle.outline,
            boxShadow: computedStyle.boxShadow,
            selector: uniqueSelector,
            boundingRect: el.getBoundingClientRect()
          });

          // Restore original styles
          el.style.outline = originalOutline;
          el.style.boxShadow = originalBoxShadow;

        } catch (error) {
          results.push({
            index,
            tagName: el.tagName.toLowerCase(),
            error: error.message,
            visible: false,
            focused: null,
            hasVisibleFocus: false
          });
        }
      });

      return { elements: results };
    };
  }

  /**
   * Check if element has visible focus indicator
   * @param {CSSStyleDeclaration} style
   * @returns {boolean}
   */
  hasVisibleFocusIndicator(style) {
    const outline = style.outline;
    const boxShadow = style.boxShadow;

    // Check outline
    if (outline && outline !== 'none' && outline !== '0px' && !/^0px/.test(outline)) {
      return true;
    }

    // Check box-shadow (common focus indicator)
    if (boxShadow && boxShadow !== 'none' && !/^0px/.test(boxShadow)) {
      return true;
    }

    return false;
  }

  /**
   * Generate unique CSS selector for element
   * @param {Element} el
   * @returns {string}
   */
  generateUniqueSelector(el) {
    if (el.id) return `#${el.id}`;

    const parts = [];
    let current = el;

    while (current && current.nodeType === 1 && current.tagName.toLowerCase() !== 'html') {
      let part = current.tagName.toLowerCase();

      if (current.className) {
        const classes = current.className.trim().split(/\s+/).filter(c => c);
        if (classes.length > 0) {
          part += '.' + classes.join('.');
        }
      }

      // Add nth-child if needed for uniqueness
      const siblings = Array.from(current.parentNode?.children || []);
      const index = siblings.indexOf(current);
      if (siblings.length > 1) {
        part += `:nth-child(${index + 1})`;
      }

      parts.unshift(part);
      current = current.parentNode;

      // Prevent infinite loops
      if (parts.length > 5) break;
    }

    return parts.join(' > ');
  }

  /**
   * Identify focus-related problems
   * @param {Array} elements
   * @returns {Array}
   */
  identifyProblems(elements) {
    const problems = [];

    elements.forEach((el, index) => {
      const issues = [];

      // Check 1: Element should be focusable but isn't
      if (el.focused === false) {
        issues.push('not-focusable');
      }

      // Check 2: Focused element has no visible focus indicator
      if (el.focused === true && !el.hasVisibleFocus) {
        issues.push('no-visible-focus');
      }

      // Check 3: Missing accessible name
      if (!el.ariaLabel && !el.text) {
        issues.push('missing-label');
      }

      if (issues.length > 0) {
        problems.push({
          index,
          element: el,
          issues,
          severity: this.calculateSeverity(issues)
        });
      }
    });

    return problems;
  }

  /**
   * Calculate severity of issues
   * @param {Array<string>} issues
   * @returns {string}
   */
  calculateSeverity(issues) {
    if (issues.includes('not-focusable')) return 'critical';
    if (issues.includes('no-visible-focus')) return 'high';
    if (issues.includes('missing-label')) return 'medium';
    return 'low';
  }

  /**
   * Take screenshots of problematic elements
   * @param {import('playwright').Page} page
   * @param {Array} problems
   * @param {string} pageName
   * @returns {Promise<Array<string>>}
   */
  async takeProblemScreenshots(page, problems, pageName) {
    const screenshots = [];
    const screenshotDir = this.config.screenshotsDir;

    fileUtils.ensureDir(screenshotDir);

    for (let i = 0; i < Math.min(problems.length, 10); i++) { // Limit screenshots
      const problem = problems[i];
      const element = problem.element;

      if (!element.selector) continue;

      try {
        const locator = page.locator(element.selector).first();
        const safeName = `${pageName.replace(/[^a-z0-9]/gi, '_')}_focus_${i + 1}.png`;
        const screenshotPath = path.join(screenshotDir, safeName);

        await locator.screenshot({ path: screenshotPath, timeout: 2000 });
        screenshots.push(screenshotPath);

        this.screenshotCount++;
      } catch (error) {
        console.warn(`Failed to screenshot element ${i}:`, error.message);
      }
    }

    return screenshots;
  }

  getDescription() {
    return 'Checks keyboard focus navigation and visible focus indicators';
  }

  getPriority() {
    return 2; // High priority - keyboard navigation is critical
  }
}

module.exports = KeyboardFocusChecker;
