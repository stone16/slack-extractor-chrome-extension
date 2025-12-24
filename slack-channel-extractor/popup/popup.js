// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const channelName = document.getElementById('channelName');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const secondaryControls = document.getElementById('secondaryControls');
const scrollDelay = document.getElementById('scrollDelay');
const scrollDelayValue = document.getElementById('scrollDelayValue');
const includeThreads = document.getElementById('includeThreads');
const autoSaveInterval = document.getElementById('autoSaveInterval');
const timeRangeFrom = document.getElementById('timeRangeFrom');
const timeRangeTo = document.getElementById('timeRangeTo');
const messageCount = document.getElementById('messageCount');
const threadCount = document.getElementById('threadCount');
const extractedThreadCount = document.getElementById('extractedThreadCount');
const userCount = document.getElementById('userCount');
const extractionSpeed = document.getElementById('extractionSpeed');
const progressBar = document.getElementById('progressBar');
const lastSaveTime = document.getElementById('lastSaveTime');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const clearDataBtn = document.getElementById('clearDataBtn');
const dataSize = document.getElementById('dataSize');
const logContainer = document.getElementById('logContainer');

// State
let extractionState = {
  isRunning: false,
  isPaused: false,
  startTime: null,
  messageCount: 0
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await updateState();
  setupEventListeners();
  startStatePolling();
});

// Load saved settings
async function loadSettings() {
  const settings = await chrome.storage.local.get([
    'scrollDelay',
    'includeThreads',
    'autoSaveInterval',
    'timeRangeFrom',
    'timeRangeTo'
  ]);

  if (settings.scrollDelay) {
    scrollDelay.value = settings.scrollDelay;
    scrollDelayValue.textContent = `${settings.scrollDelay}s`;
  }
  if (settings.includeThreads !== undefined) {
    includeThreads.checked = settings.includeThreads;
  }
  if (settings.autoSaveInterval) {
    autoSaveInterval.value = settings.autoSaveInterval;
  }
  if (settings.timeRangeFrom) {
    timeRangeFrom.value = settings.timeRangeFrom;
  }
  if (settings.timeRangeTo) {
    timeRangeTo.value = settings.timeRangeTo;
  }
}

// Save settings
async function saveSettings() {
  await chrome.storage.local.set({
    scrollDelay: parseFloat(scrollDelay.value),
    includeThreads: includeThreads.checked,
    autoSaveInterval: parseInt(autoSaveInterval.value),
    timeRangeFrom: timeRangeFrom.value,
    timeRangeTo: timeRangeTo.value
  });
}

// Setup event listeners
function setupEventListeners() {
  // Settings changes
  scrollDelay.addEventListener('input', () => {
    scrollDelayValue.textContent = `${scrollDelay.value}s`;
    saveSettings();
  });

  includeThreads.addEventListener('change', saveSettings);
  autoSaveInterval.addEventListener('change', saveSettings);
  timeRangeFrom.addEventListener('change', saveSettings);
  timeRangeTo.addEventListener('change', saveSettings);

  // Control buttons
  startBtn.addEventListener('click', startExtraction);
  pauseBtn.addEventListener('click', togglePause);
  stopBtn.addEventListener('click', stopExtraction);

  // Export buttons
  exportJsonBtn.addEventListener('click', () => exportData('json'));
  exportCsvBtn.addEventListener('click', () => exportData('csv'));

  // Clear data button
  clearDataBtn.addEventListener('click', clearData);
}

// Clear all cached data
async function clearData() {
  if (!confirm('Are you sure you want to clear all cached message data? This cannot be undone.')) {
    return;
  }

  try {
    await chrome.storage.local.remove(['extractedMessages', 'extractedThreads', 'extractorState']);

    // Also tell the content script to clear its state
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url.includes('app.slack.com')) {
      await chrome.tabs.sendMessage(tab.id, { action: 'CLEAR_DATA' });
    }

    // Reset UI
    messageCount.textContent = '0';
    threadCount.textContent = '0';
    extractedThreadCount.textContent = '0';
    userCount.textContent = '0';
    dataSize.textContent = 'No data';
    lastSaveTime.textContent = 'Not saved yet';
    progressBar.style.width = '0%';

    addLog('All cached data cleared', 'success');
  } catch (error) {
    addLog(`Failed to clear data: ${error.message}`, 'error');
  }
}

