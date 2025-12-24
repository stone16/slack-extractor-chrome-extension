/**
 * Slack Channel Extractor - Content Script
 * Extracts messages from Slack channels with human-like behavior
 */

class SlackExtractor {
  constructor() {
    this.messages = new Map(); // Use Map to avoid duplicates
    this.threads = new Map();
    this.users = new Set();
    this.pendingThreads = new Set(); // Threads with replies to extract
    this.extractedThreads = new Set(); // Threads already extracted
    this.threadQueue = []; // Queue of threads to extract immediately
    this.isRunning = false;
    this.isPaused = false;
    this.isCompleted = false;
    this.extractionPhase = 'idle'; // 'idle', 'scrolling', 'threads', 'completed'
    this.settings = {
      scrollDelay: 2, // Faster default for large channels
      includeThreads: true,
      autoSaveInterval: 100,
      timeRangeFrom: '',
      timeRangeTo: ''
    };
    this.lastSaveTime = null;
    this.lastSaveCount = 0;
    this.channelName = '';
    this.channelId = '';
    this.scrollProgress = 0;
    this.observer = null;
    this.activeTimeRange = null;
  }

  // Initialize extractor
  async init() {
    await this.loadState();
    this.detectChannel();
    this.setupMessageObserver();
    this.log('Extractor initialized', 'info');
  }

  // Get the date range of currently visible messages
  getVisibleDateRange() {
    const messageList = document.querySelector('.c-message_list');
    if (!messageList) return null;

    let messageElements = messageList.querySelectorAll('[data-qa="message_container"][data-msg-ts]');
    if (messageElements.length === 0) {
      messageElements = messageList.querySelectorAll('[data-msg-ts]');
    }

    if (messageElements.length === 0) return null;

    let oldestTs = null;
    let newestTs = null;

    messageElements.forEach(el => {
      const tsAttr = this.normalizeSlackTs(el.getAttribute('data-msg-ts'));
      if (!tsAttr) return;
      const tsNumber = this.parseSlackTimestamp(tsAttr);
      if (tsNumber === null) return;

      if (oldestTs === null || tsNumber < oldestTs) oldestTs = tsNumber;
      if (newestTs === null || tsNumber > newestTs) newestTs = tsNumber;
    });

    return oldestTs && newestTs ? { oldestTs, newestTs } : null;
  }

  // Quick jump to target date - scrolls fast without extracting
  async jumpToDate(targetTs, direction = 'down') {
    const scrollContainer = this.getScrollContainer();
    if (!scrollContainer) {
      this.log('Cannot find scroll container for jump', 'error');
      return false;
    }

    this.log(`Quick jumping ${direction} to reach target date...`, 'info');

    // Special case: jump to bottom (newest messages)
    if (direction === 'bottom') {
      return await this.jumpToBottom(scrollContainer);
    }

    const maxAttempts = 200; // Safety limit
    let attempts = 0;
    let lastVisibleRange = null;
    let noProgressCount = 0;

    while (attempts < maxAttempts && this.isRunning && !this.isPaused) {
      attempts++;

      // Check current visible range
      const visibleRange = this.getVisibleDateRange();
      if (!visibleRange) {
        await this.sleep(500);
        continue;
      }

      // Log progress every 10 attempts
      if (attempts % 10 === 0) {
        const visibleDate = new Date(visibleRange.newestTs * 1000).toLocaleDateString();
        const targetDate = new Date(targetTs * 1000).toLocaleDateString();
        this.log(`Jump progress: visible=${visibleDate}, target=${targetDate}, attempts=${attempts}`, 'info');
        this.sendJumpProgress(attempts, targetTs, visibleRange);
      }

      // Check if we've reached the target
      if (direction === 'down') {
        // Scrolling down (to newer messages)
        // Strategy: Overshoot PAST the target, then stop
        // This ensures we capture ALL messages up to and including the target date

        // If oldest visible is newer than target, we've overshot - perfect!
        // This means all messages at targetTs and older are now "above" us in the scroll
        if (visibleRange.oldestTs > targetTs) {
          this.log(`Overshot target (oldest visible: ${new Date(visibleRange.oldestTs * 1000).toLocaleDateString()}), ready to scroll up through range`, 'success');
          return true;
        }

        // Keep scrolling down until we overshoot
        if (visibleRange.newestTs < targetTs) {
          // Haven't reached target yet
          await this.scrollDown(scrollContainer, 800);
        } else if (visibleRange.oldestTs <= targetTs) {
          // Target is visible but we haven't overshot yet - keep going
          await this.scrollDown(scrollContainer, 400);
        } else {
          return true;
        }
      } else {
        // Scrolling up (to older messages) - for when target is older than visible
        if (visibleRange.oldestTs <= targetTs && targetTs <= visibleRange.newestTs) {
          this.log('Target date is now visible!', 'success');
          return true;
        }
        if (visibleRange.newestTs < targetTs) {
          this.log('Overshot target, scrolling forward...', 'info');
          await this.scrollDown(scrollContainer, 500);
          await this.sleep(300);
          return true;
        }
        if (visibleRange.oldestTs > targetTs) {
          await this.scrollUp(scrollContainer, 800);
        } else {
          return true;
        }
      }

      // Check for no progress (stuck)
      if (lastVisibleRange &&
          lastVisibleRange.oldestTs === visibleRange.oldestTs &&
          lastVisibleRange.newestTs === visibleRange.newestTs) {
        noProgressCount++;
        if (noProgressCount >= 5) {
          this.log('No progress during jump - may have reached channel boundary', 'warning');
          return true; // Continue with extraction anyway
        }
      } else {
        noProgressCount = 0;
      }
      lastVisibleRange = visibleRange;

      // Small delay to allow content loading
      await this.sleep(150);
    }

    this.log(`Jump completed after ${attempts} attempts`, 'info');
    return true;
  }

