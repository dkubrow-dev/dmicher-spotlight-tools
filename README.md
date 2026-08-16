> *README написан на русском и английском языках. Английскую версию ищите ниже.*
> *The README is written in both Russian and English. The English version is below.*

# Русская версия

## Приспособы фокуса

Модуль «Приспособы фокуса Дмичера» - набор инструментов для Foundry VTT, не зависящих от игровых систем и предназначенных для контроля фокуса внимания (спотлайта) за игровым столом.
Модуль позволяет организовать последовательность заявок игроков, проконтролировать время, оставшееся до запланированных мастером событий, провести проверку готовности или другой опрос, организовать перерыв и проследить за тем, кто из игроков долгое время остаётся вне фокуса внимания.

Поддерживаются Foundry VTT версий 12, 13 и 14.

## Как установить модуль?

### Вариант 1: установка через манифест

Запустите свою копию Foundry VTT и перейдите в главное меню.
Выберите пункт "Модули".
Нажмите на кнопку "Установить модуль".
Внизу окна введите в поле "Ссылка манифеста" ссылку:
```
https://github.com/dkubrow-dev/dmicher-spotlight-tools/releases/latest/download/module.json
```
Нажмите на кнопку "Установить" рядом с полем.

### Вариант 2: установка через менеджер пакетов
Запустите свою копию Foundry VTT и перейдите в главное меню.
Выберите пункт "Модули".
Нажмите кнопку "Установить модуль".
В поле поиска введите "dmicher", выберите модуль "dmicher 🛠️ Spotlight Tools | Приспособы фокуса" и нажмите кнопку "Установить".

### После установки модуля
Зайдите в любой игровой мир.
В правом боковом меню откройте меню "Управление модулями".
Активируйте модуль и перезагрузите мир.

Затем в правом боковом меню откройте меню "Настройки игры".
В открывшемся окне найдите раздел с настройками модуля и нажмите кнопку "Открыть настройки заявок".
Если вы увидите окно с настройками заявок, значит модуль Foundry VTT установлен.

## Возможности модуля

Модуль позволяет всем игрокам:
- одним кликом или клавишей хотбара подавать заявки для выстраивания их последовательности;
- указывать свой игровой статус, не отвлекая мастера и участников от игры и погружения в нарратив сторонней метаинформацией.

Модуль позволяет мастеру и ассистентам:
- в удобном месте интерфейса отслеживать поданные заявки по времени и важности, предоставлять слово игрокам;
- создавать публичные и приватные таймеры с окнами, сигналами и сообщениями в чат;
- быстро создать таймер перерыва;
- отследить скорость выполнения каких-либо действий по секундомеру, одним кликом или клавишей хотбара засечь события и вывести их в чат;
- провести проверку готовности игроков продолжить игру;
- проводить опросы игроков по шаблонам или как временные разовые опросы;
- контролировать фокус внимания (спотлайт) в окне аудита с настраиваемыми индикаторами активности игроков.

Модуль имеет локализацию на русский и английский языки.

### Заявки пользователей

Окно «Настройки заявок» разделено на вкладки «Общие» и «Продвинутые». На общей вкладке игроки видят обычную и срочную заявки, а мастер и ассистенты — также заявку «Окружение». Изображение можно нажать для подачи заявки или перетащить на панель быстрого доступа; текст и безопасный CSS-стиль настраиваются отдельно каждым пользователем.

В правой панели, во вкладке Playlists, модуль добавляет в «User Volume Controls» ползунок «Заявки». Итоговая громкость складывается из базовой громкости, заданной мастером для типа заявки, и личной громкости пользователя.

Мастеру на вкладке «Продвинутые» доступны:

- отключение вывода заявок в чат без отключения самой очереди;
- ограничения количества обычных и срочных заявок, полный запрет отдельных типов и блокировка заявок игроков при активном «Окружении»;
- боковая вкладка «Заявки» с очередью, персонажами, временем, кнопками управления и перетаскиваемыми макросами;
- собственные изображения и звуки по внешним RAW-ссылкам с проверкой загрузки и CORS перед сохранением;
- базовая громкость каждого типа, общий выключатель звука и приветственное сообщение.

