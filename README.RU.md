# ctxray

<p align="center">
  <a href="https://github.com/MairwunNx/ctxray/actions/workflows/ci.yml"><img alt="Сборка" src="https://img.shields.io/github/actions/workflow/status/MairwunNx/ctxray/ci.yml?branch=master&label=build"></a>
  <img alt="Статус: ранняя разработка" src="https://img.shields.io/badge/status-early%20development-orange">
  <img alt="Bun 1.4" src="https://img.shields.io/badge/Bun-1.4-000000?logo=bun&logoColor=white">
  <img alt="TypeScript 7" src="https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white">
  <img alt="Языки: английский, русский" src="https://img.shields.io/badge/languages-en%20%7C%20ru-blue">
  <img alt="Телеметрии нет" src="https://img.shields.io/badge/telemetry-none-brightgreen">
  <a href="LICENSE"><img alt="Лицензия" src="https://img.shields.io/github/license/MairwunNx/ctxray"></a>
  <br>
  <img alt="Claude Code" src="https://img.shields.io/badge/Claude%20Code-D97757?logo=claude&logoColor=white">
  <img alt="Codex" src="https://img.shields.io/badge/Codex-412991">
  <img alt="Cursor" src="https://img.shields.io/badge/Cursor-000000?logo=cursor&logoColor=white">
  <img alt="Gemini CLI" src="https://img.shields.io/badge/Gemini%20CLI-1A73E8?logo=googlegemini&logoColor=white">
  <img alt="OpenCode" src="https://img.shields.io/badge/OpenCode-4B5563">
</p>

🩻 **ctxray** — рентген для ИИ-харнессов. Он показывает, что Claude Code, Codex, Cursor, Gemini CLI или OpenCode загрузили в модель: правила, скиллы, MCP-инструменты, системный промпт и сколько токенов стоит каждый кусок. А потом проверяет это в CI, чтобы сломанное правило не дошло до команды.

[English version](https://github.com/MairwunNx/ctxray/blob/master/README.md)

> [!WARNING]
> ctxray в ранней разработке, релизов пока нет. До версии 1.0 API может меняться в минорных версиях.

## Что вы получаете

- 🔍 **Видно, что загрузилось.** `ctxray inspect` показывает правила, скиллы, MCP-серверы с их инструментами, команды и системный промпт, с которыми ИИ-харнесс работает в этом репозитории.
- 🪙 **Токены за каждый кусок.** У каждого правила, скилла и MCP-сервера свой счёт токенов, и сразу видно, что занимает контекст. Где токенайзер открыт, счёт точный, где нет — помечен ≈.
- ❓ **Почему оно там.** У каждого куска есть причина: включён всегда, совпал путь к файлу или его запросила модель.
- ✅ **Тесты на настройку агента.** Файлы `*.ctxray.ts` пишутся как тесты Bun или Vitest: «правила платежей грузятся для кода платежей», «контекст меньше 25k токенов», «этот промпт выбирает скилл возвратов».
- 🧪 **Один тест на все харнессы.** Тот же тест прогоняется на каждом ИИ-харнессе, которым вы пользуетесь. Копировать его под каждый не нужно.
- 📉 **Что меняет merge request.** `ctxray diff` сравнивает с основной веткой: новый MCP-сервер на 14 инструментов, правило, которое выросло на 6k токенов.
- 📋 **Правила вашей компании.** Лимиты токенов, запрещённые MCP-серверы, обязательный AGENTS.md проверяются на каждом merge request без обращения к модели.
- 🏢 **Работает в закрытом контуре.** Корпоративные LLM-шлюзы, прокси, свои CA-сертификаты и внутренние npm-реестры поддерживаются.
- 🔒 **Секреты не утекут.** API-ключи, токены, email, номера телефонов и карт скрываются до того, как что-то попадёт на диск.
- 📊 **Отчёты для людей и для CI.** Живой вывод в терминале, HTML-отчёт, JUnit, Allure, JSON и короткая сводка в Markdown для merge request.
- 🌍 **Русский и английский.** ctxray берёт язык системы или тот, что вы передали в `--lang`.

## Поддерживаемые харнессы

ctxray читает файлы ИИ-харнесса, не запуская его. Там, где харнесс это позволяет, ctxray ещё и запускает его сам и записывает запросы к модели или записывает сессию, в которой работаете вы.

| ИИ-харнесс | Читает файлы | Запускает и записывает | Записывает вашу сессию |
|---|:-:|:-:|:-:|
| Claude Code | ✓ | ✓ | ✓ |
| Codex | ✓ | ✓ | ✓ |
| Gemini CLI | ✓ | ✓ | |
| OpenCode | ✓ | ✓ | |
| Cursor CLI | ✓ | экспериментально | ✓ |
| Cursor (редактор) | ✓ | | ✓ |
| Claude Code Desktop | ✓ | | ✓ |

## The Loadout Stack

ctxray проверяет настройку агента в семь слоёв, от дешёвых к дорогим. Первые три только читают файлы, остальные запускают ИИ-харнесс.

| Слой | Что проверяет |
|---|---|
| L1 Lint | Файлы правил, скиллов и конфигов валидны |
| L2 Policy | Настройка соответствует правилам вашей компании |
| L3 Resolve | К файлам, с которыми вы работаете, применяются нужные правила |
| L4 Assemble | Харнесс действительно отправил их модели |
| L5 Wire | Харнесс подкладывает нужное правило, когда агент читает файл или вызывает скилл |
| L6 Activate | Модель выбирает нужный скилл по промпту |
| L7 Scenario | Агент решает задачу правильным путём |

## Быстрый старт

Эти команды заработают с первым релизом.

1. Посмотрите, что загружает ваш ИИ-харнесс:

   ```sh
   bunx @mairwunnx/ctxray inspect
   ```

2. Создайте конфиг и пример теста командой `ctxray init`.
3. Запустите `ctxray test` локально, а потом добавьте в CI.

## Документация

Руководство — в [вики](https://github.com/MairwunNx/ctxray/wiki). Оно растёт вместе с ctxray.

## Связанные проекты

- **[Feature-Action Architecture](https://github.com/MairwunNx/Feature-Action-Architecture)** — архитектура, по которой написан код ctxray.

## Раскрытие контента

- 🤖 **Код от ИИ.** Большую часть кода написали ИИ-агенты.
- 📡 **Телеметрии нет.** ctxray никуда не отправляет данные о вас. Он обращается только к провайдеру модели или шлюзу, который вы настроили, и только в тестах, которые запускают ИИ-харнесс.
- Бесплатно, по лицензии MIT. Рекламы нет.

> 🫡 Сделал Павел Ерохин (Pavel Erokhin), он же mairwunnx.
