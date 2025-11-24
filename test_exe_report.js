const { _electron: electron } = require('playwright');
const { createHtmlReport } = require('axe-html-reporter');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const axeCore = require('axe-core'); // 直接引入 axe-core 源文件

// -------------------------------------------------------
// 配置区域
// -------------------------------------------------------

const CONFIG = {
  // 你的 exe 路径
  exePath: path.join('C:', 'Program Files', 'Lenovo', 'Smart Meeting', 'Lenovo Smart Meeting.exe'),
  // 报告输出目录
  reportDir: 'axe-reports',
  // 进程名称
  processName: 'Lenovo Smart Meeting.exe'
};

//  定义要巡检的页面列表
// name: 在报告中显示的页面名称
// selector: 用于导航到该页面的、唯一的 CSS 选择器
const pagesToScan = [
  { name: '首页', selector: 'a[href="#/main"]' },
  { name: '历史记录', selector: 'a[href="#/historyList"]' },
  { name: '如何使用', selector: 'button[aria-label*="how to use"]' },
  { name: '用户中心', selector: 'button[aria-label*="user center"]' }
];

// -------------------------------------------------------
//  辅助函数
// -------------------------------------------------------

/**
 * 核心扫描函数
 * @param {import('playwright').Page} page Playwright 的页面对象
 * @param {string} pageName 当前页面的名称
 * @returns {Promise<import('axe-core').AxeResults>}
 */
async function scanPage(page, pageName) {
  console.log(`\n---\n开始扫描页面: [${pageName}]...`);
  
  // 等待页面稳定
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000); // 硬等待，确保动态内容加载

  // 注入 axe 脚本 (如果尚未注入)
  const isAxeInjected = await page.evaluate(() => window.axe !== undefined);
  if (!isAxeInjected) {
    console.log('首次注入 axe-core 脚本...');
    await page.evaluate((source) => {
      const script = document.createElement('script');
      script.textContent = source;
      document.head.appendChild(script);
    }, axeCore.source);
  }

  // 执行扫描
  const results = await page.evaluate(async (context) => {
    return await window.axe.run(document, {
      // 可选：在这里配置 axe，例如排除某些元素
      // rules: { ... }
    });
  }, { pageName }); // 传递上下文，虽然这里没直接用，但可用于调试

  console.log(`页面 [${pageName}] 扫描完成，发现 ${results.violations.length} 个问题。`);
  
  // 为报告添加页面信息
  results.url = pageName; // 使用页面名称作为标识
  return results;
}


// -------------------------------------------------------
//  主执行流程
// -------------------------------------------------------

(async () => {
  // 1. 清理旧进程
  console.log(`正在清理旧进程...`);
  try {
    execSync(`taskkill /F /IM "${CONFIG.processName}"`, { stdio: 'ignore' });
    console.log('旧进程已清理');
  } catch (e) {
    console.log('无需清理 (进程不存在)');
  }
  await new Promise(r => setTimeout(r, 1000));

  // 2. 启动应用
  console.log('正在启动客户端...');
  const electronApp = await electron.launch({
    executablePath: CONFIG.exePath,
    timeout: 60000,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const allResults = [];
  let window;

  try {
    // 3. 获取窗口并开始巡检
    window = await electronApp.firstWindow();
    console.log(`成功连接窗口: "${await window.title()}"`);

    for (const page of pagesToScan) {
      try {
        console.log(`\n正在导航到页面: [${page.name}]...`);
        const navElement = window.locator(page.selector);
        await navElement.click();
        
        const results = await scanPage(window, page.name);
        allResults.push(results);
        
      } catch (navError) {
        console.error(`导航或扫描页面 [${page.name}] 失败:`, navError.message);
        console.error(`   使用的选择器: ${page.selector}`);
        // 可选：在这里添加截图逻辑以帮助调试
        // await window.screenshot({ path: `error_${page.name}.png` });
      }
    }

    // 4. 手动合并所有页面的结果
    const aggregatedResults = {
      violations: [],
      passes: [],
      incomplete: [],
      inapplicable: [],
    };

    allResults.forEach(results => {
      aggregatedResults.violations = aggregatedResults.violations.concat(results.violations);
      aggregatedResults.passes = aggregatedResults.passes.concat(results.passes);
      aggregatedResults.incomplete = aggregatedResults.incomplete.concat(results.incomplete);
      aggregatedResults.inapplicable = aggregatedResults.inapplicable.concat(results.inapplicable);
    });
    
    // 5. 生成统一报告
    console.log('\n\n所有页面巡检完毕，正在生成统一的 HTML 报告...');
    if (!fs.existsSync(CONFIG.reportDir)) fs.mkdirSync(CONFIG.reportDir);
    
    const reportName = `report-multipage-${Date.now()}.html`;
    createHtmlReport({
      results: aggregatedResults, // 传递合并后的结果
      options: {
        projectKey: 'Lenovo Smart Meeting (Multi-page)',
        outputDir: CONFIG.reportDir,
        reportFileName: reportName,
      }
    });
    
    console.log(`\n报告已生成! 请打开查看详情:`);
    console.log(` ${path.resolve(CONFIG.reportDir, reportName)}\n`);

  } catch (e) {
    console.error('发生严重错误:', e);
  } finally {
    // 5. 关闭应用
    console.log(' closing app');
    await electronApp.close();
  }
})();