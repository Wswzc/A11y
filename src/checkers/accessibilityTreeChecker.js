const BaseChecker = require('./baseChecker');

/**
 * Accessibility Tree and Landmark Checker
 */
class AccessibilityTreeChecker extends BaseChecker {
  constructor(config) {
    super(config);
    this.requiredLandmarks = ['banner', 'main', 'navigation', 'complementary', 'contentinfo'];
  }

  async executeCheck(page, pageName, options = {}) {
    const {
      checkLang = true,
      checkLandmarks = true,
      checkHeadings = true,
      detailedTree = false
    } = options;

    try {
      // Get accessibility snapshot
      const axTree = await page.accessibility.snapshot();

      // Get page language
      const lang = await page.evaluate(() => {
        return document.documentElement.lang || '';
      });

      const results = {
        language: this.checkLanguage(lang),
        landmarks: checkLandmarks ? await this.checkLandmarks(page, axTree) : null,
        headings: checkHeadings ? await this.checkHeadings(page, axTree) : null,
        tree: detailedTree ? axTree : null,
        summary: {}
      };

      // Generate summary
      results.summary = this.generateSummary(results);

      return results;
    } catch (error) {
      return {
        error: error.message,
        language: null,
        landmarks: null,
        headings: null,
        tree: null,
        summary: { issues: 1, score: 0 }
      };
    }
  }

  /**
   * Check page language declaration
   * @param {string} lang
   * @returns {Object}
   */
  checkLanguage(lang) {
    const hasLang = lang && lang.trim().length > 0;
    const isValidFormat = hasLang && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(lang);

    return {
      declared: lang,
      hasDeclaration: hasLang,
      validFormat: isValidFormat,
      issues: []
    };
  }

  /**
   * Check for proper landmark usage
   * @param {import('playwright').Page} page
   * @param {Object} axTree
   * @returns {Promise<Object>}
   */
  async checkLandmarks(page, axTree) {
    try {
      // Get landmarks from accessibility tree
      const landmarks = this.extractLandmarks(axTree);

      // Check for required landmarks
      const presentLandmarks = landmarks.map(l => l.role);
      const missingRequired = this.requiredLandmarks.filter(
        role => !presentLandmarks.includes(role)
      );

      // Check for multiple landmarks of same type
      const landmarkCounts = {};
      presentLandmarks.forEach(role => {
        landmarkCounts[role] = (landmarkCounts[role] || 0) + 1;
      });

      const multipleLandmarks = Object.entries(landmarkCounts)
        .filter(([role, count]) => count > 1 && role !== 'navigation') // Multiple nav is often OK
        .map(([role, count]) => ({ role, count }));

      // Check landmark accessibility
      const landmarkIssues = [];
      for (const landmark of landmarks) {
        const issues = this.checkLandmarkAccessibility(landmark);
        landmarkIssues.push(...issues);
      }

      return {
        present: landmarks,
        missing: missingRequired,
        multiples: multipleLandmarks,
        issues: landmarkIssues,
        score: this.calculateLandmarkScore(landmarks, missingRequired, landmarkIssues)
      };
    } catch (error) {
      return {
        error: error.message,
        present: [],
        missing: [],
        multiples: [],
        issues: [],
        score: 0
      };
    }
  }

  /**
   * Extract landmarks from accessibility tree
   * @param {Object} axTree
   * @param {Array} result
   * @returns {Array}
   */
  extractLandmarks(axTree, result = []) {
    if (!axTree) return result;

    // Check if this node is a landmark
    const landmarkRoles = ['banner', 'main', 'navigation', 'complementary', 'contentinfo',
                          'region', 'search', 'form'];

    if (axTree.role && landmarkRoles.includes(axTree.role)) {
      result.push({
        role: axTree.role,
        name: axTree.name,
        level: axTree.level || 0,
        children: axTree.children?.length || 0
      });
    }

    // Recursively check children
    if (axTree.children) {
      axTree.children.forEach(child => this.extractLandmarks(child, result));
    }

    return result;
  }

  /**
   * Check landmark accessibility
   * @param {Object} landmark
   * @returns {Array}
   */
  checkLandmarkAccessibility(landmark) {
    const issues = [];

    // Check if landmark has accessible name
    if (!landmark.name || landmark.name.trim().length === 0) {
      issues.push({
        type: 'missing-name',
        landmark: landmark.role,
        severity: 'high',
        description: `${landmark.role} landmark missing accessible name`
      });
    }

    // Check for redundant landmarks (specific checks per type)
    if (landmark.role === 'main' && landmark.children === 0) {
      issues.push({
        type: 'empty-main',
        landmark: landmark.role,
        severity: 'medium',
        description: 'Main landmark appears to be empty'
      });
    }

    return issues;
  }

