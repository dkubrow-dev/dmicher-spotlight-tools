# dmicher Spotlight Tools 1.3.1

## Русский

- Рабочая ветка Ширмы: добавлены мировые события и операции заявок, опросов, таймеров, перерыва, секундомера и аудита фокуса. Точки «Автоматизация» используют общий редактор Ширмы; подписки работают без сцены и сохраняются у своего инструмента с ревизией. Без Ширмы ручные функции остаются доступными.
- Автоматизация исполняется избранным полным мастером, проверяет актуальность исполнения и Premium перед защищённой операцией. Остановка отменяет ожидания даже на паузе. Заявки НПС, автоматический секундомер и запрос Информатора об актуальности внимания — Premium; ручной секундомер бесплатен.
- Аудит публикует изменения статуса игрока и зоны показателя, а также переходы всех несерых показателей в жёлтую или красную зону. Пустой набор не считается совпадением. Сброс одного/всех показателей возвращает их в зелёную зону. Отмена всех заявок включает заявку окружения.

- В Premium свой звук заявки, таймера и перерыва можно выбрать или загрузить через штатное окно файлов Foundry. Поле принимает путь к файлу и прямую внешнюю ссылку. Перед сохранением проверяется воспроизведение; права загрузки определяет Foundry.
- В «Плейлисты → Управление громкостью» убраны значки вопроса у строк «Заявки» и «Таймеры». Ползунки и их поведение сохранены; описания настроек остаются в справке.
- Исправлена видимость ленты заявок при выключенном «Показывать ленту заявок игрокам»: после запуска мира лента доступна мастеру и ассистенту, а игрокам скрыта.
- Флаг «Включить» по-прежнему управляет лентой для всех. Премиальный показ времени не меняет права просмотра.
- Совместимость: Foundry VTT 13 и 14.

Обновите модуль и перезагрузите страницу мира. Ветка разработки Ширмы сохраняет обязательную зависимость от Generics 1.0.0 и подключения через его API.

## English

- Master Screen development branch: world events and operations now cover requests, polls, timers, breaks, the stopwatch and focus audit. Automation entry points reuse Master Screen's editor; subscriptions run without a scene and are stored with revisions on their owning tool. Manual tools remain available without Master Screen.
- An elected full GM executes automation, checking execution validity and Premium before protected operations. Stop cancels pending work even while paused. NPC requests, automated stopwatch operations and Informer attention prompts require Premium; the manual stopwatch remains free.
- Focus audit emits player status and indicator-zone changes, plus transitions where all non-gray indicators become yellow or red. An empty set does not match. Resetting one/all indicators returns them to green. Cancelling all requests includes the environment request.

- Premium request, timer and break sounds can be selected or uploaded through Foundry's native file browser. The field accepts a file path or direct external URL. Playback is checked before saving; Foundry controls upload permissions.
- Requests and Timers in Playlists → Volume controls no longer display question icons. Slider behavior and the corresponding help descriptions remain available.
- Fixed Request Feed visibility when “Show Request Feed to players” is disabled: the feed is available to the GM and assistant after world startup and remains hidden from players.
- “Enable” still controls the feed for everyone. The Premium timestamp option does not change visibility permissions.
- Compatible with Foundry VTT 13 and 14.

Update the module and reload the world page. The Master screen development branch retains its required Generics 1.0.0 dependency and shared API integrations.
