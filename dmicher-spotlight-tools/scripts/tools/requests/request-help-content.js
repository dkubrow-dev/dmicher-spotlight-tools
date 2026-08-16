function definePage(id, key, sections) {
  return Object.freeze({
    id,
    key,
    sections: Object.freeze(sections.map(([sectionKey, items]) => Object.freeze({
      key: sectionKey,
      items: Object.freeze([...items])
    })))
  });
}

function defineGroup(id, key, pages) {
  return Object.freeze({ id, key, pages: Object.freeze(pages) });
}

const requestPages = [
  definePage("overview", "Overview", [
    ["Types", ["Regular", "Urgent", "Environment"]],
    ["Mechanics", ["Queue", "Chat", "Identity", "Authority", "Resolution"]],
    ["Navigation", ["Contents", "Theme", "OpenSettings", "OpenMasterSettings", "OpenManagement", "ModuleMenu", "SceneControls"]]
  ]),
  definePage("players", "Players", [
    ["Window", ["SettingsWindow", "RequestBlock", "Image", "Text", "Color", "FontSize", "Underline", "Italic", "Bold", "Alignment", "Save", "TimeoutOverlay"]],
    ["Submission", ["Click", "Drag", "ExistingMacro", "RestrictionFeedback", "ModeratorRequired", "MacroMetadata", "MacroCleanup"]],
    ["Chat", ["Card", "Cancel", "Grant", "TakeFloor", "Technical"]],
    ["Volume", ["Slider", "Formula", "Mute", "FoundryMute"]]
  ]),
  definePage("master-settings", "MasterSettings", [
    ["Access", ["Window", "GameSettingsButton", "ModeratorOnly"]],
    ["Blocks", ["Feed", "Limits", "Images", "Sounds", "Welcome", "Save"]]
  ]),
  definePage("management", "Management", [
    ["Summary", ["WindowCounter", "Totals", "VisibleCounter", "Refresh"]],
    ["Filters", ["Type", "DuplicatesNone", "DuplicatesType", "DuplicatesPlayer"]],
    ["Row", ["Images", "Submitted", "Author", "OpenMessage", "Grant", "Cancel"]],
    ["Queue", ["ResetTimeouts", "EnvironmentRequest", "Clear", "Empty", "EnvironmentGrant"]]
  ]),
  definePage("customization", "Customization", [
    ["Images", ["TypeSections", "CustomToggle", "Url", "Validation", "Preview", "ExistingMacros"]],
    ["Sounds", ["GlobalToggle", "CustomToggle", "Url", "BaseVolume", "Preview", "FinalVolume", "TimerCustom", "BreakCustom", "TimerVolume", "FoundryMute"]],
    ["Welcome", ["Toggle", "PlayerMessage", "ModeratorMessage", "InternalButtons", "Free", "Support"]]
  ]),
  definePage("limits", "Limits", [
    ["Chat", ["ChatToggle", "QueueWithoutChat"]],
    ["Types", ["RegularSection", "UrgentSection", "Unlimited", "CountMode", "CountField", "Forbidden", "TimeoutSelect", "TimeoutNone", "TimeoutSubmission", "TimeoutGrant", "TimeoutTime"]],
    ["Environment", ["Toggle", "AllTypes", "Priority", "ExistingQueue"]],
    ["Enforcement", ["LocalCheck", "AuthoritativeCheck", "Warnings", "TimeoutDisplay", "TimeoutWarning", "TimeoutDrag", "TimeoutReset", "TimeoutExpiry"]]
  ]),
  definePage("feed", "Feed", [
    ["Settings", ["Enable", "ReloadPrompt", "ReloadNow", "ReloadLater", "ShowTime"]],
    ["Rows", ["Tab", "Images", "Names", "Time", "Empty"]],
    ["Controls", ["PlayerCancel", "ModeratorGrant", "ModeratorCancel"]],
    ["Footer", ["MacroClick", "MacroDrag", "Settings", "ResetTimeouts", "Management", "TimeoutOverlay"]]
  ])
];

const pollPages = [
  definePage("polls-overview", "PollsOverview", [
    ["Access", ["Manager", "ModeratorOnly", "WorldState", "OneActive"]],
    ["Types", ["Buttons", "Radio", "Checkbox", "Text"]],
    ["Lifecycle", ["Template", "Launch", "PrivateRequest", "Answer", "Finish"]]
  ]),
  definePage("polls-templates", "PollsTemplates", [
    ["Table", ["Macro", "Name", "Type", "LastResult", "Edit", "Start", "Results", "Delete"]],
    ["Form", ["NewTemplate", "PollName", "Question", "TypeSelect", "Options", "OptionToggle", "Participants", "TimerToggle", "TimerTime", "TimerSound"]],
    ["Actions", ["Cancel", "Save", "StartTemporary", "RestoreDefaults", "ClearActive"]],
    ["Macros", ["Drag", "Existing", "MissingTemplate", "Metadata", "Cleanup"]]
  ]),
  definePage("polls-launch", "PollsLaunch", [
    ["Summary", ["Type", "SelectedCount", "Name", "Question"]],
    ["Timer", ["Enable", "Time", "Sound", "OrdinaryTimer"]],
    ["Participants", ["Selection", "Inactive", "Required"]],
    ["Options", ["Enable", "Rename", "Limits", "Text"]],
    ["Actions", ["FinishCurrent", "Cancel", "Start", "Validation"]]
  ]),
  definePage("polls-voting", "PollsVoting", [
    ["Delivery", ["PrivateCard", "Moderators", "TargetOnly"]],
    ["Input", ["ButtonChoice", "RadioChoice", "CheckboxChoice", "TextAnswer", "Submit", "Cancel", "Empty"]],
    ["Processing", ["PrimaryModerator", "FirstAnswer", "RequestRemoved", "ResultMessage"]]
  ]),
  definePage("polls-results", "PollsResults", [
    ["Header", ["NameQuestion", "Type", "Started", "StartedBy"]],
    ["Summary", ["Options", "Counts", "Voters", "TextNoSummary"]],
    ["Responses", ["Player", "Status", "Answer", "AnsweredAt"]],
    ["Actions", ["Post", "Finish", "Close", "TemporaryClose"]],
    ["Completion", ["Pending", "LastResult", "TimerSeparate"]]
  ])
];

