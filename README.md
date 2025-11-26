# Enhanced Accessibility Testing Framework v2.0.0

一个强大的、无障碍性自动化测试框架，具有模块化架构、改进的错误处理和丰富的报告功能。

## 🚀 特性

- **模块化架构**：可扩展的检查器、报告器和配置系统
- **并发执行**：支持多页面并发测试，提高效率
- **智能重试**：自动重试失败的操作，提高稳定性
- **丰富报告**：HTML、JSON等多种格式的详细报告
- **额外检查**：除了axe-core外，还包括颜色对比度、键盘焦点、缩放等检查
- **CLI界面**：友好的命令行界面，支持多种配置选项
- **环境变量支持**：灵活的配置管理

## 📦 安装

```bash
npm install
```

## 🏗️ 架构

```
src/
├── config/           # 配置管理
├── core/            # 核心引擎
│   ├── testEngine.js    # 主测试引擎
│   ├── axeScanner.js    # Axe扫描器
│   └── appManager.js    # 应用管理器
├── checkers/        # 检查器模块
│   ├── baseChecker.js          # 基础检查器
│   ├── colorContrastChecker.js # 颜色对比度
│   ├── keyboardFocusChecker.js # 键盘焦点
│   ├── zoomChecker.js          # 缩放测试
│   └── accessibilityTreeChecker.js # 可访问性树
├── reporters/       # 报告生成器
│   ├── baseReporter.js    # 基础报告器
│   ├── htmlReporter.js    # HTML报告
│   └── jsonReporter.js    # JSON报告
└── utils/           # 工具函数
    ├── logger.js       # 日志工具
    ├── asyncUtils.js   # 异步工具
    └── fileUtils.js    # 文件工具
```

## 🚀 使用方法

### 基本用法

```bash
# 运行完整测试套件
npm start

# 或直接运行
node src/index.js
```

### 命令行选项

```bash
Usage: a11y-test [options]

Options:
  -c, --config <file>        配置文件路径
  -p, --pages <file>         页面配置文件路径
  -o, --output <dir>         输出目录
  -f, --format <formats>     报告格式 (comma-separated) (default: "html,json")
  -v, --verbose              详细日志
  --debug                    调试模式
  --dry-run                  仅验证配置，不运行测试
  --sequential               顺序运行测试 (默认: 并发)
  --continue-on-error        即使单个页面失败也继续测试
  --no-reports               跳过报告生成
  --no-extra-checks          跳过额外可访问性检查
  --timeout <ms>             操作超时时间
  --concurrency <n>          最大并发操作数 (default: 3)
  -h, --help                 显示帮助信息
  -V, --version              显示版本信息
```

### 示例

```bash
# 调试模式运行
node src/index.js --debug --verbose

# 仅验证配置
node src/index.js --dry-run

# 自定义输出目录
node src/index.js --output ./my-reports

# 仅生成JSON报告
node src/index.js --format json

# 顺序执行，遇到错误继续
node src/index.js --sequential --continue-on-error
```

## ⚙️ 配置

### 环境变量

```bash
# 应用配置
export A11Y_EXE_PATH="C:\Program Files\Lenovo\Smart Meeting\Lenovo Smart Meeting.exe"
export A11Y_REPORT_DIR="./custom-reports"
export A11Y_PROCESS_NAME="Lenovo Smart Meeting.exe"

# 测试配置
export A11Y_MAX_CONCURRENCY=2
export A11Y_RETRY_ATTEMPTS=3
export A11Y_WAIT_TIMEOUT=5000
export A11Y_TIMEOUT=120000

# 调试和日志
export A11Y_DEBUG=true
export A11Y_LOG_FILE="a11y-test.log"

# 截图配置
export A11Y_SCREENSHOTS_DIR="a11y-issues/custom-screenshots"
```

### 配置文件

创建 `a11y-config.json`:

```json
{
  "exePath": "C:\\Program Files\\Lenovo\\Smart Meeting\\Lenovo Smart Meeting.exe",
  "reportDir": "axe-reports",
  "processName": "Lenovo Smart Meeting.exe",
  "timeout": 60000,
  "maxConcurrency": 3,
  "retryAttempts": 2,
  "debug": false,
  "axeOptions": {
    "rules": {},
    "runOnly": []
  }
}
```

