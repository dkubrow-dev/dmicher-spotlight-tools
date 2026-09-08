# dmicher Spotlight Tools 1.3.0

Рабочая пересборка: общий код вынесен в обязательный бесплатный `dmicher-generics` 1.0.0 / API 1. Его нужно установить и включить вместе со Spotlight; Premium остаётся необязательным. Прежние настройки темы и пользовательские функции Spotlight сохраняются. Перед публичным распространением этой пересборки необходимо опубликовать Generics; текущая работа не публикует релизы.

Development rebuild: the free `dmicher-generics` 1.0.0 / API 1 module is now required for shared window styles and helpers. Existing Spotlight settings and user features remain available; Premium is still optional. Publish Generics before publicly distributing this rebuild; this work does not publish releases.

Связь Spotlight с Premium перенесена в `generics.premium` API 1. Премиальные реализации разрешения и сохранения конфигурации размещены в пакете функций Premium. Прямые методы регистрации провайдера удалены из API Spotlight. Нормализация, бесплатные настройки и сохранённые значения защищены в Spotlight; сбой, несовместимость или отзыв доступа возвращают бесплатную реализацию без изменения сохранённых предпочтений. Для этой пересборки нужны согласованные локальные версии Generics, Premium и Spotlight.

Spotlight now connects to Premium through `generics.premium` API 1. Premium configuration resolution and saving are implemented in Premium's feature package. Direct provider registration has been removed from Spotlight's API. Spotlight retains normalization and protects free settings and saved preferences; errors, incompatibility or revoked access restore the free implementation without rewriting preferences. This rebuild requires matching local Generics, Premium and Spotlight builds.

Манифест этого выпуска закреплён за [Spotlight 1.3.0](https://github.com/dkubrow-dev/dmicher-spotlight-tools/releases/download/1.3.0/module.json); обязательная инфраструктурная зависимость — [Generics 1.0.0](https://github.com/dkubrow-dev/dmicher-generics/releases/download/1.0.0/module.json), минимум 1.0.0 / API 1. Один и тот же `module.json` используется в исходниках, рядом с ZIP и в корне ZIP. Базовая работа не требует сторонних модулей и внешних библиотек; Premium остаётся необязательным. Подключение сторонних исполнителей в будущих интеграциях требует явного выбора мастера в настройках.

This release pins its manifest to [Spotlight 1.3.0](https://github.com/dkubrow-dev/dmicher-spotlight-tools/releases/download/1.3.0/module.json) and the required infrastructure dependency to [Generics 1.0.0](https://github.com/dkubrow-dev/dmicher-generics/releases/download/1.0.0/module.json), minimum 1.0.0 / API 1. The source, standalone artifact, and ZIP-root `module.json` are identical. Base functionality requires no third-party modules or libraries; Premium remains optional. Future third-party providers require the Game Master's explicit selection in settings.

## Русский

Выпуск 1.3.0 входит в общий комплект с dmicher Premium 1.3.0 и dmicher licence server 1.3.0.

- Базовый модуль остаётся бесплатным: заявки, лента, таймеры, перерывы, опросы, статусы игроков и контроль внимания мастером доступны с Generics, без сателлита Premium.
- Подключение активного модуля `dmicher-premium` с действующей лицензией открывает премиальные настройки: показ времени в ленте, общий вывод в чат, изображения и звуки мира, отдельное отключение приветствий мастеру и игрокам.
- Общие и премиальные параметры расположены в одном окне настроек мастера. Недоступные премиальные параметры отмечены и отключены; из окна можно перейти к настройкам установленного сателлита.
- В бесплатном режиме используются встроенные изображения и звуки; время, чат и оба приветствия включены. Видимость ленты, антиспам, уведомления опросов и таймеров, личные настройки и показ статуса версии остаются общими параметрами.
- При потере доступа модуль возвращается к бесплатным значениям, сохраняя прежние премиальные настройки для восстановления после подтверждения лицензии. Ошибка или отсутствие сателлита не препятствует работе базовых функций.
- Приветствия и справка объясняют различия бесплатной и премиальной версий. Мастер видит ссылку на подписку в бесплатном статусе, игроки — только статус версии; подтверждённый Premium сопровождается благодарностью автора.
- Поддерживаются Foundry VTT 13 и 14. Поддержка Foundry VTT 12 прекращена.

Для Premium установите и включите `dmicher-premium`, затем введите личную лицензию в его настройках. Для бесплатной работы Spotlight Tools установка сателлита не требуется.

## English

Version 1.3.0 is released together with dmicher Premium 1.3.0 and dmicher licence server 1.3.0.

- The base module remains free: requests, Request Feed, timers, breaks, polls, player statuses, and the Game Master's focus audit remain available with Generics and without the Premium satellite.
- Enabling `dmicher-premium` with a valid license unlocks Premium settings: feed timestamps, global chat output, world images and sounds, and separate switches for Game Master and player welcomes.
- Common and Premium controls share the Game Master Settings window. Unavailable Premium controls are labeled and disabled; the installed satellite's settings can be opened from this window.
- Free mode uses built-in images and sounds, with timestamps, chat output, and both welcomes enabled. Feed visibility, anti-spam limits, poll and timer notifications, personal preferences, and version-status display remain common settings.
- When access expires, the module uses free defaults and preserves previous Premium settings for restoration after license confirmation. A missing or failing satellite does not prevent the base tools from working.
- Welcomes and Help explain the free and Premium editions. The free-status message gives the Game Master a subscription link, while players see only the edition status; confirmed Premium includes the author's thanks.
- Foundry VTT 13 and 14 are supported. Foundry VTT 12 support has ended.

To use Premium, install and enable `dmicher-premium`, then enter your personal license in its settings. The satellite is optional for free use of Spotlight Tools.
