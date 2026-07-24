# Chi tiết Kế hoạch Revamp & Tracking (web-tracking.xlsx)

Tài liệu này chứa Master Plan chi tiết cho việc nâng cấp (revamp) Website VNG năm 2026, bao gồm kế hoạch làm việc, ma trận yêu cầu CMS, danh sách trang chi tiết, đầu việc kỹ thuật SEO/AIO và cấu trúc sitemap mới.

---

## 1. Master Plan Overview (01 Master Overview)

| Hạng mục | Nội dung |
| --- | --- |
| Tên master plan | VNG Website Revamp Master Plan 2026 |
| Mục tiêu | Ưu tiên 2026 là revamp Website VNG chính thành nền tảng truyền thông doanh nghiệp: nội dung/UX-UI mới, sitemap rõ, CMS giảm phụ thuộc dev, SEO/AIO và tracking vận hành được. |
| Phạm vi chính (theo timeline thực hiện) | 1. Triển khai phase 2 của trang Nhà đầu tư (IR page): launch trang Stock + trang Disclosure + CMS cho Disclosure<br>2. Triển khai sitemap VNG website mới: Trang chủ; Về VNG; Trụ cột kinh doanh, Con người; Nhà đầu tư; Tác động; Tin tức; Contact Us. |
| Team phối hợp | CC/CBC: nội dung, governance, CMS use case, UAT; BIE: UX/UI/Figma; IT: centralize, dev, CMS, SEO/AIO, tracking, security; VNGGames/A4B/Digital Trans hỗ trợ bàn giao source |
| Timeline chính | 17-24/06/2026 tiếp nhận & bàn giao; <br>25/6 - 15/7/2026: IR page phase 2<br>16/7-20/09/2026 nâng cấp & revamp; <br>sau 20/09/2026 tối ưu & mở rộng. |


---

## 2. Trạng thái các Site hiện tại (02 Current Sites)

| Asset / site | URL / status | Team đang hỗ trợ | Team sử dụng/quản trị CMS | Priority 2026 |
| --- | --- | --- | --- | --- |
| Website VNG + CMS | https://vng.com.vn/ | VNGGames hỗ trợ dev | CBC, Legal | Top 1 |
| Nhà đầu tư + CMS | https://ir.vng.com.vn/vi; đã deploy lên web VNG | A4B hỗ trợ dev | CBC, Legal | Top 2 |
| Annual Report Landing page | AR2025: https://ir.vng.com.vn/vi/annual-report; AR2024: https://bctn2024.vng.com.vn/ | A4B/outsource dev | CBC/Legal theo quy trình IR | Nhận bàn giao |
| Quỹ DMF + CMS | Đang thuộc domain/stack liên quan VNG | VNGGames hỗ trợ dev | CBC | Nhận bàn giao |
| Career site | Project riêng | Digital Trans hỗ trợ | CBC, HR | Project riêng |


---

## 3. Kế hoạch làm việc (03 Workplan)

Kế hoạch chi tiết theo từng Phase và Workstream:

