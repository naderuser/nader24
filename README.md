# NaderVPN Subscription Manager

<p align="center">
  <img src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/D1-Database-22C55E?style=for-the-badge" alt="D1 Database">
</p>

پنل مدیریت اشتراک VPN برای Cloudflare Workers

## ✨ ویژگی‌ها

- 🔐 **ورود با رمز عبور** - امن و ساده
- 📋 **مدیریت اشتراک‌ها** - اضافه، ویرایش، حذف
- 🔗 **پشتیبانی از همه پروتکل‌ها** - VLESS, VMess, Trojan, Shadowsocks, Hysteria2, TUIC, WireGuard
- 📱 **QR Code** - اسکن برای اتصال سریع
- 📊 **آمار** - تعداد اشتراک‌ها و وضعیت
- 🌙 **دارک مود** - رابط کاربری تاریک
- 📱 **ریسپانسیو** - کار با موبایل
- 🇮🇷 **فارسی RTL** - رابط فارسی

## 🚀 نصب و راه‌اندازی

### ۱. کلون پروژه

```bash
git clone https://github.com/naderuser/nader24.git
cd nader24/NaderVPN2
```

### ۲. نصب Wrangler

```bash
npm install -g wrangler
```

### ۳. ورود به Cloudflare

```bash
wrangler login
```

### ۴. ساخت D1 Database

```bash
wrangler d1 create nadervpn-db
```

### ۵. ساخت KV Namespace

```bash
wrangler kv:namespace create "NADERKV"
```

### ۶. بروزرسانی wrangler.toml

فایل `wrangler.toml` رو باز کن و `database_id` و `kv_namespaces id` رو جایگزین کن:

```toml
[[d1_databases]]
binding = "DB"
database_name = "nadervpn-db"
database_id = "YOUR_D1_ID_HERE"  # ← اینجا

[[kv_namespaces]]
binding = "KV"
id = "YOUR_KV_ID_HERE"  # ← اینجا
```

### ۷. اجرای Schema

```bash
wrangler d1 execute nadervpn-db --file=./schema.sql
```

### ۸. استقرار

```bash
wrangler deploy
```

## 🔑 ورود به پنل

بعد از استقرار، به آدرس Worker برو:

```
https://your-worker.your-subdomain.workers.dev/login
```

رمز عبور پیش‌فرض:
```
nader0933
```

## 📁 ساختار پروژه

```
NaderVPN2/
├── wrangler.toml          # تنظیمات Cloudflare
├── schema.sql            # Schema دیتابیس
├── package.json
├── README.md
├── src/
│   ├── index.js         # نقطه ورود
│   ├── db/
│   │   └── init.js      # عملیات دیتابیس
│   ├── middleware/
│   │   └── auth.js      # احراز هویت
│   ├── routes/
│   │   ├── auth.js      # ورود/خروج
│   │   ├── dashboard.js  # داشبورد
│   │   ├── subscription.js # اشتراک
│   │   └── qr.js        # QR Code
│   └── utils/
│       └── crypto.js     # رمزنگاری
└── public/              # فایل‌های استاتیک (اختیاری)
```

## 🌐 API Endpoints

| Method | Endpoint | توضیحات |
|--------|----------|---------|
| GET | `/login` | صفحه ورود |
| POST | `/api/auth/login` | ورود |
| POST | `/api/auth/logout` | خروج |
| GET | `/dashboard` | داشبورد |
| GET | `/api/stats` | آمار |
| GET | `/api/subscriptions` | لیست اشتراک‌ها |
| POST | `/api/subscriptions` | ایجاد اشتراک |
| PUT | `/api/subscriptions/:uuid` | ویرایش اشتراک |
| DELETE | `/api/subscriptions/:uuid` | حذف اشتراک |
| POST | `/api/subscriptions/:uuid/enable` | فعال‌سازی |
| POST | `/api/subscriptions/:uuid/disable` | غیرفعال‌سازی |
| GET | `/sub/:token` | دریافت اشتراک |
| GET | `/api/qr/:uuid` | QR Code |

## 📝 مثال استفاده

### ایجاد اشتراک جدید

```bash
curl -X POST https://your-worker.workers.dev/api/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "علی",
    "remark": "تست",
    "config_links": "vless://...\\nvmess://...",
    "traffic_limit": "10",
    "expire_type": "days",
    "expire_days": "30"
  }'
```

### دریافت اشتراک

مرورگر یا اپلیکیشن VPN:
```
https://your-worker.workers.dev/sub/TOKEN_HERE
```

## 🔒 امنیت

- Session Cookie با HttpOnly و Secure
- Rate Limiting
- Input Validation
- Security Headers

## 📄 لایسنس

MIT License