Окно «Активные заявки» работает независимо от чата. Оно показывает аватар или токен, тип заявки, игрока и выбранного персонажа; позволяет фильтровать типы, скрывать повторы по типу или игроку, давать слово, отменять заявки и очищать очередь.

Интерактивная справка открывается из настроек модуля, верхнего меню «Приспособы фокуса» и боковой ленты заявок.

### Личные статусы игроков на игре

Обратите внимание и расскажите игрокам: при включении модуля слева снизу в списке игроков появится небольшой выпадающий список с игровым статусом.
В списке можно найти четыре статуса, разделённые цветами:
- зелёный, "Играю" - полностью погружён в контекст игры, доступен для заявок;
- жёлтый, "Слышу" - слышу и/или вижу игру, но действовать активно пока не могу;
- оранжевый, "Отошёл" - временно отвлёкся, отошёл от компьютера, не слежу за игрой; подойду скоро, либо позовите, если что-то срочное;
- красный, "Недоступен" - отошёл, не слежу за игрой, не ждите, играйте без меня.

Игрок самостоятельно выставляет себе игровой статус.
При изменении статуса в чат для мастера выводится сообщение о смене статуса игрока.

Это позволяет игрокам тихо, но чётко сообщить мастеру о том, насколько они погружены в игру, не отвлекая мастера и игроков от самой игры, не влезая в нарратив сцены с фразами типа "Мне надо отойти", "У меня что-то происходит - играйте без меня".
Игровой статус автоматически меняется на "Играю" каждый раз, когда игрок заходит в игру.

### Опросы и проверка готовности

Мастер может открыть окно "Опросы" из левой панели инструментов и подготовить шаблоны опросов или сразу запустить временный опрос без сохранения шаблона.
Опросы поддерживают ответы кнопками, единичный выбор в таблице, множественный выбор в таблице и свободный текстовый ответ.

В шаблоне можно настроить название, вопрос, варианты ответов, активность вариантов, участников, таймер и звук таймера.
Перед запуском шаблон можно проверить и временно изменить участников, вопрос и активные варианты ответов без изменения самого шаблона.

Результаты отображаются в отдельном окне и могут быть выведены в чат.
Для опросов с вариантами ответы сортируются по числу проголосовавших игроков, а ответы игроков учитываются в аудите как активность в чате.
Шаблоны опросов можно перетащить на панель быстрого доступа, чтобы создать макрос запуска.

Для демонстрации возможностей и удобства пользования модуль на старте представляет два шаблона опросов на русском и английском языках:
- "Проверка готовкности" - позволяет провести проверку готовности;
- "Лучший игрок" - позволяет голосованием выбрать лучшего игрока сессии.

> *Ранее функционал был представлен только голосованием "Проверка готовности". С версии 1.1.0 модуль позволяет гибко настраивать шаблоны самостоятельно.*

### Таймеры и перерыв

#### Общие таймеры

Для того чтобы засекать время, оставшееся до конкретных событий, мастер может запустить один или несколько таймеров и гибко настроить их.
Перейдите в левом меню сцены в раздел "Приспособы фокуса", затем нажмите кнопку "Таймеры".
Окно "Таймеры" разделено на две части: сверху указаны настройки нового таймера, снизу - все зарегистрированные таймеры.

Новому таймеру вы можете:
- назначить отображаемое имя;
- выбрать время в двух режимах: указать время, через которое таймер сработает, либо время по часам, когда этот таймер завершится;
- выбрать видимость: публичный таймер будет виден всем игрокам, а приватный - только мастеру и ассистентам;
- выбрать стиль, в котором таймер будет отображаться при открытии: заметный таймер будет хорошо виден в интерфейсе, компактный будет занимать мало места и быть едва заметным (игроки и вы сможете поменять стиль отображения таймера после открытия окна);
- выбрать сигнал, который прозвучит, когда время таймера истечёт.

