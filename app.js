const STORAGE_KEY = "soft75_tracker_entries_v1";
const REMOTE_UPDATE_CHECK_MS = 60000;

const TASKS = [
  { id: "workout", label: "Workout (45 min)" },
  { id: "water", label: "Water (3L)" },
  { id: "healthy", label: "Healthy eating (2000 calories)" },
  { id: "schoolReading", label: "Reading for School (90 minutes)" },
  { id: "reading", label: "Reading (10 pages)" }
];

let entries = loadEntries();
ensureTodayEntry();

const dom = {
  dateLabel: document.getElementById("entryDateLabel"),
  datePicker: document.getElementById("datePicker"),
  goTodayBtn: document.getElementById("goTodayBtn"),
  taskList: document.getElementById("taskList"),
  mood: document.getElementById("mood"),
  moodValue: document.getElementById("moodValue"),
  notes: document.getElementById("notes"),
  progressBar: document.getElementById("progressBar"),
  progressPercent: document.getElementById("progressPercent"),
  saveBtn: document.getElementById("saveBtn"),
  exportBackupBtn: document.getElementById("exportBackupBtn"),
  importBackupBtn: document.getElementById("importBackupBtn"),
  importBackupInput: document.getElementById("importBackupInput"),
  deleteDayBtn: document.getElementById("deleteDayBtn"),
  resetDataBtn: document.getElementById("resetDataBtn"),
  saveState: document.getElementById("saveState"),
  historyList: document.getElementById("historyList"),
  streakCount: document.getElementById("streakCount"),
  weeklyCount: document.getElementById("weeklyCount")
};

let activeDate = getTodayKey();
let knownAppTag = "";

render();
setupCrossTabSync();
setupRemoteUpdateCheck();

function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function setSaveState(text) {
  dom.saveState.textContent = text;
}

function downloadBackupFile() {
  const payload = {
    exportedAt: new Date().toISOString(),
    storageKey: STORAGE_KEY,
    entries
  };
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tracker-backup.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setSaveState("Backup file exported");
}

function isValidEntriesRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    return (
      typeof entry.date === "string" &&
      entry.checks &&
      typeof entry.checks === "object" &&
      typeof entry.note === "string" &&
      typeof entry.mood === "number"
    );
  });
}

function importBackupFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result || "{}"));
      const importedEntries =
        parsed && typeof parsed === "object" && "entries" in parsed
          ? parsed.entries
          : parsed;

      if (!isValidEntriesRecord(importedEntries)) {
        window.alert("Invalid backup format.");
        return;
      }

      entries = importedEntries;
      saveEntries();
      activeDate = getTodayKey();
      ensureEntryForDate(activeDate);
      render();
      setSaveState("Backup imported");
    } catch {
      window.alert("Could not read backup JSON.");
    } finally {
      dom.importBackupInput.value = "";
    }
  };
  reader.onerror = () => {
    window.alert("Failed to read the selected file.");
    dom.importBackupInput.value = "";
  };
  reader.readAsText(file);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function createDefaultEntry(dateKey) {
  const checks = {};
  TASKS.forEach((task) => {
    checks[task.id] = false;
  });

  return {
    date: dateKey,
    checks,
    note: "",
    mood: 3,
    updatedAt: Date.now()
  };
}

function ensureTodayEntry() {
  const today = getTodayKey();
  ensureEntryForDate(today);
}

function ensureEntryForDate(dateKey) {
  if (!entries[dateKey]) {
    entries[dateKey] = createDefaultEntry(dateKey);
    saveEntries();
  }
}

function completionOf(entry) {
  const done = TASKS.filter((task) => entry.checks[task.id]).length;
  return Math.round((done / TASKS.length) * 100);
}

function isDayCompleted(entry) {
  return TASKS.every((task) => entry.checks[task.id]);
}