// Start extraction
async function startExtraction() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes('app.slack.com')) {
    addLog('Please navigate to a Slack channel first', 'error');
    return;
  }

  const settings = {
    scrollDelay: parseFloat(scrollDelay.value),
    includeThreads: includeThreads.checked,
    autoSaveInterval: parseInt(autoSaveInterval.value),
    timeRangeFrom: timeRangeFrom.value,
    timeRangeTo: timeRangeTo.value
  };

  try {
    await chrome.tabs.sendMessage(tab.id, {
      action: 'START_EXTRACTION',
      settings
    });

    updateUI('running');
    addLog('Extraction started', 'success');
    extractionState.startTime = Date.now();
  } catch (error) {
    addLog(`Failed to start: ${error.message}`, 'error');
  }
}

// Toggle pause
async function togglePause() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    if (extractionState.isPaused) {
      await chrome.tabs.sendMessage(tab.id, { action: 'RESUME_EXTRACTION' });
      updateUI('running');
      addLog('Extraction resumed', 'info');
    } else {
      await chrome.tabs.sendMessage(tab.id, { action: 'PAUSE_EXTRACTION' });
      updateUI('paused');
      addLog('Extraction paused', 'warning');
    }
  } catch (error) {
    addLog(`Failed to toggle pause: ${error.message}`, 'error');
  }
}

// Stop extraction
async function stopExtraction() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'STOP_EXTRACTION' });
    updateUI('ready');
    addLog('Extraction stopped', 'warning');
  } catch (error) {
    addLog(`Failed to stop: ${error.message}`, 'error');
  }
}

// Organize messages by threads for JSON export
function organizeMessagesByThreads(messages) {
  const threads = {};
  const standalone = [];

  // Sort messages by timestamp first
  const sortedMessages = [...messages].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

  // Group messages by thread_ts
  sortedMessages.forEach(msg => {
    const threadKey = msg.thread_ts || msg.ts;

    // If message has replies or is part of a thread
    if (msg.thread_ts || msg.reply_count > 0) {
      if (!threads[threadKey]) {
        threads[threadKey] = {
          thread_ts: threadKey,
          parent_message: null,
          replies: [],
          total_messages: 0,
          participants: new Set()
        };
      }

      if (msg.ts === threadKey || (!msg.is_thread_reply && msg.reply_count > 0)) {
        // This is the parent message
        threads[threadKey].parent_message = msg;
      } else {
        // This is a reply
        threads[threadKey].replies.push(msg);
      }

      threads[threadKey].total_messages++;
      if (msg.user_name) threads[threadKey].participants.add(msg.user_name);
    } else {
      // Standalone message (not part of any thread)
      standalone.push(msg);
    }
  });

  // Convert to array and format for export
  const threadArray = Object.values(threads).map(thread => {
    // Sort replies by timestamp
    thread.replies.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

    // Build conversation text for easy reading
    let conversationText = '';
    if (thread.parent_message) {
      conversationText += `[${thread.parent_message.message_date || ''} ${thread.parent_message.message_time || ''}] ${thread.parent_message.user_name || 'Unknown'}: ${thread.parent_message.text || ''}\n`;
    }
    thread.replies.forEach(reply => {
      conversationText += `  └─ [${reply.message_date || ''} ${reply.message_time || ''}] ${reply.user_name || 'Unknown'}: ${reply.text || ''}\n`;
    });

    return {
      thread_ts: thread.thread_ts,
      parent_message: thread.parent_message,
      replies: thread.replies,
      reply_count: thread.replies.length,
      total_messages: thread.total_messages,
      participants: Array.from(thread.participants),
      conversation_text: conversationText.trim()
    };
  });

  // Sort threads by parent message timestamp
  threadArray.sort((a, b) => parseFloat(a.thread_ts) - parseFloat(b.thread_ts));

  return {
    exported_at: new Date().toISOString(),
    summary: {
      total_messages: messages.length,
      total_threads: threadArray.length,
      standalone_messages: standalone.length,
      unique_users: [...new Set(messages.map(m => m.user_name).filter(Boolean))].length
    },
    threads: threadArray,
    standalone_messages: standalone
  };
}