После запуска таймера сообщение о его запуске появится в чате, а окно таймера появится на экране.
Сообщения и окна приватных таймеров увидят только мастера и ассистенты.
Окно таймера можно закрыть: открыть окно таймера можно будет в любой момент по кнопке в чате или из таблицы текущих таймеров.

Вы можете отменить таймер из таблицы текущих таймеров.
Завершённые таймеры самостоятельно не удаляются из памяти: вы можете очистить список зарегистрированных таймеров в окне "Таймеры".

#### Таймер перерыва

Мастер и ассистент игры могут быстро объявить перерыв в игре.
"Перерыв" - это особый таймер, в котором можно быстро выбрать примерное время перерыва и запустить его в пару кликов.
Перейдите в левом меню сцены в раздел "Приспособы фокуса", затем нажмите кнопку "Перерыв".

В открывшемся окне выберите примерную длительность перерыва и нажмите "Объявить перерыв".

> **Обратите внимание**: к текущему времени прибавляется выбранная длительность, после чего результат всегда округляется вверх до ближайшей полной минуты. Например, при запуске таймера в 16:00:03 на 15 минут таймер перерыва предложит перерыв "до 16:16". Так выбранная длительность гарантированно сохраняется, а игрокам удобно ориентироваться по обычным часам.

При объявлении перерыва:
- будет создан таймер "Перерыв", который попадёт в таблицу "Текущие таймеры" в окне "Таймеры" (вы сможете управлять им оттуда);
- игроки увидят таймер;
- игра будет поставлена на паузу;
- при истечении времени прозвучит звуковой сигнал.

### Секундомер

Мастер и ассистент игры могут использовать секундомер.
Перейдите в левом меню сцены в раздел "Приспособы фокуса", затем нажмите кнопку "Секундомер".
Пока секундомер запущен, можно регистрировать заранее прописанные типы событий кликом по кнопкам событий или перетащив их на панель быстрого доступа.
Вы можете сами решить, какой смысл вкладывать в условные обозначения событий секундомера.
Зарегистрированные события вы можете вывести в чат сообщением.

### Аудит фокуса

Мастер и ассистент игры могут отслеживать фокус внимания по удобной таблице индикаторов.
Перейдите в левом меню сцены в раздел "Приспособы фокуса", затем нажмите кнопку "Аудит фокуса".

Выберите игроков, для которых будете отслеживать фокус, поставив галки рядом с их именами.
Для выбранных игроков таблица аудита будет показывать индикаторы:
- зелёный: всё хорошо, внимание не требуется;
- жёлтый: есть сомнение, что стоит обратить внимание на этот индикатор;
- оранжевый: явно есть какая-то проблема, но она не критичная;
- красный: большая проблема с акцентом внимания.

Индикаторы относятся к разным параметрам:
- "ФС" - статус игрока в Foundry: зелёный - игрок в сети, красный - игрок не в сети;
- "СС" - собственный статус игрока, который он установил в выпадающем списке модуля под списком игроков;
- "ПЗ" - последняя заявка: время, когда игрок последний раз подавал заявку через модуль;
- "АЗ" - активная заявка: время, которое прошло с момента подачи первой из текущих активных заявок до текущего момента (если по этой заявке не было предоставлено слово или заявка не была отменена);
- "СЧ" - сообщения в чате: время, когда от имени игрока в последний раз было опубликовано сообщение в чат (независимо от причины и содержания сообщения);
- "ПС" - предоставлено слово: время, которое прошло с момента последнего предоставленного слова игроку (это время меняется при предоставлении слова через заявки модуля или вручную мастером).

Аудит можно настроить в меню "Настройка аудита" (находится в окне "Аудит фокуса"), задав время в минутах для ПЗ, АЗ, СЧ и ПС.


# English version

## Spotlight Tools

The "dmicher Spotlight Tools" module is a system-agnostic toolset for Foundry VTT, designed to help control the focus of attention (spotlight) at the game table.
The module helps organize the sequence of player requests, track time remaining until events planned by the Game Master, run readiness checks or other polls, organize breaks, and notice which players have been outside the spotlight for a long time.

