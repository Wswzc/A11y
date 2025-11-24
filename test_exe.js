/* 
  A11y 检测机制与方法概述（插入于文件顶部，供维护者参考）：
  - 启动与连接：
    使用 Playwright 的 _electron.launch 启动目标 exe 并获取第一个窗口（firstWindow）。
  - 页面导航与稳定性：
    使用提供的 selector 点击导航元素，等待 domcontentloaded 并做短暂硬等待以确保动态内容加载完毕。
  - axe 注入与运行：
    检查 window.axe 是否存在；若无则把 axe-core.source 注入到 document.head；
    通过 window.axe.run(document, options) 执行无障碍规则集，收集 violations/passes 等。
  - 额外自动化检查（补充 axe）：
    1) color-contrast：通过 axe 的 runOnly 指定 'color-contrast' 规则快速检测对比度问题。
    2) accessibility snapshot：使用 Playwright 的 page.accessibility.snapshot() 获取无障碍树并检查 lang。
    3) 键盘与焦点检查：在页面内遍历交互元素（a, button, input, textarea, select, [role="button"], [tabindex]），尝试 focus 并读取 getComputedStyle 的 outline/boxShadow 来判断焦点可见性，记录 selector、文本和焦点状态，标记潜在问题。
    4) zoom 检查：临时设置 document.body.style.zoom = '2' 检查是否发生横向溢出（scrollWidth > innerWidth）。
  - 问题证据与截图：
    对于没有明显焦点样式的问题元素，优先使用 locator.screenshot(selector) 保存局部截图，失败则回退到 page.screenshot 保存整页图片，图片保存在 a11y-issues/screenshots。
  - 报告与聚合：
    将每个页面的 axe 结果收集并合并（violations/passes/incomplete/inapplicable），使用 axe-html-reporter 生成统一 HTML 报告；把额外检查结果写为 JSON 以便离线分析。
  - 容错与调试：
    所有网络/DOM 操作均包裹 try/catch，遇到导航或扫描失败时记录 selector 与错误信息；对关键操作设置超时与等待以兼容动态渲染场景。
  - 可扩展点建议：
    * 将 axe.run 的配置外置为可配置项（允许按项目打开/关闭规则）。
    * 增加更多自动化检测规则（例如跳过视觉依赖的控件，或加入 ARIA 结构一致性检查）。
    * 在截图时增加元素坐标裁剪以减少存储与定位成本。
*/

const { _electron: electron } = require('playwright');
const { createHtmlReport } = require('axe-html-reporter');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');
const axeCore = require('axe-core'); // 直接引入 axe-core 源文件

// -------------------------------------------------------
//  配置区域
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
  console.log(`\n---\n 开始扫描页面: [${pageName}]...`);
  
  // 等待页面稳定
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000); // 硬等待，确保动态内容加载

  // 注入 axe 脚本 (如果尚未注入)
  const isAxeInjected = await page.evaluate(() => window.axe !== undefined);
  if (!isAxeInjected) {
    console.log(' 首次注入 axe-core 脚本...');
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

  console.log(` 页面 [${pageName}] 扫描完成，发现 ${results.violations.length} 个问题。`);
  
  // 为报告添加页面信息
  results.url = pageName; // 使用页面名称作为标识
  return results;
}

// --------------------
// 额外自动化检查集合
// --------------------

/**
 * 运行 color-contrast 规则（axe）并返回违例列表
 */