  // Jump to bottom of channel (newest messages)
  async jumpToBottom(scrollContainer) {
    this.log('Jumping to bottom (newest messages)...', 'info');

    const maxAttempts = 50;
    let attempts = 0;
    let lastScrollHeight = 0;
    let noProgressCount = 0;

    while (attempts < maxAttempts && this.isRunning && !this.isPaused) {
      attempts++;

      // Scroll to absolute bottom
      const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      scrollContainer.scrollTop = maxScroll;

      await this.sleep(200);

      // Check if we're at the bottom
      const currentMax = scrollContainer.scrollHeight - scrollContainer.clientHeight;
      const atBottom = scrollContainer.scrollTop >= currentMax - 10;

      if (atBottom && scrollContainer.scrollHeight === lastScrollHeight) {
        noProgressCount++;
        if (noProgressCount >= 3) {
          this.log('Reached bottom of channel', 'success');
          return true;
        }
      } else {
        noProgressCount = 0;
      }

      lastScrollHeight = scrollContainer.scrollHeight;

      if (attempts % 10 === 0) {
        this.log(`Jump to bottom progress: attempt ${attempts}`, 'info');
      }
    }

    this.log('Jump to bottom completed', 'info');
    return true;
  }

  // Scroll down (towards newer messages)
  async scrollDown(scrollContainer, amount) {
    const startTop = scrollContainer.scrollTop;
    const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
    const targetTop = Math.min(maxScroll, startTop + amount);
    scrollContainer.scrollTop = targetTop;
    await this.sleep(100);
  }

  // Scroll up (towards older messages)
  async scrollUp(scrollContainer, amount) {
    const startTop = scrollContainer.scrollTop;
    const targetTop = Math.max(0, startTop - amount);
    scrollContainer.scrollTop = targetTop;
    await this.sleep(100);
  }

  // Send jump progress to popup
  sendJumpProgress(attempts, targetTs, visibleRange) {
    chrome.runtime.sendMessage({
      type: 'JUMP_PROGRESS',
      attempts,
      targetDate: new Date(targetTs * 1000).toISOString(),
      visibleOldest: new Date(visibleRange.oldestTs * 1000).toISOString(),
      visibleNewest: new Date(visibleRange.newestTs * 1000).toISOString()
    });
  }

  // Determine if we need to jump to reach target date range
  // Strategy: Jump to the END of the range (toTs), then scroll UP through the range
  // This way autoScroll's UP direction will traverse the entire date range
  needsJumpToDate() {
    if (!this.activeTimeRange) return null;

    const visibleRange = this.getVisibleDateRange();
    if (!visibleRange) return null;

    const { fromTs, toTs } = this.activeTimeRange;

    // Case 1: Both fromTs and toTs are set
    // Always position at (or beyond) the end of the range so scrolling UP captures everything
    if (fromTs && toTs) {
      this.log(`Positioning at end of range (${new Date(toTs * 1000).toLocaleDateString()}) before scrolling up`, 'info');
      return { direction: 'down', targetTs: toTs };
    }

    // Case 2: Only fromTs is set (want everything from fromTs to present)
    // Always jump to bottom to ensure we include the newest messages
    if (fromTs && !toTs) {
      this.log(`Jumping to bottom before scrolling up to ${new Date(fromTs * 1000).toLocaleDateString()}`, 'info');
      return { direction: 'bottom', targetTs: null };
    }

    // Case 3: Only toTs is set (want everything from beginning to toTs)
    // Always position at (or beyond) toTs so scrolling UP traverses the range
    if (!fromTs && toTs) {
      this.log(`Positioning at end of range (${new Date(toTs * 1000).toLocaleDateString()}) before scrolling up`, 'info');
      return { direction: 'down', targetTs: toTs };
    }

    return null;
  }

  // Load saved state
  async loadState() {
    try {
      const data = await chrome.storage.local.get(['extractedMessages', 'extractedThreads', 'extractorState']);
      if (data.extractedMessages) {
        data.extractedMessages.forEach(msg => {
          this.applyMessageTimeFields(msg);
          this.messages.set(msg.ts, msg);
          if (msg.user_id) this.users.add(msg.user_id);
        });
        this.log(`Loaded ${this.messages.size} existing messages`, 'info');
      }
      if (Array.isArray(data.extractedThreads)) {
        this.hydrateThreads(data.extractedThreads);
      } else if (this.messages.size > 0) {
        this.rebuildThreadsFromMessages();
      }
    } catch (error) {
      this.log(`Failed to load state: ${error.message}`, 'error');
    }
  }

  // Save current state
  async saveState() {
    try {
      const messages = Array.from(this.messages.values());
      await chrome.storage.local.set({
        extractedMessages: messages,
        extractedThreads: this.serializeThreads(),
        extractorState: {
          channelId: this.channelId,
          channelName: this.channelName,
          lastSaveTime: Date.now(),
          timeRange: this.activeTimeRange
        }
      });
      this.lastSaveTime = Date.now();
      this.lastSaveCount = messages.length;
      chrome.runtime.sendMessage({ type: 'SAVED' });
      this.log(`Saved ${messages.length} messages`, 'success');
    } catch (error) {
      this.log(`Failed to save: ${error.message}`, 'error');
    }
  }

  // Detect current channel
  detectChannel() {
    // Try to get channel name from page
    const channelHeader = document.querySelector('[data-qa="channel_name"]');
    if (channelHeader) {
      this.channelName = channelHeader.textContent.trim();
    }

    // Try to get channel ID from URL
    const urlMatch = window.location.pathname.match(/\/([A-Z0-9]+)$/);
    if (urlMatch) {
      this.channelId = urlMatch[1];
    }

    // Alternative: look for it in the DOM
    if (!this.channelName) {
      const titleEl = document.querySelector('.p-view_header__channel_title');
      if (titleEl) {
        this.channelName = titleEl.textContent.trim();
      }
    }
  }

  // Setup mutation observer for new messages
  setupMessageObserver() {
    const messagePane = this.getMessagePane();
    if (!messagePane) return;

    this.observer = new MutationObserver((mutations) => {
      if (this.isRunning && !this.isPaused) {
        this.extractVisibleMessages();
      }
    });

    this.observer.observe(messagePane, {
      childList: true,
      subtree: true
    });
  }

  // Get message pane element (the message list container)
  getMessagePane() {
    // Primary: the message list container
    const messageList = document.querySelector('.c-message_list');
    if (messageList) return messageList;

    // Fallback selectors
    const selectors = [
      '[data-qa="message_pane"]',
      '.c-virtual_list__scroll_container',
      '.p-message_pane__scrollable',
      '[data-qa="slack_kit_scrollbar"]'
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }

    return null;
  }