| Phase | Workstream | Task | Lead | Start | Due | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1. Tiếp nhận & bàn giao | Governance | Bàn giao kỹ thuật và centralize về IT website VNG | IT, VNGGames | 20/06/2026 | 20/06/2026 | Đang làm |
| 1. Tiếp nhận & bàn giao | Governance | Bàn giao kỹ thuật trang Nhà đầu tư (IR page) | IT, A4B | 22/6/2026 | 24/06/2026 | Hoàn thành |
| 1. Tiếp nhận & bàn giao | Requirement | Làm rõ tình trạng domain vng.com.vn hiện tại <br>Yêu cầu cho IR page phase 2 + website VNG mới + yêu cầu CMS | CBC | 15/06/2026 | 17/06/2026 | Hoàn thành |
| 1. Tiếp nhận & bàn giao | Requirement | Roadmap chi tiết<br>Lock scope for IR page: Stock, Disclosures, GMS and CMS behavior | IT | 22/06/2026 | 25/06/2026 | Đang làm |
| 2. IR page Phase 2 | Dev | Update text theo figma (đã có sẵn figma)<br>Build trang Stock - API từ Vietstock | IT | 30/6/2026 | 20/7/2026 | Đang làm |
| 2. IR page Phase 2 | Dev | Build trang Disclosure từ Figma (đã có sẵn figma) <br>Update CMS cho Disclosure | IT |  |  | Đang làm |
| 2. IR page Phase 2 | Dev | Tài liệu vận hành IR page (CMS,…) | CBC, IT | 21/7/2026 | 31/7/2026 | Đang làm |
| 3. Revamp Website VNG | Content | Viết nội dung mới cho website và content approved by ThaoTXN | CBC | 18/06/2026 | 30/06/2026 | Đang làm |
| 3. Revamp Website VNG | Design | Thiết kế Figma UX/UI mới theo sitemap & approved by ThaoTXN | CBC | 2026-01-07 00:00:00 | 15/7/2026 | Chưa làm |
| 3. Revamp Website VNG | Dev | Code theo figma đã được duyệt<br>Tối ưu Web, Mobile | IT | 31/7/2026 | 20/9/2026 | Chưa làm |
| 3. Revamp Website VNG | Dev | Build CMS modules required by sitemap | IT |  |  | Chưa làm |
| 3. Revamp Website VNG | SEO/AIO | Implement routing, sitemap.xml, metadata, schema, redirects | IT |  |  | Chưa làm |
| 3. Revamp Website VNG | Dev | UAT | IT |  |  | Chưa làm |
| 3. Revamp Website VNG | Dev | Security check | VRC |  |  | Chưa làm |
| 3. Revamp Website VNG | Dev | Deploy | IT |  |  | Chưa làm |
| 3. Revamp Website VNG | Dev | Implement tracking for sitemap modules | IT | 20/9/2026 | 30/9/2026 | Chưa làm |
| 3. Revamp Website VNG | Dev | Tài liệu vận hành website | IT | TBU | TBU | Chưa làm |
| 4. Optimize | Dev | Bảo trì, tracking system, SEO/AIO tối ưu | IT | TBU | TBC | Chưa làm |
| 4. Optimize | Microsite | Microsite theo campaign |  |  |  | Chưa làm |


---

## 4. Ma trận Yêu cầu CMS (06 Website CMS)

Bảng phân tích chi tiết các module chức năng cần thiết cho CMS quản trị Website VNG mới:

