const fs = require('fs');
const path = require('path');

const reportsDir = path.join(__dirname, '..', 'axe-reports');
const outDir = path.join(__dirname, '..', 'a11y-issues');

function findLatestExtra() {
  const files = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('report-multipage-extra-') && f.endsWith('.json'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(reportsDir, f)).mtimeMs }))
    .sort((a,b) => b.mtime - a.mtime);
  return files.length ? path.join(reportsDir, files[0].name) : null;
}

function safeFilename(name) {
  return name.replace(/[^a-z0-9\-_.]/gi, '_').slice(0, 240);
}

function severityFromType(type) {
  if (!type) return 'Moderate';
  const t = type.toLowerCase();
  if (t.includes('critical')) return 'Critical';
  if (t.includes('serious')) return 'Serious';
  return 'Moderate';
}

function buildIssuesFromJSON(json) {
  const issues = [];
  const pages = json.pages || [];
  pages.forEach(page => {
    const pageName = page.page || 'Unknown';

    // Contrast: incomplete nodes indicate problems (unable to evaluate or failing)
    const contrast = page.contrast || {};
    (contrast.incomplete || []).forEach(rule => {
      (rule.nodes || []).forEach(node => {
        const target = (node.target && node.target[0]) || '';
        const html = node.html || '';
        const summary = `[Contrast][${pageName}] ${rule.id || 'color-contrast'} issue`;
        const desc = `Page: ${pageName}\nRule: ${rule.id || 'color-contrast'}\nReason: ${node.failureSummary || (node.any && node.any[0] && node.any[0].message) || 'contrast issue'}\nSelector: ${target}\nHTML: ${html}`;
        issues.push({ summary, description: desc, steps: `导航到 ${pageName}，定位元素：${target}`, selector: target, page: pageName, severity: severityFromType(rule.impact || 'serious'), labels: 'contrast' });
      });
    });

    // If contrast.violations exist (rare here)
    (contrast.violations || []).forEach(rule => {
      (rule.nodes || []).forEach(node => {
        const target = (node.target && node.target[0]) || '';
        const html = node.html || '';
        const summary = `[Contrast][${pageName}] Violation: ${rule.id}`;
        const desc = `Page: ${pageName}\nRule: ${rule.id}\nMessage: ${node.any && node.any[0] && node.any[0].message}\nSelector: ${target}\nHTML: ${html}`;
        issues.push({ summary, description: desc, steps: `导航到 ${pageName}，定位元素：${target}`, selector: target, page: pageName, severity: severityFromType(rule.impact), labels: 'contrast' });
      });
    });

    // Accessibility tree: missing lang
    const ax = page.accessibilityTree || {};
    if (ax.lang === '') {
      const summary = `[Accessibility][${pageName}] Missing lang attribute`;
      const desc = `Page: ${pageName}\nDocument <html> element has no lang attribute (lang is empty).\nRecommendation: add <html lang="zh-CN"> or appropriate language.`;
      issues.push({ summary, description: desc, steps: `检查页面源代码，确保 <html> 有正确的 lang 属性。`, selector: 'html', page: pageName, severity: 'Serious', labels: 'lang' });
    }

    // Keyboard focus: find items in details with no outline or 'none' outlines
    const kf = page.keyboardFocus || {};
    (kf.details || []).forEach((d, idx) => {
      const outline = (d.outline || '').toLowerCase();
      if (outline.includes('none') || /0px/.test(outline) || outline.trim() === '') {
        const summary = `[Keyboard][${pageName}] Focusable element without visible focus outline`;
        const desc = `Page: ${pageName}\nTag: ${d.tag}\nRole: ${d.role || ''}\nAria: ${d.aria || ''}\nText: ${d.text || ''}\nComputed outline: ${d.outline || 'none'}\nRecommendation: provide a clear :focus-visible style (outline or box-shadow) with sufficient contrast.`;
        issues.push({ summary, description: desc, steps: `使用键盘 Tab 导航到该控件，观察是否有清晰焦点样式。`, selector: '', page: pageName, severity: 'Moderate', labels: 'keyboard,focus' });
      }
    });

    // Zoom check
    const zoom = page.zoom || {};
    if (zoom.ok === false) {
      const summary = `[Zoom][${pageName}] Page layout overflows at 200% zoom`;
      const desc = `Page: ${pageName}\nscrollWidth: ${zoom.scrollWidth}, innerWidth: ${zoom.innerWidth}\nResult: content overflows viewport at 200% zoom. Recommendation: ensure responsive layout, avoid fixed-width containers, test at 200-400% zoom.`;
      issues.push({ summary, description: desc, steps: `打开页面并将缩放设为 200%（或使用系统放大镜），检查是否出现横向滚动或内容裁切。`, selector: '', page: pageName, severity: 'Moderate', labels: 'zoom,responsive' });
    }

  });
  return issues;
}

function writeOutputs(issues) {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const csvPath = path.join(outDir, 'a11y-issues.csv');
  const mdDir = path.join(outDir, 'md');
  if (!fs.existsSync(mdDir)) fs.mkdirSync(mdDir);

  const csvHeader = ['Summary','Description','Steps','Selector','Page','Severity','Labels'].join(',') + '\n';
  const csvRows = issues.map(it => {
    const esc = s => '"' + (String(s || '').replace(/"/g, '""')) + '"';
    return [esc(it.summary), esc(it.description), esc(it.steps), esc(it.selector), esc(it.page), esc(it.severity), esc(it.labels)].join(',');
  }).join('\n');
  fs.writeFileSync(csvPath, csvHeader + csvRows, 'utf8');

  issues.forEach((it, i) => {
    const fname = path.join(mdDir, `${String(i+1).padStart(2,'0')}_${safeFilename(it.summary)}.md`);
    const content = `# ${it.summary}\n\n**页面**: ${it.page}\n\n**优先级**: ${it.severity}\n\n**标签**: ${it.labels}\n\n**问题描述**:\n\n${it.description}\n\n**复现步骤**:\n\n${it.steps}\n\n**定位 Selector**: ${it.selector || '（无）'}\n`;
    fs.writeFileSync(fname, content, 'utf8');
  });

  return { csv: csvPath, mdFolder: mdDir };
}

(function main(){
  const jsonPath = findLatestExtra();
  if (!jsonPath) {
    console.error('No extra report JSON found in axe-reports.');
    process.exit(1);
  }
  console.log('Using JSON:', jsonPath);
  const content = fs.readFileSync(jsonPath, 'utf8');
  const json = JSON.parse(content);
  const issues = buildIssuesFromJSON(json);
  const out = writeOutputs(issues);
  console.log('Generated', issues.length, 'issues.');
  console.log('CSV:', out.csv);
  console.log('Markdown folder:', out.mdFolder);
})();