  // Get scrollable container for messages
  getScrollContainer() {
    // Primary: the scrollbar hider inside message list
    const messageList = document.querySelector('.c-message_list');
    if (messageList) {
      const scrollHider = messageList.querySelector('.c-scrollbar__hider');
      if (scrollHider && this.isScrollable(scrollHider)) {
        return scrollHider;
      }
    }

    // Fallback: try other known scrollable containers
    const fallbackSelectors = [
      '.c-message_list .c-scrollbar__hider',
      '.p-message_pane__scrollable',
      '[data-qa="slack_kit_scrollbar"]',
      '.c-virtual_list__scroll_container'
    ];

    for (const selector of fallbackSelectors) {
      const element = document.querySelector(selector);
      if (this.isScrollable(element)) return element;
    }

    return null;
  }

  isScrollable(element) {
    if (!element) return false;
    if (element.scrollHeight <= element.clientHeight + 2) return false;
    const style = window.getComputedStyle(element);
    return style.overflowY !== 'hidden';
  }

  findScrollableAncestor(element) {
    let current = element;
    while (current && current !== document.body) {
      if (this.isScrollable(current)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  // Start extraction
  async start(settings) {
    if (this.isRunning) return;

    this.settings = { ...this.settings, ...settings };
    this.activeTimeRange = this.normalizeTimeRange(this.settings);
    this.isRunning = true;
    this.isPaused = false;
    this.isCompleted = false;
    this.pendingThreads = new Set(); // Track threads that need reply extraction
    this.extractedThreads = new Set(); // Track threads already extracted
    this.threadQueue = []; // Queue for immediate thread extraction

    this.log('Starting extraction...', 'info');
    this.detectChannel();

    // Phase 0: Quick jump to target date if needed
    const jumpInfo = this.needsJumpToDate();
    if (jumpInfo) {
      this.extractionPhase = 'jumping';
      this.log(`Phase 0: Quick jumping to target date range...`, 'info');
      chrome.runtime.sendMessage({ type: 'JUMPING', direction: jumpInfo.direction });

      const jumpSuccess = await this.jumpToDate(jumpInfo.targetTs, jumpInfo.direction);
      if (!jumpSuccess) {
        this.log('Jump failed, will try extraction anyway', 'warning');
      }

      // Small pause after jump to let DOM settle
      await this.sleep(500);
    }

    // Phase 1: Scroll through channel and collect main messages
    this.extractionPhase = 'scrolling';
    this.log('Phase 1: Scrolling through channel...', 'info');
    this.extractVisibleMessages();
    await this.autoScroll();

    // Phase 2: Extract thread replies if enabled
    if (this.settings.includeThreads && this.pendingThreads.size > 0) {
      this.extractionPhase = 'threads';
      this.log(`Phase 2: Extracting replies from ${this.pendingThreads.size} threads...`, 'info');
      await this.extractAllThreadReplies();
    }

    this.extractionPhase = 'completed';
  }

  // Process queued threads immediately (while they're still in DOM)
  async processThreadQueue() {
    if (this.threadQueue.length === 0) return;

    const queueCopy = [...this.threadQueue];
    this.threadQueue = [];

    for (const item of queueCopy) {
      if (!this.isRunning || this.isPaused) {
        // Put unprocessed items back in queue
        this.threadQueue.push(item);
        continue;
      }

      if (this.extractedThreads.has(item.ts)) continue;

      try {
        this.log(`Processing thread ${item.ts} immediately...`, 'info');

        // Click on the thread element to open it
        const opened = await this.openThreadFromElement(item.el, item.ts);
        if (!opened) {
          this.log(`Could not open thread ${item.ts}`, 'warning');
          continue;
        }

        // Wait for thread panel to load
        await this.sleep(1200);

        // Extract replies from thread panel
        const replyCount = await this.extractThreadReplies(item.ts);

        // Mark as extracted
        this.extractedThreads.add(item.ts);

        // Close the thread panel
        await this.closeThread();

        // Small delay
        await this.sleep(300);

      } catch (error) {
        this.log(`Error processing thread ${item.ts}: ${error.message}`, 'error');
      }
    }
  }

  // Open a thread from a specific element (when it's already in DOM)
  async openThreadFromElement(el, threadTs) {
    if (!el || !el.isConnected) {
      // Element is no longer in DOM, fall back to search
      return this.openThread(threadTs);
    }

    this.log(`Opening thread from element: ${threadTs}`, 'info');

    // Scroll element into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(400);

    // Try multiple selectors for replies button
    const replyBtnSelectors = [
      '[data-qa="replies_button_count"]',
      '[data-qa="replies_button"]',
      '[data-qa="message-action-bar-thread-reply-button"]',
      'button[aria-label*="repl"]',
      'button[aria-label*="Repl"]',
      '.c-message__reply_count',
      '[class*="ThreadRepliesLink"]',
      'a[class*="reply"]',
      'button[class*="reply"]'
    ];

    let repliesBtn = null;
    for (const selector of replyBtnSelectors) {
      repliesBtn = el.querySelector(selector);
      if (repliesBtn) {
        this.log(`Found replies button with: ${selector}`, 'info');
        break;
      }
    }

    if (repliesBtn) {
      repliesBtn.click();
      await this.sleep(600);
      return true;
    }

    // Hover and try to find the reply link
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await this.sleep(300);

    // Look for any clickable reply element
    const replyEl = el.querySelector('[class*="reply"], [class*="Reply"], [aria-label*="reply"], [aria-label*="Reply"]');
    if (replyEl) {
      replyEl.click();
      await this.sleep(600);
      return true;
    }

    this.log('No reply button found on element', 'warning');
    return false;
  }

  // Extract replies from all pending threads (fallback for missed threads)
  async extractAllThreadReplies() {
    // First, find threads that weren't extracted during scrolling
    const missedThreads = Array.from(this.pendingThreads).filter(ts => !this.extractedThreads.has(ts));

    if (missedThreads.length === 0) {
      this.log('All threads were extracted during scrolling', 'success');
      return;
    }

    this.log(`${missedThreads.length} threads need extraction (missed during scroll)`, 'info');

    let processedCount = 0;

    for (const threadTs of missedThreads) {
      if (!this.isRunning || this.isPaused) break;

      try {
        // Find and click the thread
        const opened = await this.openThread(threadTs);
        if (!opened) {
          this.log(`Could not open thread ${threadTs}`, 'warning');
          continue;
        }

        // Wait for thread panel to load
        await this.sleep(1000);

        // Extract replies from thread panel
        const replyCount = await this.extractThreadReplies(threadTs);

        // Mark as extracted
        this.extractedThreads.add(threadTs);

        // Close the thread panel
        await this.closeThread();

        processedCount++;
        if (processedCount % 10 === 0) {
          this.log(`Thread progress: ${processedCount}/${missedThreads.length}`, 'info');
          await this.saveState();
        }

        // Small delay between threads
        await this.sleep(500);

      } catch (error) {
        this.log(`Error extracting thread ${threadTs}: ${error.message}`, 'error');
      }
    }

    this.log(`Extracted replies from ${processedCount} missed threads`, 'success');
  }

  // Open a thread by clicking on it
  async openThread(threadTs) {
    this.log(`Attempting to open thread: ${threadTs}`, 'info');

    const messageList = document.querySelector('.c-message_list');
    if (!messageList) {
      this.log('Message list not found', 'warning');
      return false;
    }

    // Find message with this thread_ts - try multiple strategies
    let messageEl = messageList.querySelector(`[data-msg-ts="${threadTs}"]`);

    if (!messageEl) {
      // Try finding by iterating through all messages
      const allMessages = messageList.querySelectorAll('[data-qa="message_container"], [data-msg-ts]');
      messageEl = Array.from(allMessages).find(el => {
        const ts = this.normalizeSlackTs(el.getAttribute('data-msg-ts'));
        return ts === threadTs;
      });
    }

    if (!messageEl) {
      this.log(`Message element not found for thread ${threadTs} (may have scrolled out of view)`, 'warning');
      return false;
    }

    this.log(`Found message element for thread ${threadTs}`, 'info');

    // Scroll message into view first
    messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(500);

    // Try multiple selectors for replies button (modern Slack)
    const replyBtnSelectors = [
      '[data-qa="replies_button_count"]',
      '[data-qa="replies_button"]',
      '[data-qa="message-action-bar-thread-reply-button"]',
      'button[aria-label*="repl"]',
      'button[aria-label*="Repl"]',
      '.c-message__reply_count',
      '[class*="ThreadRepliesLink"]',
      'a[class*="reply"]',
      'button[class*="reply"]'
    ];

    let repliesBtn = null;
    for (const selector of replyBtnSelectors) {
      repliesBtn = messageEl.querySelector(selector);
      if (repliesBtn) {
        this.log(`Found replies button with: ${selector}`, 'info');
        break;
      }
    }

    if (repliesBtn) {
      repliesBtn.click();
      await this.sleep(500);
      return true;
    }

    // Alternative: Hover over message and use keyboard shortcut 't'
    this.log('Trying hover + keyboard to open thread', 'info');
    messageEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    await this.sleep(300);

    // Try clicking on reply count text directly
    const replyCountText = messageEl.querySelector('[class*="reply"], [class*="Reply"]');
    if (replyCountText) {
      replyCountText.click();
      await this.sleep(500);
      return true;
    }

    // Last resort: try 't' keyboard shortcut
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));

    const opened = await this.waitForThreadPanelOpen(1500);
    if (!opened) {
      this.log('Attempted keyboard shortcut but thread panel not detected', 'warning');
      return false;
    }

    return true;
  }

  async waitForThreadPanelOpen(timeoutMs) {
    const threadPanelSelectors = [
      '[data-qa="threads_view"]',
      '[data-qa="threads_flexpane"]',
      '[data-qa="message_pane_thread"]',
      '.p-threads_flexpane',
      '.p-flexpane__inside_body',
      '[aria-label*="thread" i]',
      '[aria-label*="Thread" i]',
      'section[class*="Thread"]',
      'div[class*="ThreadPanel"]',
      '.p-workspace__secondary_view',
      '.p-flexpane'
    ];

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const found = threadPanelSelectors.some(selector => document.querySelector(selector));
      if (found) return true;
      await this.sleep(150);
    }

    return false;
  }

