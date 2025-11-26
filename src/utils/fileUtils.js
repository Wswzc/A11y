const fs = require('fs');
const path = require('path');

/**
 * File system utilities for Accessibility Testing Framework
 */
class FileUtils {
  /**
   * Ensure directory exists, create if not
   * @param {string} dirPath
   * @returns {boolean} Success status
   */
  ensureDir(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        return true;
      }
      return true;
    } catch (error) {
      console.error(`Failed to create directory ${dirPath}:`, error.message);
      return false;
    }
  }

  /**
   * Safe file write with backup
   * @param {string} filePath
   * @param {string} content
   * @param {string} encoding
   * @returns {boolean} Success status
   */
  safeWriteFile(filePath, content, encoding = 'utf8') {
    try {
      const dir = path.dirname(filePath);
      this.ensureDir(dir);

      // Create backup if file exists
      if (fs.existsSync(filePath)) {
        const backupPath = `${filePath}.backup`;
        fs.copyFileSync(filePath, backupPath);
      }

      fs.writeFileSync(filePath, content, encoding);
      return true;
    } catch (error) {
      console.error(`Failed to write file ${filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Safe JSON file write
   * @param {string} filePath
   * @param {any} data
   * @returns {boolean} Success status
   */
  safeWriteJson(filePath, data) {
    try {
      const content = JSON.stringify(data, null, 2);
      return this.safeWriteFile(filePath, content);
    } catch (error) {
      console.error(`Failed to write JSON file ${filePath}:`, error.message);
      return false;
    }
  }

  /**
   * Safe JSON file read
   * @param {string} filePath
   * @param {any} defaultValue
   * @returns {any} Parsed data or default value
   */
  safeReadJson(filePath, defaultValue = null) {
    try {
      if (!fs.existsSync(filePath)) {
        return defaultValue;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Failed to read JSON file ${filePath}:`, error.message);
      return defaultValue;
    }
  }

  /**
   * Generate unique filename with timestamp
   * @param {string} baseName
   * @param {string} extension
   * @returns {string}
   */
  generateUniqueFilename(baseName, extension = '') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${baseName}-${timestamp}-${random}${extension}`;
  }

  /**
   * Clean old files in directory
   * @param {string} dirPath
   * @param {number} maxAgeMs
   * @param {Array<string>} excludePatterns
   */
  cleanOldFiles(dirPath, maxAgeMs = 7 * 24 * 60 * 60 * 1000, excludePatterns = []) {
    try {
      if (!fs.existsSync(dirPath)) return;

      const files = fs.readdirSync(dirPath);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(dirPath, file);

        // Check if file should be excluded
        if (excludePatterns.some(pattern => file.includes(pattern))) {
          continue;
        }

        try {
          const stats = fs.statSync(filePath);
          const age = now - stats.mtime.getTime();

          if (age > maxAgeMs) {
            fs.unlinkSync(filePath);
            console.log(`Cleaned old file: ${file}`);
          }
        } catch (error) {
          console.warn(`Failed to check/clean file ${file}:`, error.message);
        }
      }
    } catch (error) {
      console.error(`Failed to clean directory ${dirPath}:`, error.message);
    }
  }

  /**
   * Get file size in human readable format
   * @param {string} filePath
   * @returns {string}
   */
  getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const bytes = stats.size;

      const units = ['B', 'KB', 'MB', 'GB'];
      let size = bytes;
      let unitIndex = 0;

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
      }

      return `${size.toFixed(1)} ${units[unitIndex]}`;
    } catch (error) {
      return 'Unknown';
    }
  }

  /**
   * List files with filtering
   * @param {string} dirPath
   * @param {Object} options
   * @returns {Array<Object>}
   */
  listFiles(dirPath, options = {}) {
    const {
      extensions = [],
      includeStats = false,
      recursive = false,
      filter = () => true
    } = options;

    try {
      if (!fs.existsSync(dirPath)) return [];

      const results = [];
      const items = fs.readdirSync(dirPath);

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);

        if (stats.isDirectory()) {
          if (recursive) {
            results.push(...this.listFiles(itemPath, options));
          }
          continue;
        }

        if (stats.isFile()) {
          // Check extension filter
          if (extensions.length > 0) {
            const ext = path.extname(item).toLowerCase();
            if (!extensions.includes(ext)) continue;
          }

          // Apply custom filter
          if (!filter(item, stats)) continue;

          const fileInfo = {
            name: item,
            path: itemPath,
            size: stats.size,
            modified: stats.mtime
          };

          if (includeStats) {
            fileInfo.stats = stats;
          }

          results.push(fileInfo);
        }
      }

      return results;
    } catch (error) {
      console.error(`Failed to list files in ${dirPath}:`, error.message);
      return [];
    }
  }
}

module.exports = new FileUtils();