| Module | Tính năng | Yêu cầu đạt | Priority | Tình trạng CMS hiện nay |
| --- | --- | --- | --- | --- |
| Tài liệu vận hành website | Tài liệu cho các team: Dev, Quản trị - chuẩn để sử dụng, đào tạo, mở rộng,... |  | Must-have | Chưa có |
| Phạm vi CMS | CMS phục vụ quản trị website VNG hiện tại trong Phase 1; quản lý nội dung, media, menu, SEO và các cấu hình hiển thị của website hiện tại. | Kiến trúc không khóa cứng; dữ liệu, role và module nên đủ linh hoạt để mở rộng multi-site sau 2027 mà không phải làm lại nền tảng. | Must-have / Future | Đã có 1 phần |
| Quản lý nội dung | Tạo, sửa, xóa, lưu nháp bài viết; quản lý trang tĩnh như About Us, Leadership, Contact; WYSIWYG; block/section builder; preview; schedule publish/unpublish; trạng thái Draft, Review, Approved, Published, Archived. | Preview cần sát bản publish; có autosave hoặc cảnh báo rời trang khi chưa lưu; validation rõ ràng để tránh lỗi layout, thiếu trường bắt buộc hoặc nhập vượt giới hạn thiết kế. | Must-have | Đã có các phần cơ bản nhưng chưa có WYSIWYG, workflow approval chưa rõ |
| Quản lý banner | Quản lý banner desktop/mobile; cấu hình title, subtitle, CTA, link, thứ tự hiển thị, ngày bắt đầu/kết thúc; preview trước khi publish. | Banner phải được tối ưu dung lượng, hiển thị đúng trên desktop/mobile, không làm vỡ layout và tự động ẩn khi hết hạn | Must-have |  |
| Media & tài liệu | Upload hình ảnh, PDF, video và tài liệu phổ biến; media library tập trung; phân loại bằng folder/tag; tìm kiếm; thay thế file mà không đổi URL; nhập alt text, caption, description. | Kiểm tra định dạng, MIME type và dung lượng; tối ưu ảnh; scan malware nếu khả thi; chặn file executable/script nguy hiểm; lưu version khi thay thế file. | Must-have | Chưa có |
| Workflow xuất bản | Workflow Contributor/Editor tạo nội dung, gửi duyệt, Approver approve/reject kèm comment, Publisher publish; hỗ trợ publish ngay hoặc đặt lịch; unpublish nội dung. | Người tạo/sửa không mặc định được tự publish; mọi bước duyệt phải có log; có thông báo trạng thái; nội dung quan trọng cần separation of duties. | Must-have | Chưa có |
| Version & rollback | Lưu version history cho bài viết, trang, banner và tài liệu; hiển thị người sửa/thời gian sửa; so sánh phiên bản nếu có; khôi phục phiên bản cũ. | Rollback không làm mất lịch sử; phiên bản cần ghi nhận user, thời gian và lý do thay đổi với nội dung quan trọng. | Must-have | Chưa có |
| User & phân quyền | Vai trò Master Admin, Admin, Editor, Contributor, Viewer; tạo/sửa/khóa/xóa tài khoản; phân quyền theo module, chuyên mục và hành động như view/create/edit/delete/approve/publish/export. | Áp dụng least privilege; hỗ trợ khóa tài khoản khi nhân sự đổi vai trò; session timeout; phân quyền theo từng website đưa vào roadmap multi-site sau 2027. | Must-have / Future | Chưa có |
| Audit & compliance | Ghi log hành động tạo, sửa, xóa, duyệt, publish, unpublish, rollback; lọc log theo user, module, thời gian và loại hành động. | Log không được xóa bởi user thông thường; có thể export khi kiểm tra nội bộ; nên lưu before/after với nội dung quan trọng; áp dụng soft delete/trash trước khi xóa vĩnh viễn. | Must-have | Chưa có |
| SEO & marketing | Chỉnh SEO title, meta description, URL slug, Open Graph image, sitemap, redirect 301, canonical URL, schema markup cơ bản, GA4/GTM và tracking tools. | Cảnh báo thiếu/trùng meta, trùng slug, thiếu OG image hoặc link lỗi; sitemap cập nhật tự động khi publish; redirect cần tránh vòng lặp. | Must-have | Chưa có |
| Đa ngôn ngữ | Quản lý nội dung VI/EN; mỗi ngôn ngữ có title, body, slug và SEO metadata riêng; liên kết bản VI và EN của cùng một nội dung. | Có trạng thái bản dịch như missing, draft, pending, published; hỗ trợ fallback khi bản dịch chưa có; sitemap/URL theo từng ngôn ngữ. | Must-have nếu website có VI/EN | Đã có |
| Menu & navigation | Quản lý header/footer menu; thêm/sửa/xóa/sắp xếp menu item; hỗ trợ menu nhiều cấp; gắn link nội bộ, link ngoài hoặc file download. | Cảnh báo link gãy hoặc URL không tồn tại; preview menu trước khi publish để tránh sai cấu trúc điều hướng. | Must-have | Chưa có |
| Form & dữ liệu người dùng | Nếu website có Contact, Newsletter, IR request hoặc Media contact form: quản lý form/field, xem submission, export dữ liệu, cấu hình email nhận thông báo. | Có consent checkbox khi thu thập dữ liệu cá nhân; chống spam bằng CAPTCHA hoặc tương đương; phân quyền xem/export dữ liệu; có chính sách lưu/xóa dữ liệu. | Conditional | Chưa có |
| Bảo mật đăng nhập & API | CMS hỗ trợ đăng nhập, quản lý tài khoản, quyền truy cập và API cho frontend lấy dữ liệu. | SSO nếu khả thi; MFA/2FA cho Admin/Master Admin; HTTPS; session timeout; khóa tài khoản sau nhiều lần login sai; chống XSS/CSRF/injection; API có authentication, authorization và rate limit. | Must-have | Cần check lại hệ thống |
| Hiệu năng & frontend delivery | Publish nội dung lên website; danh sách nội dung có search/filter/pagination; media được phục vụ đúng kích thước. | Website public không bị ảnh hưởng nếu CMS lỗi; hỗ trợ cache/CDN; media load nhanh; publish cập nhật trong thời gian hợp lý. | Must-have | Có nhưng chưa tối ưu |
| Backup & vận hành | Có môi trường staging/production; preview/stage nội dung trước khi publish production; có tài liệu vận hành cơ bản. | Backup database và media định kỳ; restore theo thời điểm; monitoring lỗi publish/API/media; có kế hoạch rollback khi publish lỗi. | Must-have | Chưa có |
| Usability cho người quản trị | Dashboard nội dung chờ duyệt/sắp publish/vừa cập nhật; search/filter; bulk actions; giao diện dễ dùng cho người không chuyên kỹ thuật. | Thông báo lỗi rõ ràng; tránh thao tác nhầm; cảnh báo khi rời trang chưa lưu; form nhập liệu không gây mất dữ liệu; hỗ trợ preview desktop/mobile. | Should-have | Mới chỉ có dashboard chung cho toàn bộ nội dung |
| Integration | API cho frontend; tích hợp CDN/media storage, GA4, GTM, email notification, search engine nội bộ nếu có, webhook khi publish. | API có authentication/authorization/rate limit; webhook có thể clear cache hoặc trigger build; tích hợp cần có cơ chế retry/log lỗi. | Must-have / Should-have | Chưa có |


