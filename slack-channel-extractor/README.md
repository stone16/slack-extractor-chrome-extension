# Slack Channel Extractor

**[English](README.md)** | **[中文](README_CN.md)**

Chrome Extension to extract messages from Slack channels with human-like behavior for analysis.

## Features

- Human-like scrolling to avoid detection
- Extracts messages, threads, reactions, and attachments
- Auto-save at configurable intervals
- Export to JSON or CSV format
- Analysis-ready thread organization
- Progress tracking and activity logging

## Installation

### 1. Generate Icons

First, create the required icon files. You can:

**Option A**: Use the included script to generate simple icons:
```bash
cd slack-channel-extractor
python3 generate_icons.py
```

**Option B**: Create your own PNG icons:
- `icons/icon16.png` (16x16 pixels)
- `icons/icon48.png` (48x48 pixels)
- `icons/icon128.png` (128x128 pixels)

### 2. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `slack-channel-extractor` folder
5. The extension icon should appear in your toolbar

## Usage

### Step 1: Navigate to Slack

1. Open [app.slack.com](https://app.slack.com) in Chrome
2. Log in to your workspace
3. Navigate to the channel you want to extract

### Step 2: Configure Settings

Click the extension icon to open the control panel:

- **Scroll Delay**: Time between scrolls (2-8 seconds). Higher = more human-like, but slower.
- **Include Thread Replies**: Whether to track thread metadata
- **Auto-save Interval**: Save data every N messages

### Step 3: Start Extraction

1. Click **Start Extraction**
2. The extension will:
   - Automatically scroll up through the channel
   - Extract visible messages
   - Pause occasionally to simulate reading
   - Auto-save at configured intervals
3. You can **Pause**, **Resume**, or **Stop** at any time

### Step 4: Export Data

When extraction is complete (or anytime):

- **Export JSON**: Full data with metadata
- **Export CSV**: Spreadsheet-compatible format

## Output Format

### JSON Export
```json
{
  "exported_at": "2024-01-15T10:30:00.000Z",
  "total_messages": 5000,
  "messages": [
    {
      "ts": "1705234567.123456",
      "user_id": "U12345678",
      "user_name": "john.doe",
      "text": "Hello everyone!",
      "thread_ts": null,
      "reply_count": 3,
      "reactions": [{"emoji": ":thumbsup:", "count": 5}],
      "attachments": [],
      "extracted_at": "2024-01-15T10:25:00.000Z"
    }
  ]
}
```

### CSV Export
```csv
timestamp,datetime,user_id,user_name,text,thread_ts,reply_count,reactions,attachments
1705234567.123456,2024-01-14T12:34:27.123Z,U12345678,john.doe,"Hello everyone!",,3,"[{""emoji"":"":thumbsup:"",""count"":5}]",[]
```

## Anti-Detection Features

The extension employs several strategies to avoid Slack's security detection:

1. **Human-like Scrolling**
   - Random scroll distances (200-500px)
   - Variable delays with randomization
   - Occasional longer "reading" pauses

2. **Real Browser Environment**
   - Uses your actual logged-in session
   - Full browser fingerprint preserved
   - No suspicious API patterns

3. **Natural Behavior**
   - User-triggered (not automated)
   - Visible operation (you see the scrolling)
   - Respects page load timing

## Best Practices

### For Large Channels (10,000+ messages)

1. **Use Longer Delays**: Set scroll delay to 5-8 seconds
2. **Take Breaks**: Pause extraction periodically
3. **Split Sessions**: Don't extract everything at once
4. **Save Often**: Use smaller auto-save intervals (50 messages)

### Recommendations

- Best time: Off-peak hours when channel is less active
- Keep Chrome tab visible (don't minimize)
- Don't use multiple Slack tabs simultaneously
- If extraction seems stuck, try refreshing the page

## Troubleshooting

### Extension Not Working

1. Ensure you're on `app.slack.com` (not the desktop app)
2. Refresh the Slack page
3. Check if extension is enabled in `chrome://extensions/`

### Missing Messages

1. Some messages may be in collapsed threads
2. Very old messages might require more scrolling
3. Check if you've reached the beginning of the channel

### Extraction Stops Unexpectedly

1. Page might have been scrolled to top
2. Network issue - refresh and resume
3. Check Chrome console for errors

## Data Analysis Tips

The exported data is ready for analysis. Common use cases:

### Intent Classification
```python
import json

with open('slack_messages.json') as f:
    data = json.load(f)

# Group messages by thread for conversation analysis
threads = {}
for msg in data['messages']:
    thread_ts = msg.get('thread_ts') or msg['ts']
    if thread_ts not in threads:
        threads[thread_ts] = []
    threads[thread_ts].append(msg)
```

### User Activity Analysis
```python
from collections import Counter

user_counts = Counter(msg['user_name'] for msg in data['messages'] if msg.get('user_name'))
print("Most active users:", user_counts.most_common(10))
```

## Privacy & Security

### 🔒 Data Privacy Guarantee

- **All data stays local**: Messages are stored only in your browser's local storage (Chrome's `chrome.storage.local`)
- **Zero external communication**: This extension does not send any data to external servers or third parties
- **No credentials required**: Uses your existing Slack browser session - no passwords, tokens, or API keys stored
- **No tracking or analytics**: No telemetry, usage statistics, or user behavior tracking
- **Full user control**: You decide what to extract, when to export, and where to store the data

### 🛡️ Security Best Practices

1. **Trusted Devices Only**: Only use this extension on computers you trust and control
2. **Secure Storage**: Exported files may contain sensitive conversations - store them securely
3. **Clean Up After Use**: Delete exported data files after analysis if they contain sensitive information
4. **Organization Policies**: Be aware of and comply with your organization's data export and retention policies
5. **Review Before Sharing**: Always review exported files before sharing to ensure no sensitive information is included

### 🔐 Security Features

- **Local-only processing**: All message extraction and processing happens in your browser
- **No API abuse**: Does not use Slack's API (which would require tokens)
- **Session-based**: Leverages your authenticated browser session through standard DOM access
- **Open source**: All code is publicly available for security review
- **No external dependencies**: No third-party libraries that could introduce vulnerabilities

### ⚠️ Important Notes

- This tool is designed for legitimate data analysis and archival purposes
- Respect privacy: Only extract data from channels you have legitimate access to
- Comply with laws: Ensure your use complies with applicable data protection regulations (GDPR, CCPA, etc.)
- Workspace policies: Review your Slack workspace's data export policies before use

### 🐛 Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email security concerns to: [Create a GitHub Security Advisory](https://github.com/stone16/slack-extractor-chrome-extension/security/advisories/new)
3. Include detailed steps to reproduce the issue
4. Allow reasonable time for a fix before public disclosure

We take security seriously and will respond promptly to legitimate security concerns.

## Limitations

- Cannot extract private channels you don't have access to
- Cannot extract direct messages from public channels
- File contents are not downloaded (only metadata)
- Rate depends on Slack's page loading behavior

## License

MIT License - Feel free to modify and distribute.

---

## FAQ (Frequently Asked Questions)

### Is this tool legal?

Yes, this tool only accesses data you already have permission to view. It does not bypass any access controls or authentication mechanisms. However, you should:
- Comply with your organization's data use policies
- Follow applicable data protection laws
- Use only for legitimate and ethical purposes

### Will I be detected by Slack?

This tool simulates human scrolling behavior to reduce detection risk. However:
- There are no absolute guarantees
- Use reasonable scroll delays (recommended 3-5 seconds)
- Avoid massive extractions in short time periods
- Best to use during off-peak hours

### Where is the data stored?

All data is stored in your browser's local storage (`chrome.storage.local`). This means:
- Data never leaves your computer
- Uninstalling the extension removes stored data
- Exported files are saved to your chosen location

### Can I extract private channels?

Yes, but only private channels you already have access to. This tool uses your existing Slack session, so it can only access what you can normally view.

### How do I delete extracted data?

1. Click "Clear Cached Data" in the extension popup
2. Or uninstall the extension
3. Manually delete your exported JSON/CSV files

### Which browsers are supported?

Currently only Google Chrome and Chromium-based browsers (Edge, Brave) are supported. Firefox and Safari are not supported.

### Can I extract multiple channels simultaneously?

Not recommended. To reduce detection risk, extract one channel at a time. Complete one channel before starting the next.

---

## Contributing

Contributions are welcome! Feel free to submit Pull Requests or open Issues.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/stone16/slack-extractor-chrome-extension.git
cd slack-extractor-chrome-extension/slack-channel-extractor

# Generate icons
python3 generate_icons.py

# Load extension in Chrome for testing
# chrome://extensions/ -> Developer mode -> Load unpacked
```

### Code Style

- Use clear, descriptive variable names
- Add comments for complex logic
- Follow the existing code structure

---

## Acknowledgments

Thanks to all contributors and users who use this tool for data analysis.

---

## Disclaimer

This tool is provided for educational and legitimate data analysis purposes only. Users are responsible for ensuring their use complies with all applicable laws, regulations, and policies. The authors are not responsible for any misuse or abuse of this tool.
