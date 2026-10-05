import * as shared from "./index";

describe("package entry", () => {
  it("re-exports every module's public API", () => {
    const names = [
      // ids, tz, csv, sync
      "isUuid", "newIdFrom", "uuidV7Timestamp", "hashBytes", "idFromKey",
      "zonedParts", "zonedMidnight", "zonedInstant", "addDaysToKey", "dayKeyOf", "weekdayOfKey", "localTime",
      "csvEscape", "toCsv",
      "mergeRows", "pickWinner", "rowVersion", "diffDirty", "applyPull", "pullCursor", "planRemoteApply",
      // units
      "roundTenth", "toF", "toC", "convert", "toStoredF", "displayTemp", "formatTemp",
      // schemas
      "KitchenSchema", "CheckpointSchema", "ReadingSchema", "CoolingItemSchema", "SettingsSchema", "DEFAULT_SETTINGS",
      "KitchenMemberSchema", "DeviceSchema", "JoinCodeSchema", "SyncPushRequestSchema", "SyncPullResponseSchema",
      "SyncPushResponseSchema", "SYNC_TABLE_NAMES", "CHECKPOINT_KINDS",
      // limits, cooling
      "FOOD_CODE_DEFAULTS", "COOKING_MINIMUMS_F", "defaultLimitsFor", "evaluateReading", "limitsLabel", "kindLabel", "checkpointTone",
      "COOLING_LIMITS", "coolingDeadlines", "evaluateCooling", "expireCooling", "discardCooling", "nextCoolingPrompt",
      "coolingProgress", "coolingLabel", "formatMinutes",
      // schedule, compliance, report
      "checkIdFor", "expandChecks", "classifyChecks", "dueChecks", "missedChecks", "nextCheck", "checkForReading",
      "DEFAULT_GRACE_MINUTES",
      "dailyCompliance", "weeklyCompliance", "checkpointStats", "fullyLoggedStreak",
      "dailyReportModel", "rangeReportModel", "toCsvRows", "CSV_HEADER", "correctiveActionLabel",
      // design tokens
      "tokens",
    ];
    for (const n of names) expect(shared, n).toHaveProperty(n);
  });
});
