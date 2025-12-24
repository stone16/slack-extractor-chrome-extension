# Contributing to Slack Channel Extractor

**[English](#english)** | **[中文](#中文)**

---

## English

Thank you for your interest in contributing to Slack Channel Extractor! This document provides guidelines for contributing to the project.

### How to Contribute

#### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title**: Descriptive summary of the issue
- **Steps to reproduce**: Detailed steps to reproduce the behavior
- **Expected behavior**: What you expected to happen
- **Actual behavior**: What actually happened
- **Environment**:
  - Chrome version
  - Operating system
  - Extension version
- **Screenshots**: If applicable
- **Console errors**: Any errors from Chrome DevTools console

#### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- **Clear title**: Descriptive summary of the enhancement
- **Use case**: Why this enhancement would be useful
- **Proposed solution**: How you envision this working
- **Alternatives considered**: Any alternative solutions you've thought about

#### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes**:
   - Follow the existing code style
   - Add comments for complex logic
   - Test your changes thoroughly
3. **Update documentation** if needed (README, comments)
4. **Commit your changes**:
   - Use clear, descriptive commit messages
   - Reference issues if applicable (e.g., "Fix #123")
5. **Submit the pull request**:
   - Provide a clear description of the changes
   - Link related issues

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/slack-extractor-chrome-extension.git
cd slack-extractor-chrome-extension/slack-channel-extractor

# Generate icons
python3 generate_icons.py

# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select the slack-channel-extractor folder
```

### Code Style Guidelines

#### JavaScript

- Use ES6+ features (const/let, arrow functions, async/await)
- Use meaningful variable and function names
- Add JSDoc comments for complex functions
- Keep functions focused and single-purpose
- Use consistent indentation (2 spaces)

Example:
```javascript
/**
 * Extract messages from visible DOM elements
 * @returns {Object} Statistics about extraction
 */
extractVisibleMessages() {
  // Implementation
}
```

#### File Organization

- `background/`: Service worker for data persistence
- `content/`: Content script that runs on Slack pages
- `popup/`: Extension popup UI (HTML/CSS/JS)
- `icons/`: Extension icons

#### Comments

- Add comments for non-obvious logic
- Explain the "why", not just the "what"
- Use TODO comments for known issues or future improvements

### Testing Guidelines

Before submitting a pull request:

1. **Test basic functionality**:
   - Extension loads without errors
   - Message extraction works on different channel types
   - Export functions work correctly
   - Settings persist across sessions

2. **Test edge cases**:
   - Very large channels (10,000+ messages)
   - Channels with many threads
   - Empty channels
   - Channels with special characters in names

3. **Test on different environments**:
   - Different Chrome versions if possible
   - Different Slack workspace types

4. **Check browser console**:
   - No JavaScript errors
   - No warning messages

### Security Considerations

When contributing, please ensure:

- **No credentials**: Never commit API keys, tokens, or passwords
- **No external calls**: Keep all processing local
- **Privacy respect**: Don't collect user data
- **Safe DOM manipulation**: Avoid XSS vulnerabilities
- **Input validation**: Validate user inputs

### Questions?

If you have questions about contributing:

- Open a GitHub Discussion
- Ask in an issue
- Review existing pull requests for examples

Thank you for contributing!

---

## 中文

感谢你对 Slack 频道消息提取器项目的关注！本文档提供贡献指南。

### 如何贡献

#### 报告 Bug

在创建 bug 报告之前，请检查现有 issue 以避免重复。创建 bug 报告时，请包含：

- **清晰的标题**：问题的描述性摘要
- **重现步骤**：重现行为的详细步骤
- **预期行为**：你期望发生什么
- **实际行为**：实际发生了什么
- **环境信息**：
  - Chrome 版本
  - 操作系统
  - 扩展版本
- **截图**：如果适用
- **控制台错误**：Chrome DevTools 控制台中的任何错误

#### 功能建议

功能建议通过 GitHub issues 跟踪。创建功能建议时，请包含：

- **清晰的标题**：功能增强的描述性摘要
- **使用场景**：为什么这个增强会有用
- **建议方案**：你设想这如何工作
- **备选方案**：你考虑过的任何替代解决方案

#### Pull Request

1. **Fork 仓库**并从 `main` 创建你的分支
2. **进行更改**：
   - 遵循现有代码风格
   - 为复杂逻辑添加注释
   - 彻底测试你的更改
3. **更新文档**（如需要）（README、注释）
4. **提交更改**：
   - 使用清晰、描述性的提交消息
   - 引用相关 issue（例如："Fix #123"）
5. **提交 pull request**：
   - 提供更改的清晰描述
   - 链接相关 issue

### 开发设置

```bash
# 克隆你的 fork
git clone https://github.com/YOUR_USERNAME/slack-extractor-chrome-extension.git
cd slack-extractor-chrome-extension/slack-channel-extractor

# 生成图标
python3 generate_icons.py

# 在 Chrome 中加载扩展
# 1. 打开 chrome://extensions/
# 2. 启用"开发者模式"
# 3. 点击"加载已解压的扩展程序"
# 4. 选择 slack-channel-extractor 文件夹
```

### 代码风格指南

#### JavaScript

- 使用 ES6+ 特性（const/let、箭头函数、async/await）
- 使用有意义的变量和函数名
- 为复杂函数添加 JSDoc 注释
- 保持函数专注和单一职责
- 使用一致的缩进（2 个空格）

示例：
```javascript
/**
 * 从可见 DOM 元素中提取消息
 * @returns {Object} 提取统计信息
 */
extractVisibleMessages() {
  // 实现
}
```

#### 文件组织

- `background/`：用于数据持久化的 service worker
- `content/`：在 Slack 页面上运行的 content script
- `popup/`：扩展弹出窗口 UI（HTML/CSS/JS）
- `icons/`：扩展图标

#### 注释

- 为不明显的逻辑添加注释
- 解释"为什么"，而不仅仅是"什么"
- 为已知问题或未来改进使用 TODO 注释

### 测试指南

提交 pull request 之前：

1. **测试基本功能**：
   - 扩展加载无错误
   - 消息提取在不同频道类型上工作
   - 导出功能正常工作
   - 设置在会话间持久化

2. **测试边缘情况**：
   - 非常大的频道（10,000+ 消息）
   - 有很多会话串的频道
   - 空频道
   - 名称中有特殊字符的频道

3. **在不同环境测试**：
   - 如果可能，在不同的 Chrome 版本上
   - 不同的 Slack 工作区类型

4. **检查浏览器控制台**：
   - 无 JavaScript 错误
   - 无警告消息

### 安全考虑

贡献时，请确保：

- **无凭据**：永远不要提交 API 密钥、令牌或密码
- **无外部调用**：保持所有处理都在本地
- **尊重隐私**：不收集用户数据
- **安全的 DOM 操作**：避免 XSS 漏洞
- **输入验证**：验证用户输入

### 有疑问？

如果你对贡献有疑问：

- 开启 GitHub Discussion
- 在 issue 中询问
- 查看现有 pull requests 作为示例

感谢你的贡献！
