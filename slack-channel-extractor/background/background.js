/**
 * Slack Channel Extractor - Background Service Worker
 * Handles data persistence and cross-component communication
 */

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('[SlackExtractor] Extension installed');

  // Set default settings
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({
        settings: {
          scrollDelay: 3,
          includeThreads: true,
          autoSaveInterval: 100
        }
      });
    }
  });
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'LOG':
    case 'PROGRESS':
    case 'COMPLETED':
    case 'ERROR':
    case 'SAVED':
      // Forward to popup if open
      forwardToPopup(message);
      break;

    case 'EXPORT_DATA':
      exportData(message.format).then(sendResponse);
      return true; // Keep channel open for async

    case 'CLEAR_DATA':
      clearData().then(sendResponse);
      return true;

    case 'GET_STATS':
      getStats().then(sendResponse);
      return true;
  }
});

// Forward message to popup
async function forwardToPopup(message) {
  try {
    // Send to all extension views (popup, etc.)
    chrome.runtime.sendMessage(message);
  } catch (error) {
    // Popup might not be open, ignore error
  }
}

// Export data
async function exportData(format) {
  try {
    const data = await chrome.storage.local.get(['extractedMessages']);
    const messages = data.extractedMessages || [];

    if (messages.length === 0) {
      return { success: false, error: 'No data to export' };
    }

    let content, filename, mimeType;
    const timestamp = new Date().toISOString().slice(0, 10);

    if (format === 'json') {
      // JSON with metadata
      const exportData = {
        exported_at: new Date().toISOString(),
        total_messages: messages.length,
        messages: messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts))
      };
      content = JSON.stringify(exportData, null, 2);
      filename = `slack_messages_${timestamp}.json`;
      mimeType = 'application/json';
    } else if (format === 'csv') {
      // CSV format
      const headers = [
        'timestamp',
        'datetime',
        'message_date',
        'message_time',
        'user_id',
        'user_name',
        'text',
        'thread_ts',
        'reply_count',
        'reactions',
        'attachments'
      ];

      const rows = messages.map(msg => {
        const tsNumber = parseFloat(msg.ts);
        const datetime = Number.isNaN(tsNumber) ? '' : new Date(tsNumber * 1000).toISOString();
        const dateParts = getMessageDateParts(msg);
        return [
          msg.ts,
          datetime,
          msg.message_date || dateParts.date,
          msg.message_time || dateParts.time,
          msg.user_id || '',
          escapeCSV(msg.user_name || ''),
          escapeCSV(msg.text || ''),
          msg.thread_ts || '',
          msg.reply_count || 0,
          escapeCSV(JSON.stringify(msg.reactions || [])),
          escapeCSV(JSON.stringify(msg.attachments || []))
        ].join(',');
      });

      content = [headers.join(','), ...rows].join('\n');
      filename = `slack_messages_${timestamp}.csv`;
      mimeType = 'text/csv';
    } else if (format === 'analysis') {
      // Analysis-ready format (organized by threads)
      const threads = organizeByThreads(messages);
      const exportData = {
        exported_at: new Date().toISOString(),
        summary: {
          total_messages: messages.length,
          total_threads: Object.keys(threads).length,
          unique_users: [...new Set(messages.map(m => m.user_id).filter(Boolean))].length
        },
        threads: threads
      };
      content = JSON.stringify(exportData, null, 2);
      filename = `slack_analysis_${timestamp}.json`;
      mimeType = 'application/json';
    }

    // Create download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url,
      filename,
      saveAs: true
    });

    return { success: true, count: messages.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Organize messages by threads for analysis
function organizeByThreads(messages) {
  const threads = {};
  const standalone = [];
  const messageMap = new Map();

  // Build message lookup map
  messages.forEach(msg => {
    messageMap.set(msg.ts, msg);
  });

  // First pass: identify thread parents (messages with replies or explicit thread_ts = ts)
  messages.forEach(msg => {
    if (msg.reply_count > 0 || (msg.thread_ts && msg.thread_ts === msg.ts)) {
      threads[msg.ts] = {
        thread_ts: msg.ts,
        parent_message: msg,
        replies: [],
        participants: new Set([msg.user_name || msg.user_id]),
        total_messages: 1,
        first_message_time: msg.message_date ? `${msg.message_date} ${msg.message_time}` : null,
        last_message_time: null
      };
    }
  });

  // Second pass: organize replies and standalone messages
  messages.forEach(msg => {
    if (msg.thread_ts && msg.thread_ts !== msg.ts) {
      // This is a reply to a thread
      if (!threads[msg.thread_ts]) {
        // Parent message not found, create placeholder thread
        threads[msg.thread_ts] = {
          thread_ts: msg.thread_ts,
          parent_message: null,
          replies: [],
          participants: new Set(),
          total_messages: 0,
          first_message_time: null,
          last_message_time: null
        };
      }
      threads[msg.thread_ts].replies.push(msg);
      if (msg.user_name || msg.user_id) {
        threads[msg.thread_ts].participants.add(msg.user_name || msg.user_id);
      }
      threads[msg.thread_ts].total_messages++;
    } else if (!threads[msg.ts]) {
      // Standalone message (not a thread parent or reply)
      standalone.push(msg);
    }
  });

  // Sort replies by timestamp and calculate metadata
  const processedThreads = {};
  Object.entries(threads).forEach(([threadTs, thread]) => {
    thread.replies.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

    // Calculate last message time
    if (thread.replies.length > 0) {
      const lastReply = thread.replies[thread.replies.length - 1];
      thread.last_message_time = lastReply.message_date ? `${lastReply.message_date} ${lastReply.message_time}` : null;
    } else if (thread.parent_message) {
      thread.last_message_time = thread.first_message_time;
    }

    // Convert Set to Array for JSON serialization
    processedThreads[threadTs] = {
      thread_ts: thread.thread_ts,
      parent_message: thread.parent_message,
      replies: thread.replies,
      participants: Array.from(thread.participants),
      total_messages: thread.total_messages,
      first_message_time: thread.first_message_time,
      last_message_time: thread.last_message_time,
      // Add conversation text for easier analysis
      conversation_text: buildConversationText(thread)
    };
  });

  // Sort standalone by timestamp
  standalone.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

  return {
    threaded_conversations: processedThreads,
    standalone_messages: standalone,
    thread_count: Object.keys(processedThreads).length,
    standalone_count: standalone.length
  };
}

// Build a readable conversation text from a thread
function buildConversationText(thread) {
  const lines = [];

  if (thread.parent_message) {
    const pm = thread.parent_message;
    lines.push(`[${pm.message_date || ''} ${pm.message_time || ''}] ${pm.user_name || pm.user_id || 'Unknown'}: ${pm.text || ''}`);
  }

  thread.replies.forEach(reply => {
    lines.push(`  └─ [${reply.message_date || ''} ${reply.message_time || ''}] ${reply.user_name || reply.user_id || 'Unknown'}: ${reply.text || ''}`);
  });

  return lines.join('\n');
}

function getMessageDateParts(msg) {
  const tsNumber = parseFloat(msg.ts);
  if (Number.isNaN(tsNumber)) {
    return { date: '', time: '' };
  }
  const date = new Date(tsNumber * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return {
    date: `${year}${month}${day}`,
    time: `${hours}:${minutes}:${seconds}`
  };
}

// Clear all data
async function clearData() {
  try {
    await chrome.storage.local.remove(['extractedMessages', 'extractedThreads', 'extractorState']);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get statistics
async function getStats() {
  try {
    const data = await chrome.storage.local.get(['extractedMessages', 'extractorState']);
    const messages = data.extractedMessages || [];

    const users = new Set(messages.map(m => m.user_id).filter(Boolean));
    const threads = new Set(messages.filter(m => m.reply_count > 0).map(m => m.ts));

    // Calculate date range
    const timestamps = messages.map(m => parseFloat(m.ts)).filter(t => !isNaN(t));
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);

    return {
      success: true,
      stats: {
        messageCount: messages.length,
        userCount: users.size,
        threadCount: threads.size,
        dateRange: timestamps.length > 0 ? {
          from: new Date(minTs * 1000).toISOString(),
          to: new Date(maxTs * 1000).toISOString()
        } : null,
        channelInfo: data.extractorState || null,
        storageSize: JSON.stringify(messages).length
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Escape CSV field
function escapeCSV(field) {
  if (field === null || field === undefined) return '';
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Handle tab updates - detect when user navigates to Slack
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('app.slack.com')) {
    // Badge to indicate active on Slack
    chrome.action.setBadgeText({ text: '✓', tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#2eb67d', tabId });
  }
});

console.log('[SlackExtractor] Background service worker loaded');
