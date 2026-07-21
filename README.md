# NaderVPN - Cloudflare Workers VPN Management Panel

<p align="center">
  <img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/D1-Database-22C55E?style=for-the-badge" alt="D1 Database">
  <img src="https://img.shields.io/badge/KV-Storage-F7A800?style=for-the-badge" alt="KV Storage">
</p>

<p align="center">
  پنل مدیریت پیشرفته VPN برای Cloudflare Workers با پشتیبانی از VLESS، VMess، Trojan، Shadowsocks و WireGuard
</p>

## ✨ ویژگی‌ها

### 🔐 احراز هویت و امنیت
- ورود امن با JWT و Session
- هش کردن رمز عبور (PBKDF2)
- محافظت CSRF
- محدودیت نرخ ورود (Rate Limiting)
- هدرهای امنیتی (Security Headers)
- لاگ‌های فعالیت

### 👥 مدیریت کاربران
- ایجاد، ویرایش و حذف کاربر
- فعال/غیرفعال‌سازی
- بازنشانی ترافیک
- تمدید انقضا
- جستجو و فیلتر
- عملیات دسته‌ای (Bulk)
- خروجی CSV/JSON
- ورود CSV/JSON

### 🖥️ مدیریت نودها
- چندین پروتکل: VLESS، VMess، Trojan، Shadowsocks، WireGuard
- TLS/Non-TLS
- فعال/غیرفعال‌سازی
- ورود/خروج نودها

### 📊 داشبورد
- آمار کاربران (کل، فعال، منقضی، آنلاین)
- نمودار ترافیک
- نمودار رشد کاربران
- آخرین فعالیت‌ها

### 📱 اشتراک‌گذاری
- لینک اشتراک منحصربه‌فرد برای هر کاربر
- سازگار با: v2rayN، v2rayNG، NekoBox، Clash Meta، Sing-Box و ...

### 💾 پشتیبان‌گیری
- ایجاد پشتیبان
- بازگردانی پشتیبان
- دانلود فایل پشتیبان

### 🎨 رابط کاربری
- طراحی Glassmorphism
- پشتیبانی RTL (فارسی)
- پشتیبانی LTR (انگلیسی)
- Dark/Light Theme
- واکنش‌گرا (Mobile First)

## 🚀 نصب و راه‌اندازی

### پیش‌نیازها
- حساب Cloudflare
- Wrangler CLI (نسخه 4 یا بالاتر)
- Node.js 18+

### 1. کلون پروژه
```bash
git clone https://github.com/your-repo/nadervpn.git
cd nadervpn
```

### 2. نصب Wrangler
```bash
npm install -g wrangler
```

### 3. ورود به Cloudflare
```bash
wrangler login
```

### 4. ایجاد D1 Database
```bash
wrangler d1 create nadervpn-db
```

### 5. ایجاد KV Namespace
```bash
wrangler kv:namespace create "NADERKV"
```

### 6. بروزرسانی wrangler.toml
```toml
name = "nadervpn"
main = "src/index.js"
compatibility_date = "2024-01-01"

[site]
bucket = "./public"

[[d1_databases]]
binding = "DB"
database_name = "nadervpn-db"
database_id = "YOUR-DATABASE-ID-HERE"

[[kv_namespaces]]
binding = "KV"
id = "YOUR-KV-ID-HERE"
```

### 7. اجرای Schema
```bash
wrangler d1 execute nadervpn-db --file=./schema.sql
```

### 8. استقرار
```bash
wrangler deploy
```

### 9. تنظیم رمز عبور اولیه
پس از استقرار، با مرورگر به آدرس Worker بروید و با:
- **Username:** admin
- **Password:** nader0933

وارد شوید و رمز عبور را تغییر دهید.

## 📁 ساختار پروژه

