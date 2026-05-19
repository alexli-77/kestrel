"use strict";

function partsFor(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
}

function localDateKey(date, timeZone) {
  const p = partsFor(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

function localMinutes(date, timeZone) {
  const p = partsFor(date, timeZone);
  return Number(p.hour) * 60 + Number(p.minute);
}

function parseTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value || "");
  if (!match) throw new Error(`invalid daily time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

function isDueToday(schedule, now, timeZone, dateKey) {
  if (!schedule || schedule.type !== "daily") return false;
  const today = localDateKey(now, timeZone);
  if (dateKey && dateKey < today) return true;
  if (dateKey && dateKey > today) return false;
  const due = parseTime(schedule.time);
  const after = Number(schedule.catchup_after_minutes ?? 0);
  return localMinutes(now, timeZone) >= due + after;
}

module.exports = { localDateKey, localMinutes, parseTime, isDueToday };