---

## 5. Danh mục các trang chi tiết (07 Page Inventory)

Danh sách tất cả các trang/chuyên mục của Website VNG mới kèm theo các yêu cầu về Content, UX/UI, Dev/CMS và SEO/AIO/Tracking:

| Sitemap group | Page/section | Proposed URL / behavior | Priority | Content need | UX/UI need | Dev/CMS need | SEO/AIO/Tracking need | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Trang chủ | Homepage | / | High | Banner tiêu biểu; định vị + hệ sinh thái 4 BUs; 3 tin mới nhất; tác động cộng đồng; Career; Contact Us | Nội dung + UX/UI mới; homepage modules rõ thứ tự ưu tiên | CMS setup banner/news auto-pull; links to Tin tức/Tác động/Con người; Contact section | Organization schema; homepage metadata; page_view, section_view, CTA/outbound tracking | Top 1 scope 2026 |
| Về VNG | Tầm nhìn - Sứ mệnh - Giá trị cốt lõi | /ve-vng/ | High | Corporate narrative, vision, mission, values | Nội dung + UX/UI mới | Static page CMS fields, component sections | Breadcrumb, Organization/entity copy |  |
| Về VNG | Lịch sử | /ve-vng/lich-su/ | High | Milestones/history | Timeline component | CMS timeline/items | Breadcrumb, structured dates nếu cần |  |
| Về VNG | Đội ngũ lãnh đạo | /ve-vng/doi-ngu-lanh-dao/ | Medium | Leader bios/titles/photos | Leadership grid/profile | CMS person profile fields | Person schema, profile tracking |  |
| Về VNG | Văn hóa doanh nghiệp | /ve-vng/van-hoa-doanh-nghiep/ | Medium | Culture narrative | Long-form/culture modules | CMS page sections | Breadcrumb/internal links |  |
| Về VNG | Giải thưởng | /ve-vng/giai-thuong/ | Medium | Awards list | Card/list layout | CMS awards list | Breadcrumb; item tracking |  |
| Trụ cột kinh doanh | Landing / parent section | /tru-cot-kinh-doanh/ | High | Overview of business pillars | Pillar landing/cards | CMS pillar cards, internal/outbound links | Breadcrumb; pillar tracking | Parent group in sitemap |
| Trụ cột kinh doanh | Nền tảng số | /tru-cot-kinh-doanh/nen-tang-so/ | High | Zalo, ZaloPay intro | Hub/card UX; embed/CTA to BU sites | Embed/link BU websites; no full rebuild | Entity naming; outbound_click by BU | Nhúng website BU |
| Trụ cột kinh doanh | Tăng trưởng toàn cầu | /tru-cot-kinh-doanh/tang-truong-toan-cau/ | High | VNGGames, GreenNode intro | Hub/card UX; embed/CTA to BU sites | Embed/link BU websites | Entity naming; outbound_click by BU | Nhúng website BU |
| Trụ cột kinh doanh | Năng lực AI | /tru-cot-kinh-doanh/nang-luc-ai/ | High | AI-Native Products & People intro | Hub/card UX; embed/CTA to BU sites | Embed/link relevant BU/product content | Entity naming; AIO-ready content | Nhúng website BU |
| Con người | Phát triển đội ngũ | /con-nguoi/phat-trien-doi-ngu/ | Medium | People development story | People section UX | CMS page sections | Breadcrumb; section tracking |  |
| Con người | Môi trường làm việc | /con-nguoi/moi-truong-lam-viec/ | Medium | Work environment | Image/story modules | CMS media/story blocks | Image alt text; internal links |  |
| Con người | Sự kiện nội bộ tiêu biểu | /con-nguoi/su-kien-noi-bo/ | Medium | Internal event highlights | Gallery/list modules | CMS gallery/list | Event/section tracking |  |
| Con người | Tuyển dụng | Career embed/link | Medium | Employer brand CTA | CTA/embed block | Nhúng/link Career site | outbound_click to Career | Career là project riêng |
| Nhà đầu tư | IR current page | Embed current IR site/page | High | IR current content and key investor journey | Nhúng trang hiện tại vào web mới | Integrate existing IR; preserve URL where possible | IR metadata, report links, tracking | Top 2 priority |
| Tác động | Đóng góp kinh tế | /tac-dong/dong-gop-kinh-te/ | High | Economic contribution content | Impact content modules | CMS page sections | Breadcrumb; AIO-readable facts | Nội dung + UX/UI mới |
| Tác động | Nhân lực số | /tac-dong/nhan-luc-so/ | High | Digital workforce contribution | Impact data/story modules | CMS page sections/key numbers | AIO-readable facts; section tracking |  |
| Tác động | Hạ tầng số | /tac-dong/ha-tang-so/ | High | Digital infrastructure contribution | Impact data/story modules | CMS page sections/key numbers | AIO-readable facts; section tracking |  |
| Tác động | Cam kết cộng đồng | /tac-dong/cam-ket-cong-dong/ | High | Community commitments; DMF and UpRace references | Cards/CTA/embed block | Nhúng/link DMF và landing UpRace | outbound/internal tracking | DMF nhận bàn giao |
| Tin tức | Tin tức Doanh nghiệp | /tin-tuc/doanh-nghiep/ | High | Corporate news category | Listing/category UX | CMS category/article fields | NewsArticle schema; article_view |  |
| Tin tức | Thông cáo báo chí | /tin-tuc/thong-cao-bao-chi/ | High | Press release category | Listing/category UX | CMS category/article fields | NewsArticle schema; article_view |  |
| Tin tức | Kết quả kinh doanh | Auto from IR business results | High | Business results pulled from IR | Listing/module UX | Auto update from Nhà đầu tư business results | Report/news tracking; avoid duplicate content | Tự động cập nhật từ IR |
| Tin tức | Kết nối với VNG | /tin-tuc/ket-noi-voi-vng/ | Medium | Photo recap campus tour/workshop/etc. | Photo recap/list UX | CMS gallery/article fields | Image alt; event tracking |  |
| Contact | Contact Us | /contact-us/ or homepage section | Medium | Contact points/routing | Contact section/page | CMS contact fields or form if scoped | Form tracking/privacy if form exists | Appears under homepage |


