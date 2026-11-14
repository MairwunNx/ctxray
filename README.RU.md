# ctxray

<p align="center">
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/MairwunNx/ctxray"></a>
  <img alt="Status: early development" src="https://img.shields.io/badge/status-early%20development-orange">
</p>

🩻 **ctxray** — рентген для ИИ-харнессов. Посмотрите, что именно загрузили ваши Claude Code, Codex, Cursor и другие, и проверяйте это в CI.

[English version](https://github.com/MairwunNx/ctxray/blob/master/README.md)

> [!WARNING]
> ctxray в ранней разработке, релизов пока нет. До версии 1.0 API может меняться в минорных версиях.

## Зачем

ИИ-харнесс собирает контекст модели из правил, скиллов, MCP-серверов, команд и собственного системного промпта. Вы не видите, что он загрузил, сколько это стоит в токенах и почему туда попало правило. ctxray это показывает и превращает в тесты, которые CI гоняет на каждом merge request.

<!-- Здесь будет запись `ctxray inspect`. -->

## Быстрый старт

```sh
bunx @mairwunnx/ctxray inspect
```

Заработает с первым релизом.

## The Loadout Stack

ctxray проверяет настройку агента в семь слоёв. Каждый отвечает на свой вопрос, и каждый следующий дороже предыдущего.

| Слой | Вопрос |
|---|---|
| L1 Lint | Файлы правил, скиллов и конфигов валидны? |
| L2 Policy | Настройка соответствует правилам вашей организации? |
| L3 Resolve | Что должно загрузиться для этих файлов? |
| L4 Assemble | Что харнесс на самом деле положил в запрос? |
| L5 Wire | Подкладывает ли харнесс нужное, когда агент читает файл или вызывает скилл? |
| L6 Activate | Выбирает ли модель нужный скилл по промпту? |
| L7 Scenario | Справляется ли агент с задачей правильным путём? |

## Документация

Всё остальное — в [вики](https://github.com/MairwunNx/ctxray/wiki).

## Лицензия

[MIT](LICENSE)
