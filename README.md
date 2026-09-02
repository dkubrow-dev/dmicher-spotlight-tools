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

### Заявки игроков

Окно «Настройки заявок» — личное окно пользователя без вкладок. Игрок видит обычную и срочную заявки, а мастер и ассистент — также «Окружение». Изображение можно нажать для подачи заявки или перетащить на панель быстрого доступа. Для каждого типа отдельно настраиваются строго текстовое сообщение, цвет, CSS-размер шрифта, подчёркивание, курсив, жирное начертание и выравнивание.

Общие параметры мира вынесены в отдельное окно «Настройки мастера», доступное мастеру и ассистенту по одноимённой кнопке в настройках игры. В разделе модуля настройка «Тема окон модуля» располагается перед кнопками подменю. В окне «Настройки мастера» блоки идут в порядке «Лента заявок», «Антиспам ограничения заявок», «Изображения», «Звуки» и «Приветствие».

При первой активации модуля в новом мире действуют следующие значения:

- «Лента заявок» включена и доступна игрокам; время подачи показывается;
- заявки выводятся в чат;
- обычные заявки не ограничены по количеству и таймауту;
- для срочных заявок разрешена одна активная заявка на игрока, а после предоставления слова действует таймаут 10 минут;
- при активной заявке окружения блокируются все новые заявки, включая повторное окружение;
- используются стандартные изображения и звуки, звуки заявок включены;
- приветствие включено.

«Лента заявок» — отдельная вкладка правой боковой панели после боя и перед сценами. Она показывает очередь, портреты, типы, игроков, персонажей и время; позволяет автору отменить свою заявку, а модератору — отменить любую или предоставить слово. Внизу находятся кнопки подачи и перетаскивания макросов, «Настройки заявок», «Активные заявки» и, когда настроен хотя бы один таймаут, мастерская кнопка «Сброс таймеров». Если лента включена, мастер и ассистенты видят её всегда; переключатель «Показывать ленту заявок игрокам» отдельно управляет доступом обычных игроков и по умолчанию включён. Скрытие вкладки от игроков не отключает очередь или подачу заявок через «Настройки заявок» и макросы. Изменение общего включения ленты или её показа игрокам требует перестройки боковой панели, поэтому модуль предлагает перезагрузить клиент.

Блок антиспама независимо настраивает количество и таймаут обычных и срочных заявок. Таймаут может считаться с подачи или с предоставления слова; предупреждение сообщает оставшееся время. Сброс таймеров не удаляет активные заявки. Вывод карточек в чат можно отключить без отключения очереди, ленты и окна управления.

Собственные изображения и звуки принимаются по прямым RAW-ссылкам. При сохранении клиент проверяет CORS-доступность и возможность отобразить изображение или воспроизвести звук. Старые макросы сохраняют назначенную им иконку, но при запуске используют актуальные ресурсы и ограничения.

Окно «Активные заявки» работает независимо от чата. Оно показывает портрет или токен и изображение типа, игрока и выбранного персонажа; фильтрует типы; скрывает повторы по типу или игроку; переходит к карточке чата; позволяет давать слово, отменять заявки, создать «Заявку окружения», сбросить настроенные таймеры и очистить очередь.

В Playlists → User Volume Controls модуль добавляет ползунки «Заявки» и «Таймеры». Громкость заявки равна базовой громкости типа, умноженной на личную громкость «Заявки». Звуки таймеров также учитывают личный ползунок «Таймеры» и дополнительные уровни конкретного сигнала. Штатное отключение звука Foundry имеет приоритет над всеми звуками модуля.

Приветствие отправляется приватно каждому вошедшему пользователю. В нём отображаются точное значение `title` и версия установленного модуля. Ссылки «игровое меню» и «справкой» открывают окна внутри клиента Foundry; мастер и ассистент также могут открыть «Настройки мастера» и отключить приветствие. Отделённый горизонтальной чертой уменьшенный текст сообщает о бесплатности модуля, а «по ссылке» намеренно открывает внешнюю страницу поддержки.

Подробная интерактивная справка открывается из настроек игры и первой кнопкой в левом верхнем меню «Приспособы фокуса».

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
Окно "Таймеры" содержит форму нового таймера, таблицу сохранённых шаблонов и таблицу текущих таймеров.

Новому таймеру вы можете:
- назначить отображаемое имя;
- выбрать время в двух режимах: указать время, через которое таймер сработает, либо время по часам, когда этот таймер завершится;
- выбрать видимость: публичный таймер будет виден всем игрокам, а приватный - только мастеру и ассистентам;
- выбрать стиль, в котором таймер будет отображаться при открытии: заметный таймер будет хорошо виден в интерфейсе, компактный будет занимать мало места и быть едва заметным (игроки и вы сможете поменять стиль отображения таймера после открытия окна);
- выбрать «Без звука», доступный настроенный «Свой звук» или один из трёх стандартных сигналов;
- ползунком рядом с предпрослушиванием задать громкость этого запуска.