async function runContrastCheck(page) {
  try {
    const contrast = await page.evaluate(async () => {
      if (!window.axe) return { error: 'axe not injected' };
      return await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
    });
    return contrast;
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 使用 Playwright 的 accessibility snapshot 检查关键可访问节点及 lang
 */
async function runAXTreeChecks(page) {
  try {
    const ax = await page.accessibility.snapshot();
    const lang = await page.evaluate(() => document.documentElement.lang || '');
    // 简单检查是否包含常见地标
    const hasBanner = !!page.evaluate(() => !!document.querySelector('header'));
    return { snapshot: ax, lang };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 检查页面的键盘可达性与焦点样式
 */
async function runKeyboardAndFocusChecks(page) {
  try {
    // 在页面内收集交互元素，构建可定位的选择器，并尝试 focus，获取焦点可视样式
    const results = await page.evaluate(() => {
      function cssPath(el) {
        if (!el) return '';
        if (el.id) return `#${el.id}`;
        const parts = [];
        while (el && el.nodeType === 1 && el.tagName.toLowerCase() !== 'html') {
          let part = el.tagName.toLowerCase();
          if (el.className) {
            const cls = String(el.className).trim().split(/\s+/).join('.');
            if (cls) part += '.' + cls;
          }
          const parent = el.parentNode;
          if (parent) {
            const children = Array.from(parent.children).filter(c => c.tagName === el.tagName);
            if (children.length > 1) {
              const idx = Array.from(parent.children).indexOf(el) + 1;
              part += `:nth-child(${idx})`;
            }
          }
          parts.unshift(part);
          el = parent;
        }
        return parts.join(' > ');
      }

      const sel = 'a, button, input, textarea, select, [role="button"], [tabindex]';
      const els = Array.from(document.querySelectorAll(sel)).filter(e => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length));
      const out = [];
      els.forEach(el => {
        try {
          el.focus();
          const cs = window.getComputedStyle(el);
          out.push({
            tag: el.tagName,
            role: el.getAttribute('role') || null,
            aria: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || null,
            text: (el.innerText || '').trim().slice(0, 60),
            focused: document.activeElement === el,
            outline: cs.outline || cs.boxShadow || null,
            selector: cssPath(el)
          });
        } catch (e) {
          out.push({ tag: el.tagName, error: e.message, selector: cssPath(el) });
        }
      });
      return out;
    });
    // 把没有明显 outline 的元素视为问题（聚合 selector）
    const problems = results.filter(r => r.focused && (!r.outline || r.outline === 'none' || /0px/.test(r.outline) || r.outline.trim() === ''));
    return { details: results, problems };
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 为每个无焦点样式的问题元素生成截图并保存
 */
async function saveFocusScreenshots(page, problems, pageName) {
  if (!problems || problems.length === 0) return [];
  const screenshotsDir = path.join('a11y-issues', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
  const saved = [];
  for (let i = 0; i < problems.length; i++) {
    const p = problems[i];
    const selector = p.selector || p.target || '';
    const safeName = `${pageName.replace(/[^a-z0-9]/gi,'_')}_${String(i+1).padStart(2,'0')}.png`;
    const outPath = path.join(screenshotsDir, safeName);
    try {
      if (selector) {
        // 尝试使用 locator.screenshot
        const locator = page.locator(selector).first();
        // 等待短暂以确保元素存在
        await locator.waitFor({ timeout: 1000 }).catch(() => {});
        await locator.screenshot({ path: outPath }).catch(async () => {
          // fallback: full page screenshot and crop not implemented — just save full page
          await page.screenshot({ path: outPath });
        });
      } else {
        // 没有 selector 的情况下保存全页截图
        await page.screenshot({ path: outPath });
      }
      saved.push(outPath);
    } catch (err) {
      try { await page.screenshot({ path: outPath }); saved.push(outPath); } catch(e) { /* ignore */ }
    }
  }
  return saved;
}

/**
 * 简单的放大测试：设置 zoom=200% 并检查是否出现横向溢出
 */
async function runZoomCheck(page) {
  try {
    const res = await page.evaluate(() => {
      const prev = document.body.style.zoom || '';
      document.body.style.zoom = '2';
      const scrollWidth = document.documentElement.scrollWidth;
      const innerWidth = window.innerWidth;
      // 恢复
      document.body.style.zoom = prev;
      return { scrollWidth, innerWidth, ok: scrollWidth <= innerWidth + 4 };
    });
    return res;
  } catch (e) {
    return { error: e.message };
  }
}

/**
 * 运行所有额外检查并返回聚合结果
 */
async function runExtraChecks(page, pageName) {
  const contrast = await runContrastCheck(page);
  const ax = await runAXTreeChecks(page);
  const kf = await runKeyboardAndFocusChecks(page);
  const zoom = await runZoomCheck(page);
  return { page: pageName, contrast, accessibilityTree: ax, keyboardFocus: kf, zoom };
}


// -------------------------------------------------------
//  主执行流程
// -------------------------------------------------------

(async () => {
  // 1. 清理旧进程
  console.log(` 正在清理旧进程...`);
  try {
    execSync(`taskkill /F /IM "${CONFIG.processName}"`, { stdio: 'ignore' });
    console.log(' 旧进程已清理');
  } catch (e) {
    console.log(' 无需清理 (进程不存在)');
  }
  await new Promise(r => setTimeout(r, 1000));

  // 2. 启动应用
  console.log(' 正在启动客户端...');
  const electronApp = await electron.launch({
    executablePath: CONFIG.exePath,
    timeout: 60000,
    args: ['--no-sandbox', '--disable-gpu']
  });

  const allResults = [];
  const extraResults = [];
  let window;

  try {
    // 3. 获取窗口并开始巡检
    window = await electronApp.firstWindow();
    console.log(` 成功连接窗口: "${await window.title()}"`);

    for (const page of pagesToScan) {
      try {
        console.log(`\n 正在导航到页面: [${page.name}]...`);
        const navElement = window.locator(page.selector);
        await navElement.click();
        
        const results = await scanPage(window, page.name);
        allResults.push(results);

        // 运行额外的自动化检查并收集结果
        try {
            const extra = await runExtraChecks(window, page.name);
            extraResults.push(extra);
            console.log(` 已完成额外检查: ${page.name}`);
            // 为键盘焦点问题生成截图
            try {
              const saved = await saveFocusScreenshots(window, extra.keyboardFocus && extra.keyboardFocus.problems, page.name);
              if (saved && saved.length) console.log(`📷 已为 ${page.name} 保存 ${saved.length} 张焦点问题截图（目录：a11y-issues/screenshots）`);
            } catch (ssErr) {
              console.warn(' 保存焦点截图失败:', ssErr.message);
            }
        } catch (exCheckErr) {
          console.warn(` 额外检查失败: ${page.name}`, exCheckErr.message);
        }
        
      } catch (navError) {
        console.error(` 导航或扫描页面 [${page.name}] 失败:`, navError.message);
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
    console.log('\n\n 所有页面巡检完毕，正在生成统一的 HTML 报告...');
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
    
    console.log(`\n 报告已生成! 请打开查看详情:`);
    console.log(` ${path.resolve(CONFIG.reportDir, reportName)}\n`);

    // 写入额外检查的 JSON 报告
    try {
      if (extraResults.length > 0) {
        const extraName = `report-multipage-extra-${Date.now()}.json`;
        const extraPath = path.join(CONFIG.reportDir, extraName);
        fs.writeFileSync(extraPath, JSON.stringify({ generated: Date.now(), pages: extraResults }, null, 2), 'utf8');
        console.log(` 额外检查 JSON 已保存: ${path.resolve(extraPath)}`);
      } else {
        console.log(' 未收集到额外检查结果，未生成 JSON 报告。');
      }
    } catch (writeErr) {
      console.error(' 写入额外检查 JSON 失败:', writeErr.message);
    }

  } catch (e) {
    console.error(' 发生严重错误:', e);
  } finally {
    // 5. 关闭应用
    console.log(' closing app');
    await electronApp.close();
  }
})();