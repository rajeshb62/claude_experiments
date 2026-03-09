// background/index.js — Service worker: alarms, message routing

import { generateDailyDigest } from '../lib/agents.js';
import { readVault, getVaultHandle, buildLinkGraph } from '../lib/vault.js';
import { buildIndex } from '../lib/index.js';

const DIGEST_ALARM = 'daily-digest';

// Setup digest alarm on install
chrome.runtime.onInstalled.addListener(() => {
  scheduleDailyDigest();
});

// Re-schedule on startup
chrome.runtime.onStartup.addListener(() => {
  scheduleDailyDigest();
});

async function scheduleDailyDigest() {
  const { digest_hour = 8 } = await chrome.storage.local.get('digest_hour');
  await chrome.alarms.clear(DIGEST_ALARM);
  chrome.alarms.create(DIGEST_ALARM, {
    when: nextAlarmTime(digest_hour),
    periodInMinutes: 24 * 60,
  });
}

function nextAlarmTime(hour) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== DIGEST_ALARM) return;
  try {
    const handle = await getVaultHandle();
    if (!handle) return;
    const files = await readVault(handle);
    const graph = buildLinkGraph(files);
    const index = buildIndex(files);
    const { digest, filename } = await generateDailyDigest({ files, graph, index }, handle);

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Personal OS — Daily Digest Ready',
      message: `Saved to ${filename}`,
    });

    // Store latest digest for popup display
    await chrome.storage.local.set({ latest_digest: digest, latest_digest_date: new Date().toISOString() });
  } catch (e) {
    console.error('Digest generation failed:', e);
  }
});

// Open side panel when extension icon clicked
chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({ tabId: tab.id });
});