function dateDisplay(dateKey) {
  const d = new Date(`${dateKey}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function sortedDateKeysDesc() {
  return Object.keys(entries).sort((a, b) => b.localeCompare(a));
}

function render() {
  ensureEntryForDate(activeDate);
  const current = entries[activeDate];
  dom.dateLabel.textContent = `${dateDisplay(activeDate)} ${
    activeDate === getTodayKey() ? "(Today)" : ""
  }`;
  dom.datePicker.value = activeDate;

  renderTasks(current);
  dom.mood.value = String(current.mood || 3);
  dom.moodValue.textContent = String(current.mood || 3);
  dom.notes.value = current.note || "";
  renderProgress(current);
  renderHistory();
  renderStats();
  renderSaveState(current);
}

function renderTasks(entry) {
  dom.taskList.innerHTML = "";
  TASKS.forEach((task) => {
    const row = document.createElement("label");
    row.className = "task-item";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!entry.checks[task.id];
    input.addEventListener("change", () => {
      updateActiveEntry((draft) => {
        draft.checks[task.id] = input.checked;
      });
    });
    const text = document.createElement("span");
    text.textContent = task.label;
    row.append(input, text);
    dom.taskList.appendChild(row);
  });
}

function renderProgress(entry) {
  const percent = completionOf(entry);
  dom.progressBar.style.width = `${percent}%`;
  dom.progressPercent.textContent = `${percent}%`;
}

function renderHistory() {
  dom.historyList.innerHTML = "";
  const keys = sortedDateKeysDesc();

  keys.forEach((dateKey) => {
    const entry = entries[dateKey];
    const wrapper = document.createElement("article");
    wrapper.className = "history-item";

    const head = document.createElement("div");
    head.className = "history-head";
    const title = document.createElement("strong");
    title.textContent = dateDisplay(dateKey);
    const completion = document.createElement("span");
    completion.className = "history-meta";
    completion.textContent = `${completionOf(entry)}% | Mood ${entry.mood || 3}/5`;
    head.append(title, completion);

    const actionRow = document.createElement("div");
    actionRow.className = "history-head";

    const status = document.createElement("span");
    status.className = "history-meta";
    status.textContent = isDayCompleted(entry)
      ? "Completed challenge day"
      : "In progress";

    const editBtn = document.createElement("button");
    editBtn.textContent = dateKey === activeDate ? "Editing" : "Edit";
    editBtn.disabled = dateKey === activeDate;
    editBtn.addEventListener("click", () => {
      activeDate = dateKey;
      render();
    });

    actionRow.append(status, editBtn);

    wrapper.append(head, actionRow);

    if (entry.note?.trim()) {
      const note = document.createElement("p");
      note.className = "history-note";
      note.textContent = entry.note;
      wrapper.appendChild(note);
    }

    dom.historyList.appendChild(wrapper);
  });
}

function renderStats() {
  const streak = calculateCurrentStreak();
  const weeklyDone = countCompletedInCurrentWeek();
  dom.streakCount.textContent = `${streak} day${streak === 1 ? "" : "s"}`;
  dom.weeklyCount.textContent = `${weeklyDone}/7`;
}

function calculateCurrentStreak() {
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (true) {
    const key = cursor.toISOString().slice(0, 10);
    const entry = entries[key];
    if (!entry || !isDayCompleted(entry)) {
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function countCompletedInCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() + mondayOffset);

  let count = 0;
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    if (entries[key] && isDayCompleted(entries[key])) {
      count += 1;
    }
  }
  return count;
}

function updateActiveEntry(mutator) {
  const current = entries[activeDate];
  mutator(current);
  current.updatedAt = Date.now();
  saveEntries();
  setSaveState(`Saved ${timeDisplay(current.updatedAt)}`);
  render();
}

function timeDisplay(ts) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderSaveState(entry) {
  if (entry?.updatedAt) {
    setSaveState(`Saved ${timeDisplay(entry.updatedAt)}`);
    return;
  }
  setSaveState("Not saved yet");
}

function deleteActiveDay() {
  if (!entries[activeDate]) {
    return;
  }
  const ok = window.confirm(
    `Delete entry for ${dateDisplay(activeDate)}? This cannot be undone.`
  );
  if (!ok) {
    return;
  }

  delete entries[activeDate];
  saveEntries();

  const keys = sortedDateKeysDesc();
  if (keys.length === 0) {
    activeDate = getTodayKey();
    ensureEntryForDate(activeDate);
  } else {
    activeDate = keys[0];
  }
  render();
}

function resetAllData() {
  const ok = window.confirm(
    "Reset all tracker data? This removes every saved day."
  );
  if (!ok) {
    return;
  }

  entries = {};
  localStorage.removeItem(STORAGE_KEY);
  activeDate = getTodayKey();
  ensureEntryForDate(activeDate);
  setSaveState("Data reset");
  render();
}

function setupCrossTabSync() {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) {
      return;
    }
    entries = loadEntries();
    ensureEntryForDate(activeDate);
    render();
    setSaveState("Synced from another tab");
  });
}

async function readAppTag() {
  try {
    const response = await fetch("app.js", {
      method: "HEAD",
      cache: "no-store"
    });
    if (!response.ok) {
      return "";
    }
    return (
      response.headers.get("etag") ||
      response.headers.get("last-modified") ||
      ""
    );
  } catch {
    return "";
  }
}

function setupRemoteUpdateCheck() {
  const checkForUpdate = async () => {
    const tag = await readAppTag();
    if (!tag) {
      return;
    }
    if (!knownAppTag) {
      knownAppTag = tag;
      return;
    }
    if (tag !== knownAppTag) {
      window.location.reload();
    }
  };

  checkForUpdate();
  window.setInterval(checkForUpdate, REMOTE_UPDATE_CHECK_MS);
}

dom.mood.addEventListener("input", () => {
  const value = Number(dom.mood.value);
  dom.moodValue.textContent = String(value);
  updateActiveEntry((draft) => {
    draft.mood = value;
  });
});

dom.notes.addEventListener("input", () => {
  updateActiveEntry((draft) => {
    draft.note = dom.notes.value;
  });
});

dom.datePicker.addEventListener("change", () => {
  if (!dom.datePicker.value) {
    return;
  }
  activeDate = dom.datePicker.value;
  ensureEntryForDate(activeDate);
  render();
});

dom.goTodayBtn.addEventListener("click", () => {
  activeDate = getTodayKey();
  ensureEntryForDate(activeDate);
  render();
});

dom.saveBtn.addEventListener("click", () => {
  const current = entries[activeDate];
  current.updatedAt = Date.now();
  saveEntries();
  setSaveState(`Saved ${timeDisplay(current.updatedAt)}`);
  render();
});

dom.exportBackupBtn.addEventListener("click", () => {
  downloadBackupFile();
});

dom.importBackupBtn.addEventListener("click", () => {
  dom.importBackupInput.click();
});

dom.importBackupInput.addEventListener("change", () => {
  const file = dom.importBackupInput.files?.[0];
  if (!file) {
    return;
  }
  importBackupFile(file);
});

dom.deleteDayBtn.addEventListener("click", () => {
  deleteActiveDay();
});

dom.resetDataBtn.addEventListener("click", () => {
  resetAllData();
});