// Filter messages by current time range settings
function filterMessagesByTimeRange(messages) {
  const fromValue = timeRangeFrom.value;
  const toValue = timeRangeTo.value;

  if (!fromValue && !toValue) {
    return messages; // No filter applied
  }

  const fromTs = fromValue ? Date.parse(fromValue) / 1000 : null;
  const toTs = toValue ? Date.parse(toValue) / 1000 : null;

  return messages.filter(msg => {
    const msgTs = parseFloat(msg.ts);
    if (isNaN(msgTs)) return true;
    if (fromTs && msgTs < fromTs) return false;
    if (toTs && msgTs > toTs) return false;
    return true;
  });
}

// Export data
async function exportData(format) {
  const data = await chrome.storage.local.get(['extractedMessages']);
  let messages = data.extractedMessages || [];

  if (messages.length === 0) {
    addLog('No data to export', 'warning');
    return;
  }

  // Apply time range filter
  const originalCount = messages.length;
  messages = filterMessagesByTimeRange(messages);

  if (messages.length === 0) {
    addLog('No messages in selected time range', 'warning');
    return;
  }

  if (messages.length < originalCount) {
    addLog(`Filtered to ${messages.length} of ${originalCount} messages by time range`, 'info');
  }

  let content, filename, type;
  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    // Organize messages by threads for easier analysis
    const organizedData = organizeMessagesByThreads(messages);
    content = JSON.stringify(organizedData, null, 2);
    filename = `slack_messages_${timestamp}.json`;
    type = 'application/json';
  } else {
    // CSV format
    const headers = [
      'timestamp',
      'message_date',
      'message_time',
      'user_id',
      'user_name',
      'text',
      'thread_ts',
      'reply_count',
      'reactions'
    ];
    const rows = messages.map(msg => {
      const dateParts = getMessageDateParts(msg);
      return [
        msg.ts,
        msg.message_date || dateParts.date,
        msg.message_time || dateParts.time,
        msg.user_id || '',
        msg.user_name || '',
        `"${(msg.text || '').replace(/"/g, '""')}"`,
        msg.thread_ts || '',
        msg.reply_count || 0,
        msg.reactions ? JSON.stringify(msg.reactions) : ''
      ];
    });
    content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    filename = `slack_messages_${timestamp}.csv`;
    type = 'text/csv';
  }

  // Create and download file
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);

  await chrome.downloads.download({
    url,
    filename,
    saveAs: true
  });

  addLog(`Exported ${messages.length} messages as ${format.toUpperCase()}`, 'success');
}

// Update UI state
function updateUI(state, phase = null) {
  statusDot.className = `status-dot ${state}`;

  switch (state) {
    case 'ready':
      statusText.textContent = 'Ready';
      startBtn.disabled = false;
      startBtn.style.display = 'flex';
      secondaryControls.style.display = 'none';
      extractionState.isRunning = false;
      extractionState.isPaused = false;
      break;
    case 'running':
      if (phase === 'jumping') {
        statusText.textContent = 'Jumping to target date...';
      } else if (phase === 'scrolling') {
        statusText.textContent = 'Phase 1: Scrolling...';
      } else if (phase === 'threads') {
        statusText.textContent = 'Phase 2: Extracting threads...';
      } else {
        statusText.textContent = 'Extracting...';
      }
      startBtn.style.display = 'none';
      secondaryControls.style.display = 'flex';
      pauseBtn.innerHTML = '<span class="btn-icon">⏸️</span> Pause';
      extractionState.isRunning = true;
      extractionState.isPaused = false;
      break;
    case 'paused':
      statusText.textContent = 'Paused';
      pauseBtn.innerHTML = '<span class="btn-icon">▶️</span> Resume';
      extractionState.isPaused = true;
      break;
    case 'completed':
      statusText.textContent = 'Completed';
      startBtn.disabled = false;
      startBtn.style.display = 'flex';
      startBtn.innerHTML = '<span class="btn-icon">🔄</span> Restart';
      secondaryControls.style.display = 'none';
      extractionState.isRunning = false;
      break;
    case 'error':
      statusText.textContent = 'Error';
      startBtn.disabled = false;
      startBtn.style.display = 'flex';
      secondaryControls.style.display = 'none';
      extractionState.isRunning = false;
      break;
  }
}