  // Extract messages from the thread panel
  async extractThreadReplies(threadTs) {
    // Wait for thread panel to appear - longer wait
    await this.sleep(1000);

    // Try multiple selectors for thread panel (modern Slack)
    const threadPanelSelectors = [
      '[data-qa="threads_view"]',
      '[data-qa="threads_flexpane"]',
      '[data-qa="message_pane_thread"]',
      '.p-threads_flexpane',
      '.p-flexpane__inside_body',
      '[aria-label*="thread" i]',
      '[aria-label*="Thread" i]',
      'section[class*="Thread"]',
      'div[class*="ThreadPanel"]',
      '.p-workspace__secondary_view',
      '.p-flexpane'
    ];

    let threadPanel = null;
    for (const selector of threadPanelSelectors) {
      threadPanel = document.querySelector(selector);
      if (threadPanel) {
        this.log(`Found thread panel with: ${selector}`, 'info');
        break;
      }
    }

    if (!threadPanel) {
      this.log('Thread panel not found after trying all selectors', 'warning');
      // Log what elements exist for debugging
      const flexPanes = document.querySelectorAll('[class*="flexpane"], [class*="Flexpane"], [class*="thread"], [class*="Thread"]');
      this.log(`Found ${flexPanes.length} potential panel elements`, 'info');
      return 0;
    }

    // Find scroll container in thread panel - try multiple strategies
    const scrollContainerSelectors = [
      '.c-scrollbar__hider',
      '.c-virtual_list__scroll_container',
      '[data-qa="slack_kit_scrollbar"]',
      '[class*="scrollbar"][class*="hider"]'
    ];

    let scrollContainer = null;
    for (const selector of scrollContainerSelectors) {
      scrollContainer = threadPanel.querySelector(selector);
      if (scrollContainer && this.isScrollable(scrollContainer)) {
        break;
      }
    }

    // Fallback: find any scrollable element in thread panel
    if (!scrollContainer) {
      scrollContainer = this.findScrollableAncestor(threadPanel.querySelector('[data-msg-ts]'));
    }

    // Scroll through thread to load all replies
    if (scrollContainer) {
      this.log('Scrolling thread panel to load all replies...', 'info');
      let lastScrollHeight = 0;
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
        await this.sleep(400);
        if (scrollContainer.scrollHeight === lastScrollHeight) {
          if (attempts > 2) break; // Only break after a few stable iterations
        }
        lastScrollHeight = scrollContainer.scrollHeight;
        attempts++;
      }
      this.log(`Thread scroll complete after ${attempts} iterations`, 'info');
    } else {
      this.log('Thread scroll container not found - extracting visible messages only', 'warning');
    }