Для собственного сигнала итоговая громкость равна уровню нового таймера, умноженному на базовую громкость «Настраиваемого звука таймера» из «Настроек мастера» и личный ползунок «Таймеры» в Playlists → User Volume Controls. Для стандартного сигнала базовый уровень мастера считается равным 100%. Кнопка предпрослушивания использует те же уровни, а штатное отключение звука Foundry блокирует воспроизведение.

Кнопка с дискетой сохраняет настройки формы как повторно используемый шаблон. Сохранённый шаблон можно запустить, загрузить в форму для изменения или удалить. Встроенный локализованный шаблон «Перерыв» удалить нельзя; в нём настраиваются только сигнал, громкость и стиль, а видимость всегда остаётся публичной.

После запуска таймера сообщение о его запуске появится в чате, а окно таймера появится на экране.
Сообщения и окна приватных таймеров увидят только мастера и ассистенты.
Окно таймера можно закрыть: открыть окно таймера можно будет в любой момент по кнопке в чате или из таблицы текущих таймеров.

Золотая звезда в первом столбце отмечает экземпляры шаблонов; серой звездой отмечены разовые таймеры, которые можно сохранить как шаблон кнопкой с дискетой.
Из таблицы текущих таймеров таймер можно открыть, повторить со всеми исходными параметрами или отменить. Перед повтором можно удалить исходный таймер или оставить его; для завершённого таймера по умолчанию выбрано удаление, для действующего — сохранение. Повтор доступен и в окне завершённого таймера.
Завершённые таймеры самостоятельно не удаляются из памяти: вы можете очистить список зарегистрированных таймеров в окне "Таймеры".

#### Таймер перерыва

Мастер и ассистент игры могут быстро объявить перерыв в игре.
«Перерыв» — встроенный шаблон таймера, в котором можно выбрать время и запустить таймер в пару кликов. Одновременно может действовать только один перерыв.
Перейдите в левом меню сцены в раздел "Приспособы фокуса", затем нажмите кнопку "Перерыв".

В открывшемся окне выберите готовую длительность, укажите время окончания в поле «до» или точную длительность в поле «на», затем нажмите "Объявить перерыв". Поля используют формат ЧЧ:ММ; по умолчанию предложены текущее время + 15 минут с округлением вверх и длительность 00:15.

> **Обратите внимание**: к текущему времени прибавляется выбранная длительность, после чего результат всегда округляется вверх до ближайшей полной минуты. Например, при запуске таймера в 16:00:03 на 15 минут таймер перерыва предложит перерыв "до 16:16". Так выбранная длительность гарантированно сохраняется, а игрокам удобно ориентироваться по обычным часам.

При объявлении перерыва:
- будет создан таймер "Перерыв", который попадёт в таблицу "Текущие таймеры" в окне "Таймеры" (вы сможете управлять им оттуда);
- игроки увидят таймер;
- игра будет поставлена на паузу;
- при истечении времени прозвучит стандартный или включённый мастером «Свой сигнал перерыва» с учётом его базовой громкости и личного ползунка «Таймеры».

Завершённый перерыв можно повторить только тогда, когда нет другого действующего перерыва; повтор снова ставит игру на паузу.

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

The Request Settings window is a personal, tab-free window. Players see Regular and Urgent requests; Game Masters and Assistants also see Environment. Click an image to submit a request or drag it to the hotbar. Each type has user-specific plain text, color, CSS font size, underline, italic, bold, and alignment controls.

World-wide options live in the separate Game Master Settings window, available to Game Masters and Assistants from the matching Game Settings button. The Module Window Theme setting is placed before the module submenu buttons. Game Master Settings contains Request Feed, Request Anti-spam Limits, Images, Sounds, and Welcome in that order.

A newly configured world starts with these defaults:

- Request Feed is enabled and visible to players, and submission time is shown;
- request cards are posted to chat;
- Regular requests have no count limit or timeout;
- Urgent requests allow one active request per player and start a 10-minute timeout when the floor is granted;
- an active Environment request blocks every new request, including another Environment request;
- standard images and sounds are used, and request sounds are enabled;
- the welcome message is enabled.

