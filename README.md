# Bakaláři+

**Rozvrh celé školy do kapsy.** Neoficiální aplikace pro školy, které používají systém Bakaláři:
rozvrhy všech tříd, učitelů a učeben, suplování, známky s kalkulačkou, úkoly, zprávy a sdílený kalendář třídy.

> Bakaláři+ není produkt společnosti BAKALÁŘI software s.r.o. a není s ní nijak spojen. Používá stejné rozhraní
> jako oficiální aplikace a veřejný rozvrh školy.

## Co umí

| | Bez přihlášení | S přihlášením |
|---|:---:|:---:|
| Rozvrh libovolné třídy, učitele a učebny (tento týden, příští, stálý) | ✅ | ✅ |
| Suplování a změny zvýrazněné přímo v rozvrhu | ✅ | ✅ |
| **Dnes**: právě probíhající hodina s odpočtem, přestávka, další hodina | ✅ (moje třída) | ✅ |
| **Společné volno**: porovnej třídy / učitele, kdy mají všichni volno a kdy komu končí škola | ✅ | ✅ |
| **Kde je…**: kde učí učitel / kde je třída právě teď nebo v danou hodinu | ✅ | ✅ |
| **Volné učebny** v danou hodinu | ✅ | ✅ |
| Oblíbené třídy a učitelé | ✅ | ✅ |
| Můj rozvrh, známky s průměry a **kalkulačkou** („co potřebuju na dvojku?“) | | ✅ |
| Domácí úkoly, zprávy (Komens), nástěnka, absence s hlídáním limitu | | ✅ |
| **Kalendář**: akce školy + úkoly + **sdílený kalendář třídy** (testy, akce… přidávají spolužáci) | | ✅ |
| Upozornění: změny v rozvrhu, nové známky, úkoly, zprávy, večerní souhrn zítřka *(Android)* | ✅ změny | ✅ |
| Widget na plochu: teď / další hodina *(Android)* | ✅ | ✅ |

Čeština i angličtina, světlý i tmavý vzhled, funguje i offline (ukáže naposledy stažená data).
Funguje pro jakoukoli školu z adresáře Bakalářů. Rozvrhy ostatních tříd a učitelů jdou jen tam, kde škola
zveřejňuje veřejný rozvrh (většina škol).

## Instalace

### Android
1. Stáhni `Bakalari-Plus.apk` z [Releases](../../releases/latest).
2. Otevři ho a povol instalaci z tohoto zdroje (Android se zeptá sám).
3. Pro upozornění povol notifikace, pro widget: dlouze podrž plochu → Widgety → Bakaláři+.

Aktualizace: stáhni novější APK a nainstaluj přes starou verzi (data zůstanou).

### iPhone a počítač
Webová verze běží v prohlížeči (adresa je v popisu releasu). Na iPhonu: Safari → Sdílet → *Přidat na plochu*.
Upozornění a widget umí jen aplikace pro Android.

## Soukromí

- **Heslo** se posílá jen do Bakalářů tvé školy.
  - Android: aplikace si heslo pamatuje, zašifrované klíčem v Android Keystore (klíč nejde z telefonu vytáhnout),
    aby šlo přihlášení obnovit na pozadí.
  - Web: heslo se neukládá vůbec, prohlížeč si drží jen přihlašovací tokeny. Většina škol dovolí prohlížeči
    připojit se přímo. U škol, které to blokují, jde požadavek přes náš server (`/relay`), který ho jen přepošle
    a nic neukládá; aplikace na to před přihlášením upozorní.
- **Kalendář třídy** ukládá jen to, co do něj spolužáci napíšou, a jméno autora ve tvaru „Jan N.“. Server se
  jednou zeptá školy, kdo jsi a do jaké třídy chodíš (krátkodobým tokenem, bez hesla), a pak vydá vlastní
  přístup na 30 dní. Kalendář vidí jen tvoje třída. Nevhodný záznam jde nahlásit; po 3 nahlášeních zmizí.
- Žádná reklama, žádná analytika.

## Pro vývojáře

```
web/      aplikace (Preact + TypeScript + Vite), stejná pro Android i web
android/  obal pro Android (WebView + nativní přihlášení, notifikace, widget), build bez Gradle
worker/   Cloudflare Worker: hostuje web, /relay pro školy bez CORS, /cal/* sdílený kalendář (D1)
```

### Web
```
cd web && npm install
npm run dev          # http://localhost:5173 (dev server má vlastní /relay)
npm run build
```

### Worker (vlastní nasazení)
```
cd worker && npm install
npx wrangler login
npx wrangler d1 create bakalar-plus         # database_id vlož do wrangler.toml
npm run db:init
npx wrangler secret put SESSION_SECRET      # dlouhý náhodný řetězec
cd ../web && npm run build && cd ../worker && npm run deploy
```

### Android
Potřebuje JDK 17 a Android SDK (`platforms;android-35`, `build-tools;35.0.1`), Gradle ne.
```
powershell -File android\build.ps1 -CloudUrl https://bakalar-plus.<účet>.workers.dev
```
První build vytvoří podpisový klíč `android/release.keystore` + `keystore.pass`. **Zálohuj je** a nikdy je
necommituj: bez nich nejde vydat aktualizace.

### Rozhraní Bakalářů
Přihlášené části používají API v3 (komunitní dokumentace:
[bakalari-api/bakalari-api-v3](https://github.com/bakalari-api/bakalari-api-v3)), názvy polí jsou ověřené proti
živé škole. Veřejný rozvrh se čte ze stránky `/Timetable/Public/{Actual|Next|Permanent}/{Class|Teacher|Room}/{id}`,
která v sobě má data jako JSON (`const timetableData = …`). Adresář škol: `sluzby.bakalari.cz/api/v1/municipality`.

---

## English

**Your whole school's timetable in your pocket.** An unofficial app for schools that use Bakaláři: timetables of
every class, teacher and room, substitutions, grades with a grade calculator, homework, messages, and a shared
class calendar that classmates fill in together. Android app (notifications + home-screen widget) and a web
version for iPhone and computers. Czech and English UI.

Install: download `Bakalari-Plus.apk` from [Releases](../../releases/latest). Privacy and build notes are above
(in Czech). Not affiliated with BAKALÁŘI software s.r.o.

Licence: MIT.