```
NaderVPN/
├── wrangler.toml          # تنظیمات Wrangler
├── schema.sql              # Schema دیتابیس
├── src/
│   ├── index.js           # نقطه ورود اصلی
│   ├── router.js          # مسیریاب
│   ├── db/
│   │   └── init.js        # عملیات دیتابیس
│   ├── middleware/
│   │   ├── auth.js        # احراز هویت
│   │   └── security.js    # امنیت
│   ├── routes/
│   │   ├── auth.js        # مسیرهای احراز هویت
│   │   ├── dashboard.js   # داشبورد
│   │   ├── users.js       # کاربران
│   │   ├── nodes.js       # نودها
│   │   ├── settings.js    # تنظیمات
│   │   ├── logs.js        # لاگ‌ها
│   │   ├── backup.js      # پشتیبان
│   │   ├── subscription.js # اشتراک
│   │   ├── export.js      # خروجی
│   │   ├── import.js      # ورودی
│   │   ├── qr.js          # QR Code
│   │   ├── system.js      # سیستم
│   │   └── api.js         # مستندات API
│   └── utils/
│       └── crypto.js      # رمزنگاری
└── public/
    ├── index.html         # داشبورد HTML
    ├── css/
    │   └── dashboard.css  # استایل‌ها
    └── js/
        └── app.js         # جاوااسکریپت
```

## 🔌 API Endpoints

### احراز هویت
```
POST /api/auth/login     - ورود
POST /api/auth/logout    - خروج
```

### کاربران
```
GET    /api/users              - لیست کاربران
POST   /api/users              - ایجاد کاربر
GET    /api/users/:uuid        - اطلاعات کاربر
PUT    /api/users/:uuid        - ویرایش کاربر
DELETE /api/users/:uuid        - حذف کاربر
POST   /api/users/:uuid/reset  - بازنشانی ترافیک
POST   /api/users/:uuid/enable - فعال‌سازی
POST   /api/users/:uuid/disable - غیرفعال‌سازی
```

### نودها
```
GET    /api/nodes        - لیست نودها
POST   /api/nodes        - ایجاد نود
PUT    /api/nodes/:id    - ویرایش نود
DELETE /api/nodes/:id    - حذف نود
```

### اشتراک
```
GET /sub/:token              - دریافت اشتراک
GET /sub/:token?format=clash - فرمت Clash
GET /sub/:token?format=singbox - فرمت Sing-Box
```

### پشتیبان
```
POST /api/backup/create   - ایجاد پشتیبان
GET  /api/backup/list    - لیست پشتیبان‌ها
GET  /api/backup/download - دانلود
POST /api/backup/restore  - بازگردانی
```

## 📝 تنظیمات محیطی

متغیرهای محیطی در `wrangler.toml`:

```toml
[vars]
APP_NAME = "NaderVPN"
DEFAULT_LANGUAGE = "fa"
DEFAULT_THEME = "dark"
```

## 🔒 امنیت

- رمزهای عبور با PBKDF2 (100,000 iterations) هش می‌شوند
- Session‌ها در KV با انقضا ذخیره می‌شوند
- Rate Limiting برای جلوگیری از Brute Force
- CSRF Token برای فرم‌ها
- CSP Headers برای جلوگیری از XSS

## 📈 محدودیت‌های Cloudflare Free Plan

- 100,000请求/روز
- 10ms CPU time/请求
- 128MB حافظه
- Workers Sites: 100MB

## 🛠️ توسعه

### اجرای محلی
```bash
wrangler dev
```

### تست
```bash
wrangler d1 execute nadervpn-db --local --file=./schema.sql
wrangler dev
```

## 📄 لایسنس

MIT License - استفاده آزاد برای پروژه‌های شخصی و تجاری

## 🤝 مشارکت

درخواست‌های Pull خوش‌آمد هستند!

## 📧 پشتیبانی

برای سوال و پشتیبانی، Issues باز کنید.

---

ساخته شده با ❤️ برای جامعه Cloudflare Workers