### 页面配置

创建 `pages-config.json`:

```json
{
  "pages": [
    {
      "name": "首页",
      "selector": "a[href=\"#/main\"]",
      "options": {
        "timeout": 10000,
        "waitForNavigation": true
      }
    },
    {
      "name": "历史记录",
      "selector": "a[href=\"#/historyList\"]",
      "options": {
        "timeout": 15000
      }
    },
    {
      "name": "如何使用",
      "selector": "button[aria-label*=\"how to use\"]",
      "options": {
        "timeout": 8000
      }
    }
  ]
}
```

## 🔍 检查器

框架包含以下检查器：

### 1. Axe Core 检查器
- 运行完整的axe-core规则集
- 支持自定义规则配置
- 生成详细的违规报告

### 2. 颜色对比度检查器
- 检查文本和背景的对比度
- 支持WCAG AA标准验证
- 识别对比度不足的问题

### 3. 键盘焦点检查器
- 测试键盘导航功能
- 检查焦点指示器的可见性
- 验证焦点顺序的正确性

### 4. 缩放检查器
- 测试不同缩放级别下的布局
- 检查响应式设计
- 验证200%缩放支持（WCAG要求）

### 5. 可访问性树检查器
- 分析可访问性树结构
- 检查地标角色的使用
- 验证标题层次结构

## 📊 报告

### HTML报告
- 完整的axe-core HTML报告
- 增强的可视化界面
- 包含额外检查的结果

### JSON报告
- 结构化的测试数据
- 统计信息和摘要
- 适合程序化处理

### 报告特性
- 实时生成
- 详细的错误信息
- 截图支持
- 性能指标

## 🔧 开发

### 添加新的检查器

1. 继承 `BaseChecker` 类：

```javascript
const BaseChecker = require('./baseChecker');

class MyCustomChecker extends BaseChecker {
  async executeCheck(page, pageName, options) {
    // 实现检查逻辑
    return {
      // 检查结果
    };
  }

  getDescription() {
    return 'My custom accessibility checker';
  }

  getPriority() {
    return 5; // 优先级 (1-10, 1最高)
  }
}

module.exports = MyCustomChecker;
```

2. 在 `CheckerManager` 中注册：

```javascript
// 在 src/checkers/checkerManager.js 中添加
const MyCustomChecker = require('./myCustomChecker');

// 在 initializeCheckers() 方法中添加
return [
  // ... 其他检查器
  new MyCustomChecker(this.config),
];
```

### 添加新的报告器

1. 继承 `BaseReporter` 类：

```javascript
const BaseReporter = require('./baseReporter');

class MyCustomReporter extends BaseReporter {
  async generateReport(data, options) {
    // 生成报告逻辑
    const reportContent = this.buildReport(data);

    const filePath = await this.saveToFile(reportContent, 'report.xml', 'reports/');

    return {
      success: true,
      filePath,
      format: this.getFormat()
    };
  }

  buildReport(data) {
    // 构建报告内容
    return '<xml>...</xml>';
  }

  getFormat() {
    return 'xml';
  }

  getExtensions() {
    return ['.xml'];
  }

  getDescription() {
    return 'XML accessibility report generator';
  }
}

module.exports = MyCustomReporter;
```

## 🔄 迁移指南

从v1.0升级到v2.0：

1. **备份现有配置**：保存 `test_exe.js` 和相关配置文件

2. **更新依赖**：
   ```bash
   npm install commander
   ```

3. **迁移配置**：
   - 将硬编码的配置移至环境变量或配置文件
   - 更新页面选择器配置格式

4. **更新脚本**：
   - 将 `node test_exe.js` 改为 `npm start` 或 `node src/index.js`

5. **测试迁移**：
   ```bash
   node src/index.js --dry-run
   ```

## 📈 性能优化

- **并发执行**：默认支持3个并发操作
- **智能等待**：基于页面就绪状态的等待机制
- **资源缓存**：重复使用的资源缓存
- **失败重试**：自动重试失败的操作

## 🐛 调试

启用调试模式获取详细日志：

```bash
node src/index.js --debug --verbose
```

日志文件默认保存为 `a11y-test.log`。

## 🤝 贡献

欢迎提交问题和改进建议！

## 📄 许可证

ISC License