  /**
   * Check heading structure
   * @param {import('playwright').Page} page
   * @param {Object} axTree
   * @returns {Promise<Object>}
   */
  async checkHeadings(page, axTree) {
    try {
      const headings = this.extractHeadings(axTree);

      // Analyze heading structure
      const levels = headings.map(h => h.level);
      const uniqueLevels = [...new Set(levels)].sort();

      // Check for skipped levels
      const skippedLevels = [];
      for (let i = 2; i <= 6; i++) {
        if (!levels.includes(i)) continue;

        const prevLevels = levels.filter(l => l < i);
        if (prevLevels.length === 0 && i > 1) {
          skippedLevels.push(i);
        }
      }

      // Check heading order
      const headingOrderIssues = this.checkHeadingOrder(headings);

      return {
        headings,
        levels: uniqueLevels,
        skippedLevels,
        orderIssues: headingOrderIssues,
        hasH1: levels.includes(1),
        totalCount: headings.length,
        score: this.calculateHeadingScore(headings, skippedLevels, headingOrderIssues)
      };
    } catch (error) {
      return {
        error: error.message,
        headings: [],
        levels: [],
        skippedLevels: [],
        orderIssues: [],
        hasH1: false,
        totalCount: 0,
        score: 0
      };
    }
  }

  /**
   * Extract headings from accessibility tree
   * @param {Object} axTree
   * @param {Array} result
   * @returns {Array}
   */
  extractHeadings(axTree, result = []) {
    if (!axTree) return result;

    // Check if this node is a heading
    if (axTree.role === 'heading' && axTree.level) {
      result.push({
        level: axTree.level,
        name: axTree.name,
        text: axTree.name || ''
      });
    }

    // Recursively check children
    if (axTree.children) {
      axTree.children.forEach(child => this.extractHeadings(child, result));
    }

    return result;
  }

  /**
   * Check heading order issues
   * @param {Array} headings
   * @returns {Array}
   */
  checkHeadingOrder(headings) {
    const issues = [];

    for (let i = 1; i < headings.length; i++) {
      const current = headings[i];
      const previous = headings[i - 1];

      // Check for level skips (more than 1 level increase)
      if (current.level > previous.level + 1) {
        issues.push({
          type: 'level-skip',
          index: i,
          from: previous.level,
          to: current.level,
          description: `Heading level skips from ${previous.level} to ${current.level}`
        });
      }
    }

    return issues;
  }

  /**
   * Calculate landmark score (0-100)
   * @param {Array} landmarks
   * @param {Array} missing
   * @param {Array} issues
   * @returns {number}
   */
  calculateLandmarkScore(landmarks, missing, issues) {
    let score = 100;

    // Deduct for missing required landmarks
    score -= missing.length * 20;

    // Deduct for landmark issues
    score -= issues.length * 10;

    // Bonus for having many landmarks (indicates good structure)
    if (landmarks.length >= 3) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate heading score (0-100)
   * @param {Array} headings
   * @param {Array} skippedLevels
   * @param {Array} orderIssues
   * @returns {number}
   */
  calculateHeadingScore(headings, skippedLevels, orderIssues) {
    let score = 100;

    // Require at least one H1
    if (!headings.some(h => h.level === 1)) score -= 30;

    // Deduct for order issues
    score -= orderIssues.length * 15;

    // Deduct for skipped levels
    score -= skippedLevels.length * 10;

    // Bonus for good heading hierarchy
    if (headings.length >= 3 && orderIssues.length === 0) score += 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate overall summary
   * @param {Object} results
   * @returns {Object}
   */
  generateSummary(results) {
    const issues = [];
    let totalScore = 0;
    let componentCount = 0;

    // Language check
    if (results.language) {
      componentCount++;
      if (!results.language.hasDeclaration) {
        issues.push('missing-language');
      } else {
        totalScore += results.language.validFormat ? 100 : 50;
      }
    }

    // Landmark check
    if (results.landmarks) {
      componentCount++;
      totalScore += results.landmarks.score;
      if (results.landmarks.missing.length > 0) {
        issues.push('missing-landmarks');
      }
      if (results.landmarks.issues.length > 0) {
        issues.push('landmark-issues');
      }
    }

    // Heading check
    if (results.headings) {
      componentCount++;
      totalScore += results.headings.score;
      if (!results.headings.hasH1) {
        issues.push('missing-h1');
      }
      if (results.headings.orderIssues.length > 0) {
        issues.push('heading-order-issues');
      }
    }

    return {
      overallScore: componentCount > 0 ? Math.round(totalScore / componentCount) : 0,
      issues,
      issueCount: issues.length,
      components: componentCount
    };
  }

  getDescription() {
    return 'Analyzes accessibility tree structure, landmarks, and heading hierarchy';
  }

  getPriority() {
    return 4; // Medium priority
  }
}

module.exports = AccessibilityTreeChecker;
