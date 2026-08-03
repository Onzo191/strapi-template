# Kế hoạch triển khai Multi-tenant cho CMS (Strapi 5 Community)

> Trạng thái: **P1–P3 đã implement** (data model, plugin `tenant`, admin UI).
> P4 (delivery/web), P5, P6 chưa làm. SSO (§8bis) **hoãn** theo yêu cầu —
> mục đó giữ nguyên làm đặc tả cho lần sau.
>
> Viết sau khi khảo sát `apps/cms`, `packages/shared`, `apps/web` và source của
> `@strapi/admin@5.51.0`, `@strapi/permissions`, `@strapi/content-manager` trong
> `node_modules`.
>
> **Hai chỗ bản kế hoạch ban đầu sai, code đã đi khác:**
>
> 1. Id của condition là `plugin::tenant.in-assigned-sites`, không phải
>    `tenant::in-assigned-sites` — `computeConditionId` chỉ rút gọn thành
>    `<plugin>::<name>` cho plugin `admin`.
> 2. Condition **không** được ghi vào cột `conditions` của từng
>    `admin::permission` như §5.1 mô tả. Nó được gắn ở tầng engine qua hook
>    `before-evaluate.permission` → `addCondition()`. Lý do ở §5.1 bên dưới; cách
>    cũ có ba lỗ hổng mà cách mới không có.

## 0. Kết luận ngắn

**Có** — làm được trên Strapi 5 **Community**, **không cần Enterprise**, và
**không nên fork/build lại Strapi**. Toàn bộ tính năng dựng được bằng một
local plugin (`apps/cms/src/plugins/tenant`) theo đúng khuôn mẫu plugin
`editorial` đã có, cộng một content-type `site` và một lớp middleware
document-service.

Cái *không* có sẵn và phải tự viết: gán user ↔ site, UI quản trị dành riêng cho
super admin, và lớp enforce ở server. Cái *có sẵn trong CE* và ta tận dụng
(đã verify trong `node_modules`, không phải suy đoán):

| Cơ chế | Vị trí trong source | Ý nghĩa với multi-tenant |
|---|---|---|
| `conditionProvider.register()` | `@strapi/admin/dist/server/server/src/services/permission.js:12` | Đăng ký được condition tuỳ biến trong CE — không bị license gate |
| Condition handler **async** | `@strapi/permissions/dist/engine/index.js:58` (`await condition.handler(...)`) | Handler được phép query DB để lấy danh sách site của user |
| Condition → query filter | `@strapi/content-manager/.../permission-checker.js` (`sanitizeQuery`, `getRulesForAction`) | Điều kiện biến thành `filters` trên mọi query của Content Manager ⇒ lọc **theo từng entry** |
| Condition trên quan hệ | `admin-conditions.js` dùng `createdBy.id`, `createdBy.roles` | Path dạng `site.documentId` hợp lệ |
| `POST /admin/roles` không bị EE gate | `@strapi/admin/dist/server/server/src/routes/roles.js` | Custom role vẫn tạo được (repo đã làm sẵn trong `editorial/server/src/bootstrap.ts`) |

Nói cách khác: **cơ chế "user chỉ thấy dữ liệu của site mình" là cơ chế mà role
`Author` mặc định của Strapi đang dùng để chỉ thấy bài của chính mình** — ta chỉ
đổi điều kiện từ "is-creator" thành "in-assigned-sites".

Cái CE **không** cho, và kế hoạch này xử lý bằng cách khác:

- **Field-level permission** (khoá riêng field `site`) là EE ⇒ enforce bằng
  document-service middleware, không dựa vào UI.
- **Media Library** không có quan hệ tới tenant ⇒ scope bằng folder + middleware
  (Phase 5, isolation ở mức *partial*, xem §9).
- **Single type** không thể "một bản mỗi site" ⇒ `global` phải chuyển thành field
  trên `site` (§3.2).

---

## 1. Phạm vi & yêu cầu

Từ yêu cầu của bạn:

1. Phân quyền theo tenant: đăng nhập xong, user chỉ thao tác được trên các
   website được gán.
2. Màn hình quản trị tenant (tạo site, gán user ↔ site) **chỉ super admin** dùng được.

Hai yêu cầu đó kéo theo ba việc bắt buộc mà nếu bỏ thì hệ thống không thật sự
multi-tenant:

3. Content phải **thuộc về** một site (data model).
4. Delivery (`apps/web`) phải phân giải site theo domain, và cache tag phải
   tách theo site — nếu không, publish site A sẽ bust cache site B
   (`packages/shared/src/client/tags.ts` hiện dùng tag phẳng: `page:{slug}`).