Foundry VTT versions 12, 13, and 14 are supported.

## How to install the module?

### Option 1: installation through the manifest

Start your Foundry VTT copy and go to the Setup screen.
Choose "Add-on Modules".
Click "Install Module".
At the bottom of the window, enter this link in the "Manifest URL" field:
```
https://github.com/dkubrow-dev/dmicher-spotlight-tools/releases/latest/download/module.json
```
Click "Install" next to the field.

### Option 2: installation through the package manager
Start your Foundry VTT copy and go to the Setup screen.
Choose "Add-on Modules".
Click "Install Module".
Enter "dmicher" in the search field, choose "dmicher 🛠️ Spotlight Tools | Приспособы фокуса", and click "Install".

### After installing the module
Open any game world.
In the right sidebar, open the "Settings" tab and click "Module Management".
Activate the module and reload the world.

Then, in the right sidebar, open the "Settings" tab and click "Game Settings".
In the window that opens, find the module settings section and click "Open request settings".
If you see the request settings window, the Foundry VTT module is installed.

## Module features

The module lets all players:
- submit requests with one click or a hotbar key to build their sequence;
- set their game status without distracting the Game Master and other participants from play or breaking immersion with out-of-scene meta information.

The module lets the Game Master and assistants:
- track submitted requests by time and importance in a convenient interface area, and give the floor to players;
- create public and private timers with windows, sounds, and chat messages;
- quickly create a break timer;
- track the speed of any actions with a stopwatch, mark events with one click or a hotbar key, and post them to chat;
- run a readiness check for players to continue the game;
- run player polls from templates or as temporary one-off polls;
- control the focus of attention (spotlight) in the audit window with configurable player activity indicators.

The module is localized in Russian and English.

### Player requests

The Request Settings window has General and Advanced tabs. Players see Regular and Urgent requests on General; Game Masters and Assistants also see Environment. Click an image to submit a request or drag it to the hotbar. Each user configures their own text and safe CSS style.

The module adds a Reports slider to User Volume Controls in the Playlists sidebar tab. Final playback volume combines the per-type base volume configured by the Game Master with the user's own Reports volume.

The Advanced tab lets the Game Master:

- disable request chat cards without disabling the queue;
- limit Regular and Urgent requests, forbid a type, and block player requests while Environment is active;
- enable the Requests sidebar feed with characters, time, controls, and draggable macros;
- use custom images and sounds from external RAW URLs, validated for loading and CORS before saving;
- configure per-type base volume, disable all request sounds, and control the welcome message.

The Active Requests window works independently from chat. It shows an avatar or token, request type, player, and selected character; filters types; hides duplicates by type or player; grants the floor; cancels requests; and clears the queue.

Interactive help is available from module settings, the Spotlight Tools canvas controls, and the request feed.

### Player game statuses

Please note and tell your players: when the module is enabled, a small game status dropdown appears in the player list at the bottom left.
The list contains four color-coded statuses:
- green, "Playing" - fully immersed in the game context and available for requests;
- yellow, "Listening" - hearing and/or seeing the game, but not ready to act actively right now;
- orange, "Away" - temporarily distracted or away from the computer; not following the game, but should return soon or can be called for urgent matters;
- red, "Unavailable" - away and not following the game; do not wait, continue without this player.

Each player sets their own game status.
When the status changes, a message about the player's status change is posted to chat for the Game Master.

This lets players quietly but clearly tell the Game Master how immersed they are in the game, without distracting the Game Master and other players from play, and without breaking into the scene narrative with phrases like "I need to step away" or "Something is happening on my end - continue without me".
The game status automatically changes to "Playing" every time the player joins the game.

### Polls

The Game Master can open the "Polls" window from the left canvas controls and prepare poll templates or immediately launch a temporary poll without saving a template.
Polls support button answers, single table choice, multiple table choice, and free text answers.

Templates can store the poll name, question, answer options, active option flags, participants, timer settings, and timer sound.
Before launch, a template can be reviewed and temporarily adjusted: participants, question, and active answer options can be changed without changing the template itself.