Request Feed is a right-sidebar tab placed after Combat and before Scenes. It shows the queue, portraits, types, players, characters, and time. Authors can cancel their own requests; moderators can cancel any request or grant the floor. Its footer contains submit-or-drag request controls, Request Settings, Active Requests, and—when at least one timeout is configured—a moderator-only Reset Timers button. When Request Feed is enabled, Game Masters and Assistants always see it; Show Request Feed to players separately controls access for regular players and is enabled by default. Hiding the tab from players does not disable the queue or submission through Request Settings and macros. Changing global feed enablement or player visibility requires rebuilding the sidebar, so the module offers to reload the client.

Anti-spam settings independently control the count and timeout of Regular and Urgent requests. A timeout can start on submission or when the floor is granted, and rejection feedback includes the remaining time. Reset Timers preserves active requests. Chat cards can be disabled without disabling the queue, Request Feed, or management window.

Custom images and sounds use direct RAW URLs. On save, the client verifies CORS access and whether the image can be displayed or the audio can be played. Existing macros keep their assigned icon, but execution uses current resources and restrictions.

Active Requests works independently from chat. It shows the portrait or token and type image, player and selected character; filters request types; hides duplicates by type or player; navigates to a chat card; grants the floor; cancels requests; creates an Environment Request; resets configured timers; and clears the queue.

The module adds Requests and Timers sliders to Playlists → User Volume Controls. Request volume is the per-type base volume multiplied by the user's Requests volume. Timer audio also applies the user's Timers slider and any signal-specific levels. Foundry's global mute takes precedence over every module sound.

A private welcome message is sent to each joining user and shows the exact installed module `title` and version. The game menu and Help links open windows inside Foundry; Game Masters and Assistants can also open Game Master Settings and disable the welcome. Smaller text below a horizontal divider states that the module is free, while the support link intentionally opens the external support page.

Detailed interactive Help opens from Game Settings and from the first button in the Spotlight Tools canvas controls.

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
The "Timers" window contains a new-timer form, a saved-template table, and a current-timers table.

For a new timer, you can:
- set the displayed name;
- choose time in two modes: specify the duration after which the timer expires, or specify the clock time when the timer expires;
- choose visibility: a public timer is visible to all players, while a private timer is visible only to the Game Master and assistants;
- choose the style in which the timer appears when opened: a prominent timer is easy to see in the interface, while a compact timer takes little space and is barely noticeable (players and you can change the timer display style after opening its window);
- choose No Sound, the configured Custom Sound when available, or one of three standard signals;
- set this launch volume with the slider next to Preview.

For a custom signal, final volume is the New Timer level multiplied by the Game Master Settings base volume for Custom Timer Sound and the user's Timers slider in Playlists → User Volume Controls. A standard signal uses a 100% Game Master base level. Preview uses the same levels, and Foundry's global mute blocks playback.

The floppy-disk button saves the form settings as a reusable template. A saved template can be started, loaded into the form for editing, or deleted. The localized built-in Break template cannot be deleted; only its sound, volume, and style are configurable, and its visibility is always public.

After the timer starts, a message about its start appears in chat, and the timer window appears on screen.
Messages and windows of private timers are visible only to the Game Master and assistants.
The timer window can be closed: it can be opened again at any time from the chat button or from the current timers table.

A gold star in the first column marks template instances; a gray star marks one-off timers, which can be saved as templates with their floppy-disk button.
From the current timers table, a timer can be opened, repeated with all original parameters, or cancelled. Before repeating, you can delete or keep the original; deletion is selected by default for an expired timer, while keeping is selected for an active timer. Repeat is also available in an expired timer's own window.
Expired timers are not automatically removed from memory: you can clear the list of registered timers in the "Timers" window.

#### Break timer

The Game Master and assistant can quickly announce a break in the game.
Break is a built-in timer template where you can choose a time and launch the timer in a couple of clicks. Only one break can be active at a time.
Go to the "Spotlight Tools" section in the left canvas controls, then click "Break".

In the window that opens, choose a preset duration, enter an end time in the "until" field, or enter an exact duration in the "for" field, then click "Announce break". Both fields use HH:MM; their defaults are the current time plus 15 minutes rounded up and a duration of 00:15.

> **Please note**: the selected duration is added to the current time, then the result always rounds up to the next full minute. For example, starting a 15-minute break at 16:00:03 produces "until 16:16". This guarantees the selected duration while keeping the return time easy to read on a regular clock.

When a break is announced:
- a "Break" timer is created and added to the "Current timers" table in the "Timers" window (you can manage it from there);
- players see the timer;
- the game is paused;
- the standard or Game Master-enabled Custom Break Signal plays at expiry, using its base volume and the user's Timers slider.

An expired break can be repeated only when no other break is active; repeating it pauses the game again.

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