5. Content API phải scope theo site — invariant #1/#2 trong
   [AGENTS.md](AGENTS.md#security-invariants) hiện chỉ chặn "ẩn danh" và "draft",
   chưa chặn "site A đọc dữ liệu site B".

---

## 2. Kiến trúc tổng thể — 5 lớp enforce

Nguyên tắc giống `draft-guard`: **UI không phải là lớp bảo vệ**. UI chỉ để thuận
tiện; chặn thật nằm ở server.

```
┌─ L1  Admin UI      SiteSwitcher + menu ẩn        → thuận tiện, KHÔNG phải bảo mật
├─ L2  RBAC condition tenant::in-assigned-sites    → lọc list/detail trong Content Manager
├─ L3  Document-service middleware tenant-scope    → chặn đọc/ghi chéo site (kể cả API tuỳ biến)
├─ L4  Route policy is-super-admin                 → gate toàn bộ endpoint quản trị tenant
└─ L5  Content API site-scope middleware           → gate delivery theo domain/token
```

L2 có thể bị vòng qua bằng cách gọi thẳng document service từ code khác; L3 thì
không — nó nằm dưới cùng, đúng chỗ `draft-guard` đang đứng. L2 tồn tại vì nó là
thứ duy nhất làm Content Manager **hiển thị đúng** (L3 chỉ ném 403).

---

## 3. Data model

### 3.1 Content-type `site` (tenant)

`apps/cms/src/api/site/content-types/site/schema.json`

```json
{
  "kind": "collectionType",
  "collectionName": "sites",
  "info": {
    "singularName": "site",
    "pluralName": "sites",
    "displayName": "Site",
    "description": "Một website (tenant). Gốc của mọi phân quyền multi-tenant."
  },
  "options": { "draftAndPublish": false },
  "pluginOptions": { "i18n": { "localized": false } },
  "attributes": {
    "name":        { "type": "string", "required": true },
    "key":         { "type": "uid", "targetField": "name", "required": true },
    "domains":     { "type": "json", "required": true },
    "defaultLocale": { "type": "string", "required": true, "default": "vi" },
    "locales":     { "type": "json", "default": ["vi", "en"] },
    "theme":       { "type": "string" },
    "isActive":    { "type": "boolean", "default": true },

    "siteName":        { "type": "string", "required": true },
    "siteDescription": { "type": "text" },
    "logo":            { "type": "media", "multiple": false, "allowedTypes": ["images"] },
    "favicon":         { "type": "media", "multiple": false, "allowedTypes": ["images"] },
    "defaultSeo":      { "type": "component", "repeatable": false, "component": "shared.seo" },
    "socialLinks":     { "type": "component", "repeatable": true, "component": "shared.link" },
    "organizationSchema": { "type": "json" }
  }
}
```

- `key` là định danh ổn định dùng cho cache tag (`site:vnggames:page:about`) và
  cho biến môi trường bên web.
- `domains` là `json` (mảng) chứ không phải `string`: một site thường có
  `vng.com.vn` + `www.vng.com.vn` + domain staging.
- **`global` biến mất** — các field của nó (`siteName`…`organizationSchema`) dời
  lên đây. Lý do ở §3.2.

### 3.2 Vì sao phải xoá single type `global`

Strapi single type = **đúng một document** trong toàn instance. Không có cơ chế
"một bản cho mỗi site". Giữ nguyên `global` thì mọi site dùng chung logo, tên,
default SEO, organization schema — tức là không multi-tenant.

Hai lựa chọn, chọn cái thứ nhất:

- **Dời field lên `site`** (chọn): một nguồn sự thật, ít bảng, và `site` vốn đã
  là thứ delivery phải fetch theo domain. Đổi `getGlobal(locale)` →
  `getSite(domain, locale)` trong `packages/shared/src/client/strapi-client.ts`.
  Đánh đổi: `site` không localized nên phần văn bản (`siteName`,
  `siteDescription`, `defaultSeo`) cần bật `i18n` ở mức field — hoặc tách thành
  collection `site-setting` có `site` + `locale`. Nếu cần đa ngữ đầy đủ ⇒ dùng
  phương án collection.
- Giữ `global` như collection type khoá theo `site` — nhiều bảng hơn, editor dễ
  tạo nhầm 2 bản cho cùng site.

### 3.3 Thêm quan hệ `site` vào các content-type có sẵn

Các UID phải scope (tất cả trừ `redirect`, xem ghi chú):

| Content type | Scope? | Ghi chú |
|---|---|---|
| `api::page.page` | ✅ | |
| `api::article.article` | ✅ | |
| `api::landing-page.landing-page` | ✅ | |
| `api::navigation.navigation` | ✅ | `slug` (header/footer) trùng nhau giữa các site ⇒ bắt buộc scope |
| `api::category.category` | ✅ | taxonomy không nên dùng chung giữa các thương hiệu |
| `api::tag.tag` | ✅ | |
| `api::author.author` | ✅ hoặc dùng chung | quyết định theo nghiệp vụ; mặc định scope |
| `api::redirect.redirect` | ✅ | `proxy.ts` resolve theo path, giờ phải resolve theo `host + path` |
| `api::global.global` | — | bị xoá, xem §3.2 |

Mỗi schema thêm:

```json
"site": {
  "type": "relation",
  "relation": "manyToOne",
  "target": "api::site.site",
  "required": true,
  "pluginOptions": { "i18n": { "localized": false } }
}
```

`"localized": false` là cố ý: một document có nhiều bản dịch nhưng **chỉ thuộc một
site**. Nếu localized, bản `en` có thể trỏ site khác bản `vi` — và condition ở L2
sẽ cho ra kết quả khác nhau tuỳ locale đang xem. Đây là loại lỗ hổng rất khó thấy.

### 3.4 `slug` không còn unique toàn cục

`slug` hiện là `type: "uid"` ⇒ Strapi tạo unique index theo (locale). Multi-tenant
thì `vnggames.com/about` và `vngcloud.vn/about` phải cùng tồn tại.

Cách xử lý: đổi `slug` sang `"type": "string", "required": true` và tự validate
unique theo bộ ba `(site, locale, slug)` trong lifecycle. Chi phí: editor mất nút
tự sinh slug từ title của field `uid` ⇒ bù bằng auto-slugify trong middleware khi
`slug` rỗng.

```ts
// apps/cms/src/plugins/tenant/server/src/lifecycles/unique-slug.ts
// Chạy trong tenant-scope middleware (create/update), trước next().
const clash = await strapi.documents(uid).findFirst({
  filters: {
    slug: { $eq: slug },
    site: { documentId: { $eq: siteId } },
    ...(documentId ? { documentId: { $ne: documentId } } : {}),
  },
  locale,
  status: "draft",
});
if (clash) throw new errors.ValidationError(`Slug "${slug}" đã tồn tại trên site này.`);
```

### 3.5 Bảng gán user ↔ site

Không mở rộng `admin::user` (đụng vào core, vỡ khi upgrade). Dùng content-type
riêng của plugin, đúng cách `editorial` làm với `audit-log`:

`apps/cms/src/plugins/tenant/server/src/content-types/site-assignment/schema.json`

```json
{
  "kind": "collectionType",
  "collectionName": "tenant_site_assignments",
  "info": {
    "singularName": "site-assignment",
    "pluralName": "site-assignments",
    "displayName": "Site Assignment"
  },
  "options": { "draftAndPublish": false, "comment": "" },
  "pluginOptions": {
    "content-manager": { "visible": false },
    "content-type-builder": { "visible": false }
  },
  "attributes": {
    "adminUserId": { "type": "integer", "required": true },
    "siteKey":     { "type": "string",  "required": true },
    "siteDocumentId": { "type": "string", "required": true },
    "isActiveSite": { "type": "boolean", "default": false }
  }
}
```

- Ẩn khỏi Content Manager và Content-Type Builder giống `audit-log` — bảng phân
  quyền không phải nội dung, và để nó hiện ra là mời người ta tự sửa quyền của
  chính mình.
- **Không** đặt attribute tên `documentId` (bài học ADR-004: Strapi reserve tên
  này và crash trước khi HTTP server lên). Dùng `siteDocumentId`.
- `isActiveSite`: site đang chọn của user (cho site switcher, §6.3). Tối đa một
  dòng `true` mỗi user — enforce trong service.

---

## 4. Plugin `tenant` — cấu trúc file

Sao chép nguyên khuôn `editorial` (kể cả cầu CommonJS — đọc kỹ
[ADR-004 §"P7 correction"](adr/004-editorial-workflow-on-ce.md)):

```
apps/cms/src/plugins/tenant/
├── package.json                     # exports["./strapi-server"] → ./strapi-server.js  (BẮT BUỘC .js)
├── strapi-server.js                 # cầu CommonJS → ../../../dist/src/plugins/tenant/server/src
├── strapi-admin.ts
├── server/src/
│   ├── index.ts                     # { register, bootstrap, contentTypes, controllers, services, routes }
│   ├── register.ts                  # đăng ký condition + document-service middleware
│   ├── bootstrap.ts                 # RBAC action, gán condition vào permission, seed site mặc định
│   ├── constants.ts                 # TENANT_SCOPED_UIDS, CONDITION_ID, ACTION_UID
│   ├── conditions/in-assigned-sites.ts
│   ├── middlewares/tenant-scope.ts  # L3
│   ├── policies/is-super-admin.ts   # L4
│   ├── services/{assignment,active-site,site}.ts
│   ├── controllers/{sites,assignments,me}.ts
│   ├── routes/index.ts
│   └── content-types/{index.ts,site-assignment/schema.json}
└── admin/src/
    ├── index.ts                     # addMenuLink("My Sites") + addSettingsLink(super-admin only)
    ├── pages/{MySites,Sites,Assignments}.tsx
    ├── components/SiteSwitcher.tsx  # inject vào listView actions
    └── utils/api.ts
```

Đăng ký trong `apps/cms/config/plugins.ts`:

```ts
tenant: { enabled: true, resolve: "./src/plugins/tenant" },
```

và thêm vào `REQUIRED_LOCAL_PLUGINS` trong
`apps/cms/src/bootstrap/assert-plugins.ts` — nếu plugin không load thì container
phải chết, không được chạy tiếp ở trạng thái "mọi user thấy mọi site".

---

## 5. Lớp enforce — chi tiết code

### 5.1 L2 — RBAC condition (lọc Content Manager)

`server/src/conditions/in-assigned-sites.ts`

```ts
/**
 * Điều kiện RBAC "entry thuộc site tôi được gán".
 *
 * Cùng cơ chế với `admin::is-creator` (@strapi/admin .../config/admin-conditions.js):
 * handler trả về một object filter, permission engine merge vào casl rule, và
 * content-manager biến rule thành `filters` trên mọi query (permission-checker
 * `sanitizeQuery`). Nghĩa là list view, detail view, count và bulk action đều bị
 * lọc — không phải chỗ nào cũng phải tự nhớ thêm filter.
 *
 * Handler được `await` (@strapi/permissions engine), nên query DB ở đây hợp lệ.
 * Kết quả cache theo request để một request không gọi DB nhiều lần.
 */
import type { Core } from "@strapi/strapi";

export function createInAssignedSitesCondition(strapi: Core.Strapi) {
  return {
    displayName: "Thuộc site được phân công",
    name: "in-assigned-sites",
    plugin: "tenant",
    async handler(user: { id: number }) {
      const scope = await strapi
        .plugin("tenant")
        .service("assignment")
        .visibleSiteDocumentIds(user.id); // đã memo theo requestContext

      // Mảng rỗng ⇒ `$in: []` ⇒ không khớp entry nào. Cố ý: user chưa được gán
      // site nào thì thấy TRỐNG, không phải thấy TẤT CẢ.
      return { site: { documentId: { $in: scope } } };
    },
  };
}
```

Đăng ký trong `register.ts` (trước khi admin sync permission):

```ts
strapi.service("admin::permission").conditionProvider.register(
  createInAssignedSitesCondition(strapi),
);
```

**Gắn condition — cách đã chọn khi implement, khác bản kế hoạch đầu.**

Bản đầu ghi `conditions` vào từng dòng `admin::permission` trong bootstrap. Cách
đó có ba lỗ hổng, và cả ba đều im lặng:

1. Chỉ phủ được các permission **đã tồn tại lúc boot**. Một role mà super admin
   mới lưu quyền lần đầu vào tuần sau sẽ không có condition ⇒ role đó nhìn thấy
   mọi tenant.
2. Condition hiện ra trong role editor dưới dạng checkbox — bỏ tick một cái là
   un-scope cả role, không có gì cảnh báo.
3. Thêm content-type mới là phải nhớ chạy lại.

Cách đang dùng: gắn ở **tầng engine**, tại thời điểm sinh ability, qua hook
`before-evaluate.permission` (context của hook có sẵn `addCondition()` —
`@strapi/permissions/engine/hooks.js`):

```ts
permission.engine.hooks["before-evaluate.permission"].register((raw) => {
  const context = raw as BeforeEvaluateContext;
  const subject = context.permission?.subject;
  if (!subject || !isTenantScopedUid(subject)) return;
  if (context.permission.conditions?.includes(CONDITION_ID)) return;
  context.addCondition(CONDITION_ID);
});
```

Không có dòng DB nào để bảo trì, không có checkbox nào để bỏ tick, và một
content-type mới chỉ cần thêm vào `TENANT_SCOPED_UIDS`.

Super admin được miễn **bên trong handler** (trả `true` = "không ràng buộc"),
không phải bằng cách bỏ gắn condition — để chỉ có đúng một chỗ quyết định ai
được miễn.

> Một lưu ý về ngữ nghĩa: Strapi **OR** các condition trên cùng một permission
> (`{ $and: [{ $or: results }] }`). Nên nếu role còn mang `admin::is-creator`,
> kết quả là "site của tôi **HOẶC** do tôi tạo" — *rộng hơn* chứ không hẹp hơn.
> Đây chính là lý do L3 tồn tại và hai lớp không thừa nhau.

### 5.2 L3 — document-service middleware (lớp chặn thật)

`server/src/middlewares/tenant-scope.ts`. Đăng ký trong `register()` cùng chỗ với
`registerDraftGuard` — lý do y hệt `draft-guard`: Koa middleware chạy **trước**
authentication nên không thấy `ctx.state.user` (đã ghi trong AGENTS.md
"Gotchas").

Bốn việc:

```ts
export function registerTenantScope(strapi: Core.Strapi): void {
  strapi.documents.use(async (context, next) => {
    if (!isTenantScopedUid(context.uid)) return next();

    const ctx = strapi.requestContext.get();
    // Không có request context ⇒ code server tin cậy (seed, migration,
    // transition service). Cho qua, giống draft-guard.
    if (!ctx) return next();

    const actor = await resolveActor(strapi, ctx); // {kind:'admin'|'content-api'|'anon', ...}
    if (actor.kind === "admin" && actor.isSuperAdmin) return next();

    switch (context.action) {
      // (1) ĐỌC: ép filter site vào params, không tin filter client gửi lên.
      case "findMany":
      case "findFirst":
      case "count":
        context.params = withSiteFilter(context.params, actor.siteScope);
        return next();

      // (2) ĐỌC 1 BẢN: chạy xong rồi kiểm tra site của kết quả — findOne
      //     theo documentId không nhận filter site một cách đáng tin.
      case "findOne": {
        const result = await next();
        assertInScope(result, actor.siteScope);
        return result;
      }

      // (3) GHI: site bắt buộc, phải nằm trong scope, và KHÔNG được đổi.
      case "create":
        context.params.data = await assignSiteOnCreate(context.params.data, actor);
        return next();

      case "update":
      case "publish":
      case "unpublish":
      case "delete":
      case "discardDraft": {
        await assertEntryInScope(strapi, context, actor.siteScope);
        rejectSiteChange(context.params?.data, actor); // đổi site = 403 (field-level perm là EE)
        return next();
      }

      default:
        return next();
    }
  });
}
```

Ba chi tiết quyết định tính đúng:

- **`create` tự gán site**, lấy từ active site của user; nếu user có nhiều site
  và chưa chọn ⇒ 400 với thông báo rõ ("chọn site trước khi tạo nội dung"). Không
  bao giờ đoán.
- **`rejectSiteChange`**: chuyển một bài từ site A sang site B là hành vi của
  super admin. Với người khác, `data.site` khác giá trị hiện tại ⇒ 403.
- **`findOne` kiểm tra sau khi chạy**: URL của Content Manager là
  `/content-manager/collection-types/api::page.page/<documentId>`; đoán được
  documentId của site khác thì L2 (chỉ lọc list) không cứu được — L3 mới cứu.

### 5.3 L4 — policy super admin cho endpoint quản trị

`server/src/policies/is-super-admin.ts` — dùng lại `SUPER_ADMIN_CODE` từ
`editorial/server/src/constants/rbac.ts` để RBAC không bị chia đôi thành hai
nguồn sự thật (ADR-004 đã cố tình gom về một file).

```ts
export default (policyCtx: { state: { user?: { roles?: Array<{ code: string }> } } }) => {
  const codes = (policyCtx.state.user?.roles ?? []).map((r) => r.code);
  return codes.includes(SUPER_ADMIN_CODE);
};
```

`server/src/routes/index.ts`:

```ts
const superAdminOnly = { policies: ["plugin::tenant.is-super-admin"] };

export default {
  admin: {
    type: "admin",
    routes: [
      // Quản trị tenant — SUPER ADMIN ONLY
      { method: "GET",    path: "/sites",              handler: "sites.find",        config: superAdminOnly },
      { method: "POST",   path: "/sites",              handler: "sites.create",      config: superAdminOnly },
      { method: "PUT",    path: "/sites/:id",          handler: "sites.update",      config: superAdminOnly },
      { method: "GET",    path: "/assignments",        handler: "assignments.find",  config: superAdminOnly },
      { method: "PUT",    path: "/assignments/:userId",handler: "assignments.set",   config: superAdminOnly },

      // Của chính user — mọi admin user đăng nhập đều gọi được
      { method: "GET",  path: "/me/sites",       handler: "me.sites" },
      { method: "POST", path: "/me/active-site", handler: "me.setActiveSite" },
    ],
  },
};
```

`me.setActiveSite` **phải** validate site nằm trong danh sách được gán — đây là
endpoint duy nhất user tự đổi được scope của mình, nên nó là bề mặt tấn công
chính của toàn hệ thống.

### 5.4 L5 — Content API scope theo site

Delivery hiện dùng **một** read-only token cho toàn bộ site (`STRAPI_API_TOKEN`).
Multi-tenant thì token rò rỉ của site A không được đọc site B. Hai phương án:

- **A. Bắt buộc filter site + web resolve theo Host** (khuyến nghị cho giai đoạn
  đầu): middleware Koa trên `/api/*` từ chối read tới content-type scoped nếu
  query không có `filters[site][key]`; `apps/web` lấy host từ `headers()` và
  luôn truyền. Đơn giản, hợp với một deployment web phục vụ nhiều domain, khớp
  ADR-008. Yếu điểm: token vẫn *kỹ thuật* đọc được mọi site.
- **B. Token gắn với site**: bảng `tenant_token_sites` (apiTokenId → siteKey);
  middleware ép filter theo token, bỏ qua filter client gửi. Isolation thật.
  Yếu điểm: mỗi site một token, phải quản trị trong Secrets Manager.

Đề xuất: làm **A ngay ở Phase 4**, **B ở Phase 6** khi số site > 2 hoặc khi có
tenant do bên ngoài vận hành. Cả hai đều là middleware document-service để phủ
cả controller tuỳ biến, giống `draft-guard`.

---

## 6. Admin UI

### 6.1 Trang "My Sites" (mọi user) — trả lời đúng yêu cầu #1

Menu link cho mọi admin user. Sau khi đăng nhập, mở ra là thấy card từng site
mình được thao tác: tên, domain, locale, số nội dung, nút **"Làm việc trên site
này"** (gọi `POST /tenant/me/active-site`).

`admin/src/index.ts`:

```ts
app.addMenuLink({
  to: `plugins/${PLUGIN_ID}`,
  icon: Layer,
  intlLabel: { id: `${PLUGIN_ID}.menu.mySites`, defaultMessage: "My Sites" },
  Component: () => import("./pages/MySites").then((m) => m.MySites),
});
```

### 6.2 Trang quản trị tenant (super admin) — yêu cầu #2

Đặt trong **Settings** (đúng chỗ nghiệp vụ), gate hai lớp:

```ts
// 1. UI: ẩn link với người không có quyền
app.addSettingsLink("global", {
  id: `${PLUGIN_ID}-sites`,
  to: `/settings/${PLUGIN_ID}/sites`,
  intlLabel: { id: `${PLUGIN_ID}.settings.sites`, defaultMessage: "Sites & Tenants" },
  permissions: [{ action: "plugin::tenant.manage", subject: null }],
  Component: () => import("./pages/Sites").then((m) => m.Sites),
});
```

`plugin::tenant.manage` đăng ký trong `bootstrap.ts`:

```ts
await strapi.service("admin::permission").actionProvider.registerMany([
  {
    uid: "manage",
    displayName: "Quản trị site & phân công tenant",
    pluginName: "tenant",
    section: "plugins",
  },
]);
```

…và **không cấp cho role nào**. Super admin bỏ qua mọi kiểm tra ability nên vẫn
thấy; mọi role khác không thấy. Lớp 2 là policy ở §5.3 — vì ẩn menu chỉ là ẩn
menu, URL vẫn gõ tay được.

Nội dung trang:
- **Sites**: CRUD site, mỗi dòng hiện domain + số user được gán.
- **Assignments**: bảng user × site với checkbox, tìm theo email. Ghi qua
  `PUT /tenant/assignments/:userId`.

### 6.3 Site switcher

Inject vào Content Manager list view — đây là injection zone có thật trong
Strapi 5 (`contentManager.injectComponent("listView", "actions", …)`, cùng API
mà `editorial` đang dùng cho `editView`/`right-links`).

```ts
contentManager?.injectComponent?.("listView", "actions", {
  name: `${PLUGIN_ID}-site-switcher`,
  Component: SiteSwitcher,
});
```

Đổi site ⇒ `POST /tenant/me/active-site` ⇒ invalidate query cache ⇒ list refetch,
lần này condition ở L2 trả filter mới. **Không** lưu active site ở
`localStorage`: nó phải là state server-side, vì chính server dùng nó để quyết
định scope.

---

## 7. Delivery (`apps/web` + `packages/shared`)

### 7.1 Phân giải site theo domain

`apps/web/lib/site.ts` hiện đọc một hằng `NEXT_PUBLIC_SITE_URL`. Đổi thành
resolve theo `Host`:

```ts
// apps/web/lib/site.ts
import { headers } from "next/headers";

export async function currentSite(): Promise<SiteConfig> {
  const host = (await headers()).get("host") ?? "";
  return resolveSiteByHost(host); // cache theo tag `sites` + TTL, fail-closed
}
```

`proxy.ts` cũng phải đổi: `createRedirectResolver` hiện cache **một** bảng
redirect phẳng; giờ phải cache **theo host**, nếu không site A sẽ ăn redirect của
site B.

### 7.2 Cache tag phải có tiền tố site

`packages/shared/src/client/tags.ts` — đổi mọi hàm sang nhận `siteKey`:

```ts
export const listArticlesTag = (site: string) => `site:${site}:list:articles`;
export const pageTag = (site: string, slug: string) => `site:${site}:page:${slug}`;
// …
```

Và `RevalidatePayload` thêm `siteKey`; `apps/cms/src/webhooks/revalidation.ts`
đọc `entry.site.key` để gửi kèm. **Đây là thay đổi breaking bắt buộc** — bỏ qua
thì publish một bài của site A sẽ revalidate `list:articles` dùng chung và bust
cache của mọi site (đúng loại lỗi ADR-008 cảnh báo: cache freshness hỏng âm thầm).

### 7.3 Sitemap / robots / metadata

`app/sitemap.ts`, `app/robots.ts`, `app/manifest.ts` là route toàn cục — phải đọc
host và sinh theo site. Với Next 16 App Router, `sitemap.ts` **không** nhận
`headers()` khi generate tĩnh ⇒ cần chuyển sang route handler
`app/sitemap.xml/route.ts` với `dynamic = "force-dynamic"`, hoặc dùng
`generateSitemaps()` theo site. Ghi rõ ở đây vì nó là thứ hay bị phát hiện muộn.

---

## 8. Migration dữ liệu hiện có

`apps/cms/database/migrations/2026xxxx-multi-tenant-backfill.js` (thư mục đã tồn
tại, đang rỗng):

1. Tạo site mặc định `vng` từ nội dung `globals` hiện tại (siteName, logo, SEO…).
2. Backfill `site` cho **mọi** row của các bảng scoped — chạy trước khi bật
   `required: true`, nếu không Strapi từ chối sync schema.
3. Gán mọi admin user hiện có vào site `vng` (không ai bị khoá ra ngoài sau deploy).
4. Xoá bảng `globals` **ở một migration sau**, khi đã xác nhận web đã chuyển sang
   `getSite()`.

Thứ tự deploy an toàn: `(a)` thêm `site` optional + backfill → `(b)` bật
`required` → `(c)` bật enforce (L2/L3) → `(d)` chuyển web sang site-aware tag →
`(e)` xoá `global`. Mỗi bước deploy được độc lập; gộp lại là tự chuốc downtime.

---

## 8bis. SSO trong mô hình multi-tenant

Plugin `sso` hiện có ([`apps/cms/src/plugins/sso`](../apps/cms/src/plugins/sso))
làm OIDC Authorization Code + PKCE, kiểm MFA qua `acr`/`amr`, và map **IdP group
→ admin role** qua `OIDC_ROLE_MAP`. Nó **không** biết gì về site. Multi-tenant
biến điều đó thành một lỗ hổng nghiệp vụ, và một lỗ hổng bảo mật nhỏ hơn.

### 8bis.1 Điều gì vỡ nếu để nguyên

`resolveAdminUser()` tạo user với role từ IdP group, rồi mint session. Không có
dòng nào ghi assignment site. Với condition ở §5.1, user đó có `siteScope = []`
⇒ `$in: []` ⇒ **đăng nhập thành công vào một CMS trống rỗng**.

Fail-closed nên không rò rỉ dữ liệu — nhưng:

- Với `OIDC_AUTO_PROVISION=true`, mỗi nhân sự mới phải chờ super admin gán tay,
  tức là mất đúng cái lợi mà auto-provision tồn tại để mang lại.
- Người dùng nhận một màn hình trống không giải thích được. Đúng loại "dead end"
  mà `provision.ts` đã cố tình tránh khi từ chối tạo user không có role.

### 8bis.2 IdP group → site: lưu ở đâu

Thêm field vào `site` (§3.1):

```json
"idpGroups": { "type": "json", "default": [] }
```

Không dùng env `OIDC_SITE_MAP` làm nguồn chính, vì:

- Super admin đã có UI quản trị site (§6.2) — mapping thuộc về đúng chỗ đó.
- Thêm một site mới không được đòi redeploy. Đây là cùng một nguyên tắc với
  "Content changes never require a deploy" trong [CLAUDE.md](../CLAUDE.md).

`OIDC_SITE_MAP` giữ lại như fallback cho lần bootstrap đầu (khi chưa có site nào)
— cùng vai trò mà `OIDC_DEFAULT_ROLE` đang giữ.

### 8bis.3 Hook vào luồng provision

Trong `provision.ts`, ngay sau `syncRoles()` (cả nhánh user có sẵn lẫn nhánh vừa
tạo):

```ts
// Gọi qua service registry, KHÔNG import trực tiếp module của plugin tenant.
// `sso` đã import `constants/rbac` của `editorial`, nhưng đó là hằng số thuần;
// assignment là service có state, và hai plugin import chéo nhau ở tầng module
// là cách nhanh nhất tạo import cycle trong bundle CommonJS ở dist/.
await strapi.plugin("tenant").service("assignment").syncFromIdpGroups({
  adminUserId: user.id,
  email: user.email,
  roleCodes: (user.roles ?? []).map((r) => r.code),
  groups: claimGroups(claims, config.groupsClaim),
});
```

```ts
// plugins/tenant/server/src/services/assignment.ts
async syncFromIdpGroups({ adminUserId, email, roleCodes, groups }) {
  // Super admin không cần assignment — họ nhìn thấy mọi site theo thiết kế.
  if (roleCodes.includes(SUPER_ADMIN_CODE)) return;

  const sites = await strapi.documents("api::site.site").findMany({
    filters: { isActive: true },
    fields: ["key", "documentId", "idpGroups"],
  });

  // Chưa site nào khai báo idpGroups ⇒ tính năng chưa bật ⇒ CMS là nguồn sự
  // thật cho assignment, không đụng gì. Đối xứng với `if (!OIDC_ROLE_MAP) return`.
  const mappingConfigured = sites.some((s) => (s.idpGroups ?? []).length > 0);
  if (!mappingConfigured) return;

  const lower = new Set(groups.map((g) => g.toLowerCase()));
  const granted = sites.filter((s) =>
    (s.idpGroups ?? []).some((g: string) => lower.has(String(g).toLowerCase())),
  );

  if (granted.length === 0) {
    throw new SsoProvisionError(
      "IdP group của bạn không tương ứng với website nào — liên hệ Master Admin",
    );
  }

  await this.replaceAssignments(adminUserId, granted);   // cấp mới + thu hồi cái mất
  await this.reconcileActiveSite(adminUserId, granted);  // xem 8bis.4 quy tắc 4
}
```

`SsoProvisionError` là loại lỗi mà `controllers/sso.ts` đã bắt và biến thành
`failLogin(ctx, "not_authorized")` — nên không cần đụng vào controller.

### 8bis.4 Bốn quy tắc, đối xứng với bốn quy tắc role đã có

`provision.ts` đã ghi hai quy tắc "quan trọng hơn vẻ ngoài của nó". Multi-tenant
thêm bốn, cùng một logic:

1. **IdP không bao giờ cấp được "tất cả các site".** Không có group nào map ra
   wildcard. Quyền toàn bộ site = super admin = grant thủ công trong CMS. Lý do
   y hệt quy tắc "`strapi-super-admin` is never assignable via SSO": tên group
   nằm ở hệ thống khác, do đội khác quản, trên một quy trình change-control khác.
2. **Group không map ra site nào ⇒ từ chối đăng nhập**, không tạo/giữ một tài
   khoản không site. Đối xứng với quy tắc "a user whose groups map to nothing is
   rejected, not created role-less". Hai ngoại lệ đã xử ở code trên: super admin,
   và khi mapping chưa được cấu hình.
3. **Sync lại mỗi lần đăng nhập** ⇒ thu hồi group ở IdP có hiệu lực ở lần
   sign-in kế tiếp, không cần sửa tay trong CMS. Cửa sổ trễ bị chặn bởi session
   absolute 8 giờ (`config/admin.ts`, invariant #5). **Đây là giới hạn thật**:
   thu hồi tức thì đòi revoke session đang sống — chưa có, và nên ghi vào tài
   liệu bàn giao thay vì để khách hàng tự phát hiện.
4. **Active site phải được đối chiếu lại sau khi sync.** Nếu site đang active bị
   thu hồi mà không xoá cờ, user tiếp tục *tạo nội dung vào site vừa mất quyền*
   — vì active site chính là thứ `assignSiteOnCreate` ở §5.2 dùng để gán `site`.
   Quy tắc: còn quyền ⇒ giữ; mất quyền và còn đúng 1 site ⇒ chuyển sang site đó;
   còn nhiều site ⇒ xoá cờ và buộc chọn lại.

### 8bis.5 Sau khi đăng nhập, đi đâu

`controllers/sso.ts` hiện kết thúc bằng `ctx.redirect("/admin")`. Với
multi-tenant, điểm hạ cánh phụ thuộc số site:

| Số site được gán | Hành vi |
|---|---|
| 0 | không xảy ra — quy tắc 2 đã chặn ở tầng provision |
| 1 | set active tự động, `redirect("/admin")` như cũ |
| >1, đã có active hợp lệ | `redirect("/admin")` |
| >1, chưa có active | `redirect("/admin/plugins/tenant")` — trang **My Sites** (§6.1) |

Đúng nguyên văn yêu cầu của bạn: *"đăng nhập xong user có thể xem được các
website mình có thể thao tác được"*.

### 8bis.6 Ghi audit cho việc cấp/thu hồi site

Auto-audit của `editorial` chỉ bắt thao tác nội dung (`isWorkflowUid` trong
`register.ts`). Việc **ai được vào website nào** là dữ liệu compliance đúng
nghĩa, và nó thay đổi ở hai đường: super admin bấm trong UI (§6.2), và SSO sync
mỗi lần login. Cả hai phải ghi:

```ts
await strapi.plugin("editorial").service("audit").record({
  action: "tenant.grant" | "tenant.revoke",
  contentType: "api::site.site",
  entryDocumentId: site.documentId,
  actorEmail,            // super admin, hoặc "sso:<email>" khi do IdP sync
  reason: source,        // "manual" | "idp-group:<name>"
});
```

Không thêm việc gì mới ngoài hai action label — bảng audit đã append-only và đã
có export CSV/JSON.

### 8bis.7 Một IdP cho mỗi tenant — có nên không

Nếu về sau mỗi website do một đơn vị khác vận hành (agency ngoài, công ty thành
viên có Entra riêng), thiết kế hiện tại **không** đáp ứng được, và đây là phần
đắt nhất của toàn bộ kế hoạch:

- `oidcConfigFromEnv()` đọc env ⇒ phải thành config theo site (secret vẫn ở
  Secrets Manager, **không** cất trong DB).
- `discoveryCache` / `jwksCache` là module singleton ⇒ phải key theo `issuer`,
  nếu không IdP của tenant B sẽ được verify bằng JWKS của tenant A. Đây là lỗi
  bypass xác thực im lặng, không phải lỗi hiệu năng.
- `redirect_uri` cố định ⇒ phải thành `/api/sso/callback/:siteKey`, hoặc nhét
  tenant vào `state` (và khi đó `state` phải được ký, không chỉ so sánh).
- `OIDC_ALLOWED_EMAIL_DOMAINS` phải thành per-site.
- `enforce.ts` chặn ở HTML load của `/admin` — mà admin panel chỉ có **một**
  domain, nên nó không thể suy ra tenant để chọn IdP ⇒ phải chèn một bước chọn
  tổ chức trước khi redirect.

Ước lượng thêm **4–6 ngày** và tăng đáng kể bề mặt tấn công của phần xác thực.

**Khuyến nghị: không làm bây giờ.** Toàn bộ editor là nhân sự VNG trên một IdP;
một IdP + phân quyền bằng group (8bis.2) đáp ứng đủ, rẻ hơn nhiều, và giữ nguyên
mọi kiểm chứng bảo mật đã viết trong `oidc.ts`. Ghi vào ADR-009 như phương án
"revisit if" — đúng khuôn các ADR hiện có.

### 8bis.8 Cái *không* phải sửa

`enforce.ts` giữ nguyên. Nó chỉ quyết định "đẩy vào IdP hay để SPA load", không
đụng tới danh tính hay phạm vi. Ghi ra đây để không ai mở nó ra sửa nhầm khi làm
phase này — nó là file dễ làm hỏng đường đăng nhập nhất trong plugin.

---

## 9. Giới hạn đã biết (nói trước, không phát hiện sau)

| Vùng | Trạng thái | Xử lý |
|---|---|---|
| **Media Library** | ⚠️ *partial* — file không có quan hệ tenant | Phase 5: mỗi site một folder gốc, middleware ép `folder` khi upload và lọc khi list. Không kín tuyệt đối: URL file public đoán được. |
| **Content-Type Builder** | ❌ không scope được | Chỉ super admin — vốn đã nên vậy, và trên production `NODE_ENV=production` đã tắt CTB. |
| **Locale** | ❌ global | `site.locales` chỉ là whitelist ở tầng app; user site A vẫn thấy tên locale của site B trong dropdown. |
| **Webhook / API token / Users-permissions** | ❌ global | Chỉ super admin. |
| **Editorial audit log** | cần bổ sung | Thêm cột `siteKey` + lọc audit theo site, nếu không Editor site A đọc được tiêu đề nội dung chưa publish của site B — đúng loại rò rỉ mà ADR-004 §"P7 correction" đã siết. |
| **Thu hồi quyền qua SSO** | ⚠️ trễ tới lần login kế | Sync chạy khi đăng nhập (§8bis.4 quy tắc 3); cận trên là session absolute 8 giờ. Thu hồi tức thì cần revoke session đang sống. |
| **Multi-IdP theo tenant** | ❌ không hỗ trợ | Một IdP cho toàn CMS. Xem §8bis.7 trước khi hứa với khách hàng. |
| **Rate limit / ISR cache** | per-process | ADR-008 vẫn áp dụng: **một** instance. Multi-tenant *không* đổi điều này. |

Không có mục nào ở trên là lý do để chọn EE thay vì làm cách này; nhưng chúng
phải nằm trong tài liệu bàn giao cho khách hàng, đặc biệt là Media Library.

---

## 10. Test (điều kiện nghiệm thu)

Unit / integration (`node:test`, chạy bằng `pnpm test`):

1. Condition trả `$in: []` khi user chưa được gán site → list rỗng, **không** phải list đầy đủ.
2. `findOne` một documentId thuộc site khác → 403 (không phải 404 im lặng).
3. `create` không có active site → 400; có active site → tự gán đúng `site`.
4. `update` cố đổi `data.site` bởi non-super-admin → 403.
5. `POST /tenant/me/active-site` với site không được gán → 403.
6. Mọi route trong §5.3 gọi bởi role `vng-admin` → 403.
7. Sau khi role sync, permission của role non-super-admin **vẫn còn** condition
   `tenant::in-assigned-sites` (bắt rủi ro ở §5.1).
8. `tagsForEntry` sinh tag có tiền tố site; hai site không dùng chung tag nào.

SSO (§8bis) — bổ sung vào `sso` test hiện có:

9. Claims có group map ra site A ⇒ user được gán đúng site A, **không** site nào khác.
10. Group không map ra site nào ⇒ login bị từ chối (`not_authorized`), user
    không được tạo. Trường hợp super admin ⇒ vẫn vào được.
11. Không site nào khai `idpGroups` ⇒ assignment hiện có **không bị đụng tới**
    (CMS là nguồn sự thật).
12. Group bị gỡ ở IdP ⇒ lần login kế thu hồi site, và nếu đó là active site thì
    cờ active bị xoá/chuyển — user không tạo được nội dung vào site đã mất quyền.
13. Không group IdP nào có thể dẫn tới `strapi-super-admin` **hoặc** tới quyền
    toàn bộ site.

E2E (`pnpm --filter @vng/qa e2e`): đăng nhập user site A → chỉ thấy nội dung site
A; menu "Sites & Tenants" không hiển thị; gõ thẳng URL settings → bị chặn.

---

## 11. Phân kỳ & ước lượng

| Phase | Nội dung | Ước lượng |
|---|---|---|
| **P1** | Content-type `site`, quan hệ `site` trên các UID, migration backfill, gộp `global` vào `site` | 2–3 ngày |
| **P2** | Plugin `tenant`: assignment, service, policy, routes, condition (L2) + middleware (L3) | 4–5 ngày |
| **P3** | Admin UI: My Sites, Sites & Assignments (super-admin), SiteSwitcher | 3–4 ngày |
| **P4** | Delivery: resolve theo host, cache tag theo site, revalidation payload, redirect theo host, sitemap/robots | 3–4 ngày |
| **P5** | Media folder scoping, audit log theo site, unique slug theo site | 2–3 ngày |
| **P6** | Token gắn site (§5.4 B), test đầy đủ, ADR-009, cập nhật AGENTS.md/skills | 2–3 ngày |

**Đã hoàn thành (P1–P3).** Chi tiết những gì lệch so với bản kế hoạch:

| Đã làm | Ghi chú |
|---|---|
| `api::site.site` + quan hệ `site` (required) trên 8 content-type | `author`, `redirect` cũng scope |
| `slug` `uid` → `string`, unique theo `(site, locale)` trong guard | §3.4; guard cũng tự slugify khi để trống |
| `redirect.from` bỏ `unique` toàn cục | uniqueness chuyển sang `(site, from)` |
| Plugin `tenant` đầy đủ: condition, guard, assignment, console | `apps/cms/src/plugins/tenant/` |
| Site mặc định + backfill nội dung + backfill assignment | trong **plugin bootstrap**, không phải app bootstrap — xem dưới |
| Admin UI: My Sites, Sites, Phân quyền, SiteSwitcher | Settings link gate bằng `plugin::tenant.manage` |
| Audit `tenant.grant` / `tenant.revoke` | ghi vào bảng audit của `editorial` |

Ba điều phát hiện khi implement, không có trong bản kế hoạch:

- **Thứ tự lifecycle.** Strapi chạy mọi *plugin* bootstrap **trước** app
  bootstrap. Đặt `ensureSites()` trong `src/index.ts` như dự định ban đầu thì
  backfill assignment chạy khi chưa có site nào ⇒ lần boot đầu không gán ai. Việc
  tạo site đã chuyển vào plugin bootstrap.
- **Super admin cũng cần "site đang làm việc".** Guard bỏ qua họ, nên nếu không
  xử lý gì họ sẽ tạo được nội dung **không có site** — đúng trạng thái hỏng mà
  backfill sinh ra để sửa. Giờ họ chọn được site bất kỳ (`allowAny`) và guard tự
  điền; không chọn thì bị từ chối với thông báo rõ.
- **`@strapi/icons` không export `Layer`.** Bắt được ở `strapi build`, không phải
  ở typecheck — admin bundle do Vite/Rollup dựng riêng.

SSO (§8bis) **đã hoãn** theo yêu cầu. Khi làm, nó chen vào hai chỗ, không phải
một phase riêng:

- **P1** +0.5 ngày: field `site.idpGroups`.
- **P2** +1.5 ngày: `syncFromIdpGroups`, `reconcileActiveSite`, hook trong
  `provision.ts`, audit `tenant.grant`/`tenant.revoke`, và các test 9–13 ở §10.
- **P3** +0.5 ngày: điểm hạ cánh sau login (§8bis.5).

Tổng: **~18–25 ngày công**. P1+P2 là phần bắt buộc phải đúng; P3 trở đi có thể
cắt gọt. Multi-IdP theo tenant (§8bis.7) **không** nằm trong con số này.

Kèm theo: **ADR-009 — Multi-tenancy on Strapi CE**, ghi lại lựa chọn
"condition + document-service middleware" so với các phương án đã loại
(nhiều instance Strapi mỗi site; một Strapi mỗi tenant dùng chung DB; mua EE),
đúng khuôn ADR đang có trong `docs/adr/`.

---

## 12. Phương án đã cân nhắc và loại

- **Mỗi site một instance Strapi + một DB.** Isolation tuyệt đối, không cần dòng
  code nào ở trên. Loại vì: chi phí hạ tầng nhân theo số site, không có chỗ nào
  để một Master Admin nhìn toàn cảnh, và yêu cầu #2 ("super admin thấy và thao
  tác mọi site") sẽ cần một cổng thứ tư đứng trên — phức tạp hơn hẳn cách này.
- **Mua Strapi Enterprise.** EE cho custom role + field-level permission + audit
  log, nhưng **vẫn không có tenant isolation theo entry** — vẫn phải viết
  condition như §5.1. EE mua về không giải quyết được phần lõi, và ADR-004 đã ghi
  CE là ràng buộc cứng của dự án.
- **Fork / build lại Strapi.** Loại thẳng: mất đường upgrade, và không có gì
  trong yêu cầu đòi phải sửa core — mọi điểm cần can thiệp đều đã có extension
  point công khai (đã liệt kê ở §0).