const timerPages = [
  definePage("timers-overview", "TimersOverview", [
    ["Access", ["Manager", "ModeratorOnly", "WorldState"]],
    ["Visibility", ["Public", "Private", "AutoOpen", "Chat"]],
    ["Time", ["Duration", "Deadline", "NextDay", "Accuracy"]],
    ["Volume", ["Personal", "Formula", "Mute", "FoundryMute"]]
  ]),
  definePage("timers-manager", "TimersManager", [
    ["Form", ["Name", "Mode", "Time", "Visibility", "Style", "Sound", "CustomSound", "Volume", "Preview", "Reset", "Start"]],
    ["Table", ["Name", "StartedBy", "StartedAt", "Deadline", "Remaining", "Open", "Repeat", "Delete"]],
    ["Cleanup", ["ExpiredRows", "DeleteExpired", "ConfirmActive"]]
  ]),
  definePage("timers-window", "TimersWindow", [
    ["Display", ["Prominent", "Compact", "Toggle", "Drag", "Close"]],
    ["Active", ["Remaining", "Deadline", "Cancel"]],
    ["Expired", ["ForceProminent", "Sound", "Delete", "OncePerClient"]],
    ["Chat", ["Watch", "PublicCard", "PrivateCard"]]
  ]),
  definePage("timers-break", "TimersBreak", [
    ["Selection", ["Options", "Default", "RoundedDeadline", "LiveDeadline"]],
    ["Actions", ["Cancel", "Announce"]],
    ["Result", ["Pause", "PublicTimer", "Prominent", "Signal", "CustomSignal", "Chat", "NoAutoResume"]],
    ["Failure", ["RollbackPause"]]
  ])
];

const stopwatchPages = [
  definePage("stopwatch-overview", "StopwatchOverview", [
    ["Access", ["ModeratorOnly", "LocalState", "CloseKeeps", "ReloadResets", "Minimize"]],
    ["Clock", ["Display", "Start", "Pause", "StopReset", "Accumulation"]]
  ]),
  definePage("stopwatch-events", "StopwatchEvents", [
    ["Buttons", ["Circle", "Square", "Plus", "Minus"]],
    ["Recording", ["Click", "Keyboard", "Timestamp", "Paused", "NotStarted"]],
    ["List", ["Icon", "Label", "Time", "Scroll"]],
    ["Macros", ["Drag", "ChatMacro", "MacroUse", "Metadata", "Cleanup"]]
  ]),
  definePage("stopwatch-output", "StopwatchOutput", [
    ["Actions", ["Post", "EmptyPost", "Clear"]],
    ["Separation", ["ClearKeepsClock", "ResetKeepsEvents", "NotSynchronized"]],
    ["Chat", ["Table", "EventColumn", "TimeColumn"]]
  ])
];

const auditPages = [
  definePage("audit-overview", "AuditOverview", [
    ["Access", ["ModeratorOnly", "WorldState", "AutoRefresh"]],
    ["Indicators", ["Good", "Doubt", "Problem", "Deadline", "Muted"]],
    ["Scope", ["Enabled", "Disabled", "Sorting"]]
  ]),
  definePage("audit-status", "AuditStatus", [
    ["Location", ["PlayerList", "Selector", "Indicator"]],
    ["Statuses", ["Playing", "Listening", "Away", "Unavailable", "Unknown"]],
    ["Sync", ["PlayerRequest", "PrimaryModerator", "PrivateNotice", "LoginDefault"]]
  ]),
  definePage("audit-window", "AuditWindow", [
    ["Columns", ["Enable", "Player", "FoundryStatus", "SelfStatus", "LastRequest", "ActiveRequest", "LastChat", "LastGranted"]],
    ["Controls", ["Grant", "ResetPlayer", "ResetAll", "Settings"]],
    ["Behavior", ["Tooltips", "RequestsIntegration", "ChatIntegration"]]
  ]),
  definePage("audit-settings", "AuditSettings", [
    ["Blocks", ["PerMetric", "Description"]],
    ["Thresholds", ["Doubt", "Problem", "Deadline", "Units", "Order"]],
    ["Defaults", ["LastRequest", "ActiveRequest", "LastChat", "LastGranted"]],
    ["Actions", ["Save", "LiveUpdate", "Validation"]]
  ])
];

export const REQUEST_HELP_GROUPS = Object.freeze([
  defineGroup("requests", "Requests", requestPages),
  defineGroup("polls", "Polls", pollPages),
  defineGroup("timers", "Timers", timerPages),
  defineGroup("stopwatch", "Stopwatch", stopwatchPages),
  defineGroup("audit", "Audit", auditPages)
]);

export const REQUEST_HELP_PAGES = Object.freeze(REQUEST_HELP_GROUPS.flatMap((group) => group.pages));
