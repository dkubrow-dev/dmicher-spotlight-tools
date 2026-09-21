const pair = (ru, en) => ({ ru, en });
export const OWNER_LABELS = { requests: pair("Заявки", "Requests"), polls: pair("Опросы", "Polls"), timers: pair("Таймеры", "Timers"), break: pair("Перерыв", "Break"), stopwatch: pair("Секундомер", "Stopwatch"), focus: pair("Аудит внимания", "Focus audit") };
const options = rows => rows.map(([value, ru, en]) => ({ value, label: pair(ru, en) }));
const FIELDS = {
  actorUuid: { label: pair("НПС", "NPC") }, userId: { label: pair("Игрок", "Player") },
  timerId: { label: pair("Экземпляр таймера", "Timer instance") },
  minutes: { label: pair("Длительность, минут", "Duration, minutes") },
  neglectedMinutes: { label: pair("Без внимания, минут", "Without attention, minutes") },
  urgency: { label: pair("Уровень заявки", "Request urgency"), options: options([["common", "Обычная", "Common"], ["urgent", "Срочная", "Urgent"], ["stop", "Окружение", "Environment"]]) },
  eventType: { label: pair("Событие", "Event"), options: options([["sign1", "Круг", "Circle"], ["sign2", "Квадрат", "Square"], ["sign3", "Плюс", "Plus"], ["sign4", "Минус", "Minus"]]) },
  indicator: { label: pair("Показатель", "Indicator"), options: options([["lastRequest", "Последняя заявка", "Last request"], ["activeRequest", "Активная заявка", "Active request"], ["lastChat", "Последнее сообщение", "Last message"], ["lastGranted", "Последнее предоставление слова", "Last granted turn"]]) }
};
export const EVENTS = Object.freeze({
  requests: ["submitted", "cancelled", "granted"],
  polls: ["started", "answered", "allAnswered", "finished"],
  timers: ["started", "completed", "cancelled"],
  break: ["started", "finished"],
  stopwatch: ["started", "paused", "resumed", "finished", "reset", "cleared"],
  focus: ["statusChanged", "indicatorChanged", "allYellow", "allRed"]
});
export const EVENT_LABELS = Object.freeze({
  "requests.submitted": pair("Заявка подана", "Request submitted"),
  "requests.cancelled": pair("Заявка отменена", "Request cancelled"),
  "requests.granted": pair("Слово предоставлено", "Request granted"),
  "polls.started": pair("Опрос начат", "Poll started"),
  "polls.answered": pair("Получен ответ", "Answer received"),
  "polls.allAnswered": pair("Все участники ответили", "All participants answered"),
  "polls.finished": pair("Опрос завершён", "Poll finished"),
  "timers.started": pair("Таймер запущен", "Timer started"),
  "timers.completed": pair("Время таймера истекло", "Timer elapsed"),
  "timers.cancelled": pair("Таймер отменён", "Timer cancelled"),
  "break.started": pair("Перерыв начат", "Break started"),
  "break.finished": pair("Перерыв завершён", "Break finished"),
  "stopwatch.started": pair("Секундомер запущен", "Stopwatch started"),
  "stopwatch.paused": pair("Секундомер приостановлен", "Stopwatch paused"),
  "stopwatch.resumed": pair("Секундомер продолжен", "Stopwatch resumed"),
  "stopwatch.finished": pair("Секундомер завершён", "Stopwatch finished"),
  "stopwatch.reset": pair("Секундомер сброшен", "Stopwatch reset"),
  "stopwatch.cleared": pair("События секундомера очищены", "Stopwatch events cleared"),
  "focus.statusChanged": pair("Статус игрока изменён", "Player status changed"),
  "focus.indicatorChanged": pair("Зона показателя изменена", "Indicator zone changed"),
  "focus.allYellow": pair("Все активные показатели в жёлтой зоне", "All active indicators are yellow"),
  "focus.allRed": pair("Все активные показатели в красной зоне", "All active indicators are red")
});
const rows = [
  ["requests", "environment", "Заявка окружения", "Environment request"],
  ["requests", "submitNpc", "Заявка от НПС", "NPC request", true, { actorUuid: "", urgency: "common" }],
  ["requests", "resetTimeouts", "Сбросить таймауты", "Reset request timeouts"],
  ["requests", "grantNext", "Предоставить слово следующему", "Grant next request"],
  ["requests", "cancelAll", "Отменить все заявки", "Cancel all requests"],
  ["polls", "start", "Начать опрос", "Start poll"],
  ["polls", "results", "Результаты в чат", "Post poll results"],
  ["polls", "finish", "Завершить опрос", "Finish poll"],
  ["timers", "start", "Начать таймер", "Start timer"],
  ["timers", "cancel", "Удалить таймеры шаблона", "Delete template timers", false, { timerId: "" }],
  ["break", "start", "Начать перерыв", "Start break", false, { minutes: 10 }],
  ["break", "finish", "Завершить перерыв", "Finish break"],
  ["stopwatch", "start", "Начать секундомер", "Start stopwatch", true],
  ["stopwatch", "pause", "Приостановить секундомер", "Pause stopwatch", true],
  ["stopwatch", "resume", "Продолжить секундомер", "Resume stopwatch", true],
  ["stopwatch", "event", "Событие секундомера", "Record stopwatch event", true, { eventType: "sign1" }],
  ["stopwatch", "finish", "Завершить секундомер", "Finish stopwatch", true],
  ["stopwatch", "results", "Секундомер в чат", "Post stopwatch results", true],
  ["stopwatch", "reset", "Очистить секундомер", "Reset stopwatch", true],
  ["focus", "resetIndicator", "Сбросить показатель", "Reset indicator", false, { userId: "", indicator: "lastGranted" }],
  ["focus", "resetAll", "Сбросить показатели игрока", "Reset player indicators", false, { userId: "" }],
  ["focus", "request", "Запросить внимание к игроку", "Request attention for player", true, { userId: "", urgency: "common", neglectedMinutes: 15 }]
];
export const FUNCTIONS = rows.map(([type, operation, ru, en, premium = false, template = {}]) => ({
  id: `spotlight.${type}.${operation}`, label: pair(ru, en),
  path: pair(`системные.спотлайт.${({ requests: "заявки", polls: "опросы", timers: "таймеры", break: "перерыв", stopwatch: "секундомер", focus: "внимание" })[type]}`, `system.spotlight.${type}`),
  description: pair(ru, en), premium, ownerTypes: [type], template,
  fields: Object.fromEntries(Object.keys(template).map(key => [key, FIELDS[key]]))
}));
export function normalizeOwner(owner) {
  const type = String(owner?.type ?? "");
  if (!Object.hasOwn(EVENTS, type)) throw new Error("Unknown Spotlight owner");
  const id = ["polls", "timers"].includes(type) ? String(owner?.id ?? "") : type;
  if (!id || id.length > 120) throw new Error("A saved template ID is required");
  return { type, id };
}