---

## 6. Danh mục Kỹ thuật SEO & AIO cho Nhà phát triển (08 SEO AIO Dev)

Đầu việc kỹ thuật chi tiết dành cho DEV để đảm bảo website chuẩn SEO và sẵn sàng cho các công cụ AI (AIO Readiness):

| Hạng mục | DEV cần làm | Dependency từ CC/BIE | Validation/Acceptance | Target phase | Status |
| --- | --- | --- | --- | --- | --- |
| Noindex/indexation | Gỡ bỏ x-robots-tag: noindex sai; kiểm tra robots.txt, meta robots, canonical | Danh sách URL quan trọng từ CC | Các trang cần index không bị block | Foundation | Not started |
| Domain canonical | Chuẩn hóa www/non-www bằng 301 redirect | Quyết định domain chính | Chỉ còn một canonical domain | Foundation | Not started |
| 404 cleanup | Map 297 URL 404 về trang đích mới | Redirect map từ CC/SEO | Không còn 404 quan trọng; redirect 301 đúng đích | Foundation | Not started |
| Hreflang/lang | Gắn lang=vi/en và hreflang theo từng bản ngôn ngữ | Content map VI/EN | Không bị loạn language trên search/AI | Build | Not started |
| Organization Schema | Inject JSON-LD Organization trên homepage | Tên định danh, logo, social links, ticker VNZ | Schema validator pass | Build | Not started |
| Breadcrumb Schema | Render BreadcrumbList động theo URL path | Sitemap mới | Breadcrumb đúng hierarchy ở mọi page | Build | Not started |
| FAQ Schema | FAQ accordion tự map sang FAQPage JSON-LD | FAQ content từ CC | FAQ Schema pass, nội dung khớp UI | Build | Not started |
| NewsArticle/Report Schema | Render headline, datePublished, author, report metadata | Metadata từ CC/IR | Schema pass trên news/report pages | Build | Not started |
| Person Schema | Template dynamic cho Leadership profile | Bio/ảnh/title lãnh đạo từ CC | Person Schema pass nếu publish profile detail | Build | Not started |
| Topic Cluster Routing | Thiết kế routes theo hub/node thay vì phòng ban cũ | Sitemap/topic cluster approved | Hub/node URL rõ hierarchy và internal links | Build | Not started |
| XML Sitemap | Tự sinh sitemap mới sau publish | Page inventory final | Sitemap submit-ready, đúng canonical URL | Build/UAT | Not started |
| Tracking | Cài tracking event cho CTA, report download, form submit, search, language switch | Tracking plan từ CC | Events fire đúng trong test | Build/UAT | Not started |
| Performance | Tối ưu Core Web Vitals, image, script, caching | Asset specs từ BIE | Performance baseline đạt agreed target | UAT | Not started |
| Security | Security check, form protection, admin permission, backup/rollback | Access/role matrix từ CC/IT | Security pass trước launch | UAT/Launch | TBC |
| Sitemap routing | Routes and internal links must follow: Trang chủ, Về VNG, Trụ cột kinh doanh, Con người, Nhà đầu tư, Tác động, Tin tức | Signed-off sitemap | Crawl shows correct hierarchy and breadcrumbs | Build/UAT | Not started |
| Auto news modules | Homepage banner and 3 featured news pull from Tin tức via CMS setup | News CMS rules | Homepage displays correct configured/latest news | Build/UAT | Not started |
| IR embed | Nhà đầu tư current site/page embedded into new web experience | IR current URL/status | IR content preserved, tracked, and not duplicated incorrectly | Build/UAT | Not started |
| BU embed/outbound | Business pillar pages embed/link to BU sites: Zalo, ZaloPay, VNGGames, GreenNode, AI-Native references | BU URLs and entity names | Outbound clicks tracked by BU destination | Build/UAT | Not started |
| Impact embeds | Tác động links/embeds DMF and UpRace landing | DMF/UpRace URLs | Links render correctly and track outbound/internal clicks | Build/UAT | Not started |
| Career link/embed | Con người/Tuyển dụng links or embeds Career site | Career site URL/status | Career treated as separate project; outbound tracking works | Build/UAT | Not started |
| Contact Us | Contact section/page from homepage sitemap | Contact owner/fields | Contact content/form passes privacy/security checks if form is in scope | Build/UAT | Not started |