// Update state from content script
async function updateState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url.includes('app.slack.com')) {
      channelName.textContent = 'Not on Slack';
      startBtn.disabled = true;
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'GET_STATE' });

    if (response) {
      channelName.textContent = response.channelName || 'Unknown Channel';
      messageCount.textContent = response.messageCount || 0;
      threadCount.textContent = response.threadCount || 0;
      extractedThreadCount.textContent = response.extractedThreadCount || 0;
      userCount.textContent = response.userCount || 0;

      // Calculate speed
      if (extractionState.startTime && response.messageCount > 0) {
        const elapsed = (Date.now() - extractionState.startTime) / 60000; // minutes
        const speed = Math.round(response.messageCount / elapsed);
        extractionSpeed.textContent = `~${speed}/min`;
      }

      // Update progress (estimate based on scroll position)
      if (response.scrollProgress !== undefined) {
        progressBar.style.width = `${response.scrollProgress}%`;
      }

      // Update last save time
      if (response.lastSaveTime) {
        lastSaveTime.textContent = `Last saved: ${new Date(response.lastSaveTime).toLocaleTimeString()}`;
      }

      // Update data size with time range filter info
      const data = await chrome.storage.local.get(['extractedMessages']);
      const allMessages = data.extractedMessages || [];
      const filteredMessages = filterMessagesByTimeRange(allMessages);
      const size = JSON.stringify(allMessages).length;

      if (filteredMessages.length < allMessages.length) {
        dataSize.textContent = `${formatBytes(size)} (${filteredMessages.length} of ${allMessages.length} in range)`;
      } else {
        dataSize.textContent = `${formatBytes(size)} (${allMessages.length} messages)`;
      }

      // Update UI based on state
      if (response.isRunning) {
        updateUI(response.isPaused ? 'paused' : 'running', response.extractionPhase);
      } else if (response.isCompleted) {
        updateUI('completed');
      }
    }
  } catch (error) {
    // Content script not ready
    startBtn.disabled = true;
  }
}

// Poll for state updates
function startStatePolling() {
  setInterval(updateState, 1000);
}

// Add log entry
function addLog(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logContainer.insertBefore(entry, logContainer.firstChild);

  // Keep only last 50 entries
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

// Format bytes
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getMessageDateParts(msg) {
  const parsed = Number.parseFloat(msg.ts);
  if (Number.isNaN(parsed)) {
    return { date: '', time: '' };
  }
  const date = new Date(parsed * 1000);
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

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'LOG':
      addLog(message.text, message.level);
      break;
    case 'PROGRESS':
      messageCount.textContent = message.messageCount;
      threadCount.textContent = message.threadCount;
      extractedThreadCount.textContent = message.extractedThreadCount || 0;
      userCount.textContent = message.userCount;
      if (message.extractionPhase) {
        updateUI('running', message.extractionPhase);
      }
      break;
    case 'JUMPING':
      updateUI('running', 'jumping');
      addLog(`Quick jumping ${message.direction} to reach target date...`, 'info');
      break;
    case 'JUMP_PROGRESS':
      const targetDate = new Date(message.targetDate).toLocaleDateString();
      const visibleDate = new Date(message.visibleNewest).toLocaleDateString();
      statusText.textContent = `Jumping... (at ${visibleDate}, target: ${targetDate})`;
      break;
    case 'COMPLETED':
      updateUI('completed');
      addLog('Extraction completed!', 'success');
      break;
    case 'ERROR':
      updateUI('error');
      addLog(message.error, 'error');
      break;
    case 'SAVED':
      lastSaveTime.textContent = `Last saved: ${new Date().toLocaleTimeString()}`;
      break;
  }
});