Results are shown in a separate window and can be posted to chat.
For option-based polls, answers are sorted by the number of voters, and player responses count as chat activity for the focus audit.
Poll templates can be dragged to the hotbar to create launch macros.

To demonstrate the module's capabilities and ease of use, the module initially offers two survey templates in Russian and English:
- "Readiness Check" - allows you to conduct a readiness check;
- "Best Player" - allows you to vote for the best player in the session.

> *Previously, this functionality was only available through the "Readiness Check" vote. Since version 1.1.0, the module allows you to flexibly customize templates yourself.*

### Timers and Break

#### General timers

To track time remaining until specific events, the Game Master can start one or more timers and configure them flexibly.
Go to the "Spotlight Tools" section in the left canvas controls, then click "Timers".
The "Timers" window is split into two parts: new timer settings at the top, and all registered timers below.

For a new timer, you can:
- set the displayed name;
- choose time in two modes: specify the duration after which the timer expires, or specify the clock time when the timer expires;
- choose visibility: a public timer is visible to all players, while a private timer is visible only to the Game Master and assistants;
- choose the style in which the timer appears when opened: a prominent timer is easy to see in the interface, while a compact timer takes little space and is barely noticeable (players and you can change the timer display style after opening its window);
- choose the signal that will play when the timer time expires.

After the timer starts, a message about its start appears in chat, and the timer window appears on screen.
Messages and windows of private timers are visible only to the Game Master and assistants.
The timer window can be closed: it can be opened again at any time from the chat button or from the current timers table.

You can cancel a timer from the current timers table.
Expired timers are not automatically removed from memory: you can clear the list of registered timers in the "Timers" window.

#### Break timer

The Game Master and assistant can quickly announce a break in the game.
"Break" is a special timer where you can quickly choose an approximate break time and start it in a couple of clicks.
Go to the "Spotlight Tools" section in the left canvas controls, then click "Break".

In the window that opens, choose the approximate break duration and click "Announce break".

> **Please note**: the selected duration is added to the current time, then the result always rounds up to the next full minute. For example, starting a 15-minute break at 16:00:03 produces "until 16:16". This guarantees the selected duration while keeping the return time easy to read on a regular clock.

When a break is announced:
- a "Break" timer is created and added to the "Current timers" table in the "Timers" window (you can manage it from there);
- players see the timer;
- the game is paused;
- a sound signal plays when the time expires.

### Stopwatch

The Game Master and assistant can use the stopwatch.
Go to the "Spotlight Tools" section in the left canvas controls, then click "Stopwatch".
While the stopwatch is running, you can register predefined event types by clicking event buttons or dragging them to the hotbar.
You can decide what meaning to assign to the symbolic stopwatch event markers.
Registered events can be posted to chat as a message.

### Focus Audit

The Game Master and assistant can track focus of attention with a convenient indicator table.
Go to the "Spotlight Tools" section in the left canvas controls, then click "Focus Audit".

Choose the players whose focus you want to track by checking the boxes next to their names.
For selected players, the audit table shows indicators:
- green: everything is good, no attention is required;
- yellow: there is doubt, and it may be worth paying attention to this indicator;
- orange: there is clearly some problem, but it is not critical;
- red: a serious problem with the attention focus.

The indicators refer to different parameters:
- "FS" - the player's Foundry status: green means the player is online, red means the player is offline;
- "SS" - the player's self-selected status, set in the module dropdown under the player list;
- "LR" - last request: the time when the player last submitted a request through the module;
- "AR" - active request: the time elapsed since the first current active request was submitted until now (if the floor has not been granted for that request, or the request has not been cancelled);
- "CH" - chat messages: the time when a chat message was last published on behalf of the player (regardless of the cause or content of the message);
- "FG" - floor granted: the time elapsed since the floor was last granted to the player (this time changes when the floor is granted through module requests or manually by the Game Master).

The audit can be configured in the "Focus Audit Settings" menu (located in the "Focus Audit" window), by setting times in minutes for LR, AR, CH, and FG.