    // Extract messages from thread panel - try multiple selectors
    const messageSelectors = [
      '[data-qa="message_container"][data-msg-ts]',
      '[data-msg-ts]',
      '.c-message_kit__message[data-msg-ts]',
      '[data-qa="virtual-list-item"] [data-msg-ts]',
      '[role="listitem"] [data-msg-ts]'
    ];

    let threadMessages = [];
    for (const selector of messageSelectors) {
      const messages = threadPanel.querySelectorAll(selector);
      if (messages.length > 0) {
        threadMessages = messages;
        this.log(`Found ${messages.length} messages in thread with: ${selector}`, 'info');
        break;
      }
    }

    if (threadMessages.length === 0) {
      this.log(`No messages found in thread panel for ${threadTs}`, 'warning');
      return 0;
    }

    let newReplies = 0;
    threadMessages.forEach(el => {
      const msgData = this.parseMessageElement(el);
      if (!msgData || !msgData.ts) return;

      // Set thread_ts for all messages in this thread
      msgData.thread_ts = threadTs;
      msgData.is_thread_reply = msgData.ts !== threadTs;

      if (!this.messages.has(msgData.ts)) {
        this.messages.set(msgData.ts, msgData);
        if (msgData.user_id) this.users.add(msgData.user_id);
        this.updateThreadIndex(msgData);
        newReplies++;
      }
    });

