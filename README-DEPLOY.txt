ПОРТАЛ «САПСАН» — ИНСТРУКЦИЯ ПО ПУБЛИКАЦИИ

В проекте сохранены исходные изображения и музыка. Добавлены раздел новостей, закрытая админ-панель и Cloudflare Pages Functions.

ВАЖНО: локально статическая часть сайта откроется, но сохранение новостей заработает только после настройки Cloudflare D1, R2 и секретов.

ЧТО НАСТРОИТЬ В CLOUDFLARE
1. Создать проект Cloudflare Pages и загрузить содержимое этой папки (обычно через GitHub).
2. Создать D1 database, например sapsan-db.
3. В D1 выполнить SQL из файла schema.sql.
4. В настройках Pages → Settings → Functions → D1 database bindings добавить binding с именем DB и выбрать созданную базу.
5. Создать R2 bucket, например sapsan-media.
6. В Pages → Settings → Functions → R2 bucket bindings добавить binding с именем MEDIA и выбрать bucket.
7. В Pages → Settings → Variables and Secrets добавить секреты:
   ADMIN_PASSWORD — придуманный длинный уникальный пароль администратора.
   SESSION_SECRET — случайная длинная строка (не менее 32 случайных символов).
8. После настройки сделать новый deploy.
9. Открыть https://ВАШ-САЙТ.pages.dev/admin.html и войти с ADMIN_PASSWORD.

СТРУКТУРА
index.html — публичный сайт.
admin.html — панель администратора.
functions/ — серверные API-маршруты Cloudflare Pages.
images/ и music/ — исходные файлы сайта.
schema.sql — структура базы данных D1.

БЕЗОПАСНОСТЬ
- Пароль не хранится в HTML/JavaScript: он задаётся как Cloudflare Secret.
- Сессия хранится в HttpOnly Secure cookie и действует 8 часов.
- Изображения принимаются только JPG/PNG/WEBP размером до 5 МБ.
- Не публикуйте ADMIN_PASSWORD и SESSION_SECRET в репозитории или переписке.

Если вы используете загрузку через GitHub, загружайте файлы проекта в корень репозитория, чтобы index.html и папка functions находились на верхнем уровне.