---

## 7. Ma trận Sitemap mới (09 Sitemap Matrix)

Cấu trúc phân bổ sitemap mới cho website VNG:

| Trang chủ | Về VNG | Trụ cột kinh doanh | Con người | Nhà đầu tư | Tác động | Tin tức |
| --- | --- | --- | --- | --- | --- | --- |
| Banner (Chạy các tin tức tiêu biểu - tự động cập nhật từ trang Tin tức qua setup user trên CMS) | Tầm nhìn - Sứ mệnh - Giá trị cốt lõi | Trò chơi trực tuyến | Phát triển đội ngũ |  | Đóng góp kinh tế | Tin tức Doanh nghiệp |
| Định vị + hệ sinh thái 4 BUs | Lịch sử | Nền tảng kết nối | Môi trường làm việc |  | Nhân lực số | Thông cáo báo chí |
| Tin tức nổi bật (link với trang Tin tức, tự động cập nhật 3 tin mới nhất) | Đội ngũ lãnh đạo | Thanh toán & Tài chính | Các sự kiện nội bộ tiêu biểu |  | Hạ tầng số | Kết quả kinh doanh (tự động cập nhật từ mục Kết quả kinh doanh trang Nhà đầu tư) |
| Tác động cộng đồng (link với trang Tác động) | Giải thưởng | AI Cloud | Tuyển dụng (nhúng website Career) |  | Cam kết cộng đồng (nhúng website DMF và landing UpRace) | Kết nối với VNG (list photo recap campus tour/workshop/...) |
| Career (link với trang Con người) |  |  |  |  |  |  |
| Contact Us |  |  |  |  |  |  |
| Nội dung + UX/UI mới |  |  |  | Nhúng trang hiện tại vào web mới | Nội dung + UX/UI mới |  |