    this.log(`Extracted ${newReplies} new replies from thread ${threadTs}`, 'success');
    return newReplies;
  }

  // Close the thread panel
  async closeThread() {
    // Try multiple selectors for close button
    const closeBtnSelectors = [
      '[data-qa="close_flexpane"]',
      '[data-qa="flexpane_close_button"]',
      'button[aria-label="Close"]',
      'button[aria-label*="Close thread"]',
      'button[aria-label*="close"]',
      '.p-flexpane__close_button',
      '[class*="flexpane"] button[class*="close"]',
      '[class*="Thread"] button[class*="close"]'
    ];

    for (const selector of closeBtnSelectors) {
      const closeBtn = document.querySelector(selector);
      if (closeBtn) {
        closeBtn.click();
        await this.sleep(400);
        this.log('Closed thread panel', 'info');
        return true;
      }
    }

    // Alternative: press Escape key
    this.log('Trying Escape key to close thread', 'info');
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      bubbles: true,
      cancelable: true
    }));
    await this.sleep(400);

    // Alternative: click on main message area
    const mainArea = document.querySelector('.c-message_list') ||
                     document.querySelector('.p-workspace__primary_view');
    if (mainArea) {
      mainArea.click();
      await this.sleep(300);
    }

    return true;
  }

  // Pause extraction
  pause() {
    this.isPaused = true;
    this.log('Extraction paused', 'warning');
  }

  // Resume extraction
  async resume() {
    this.isPaused = false;
    this.log('Extraction resumed', 'info');
    await this.autoScroll();
  }

  // Stop extraction
  async stop() {
    this.isRunning = false;
    this.isPaused = false;
    await this.saveState();
    this.log('Extraction stopped', 'warning');
  }

  // Clear all data
  clearData() {
    this.messages.clear();
    this.threads.clear();
    this.users.clear();
    this.pendingThreads.clear();
    this.extractedThreads.clear();
    this.threadQueue = [];
    this.isRunning = false;
    this.isPaused = false;
    this.isCompleted = false;
    this.extractionPhase = 'idle';
    this.lastSaveTime = null;
    this.lastSaveCount = 0;
    this.scrollProgress = 0;
    this.log('Data cleared', 'info');
  }

  // Human-like auto scroll
  async autoScroll() {
    const scrollContainer = this.getScrollContainer();
    if (!scrollContainer) {
      this.log('Cannot find scroll container', 'error');
      return;
    }

    let noProgressCount = 0;
    let noNewInRangeCount = 0;
    let lastScrollHeight = scrollContainer.scrollHeight;
    let lastOldestVisibleTs = null;

    while (this.isRunning && !this.isPaused) {
      const currentScrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;

      // Calculate progress (inverse since we scroll up)
      const scrollSpan = scrollHeight - clientHeight;
      this.scrollProgress = scrollSpan > 0
        ? Math.round((1 - currentScrollTop / scrollSpan) * 100)
        : 100;

      // Random scroll amount (200-500px), smaller when time range is active to avoid skips
      const baseScrollAmount = 200 + Math.random() * 300;
      const scrollAmount = this.activeTimeRange
        ? Math.min(baseScrollAmount, Math.max(140, clientHeight * 0.5))
        : baseScrollAmount;

      // Scroll up
      const didScroll = this.performScroll(scrollContainer, scrollAmount);

      // Wait for scroll to complete and content to load
      await this.waitForContent(scrollContainer, scrollHeight);

      // Extract messages after scroll
      const extractionStats = this.extractVisibleMessages();

      // Process any threads that were just found (while they're still in DOM)
      if (this.settings.includeThreads && this.threadQueue.length > 0) {
        this.log(`Processing ${this.threadQueue.length} threads from queue...`, 'info');
        await this.processThreadQueue();
      }

      // Random delay (human-like)
      const baseDelay = this.settings.scrollDelay * 1000;
      const randomDelay = baseDelay + (Math.random() * 2000 - 1000); // +/- 1 second
      await this.sleep(randomDelay);

      // Occasionally pause longer (simulating reading)
      if (Math.random() < 0.1) {
        const readingPause = 3000 + Math.random() * 5000;
        this.log('Simulating reading pause...', 'info');
        await this.sleep(readingPause);
      }

      if (extractionStats.newMessages === 0) {
        noNewInRangeCount++;
      } else {
        noNewInRangeCount = 0;
      }

      const scrollHeightChanged = scrollContainer.scrollHeight !== lastScrollHeight;
      const oldestVisibleChanged = extractionStats.oldestVisibleTs && extractionStats.oldestVisibleTs !== lastOldestVisibleTs;
      if (!didScroll && !scrollHeightChanged && !oldestVisibleChanged && extractionStats.newMessages === 0) {
        noProgressCount++;
      } else {
        noProgressCount = 0;
      }
      lastScrollHeight = scrollContainer.scrollHeight;
      lastOldestVisibleTs = extractionStats.oldestVisibleTs || lastOldestVisibleTs;

      // Auto-save periodically
      if (this.messages.size - this.lastSaveCount >= this.settings.autoSaveInterval) {
        await this.saveState();
      }

      // Update progress
      this.sendProgress();

      // Check if reached top
      if (scrollContainer.scrollTop <= 0) {
        // Try scrolling a bit more to trigger loading
        scrollContainer.scrollTop = 0;
        await this.sleep(2000);

        // If still at top and no new messages for 3 iterations, we're done
        if (noProgressCount >= 3) {
          this.log('Reached the beginning of the channel', 'success');
          break;
        }
      }

      // Safety: if no new messages for many iterations, something might be wrong
      // Increased threshold for large channels
      if (noProgressCount >= 20) {
        this.log('No new messages detected for a while, stopping', 'warning');
        break;
      }

      // Log progress periodically
      if (this.messages.size % 100 === 0 && this.messages.size > 0) {
        this.log(`Progress: ${this.messages.size} messages extracted...`, 'info');
      }

      if (this.shouldStopForTimeRange(extractionStats.oldestVisibleTs, noNewInRangeCount)) {
        this.log('Reached the start of the selected time range', 'success');
        break;
      }
    }

    // Finalize
    if (this.isRunning) {
      this.isCompleted = true;
      this.isRunning = false;
      await this.saveState();
      chrome.runtime.sendMessage({ type: 'COMPLETED' });
      this.log(`Extraction complete! Total messages: ${this.messages.size}`, 'success');
    }
  }

  performScroll(scrollContainer, scrollAmount) {
    const startTop = scrollContainer.scrollTop;
    const targetTop = Math.max(0, startTop - scrollAmount);
    scrollContainer.scrollTop = targetTop;

    if (scrollContainer.scrollTop === startTop) {
      try {
        const wheelEvent = new WheelEvent('wheel', {
          deltaY: -scrollAmount,
          bubbles: true,
          cancelable: true
        });
        scrollContainer.dispatchEvent(wheelEvent);
      } catch (error) {
        // Ignore wheel fallback errors
      }
    }

    return scrollContainer.scrollTop !== startTop;
  }

  async waitForContent(scrollContainer, previousHeight) {
    const startTime = Date.now();
    const maxWait = this.activeTimeRange ? 3000 : 1500;
    while (Date.now() - startTime < maxWait) {
      await this.sleep(200);
      if (scrollContainer.scrollHeight !== previousHeight) {
        return;
      }
    }
  }

  normalizeSlackTs(value) {
    if (!value) return null;
    const raw = String(value).trim();
    if (/^\d{10}(\.\d+)?$/.test(raw)) return raw;
    const match = raw.match(/(\d{10}(?:\.\d+)?)/);
    if (match) return match[1];

    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
      return (parsed / 1000).toFixed(3);
    }

    return null;
  }

  padTwo(value) {
    return String(value).padStart(2, '0');
  }

  formatMessageDateParts(ts) {
    const tsNumber = this.parseSlackTimestamp(ts);
    if (tsNumber === null) return null;
    const date = new Date(tsNumber * 1000);
    const year = date.getFullYear();
    const month = this.padTwo(date.getMonth() + 1);
    const day = this.padTwo(date.getDate());
    const hours = this.padTwo(date.getHours());
    const minutes = this.padTwo(date.getMinutes());
    const seconds = this.padTwo(date.getSeconds());

    return {
      date: `${year}${month}${day}`,
      time: `${hours}:${minutes}:${seconds}`
    };
  }

  applyMessageTimeFields(msgData) {
    if (!msgData || !msgData.ts) return;
    const parts = this.formatMessageDateParts(msgData.ts);
    if (!parts) return;
    msgData.message_date = parts.date;
    msgData.message_time = parts.time;
  }

  parseSlackTimestamp(ts) {
    if (!ts) return null;
    const parsed = Number.parseFloat(ts);
    return Number.isNaN(parsed) ? null : parsed;
  }

  normalizeTimeRange(settings) {
    const fromTs = this.parseDateInput(settings.timeRangeFrom, false);
    const toTs = this.parseDateInput(settings.timeRangeTo, true);

    if (!fromTs && !toTs) return null;
    if (fromTs && toTs && fromTs > toTs) {
      this.log('Time range is inverted, swapping endpoints', 'warning');
      return { fromTs: toTs, toTs: fromTs };
    }

    return {
      fromTs: fromTs || null,
      toTs: toTs || null
    };
  }

  parseDateInput(value, isEnd) {
    if (!value) return null;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      const year = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10) - 1;
      const day = Number.parseInt(match[3], 10);
      const hours = Number.parseInt(match[4], 10);
      const minutes = Number.parseInt(match[5], 10);
      const seconds = match[6] ? Number.parseInt(match[6], 10) : (isEnd ? 59 : 0);
      const milliseconds = isEnd ? 999 : 0;
      const date = new Date(year, month, day, hours, minutes, seconds, milliseconds);
      return date.getTime() / 1000;
    }
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return null;
    return parsed / 1000;
  }

  isWithinRange(tsNumber) {
    if (!this.activeTimeRange || tsNumber === null) return true;
    const { fromTs, toTs } = this.activeTimeRange;
    if (fromTs && tsNumber < fromTs) return false;
    if (toTs && tsNumber > toTs) return false;
    return true;
  }

  shouldStopForTimeRange(oldestVisibleTs, noNewInRangeCount) {
    if (!this.activeTimeRange || !this.activeTimeRange.fromTs || !oldestVisibleTs) {
      return false;
    }
    return oldestVisibleTs <= this.activeTimeRange.fromTs && noNewInRangeCount >= 2;
  }

  updateThreadIndex(msgData) {
    if (!this.settings.includeThreads) return;

    const threadKey = msgData.thread_ts || (msgData.reply_count > 0 ? msgData.ts : null);
    if (!threadKey) return;

    let thread = this.threads.get(threadKey);
    if (!thread) {
      thread = {
        thread_ts: threadKey,
        root_ts: threadKey,
        root_message_ts: null,
        reply_ts: new Set(),
        reply_count: 0,
        latest_reply_ts: null,
        participants: new Set()
      };
    }

    if (msgData.ts === threadKey) {
      thread.root_message_ts = msgData.ts;
      if (msgData.reply_count) {
        thread.reply_count = Math.max(thread.reply_count, msgData.reply_count);
      }
    } else {
      thread.reply_ts.add(msgData.ts);
      thread.reply_count = Math.max(thread.reply_count, thread.reply_ts.size);
      const replyTs = this.parseSlackTimestamp(msgData.ts);
      const latestTs = this.parseSlackTimestamp(thread.latest_reply_ts);
      if (replyTs !== null && (latestTs === null || replyTs > latestTs)) {
        thread.latest_reply_ts = msgData.ts;
      }
    }

    if (msgData.user_id) {
      thread.participants.add(msgData.user_id);
    }

    this.threads.set(threadKey, thread);
  }

  rebuildThreadsFromMessages() {
    this.threads.clear();
    this.messages.forEach(msg => {
      this.updateThreadIndex(msg);
    });
  }

  serializeThreads() {
    return Array.from(this.threads.values()).map(thread => ({
      thread_ts: thread.thread_ts,
      root_ts: thread.root_ts,
      root_message_ts: thread.root_message_ts,
      reply_ts: Array.from(thread.reply_ts || []),
      reply_count: thread.reply_count,
      latest_reply_ts: thread.latest_reply_ts,
      participants: Array.from(thread.participants || [])
    }));
  }

  hydrateThreads(serializedThreads) {
    serializedThreads.forEach(thread => {
      if (!thread.thread_ts) return;
      this.threads.set(thread.thread_ts, {
        thread_ts: thread.thread_ts,
        root_ts: thread.root_ts || thread.thread_ts,
        root_message_ts: thread.root_message_ts || null,
        reply_ts: new Set(thread.reply_ts || []),
        reply_count: thread.reply_count || 0,
        latest_reply_ts: thread.latest_reply_ts || null,
        participants: new Set(thread.participants || [])
      });
    });
  }

  // Extract messages from visible DOM
  extractVisibleMessages() {
    // Target message containers within the message list specifically
    const messageList = document.querySelector('.c-message_list');
    if (!messageList) {
      this.log('Message list not found', 'warning');
      return { newMessages: 0, oldestVisibleTs: null, newestVisibleTs: null };
    }

    // Primary: message containers with timestamp data
    let messageElements = messageList.querySelectorAll('[data-qa="message_container"][data-msg-ts]');

    // Fallback: try other selectors within message list
    if (messageElements.length === 0) {
      const fallbackSelectors = [
        '.c-message_kit__message[data-msg-ts]',
        '[role="listitem"] [data-msg-ts]',
        '[data-qa="message_container"]'
      ];

      for (const selector of fallbackSelectors) {
        const elements = messageList.querySelectorAll(selector);
        if (elements.length > 0) {
          messageElements = elements;
          break;
        }
      }
    }

    let newMessages = 0;
    let oldestVisibleTs = null;
    let newestVisibleTs = null;

    messageElements.forEach(el => {
      const msgData = this.parseMessageElement(el);
      if (!msgData || !msgData.ts) return;

      const tsNumber = this.parseSlackTimestamp(msgData.ts);
      if (tsNumber !== null) {
        if (oldestVisibleTs === null || tsNumber < oldestVisibleTs) {
          oldestVisibleTs = tsNumber;
        }
        if (newestVisibleTs === null || tsNumber > newestVisibleTs) {
          newestVisibleTs = tsNumber;
        }
      }

      if (!this.isWithinRange(tsNumber)) return;
      if (this.messages.has(msgData.ts)) return;

      this.messages.set(msgData.ts, msgData);
      if (msgData.user_id) this.users.add(msgData.user_id);
      this.updateThreadIndex(msgData);
      newMessages++;

      // Track threads that have replies - extract immediately while in DOM
      if (this.settings.includeThreads && msgData.reply_count > 0) {
        if (!this.pendingThreads.has(msgData.ts) && !this.extractedThreads.has(msgData.ts)) {
          this.log(`Found thread with ${msgData.reply_count} replies: ${msgData.ts}`, 'info');
          this.pendingThreads.add(msgData.ts);

          // Queue this thread for immediate extraction while it's still in DOM
          this.threadQueue.push({ ts: msgData.ts, el: el });
        }
      }
    });

    // Log extraction summary periodically
    if (newMessages > 0 && this.messages.size % 50 === 0) {
      this.log(`Extracted ${this.messages.size} messages, ${this.pendingThreads.size} threads with replies`, 'info');
    }

    return {
      newMessages,
      oldestVisibleTs,
      newestVisibleTs
    };
  }

  // Parse a single message element
  parseMessageElement(el) {
    try {
      const msgData = {
        ts: null,
        user_id: null,
        user_name: null,
        text: null,
        thread_ts: null,
        reply_count: 0,
        reactions: [],
        attachments: [],
        message_date: null,
        message_time: null,
        extracted_at: new Date().toISOString()
      };

      // Get timestamp (unique ID) - primary: data-msg-ts attribute
      const tsAttr = this.normalizeSlackTs(
        el.getAttribute('data-msg-ts') ||
        el.getAttribute('data-ts') ||
        el.getAttribute('data-message-ts') ||
        el.getAttribute('data-item-key')
      );
      if (tsAttr) {
        msgData.ts = tsAttr;
      } else {
        // Try to find ts in nested elements or from permalink
        const tsEl = el.querySelector('[data-msg-ts], [data-ts], [data-message-ts], time');
        if (tsEl) {
          const nestedTs = this.normalizeSlackTs(
            tsEl.getAttribute('data-msg-ts') ||
            tsEl.getAttribute('data-ts') ||
            tsEl.getAttribute('data-message-ts') ||
            tsEl.getAttribute('datetime')
          );
          if (nestedTs) {
            msgData.ts = nestedTs;
          }
        }

        // Fallback: extract from permalink href (format: /p1766418893286489)
        if (!msgData.ts) {
          const permalink = el.querySelector('a[href*="/archives/"][href*="/p"]');
          if (permalink) {
            const href = permalink.getAttribute('href');
            const match = href.match(/\/p(\d+)/);
            if (match) {
              // Convert from Slack's compact format: 1766418893286489 → 1766418893.286489
              const raw = match[1];
              if (raw.length > 10) {
                msgData.ts = raw.slice(0, 10) + '.' + raw.slice(10);
              } else {
                msgData.ts = raw;
              }
            }
          }
        }
      }

      // Get thread ts
      const threadTsAttr = this.normalizeSlackTs(
        el.getAttribute('data-thread-ts') ||
        el.getAttribute('data-parent-ts') ||
        el.getAttribute('data-thread-timestamp') ||
        el.querySelector('[data-thread-ts]')?.getAttribute('data-thread-ts')
      );
      if (threadTsAttr) {
        msgData.thread_ts = threadTsAttr;
      }

      // Get channel ID from message element
      const channelId = el.getAttribute('data-msg-channel-id');
      if (channelId) {
        msgData.channel_id = channelId;
      }

      // Get user info
      const userLink = el.querySelector('[data-qa="message_sender_name"], .c-message__sender_link');
      if (userLink) {
        msgData.user_name = userLink.textContent.trim();
        const href = userLink.getAttribute('href');
        if (href) {
          const userMatch = href.match(/\/team\/([A-Z0-9]+)/);
          if (userMatch) {
            msgData.user_id = userMatch[1];
          }
        }
      }

      // Alternative user detection via button with data-message-sender
      if (!msgData.user_id) {
        const senderBtn = el.querySelector('button[data-message-sender]');
        if (senderBtn) {
          msgData.user_id = senderBtn.getAttribute('data-message-sender');
        }
      }

      // Alternative user detection via avatar
      if (!msgData.user_name) {
        const avatarEl = el.querySelector('[data-qa="message_avatar"]');
        if (avatarEl) {
          const ariaLabel = avatarEl.getAttribute('aria-label');
          if (ariaLabel) {
            msgData.user_name = ariaLabel.replace("'s avatar", '').trim();
          }
        }
      }

      // Get message text
      const textEl = el.querySelector('[data-qa="message-text"], .c-message__body, .p-rich_text_section');
      if (textEl) {
        msgData.text = textEl.textContent.trim();
      }

      // Get reply count - try multiple selectors and patterns
      const replySelectors = [
        '[data-qa="replies_button_count"]',
        '[data-qa="replies_button"]',
        '.c-message__reply_count',
        '[class*="ThreadRepliesLink"]',
        '[class*="reply_count"]',
        'a[class*="reply"]',
        'button[class*="reply"]'
      ];

      for (const selector of replySelectors) {
        const replyEl = el.querySelector(selector);
        if (replyEl) {
          const replyText = replyEl.textContent.trim();
          // Try multiple patterns: "5 replies", "5 回复", just "5", etc.
          const replyMatch = replyText.match(/(\d+)/);
          if (replyMatch) {
            msgData.reply_count = parseInt(replyMatch[1]);
            break;
          }
        }
      }

      // Also check for aria-label on reply buttons
      if (msgData.reply_count === 0) {
        const replyBtnWithAria = el.querySelector('[aria-label*="repl"]');
        if (replyBtnWithAria) {
          const ariaLabel = replyBtnWithAria.getAttribute('aria-label');
          const ariaMatch = ariaLabel.match(/(\d+)/);
          if (ariaMatch) {
            msgData.reply_count = parseInt(ariaMatch[1]);
          }
        }
      }

      if (msgData.reply_count > 0 && !msgData.thread_ts && msgData.ts) {
        msgData.thread_ts = msgData.ts;
      }

      // Get reactions
      const reactionEls = el.querySelectorAll('[data-qa="reaction"], .c-reaction');
      reactionEls.forEach(reaction => {
        const emoji = reaction.querySelector('img, .c-emoji')?.getAttribute('alt') ||
          reaction.querySelector('.c-emoji')?.textContent;
        const countEl = reaction.querySelector('[data-qa="reaction_count"], .c-reaction__count');
        const count = countEl ? parseInt(countEl.textContent) || 1 : 1;
        if (emoji) {
          msgData.reactions.push({ emoji, count });
        }
      });

      // Get attachments info
      const attachmentEls = el.querySelectorAll('[data-qa="attachment"], .c-message_attachment');
      attachmentEls.forEach(attachment => {
        const titleEl = attachment.querySelector('[data-qa="attachment_title"], .c-message_attachment__title');
        const title = titleEl ? titleEl.textContent.trim() : 'Attachment';
        msgData.attachments.push({ title });
      });

      // Get file attachments
      const fileEls = el.querySelectorAll('[data-qa="message_file"], .c-file__container');
      fileEls.forEach(file => {
        const nameEl = file.querySelector('[data-qa="file_name"], .c-file__title');
        const name = nameEl ? nameEl.textContent.trim() : 'File';
        msgData.attachments.push({ type: 'file', name });
      });

      this.applyMessageTimeFields(msgData);

      return msgData;
    } catch (error) {
      console.error('Error parsing message:', error);
      return null;
    }
  }

  // Send progress to popup
  sendProgress() {
    chrome.runtime.sendMessage({
      type: 'PROGRESS',
      messageCount: this.messages.size,
      threadCount: this.threads.size,
      pendingThreadCount: this.pendingThreads.size,
      extractedThreadCount: this.extractedThreads?.size || 0,
      userCount: this.users.size,
      extractionPhase: this.extractionPhase
    });
  }

  // Get current state
  getState() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      isCompleted: this.isCompleted,
      extractionPhase: this.extractionPhase,
      messageCount: this.messages.size,
      threadCount: this.threads.size,
      pendingThreadCount: this.pendingThreads.size,
      extractedThreadCount: this.extractedThreads?.size || 0,
      userCount: this.users.size,
      channelName: this.channelName,
      channelId: this.channelId,
      scrollProgress: this.scrollProgress,
      lastSaveTime: this.lastSaveTime
    };
  }

  // Utility: sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility: log
  log(message, level = 'info') {
    console.log(`[SlackExtractor] ${message}`);
    chrome.runtime.sendMessage({ type: 'LOG', text: message, level });
  }
}

// Initialize extractor
const extractor = new SlackExtractor();

// Initialize when page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => extractor.init());
} else {
  extractor.init();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'START_EXTRACTION':
      extractor.start(message.settings);
      sendResponse({ success: true });
      break;
    case 'PAUSE_EXTRACTION':
      extractor.pause();
      sendResponse({ success: true });
      break;
    case 'RESUME_EXTRACTION':
      extractor.resume();
      sendResponse({ success: true });
      break;
    case 'STOP_EXTRACTION':
      extractor.stop()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      return true;
    case 'GET_STATE':
      sendResponse(extractor.getState());
      break;
    case 'CLEAR_DATA':
      extractor.clearData();
      sendResponse({ success: true });
      break;
    default:
      sendResponse({ error: 'Unknown action' });
  }
  return true; // Keep channel open for async response
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (extractor.isRunning) {
    extractor.saveState();
  }
});

console.log('[SlackExtractor] Content script loaded');
