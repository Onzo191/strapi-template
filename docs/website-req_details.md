# Chi tiết Tài liệu Yêu cầu Website VNG (website-req.pdf)

Tài liệu này được trích xuất từ file PDF đặc tả yêu cầu nâng cấp Website VNG (www.vng.com.vn) và trang Nhà đầu tư (IR page) Phase 2.

---

## 1. Tổng quan & Tình trạng các Trang thuộc Domain vng.com.vn

Dưới đây là hiện trạng và định hướng quản lý đối với các trang web thành viên năm 2026:

1. **01 Website VNG + CMS**
   - **Đường dẫn**: [https://vng.com.vn/](https://vng.com.vn/)
   - **Hỗ trợ phát triển (Dev)**: Team VNGGames đang hỗ trợ.
   - **Đơn vị sử dụng CMS**: Corporate Communications (CBC), Legal.
   - **Định hướng 2026**: Nhận bàn giao kỹ thuật & Centralize về IT.
   - **Mức độ ưu tiên**: **Độ ưu tiên cao nhất (Top 1)** - Revamp website chính.

2. **02 Nhà đầu tư (IR Page) + CMS**
   - **Đường dẫn**: [https://ir.vng.com.vn/vi](https://ir.vng.com.vn/vi)
   - **Hỗ trợ phát triển (Dev)**: Đã deploy lên web VNG. Team A4B đã dev phase 1, bàn giao từ phase 2.
   - **Đơn vị sử dụng CMS**: CBC, Legal.
   - **Định hướng 2026**: Nhận bàn giao để tiếp tục triển khai Phase 2.

3. **03 Annual Report Landing Page**
   - **Đường dẫn AR2025**: [https://ir.vng.com.vn/vi/annual-report](https://ir.vng.com.vn/vi/annual-report) (do A4B phát triển)
   - **Đường dẫn AR2024**: [https://bctn2024.vng.com.vn/](https://bctn2024.vng.com.vn/) (do bên thứ ba outsource phát triển)
   - **Hiện trạng**: Cả 2 liên kết đã deploy lên web VNG (đang được nhúng trong mục Nhà đầu tư).
   - **Định hướng 2026**: Nhận bàn giao kỹ thuật.

4. **04 Quỹ DMF + CMS**
   - **Hỗ trợ phát triển (Dev)**: Team VNGGames đang hỗ trợ dev.
   - **Đơn vị sử dụng CMS**: CBC.
   - **Định hướng 2026**: Nhận bàn giao kỹ thuật.

5. **05 Career Site**
   - **Hỗ trợ phát triển (Dev)**: Team Digital Trans đang hỗ trợ.
   - **Đơn vị quản trị & sử dụng**: CBC, HR.
   - **Định hướng**: Triển khai từ năm 2027 trở đi.

---

## 2. Mục tiêu Kinh doanh & Yêu cầu Chiến lược (Business Objectives)

### Yêu cầu đối với Website chính VNG:
1. **Strategic Message (Thông điệp chiến lược)**: Đưa định vị **"hệ sinh thái số trong kỷ nguyên AI"** vào các trang trọng yếu của website.
2. **SEO Architecture (Cấu trúc SEO)**: Chuẩn hóa routing, sitemap, metadata, canonical, redirect và liên kết nội bộ (internal links).
3. **AIO Readiness (Sẵn sàng cho AI)**: Giúp các mô hình ngôn ngữ lớn (AI/LLM) đọc và hiểu đúng về VNG, các đơn vị thành viên (BU), ban lãnh đạo, các báo cáo và số liệu.
4. **Admin Autonomy (Tính tự chủ của quản trị viên)**: Đội ngũ biên tập nội dung (Content team) có thể tự chỉnh sửa trang, bài viết, các nút kêu gọi hành động (CTA), FAQ, các số liệu chính (key number) mà không cần phụ thuộc vào lập trình viên (Dev).
5. **Tracking (Hệ thống đo lường)**: Thiết lập hệ thống đo lường lượt xem (view), lượt click, tương tác phần nội dung (section engagement), lượt tải xuống (download) và các đích liên kết ngoài (outbound destination).

### Yêu cầu đối với trang Nhà đầu tư (IR Page) Phase 2:
1. **Figma Alignment**: Hiển thị đầy đủ giao diện và tính năng theo bản thiết kế Figma toàn trang.
2. **Dedicated CMS**: Sử dụng CMS chuyên dụng cho trang IR, đáp ứng nhu cầu sử dụng của các team liên quan.
3. **Tracking**: Đo lường lượt xem, lượt click, tương tác phần nội dung (section engagement), tải xuống tài liệu và các click ra ngoài.

---

## 3. Tóm tắt Trang Nhà đầu tư (IR Page Summary)

* **Phase 1 (Đã hoàn thành)**:
  - Triển khai và đưa vào hoạt động trang trên website VNG với sitemap gồm: *Tài chính, Quản trị, Đại hội đồng cổ đông, Báo cáo thường niên*.
  - Cung cấp CMS để tải tài liệu lên các trang trên (ngoại trừ trang Báo cáo thường niên).
* **Phase 2 (Đang triển khai)**:
  - Hoạt động trên môi trường production tại [https://ir.vng.com.vn/vi/](https://ir.vng.com.vn/vi/).
  - Ra mắt mục **Công bố thông tin** và **Cổ phiếu** (sử dụng API lấy dữ liệu trực tiếp từ Vietstock).
  - Bổ sung chức năng CMS để upload tài liệu lên trang Công bố thông tin.
  - Xây dựng tài liệu vận hành kỹ thuật.
  - Cài đặt hệ thống đo lường tracking.

---

## 4. Bản đồ Sitemap Website VNG mới

Sitemap được phân bổ thành các nhóm chuyên mục chính như sau:
* **Trang chủ (Homepage)**: Chạy banner tin tức tiêu biểu (auto-update), định vị hệ sinh thái 4 BUs, tin tức nổi bật, tác động cộng đồng, Career, Contact Us.
* **Về VNG**: Tầm nhìn - Sứ mệnh - Giá trị cốt lõi, Lịch sử, Đội ngũ lãnh đạo, Văn hóa doanh nghiệp, Giải thưởng.
* **Trụ cột kinh doanh**: 
  - *Trò chơi trực tuyến* / *Nền tảng kết nối* / *Thanh toán & Tài chính* / *AI Cloud*.
  - Giới thiệu Zalo, ZaloPay (nhúng website BU), VNGGames, GreenNode (nhúng website BU), và AI-Native (Products & People) (nhúng website BU).
* **Con người**: Phát triển đội ngũ, Môi trường làm việc, Các sự kiện nội bộ tiêu biểu, Tuyển dụng (nhúng website Career).
* **Nhà đầu tư**: Nhúng trang IR hiện tại vào cấu trúc web mới.
* **Tác động**: Đóng góp kinh tế, Nhân lực số, Hạ tầng số, Cam kết cộng đồng (nhúng website DMF và landing UpRace).
* **Tin tức**: Tin tức Doanh nghiệp, Thông cáo báo chí, Kết quả kinh doanh (tự động cập nhật từ mục Kết quả kinh doanh trang Nhà đầu tư), Kết nối với VNG (photo recap).

---

## 5. Yêu cầu chi tiết đối với CMS Website VNG

Hệ thống quản lý nội dung (CMS) cần đáp ứng 10 nhóm chức năng nghiệp vụ sau:

1. **Quản lý nội dung**: Tạo/sửa/xóa bài viết, trang tĩnh. Hỗ trợ trình soạn thảo WYSIWYG hoặc block builder. Cho phép lưu nháp, xem trước (preview) sát với giao diện thực tế, lên lịch xuất bản/ẩn nội dung. Quản lý trạng thái: *Draft -> Review -> Approved -> Published -> Archived*.
2. **Media & tài liệu**: Thư viện media tập trung cho hình ảnh/PDF/video. Cho phép phân loại bằng folder/tag, tìm kiếm. Hỗ trợ thay thế file không làm thay đổi URL, nhập alt text/caption, tối ưu hóa kích thước ảnh và kiểm tra bảo mật file tải lên.
3. **Workflow & version**: Phân định luồng duyệt nội dung (Contributor/Editor tạo -> Approver duyệt/từ chối kèm bình luận -> Publisher xuất bản). Ghi lại lịch sử chỉnh sửa (version history), hỗ trợ rollback về phiên bản cũ và ghi nhận rõ người sửa, thời gian, lý do thay đổi.
4. **User & phân quyền**: Quản lý tài khoản với các vai trò *Master Admin, Admin, Editor, Contributor, Viewer*. Phân quyền chi tiết theo từng module, chuyên mục và hành động. Kiến trúc phân quyền cần sẵn sàng để mở rộng thành multi-site sau năm 2027.
5. **Audit & compliance**: Nhật ký hệ thống (system log) ghi nhận mọi hoạt động tạo, sửa, xóa, duyệt, publish, rollback. Log không thể bị xóa bởi người dùng thường, hỗ trợ bộ lọc nâng cao và export báo cáo audit. Áp dụng cơ chế xóa tạm (soft delete) vào sọt rác trước khi xóa vĩnh viễn.
6. **SEO & marketing**: Cho phép tùy chỉnh SEO title, meta description, URL slug, Open Graph image, thẻ canonical, schema markup cơ bản. Tự động cập nhật XML sitemap khi xuất bản bài viết mới, quản lý cấu hình redirect 301 và tích hợp GA4/GTM.
7. **Đa ngôn ngữ & menu**: Hỗ trợ 2 ngôn ngữ Việt/Anh độc lập cho tiêu đề, nội dung, URL slug và SEO metadata. Quản lý cấu hình header/footer menu đa cấp, hỗ trợ preview cấu trúc menu và cảnh báo liên kết hỏng.
8. **Bảo mật & vận hành**: Hỗ trợ cơ chế đăng nhập an toàn (SSO/MFA), tự động ngắt phiên làm việc (session timeout). Chống các lỗ hổng bảo mật phổ biến (XSS, CSRF, Injection). Cung cấp môi trường chạy thử (Staging) trước khi đưa lên môi trường thật (Production).
9. **Trải nghiệm quản trị (Usability)**: Trang tổng quan hiển thị danh sách bài viết chờ duyệt, sắp xuất bản hoặc vừa cập nhật. Hỗ trợ tìm kiếm, lọc nhanh và thực hiện hành động hàng loạt (bulk actions). Cảnh báo khi người dùng rời trang khi chưa lưu dữ liệu.
10. **Tích hợp hệ thống (Integration)**: Cung cấp API có xác thực và giới hạn tần suất (rate limit) cho frontend lấy dữ liệu. Tích hợp CDN/media storage, hệ thống gửi email thông báo, internal search engine và webhook để xóa cache khi xuất bản nội dung mới.

---

## 6. Lộ trình Triển khai (Implementation Roadmap)

1. **Giai đoạn 1: Tiếp nhận & Bàn giao (Hoàn thành trước 30/06/2026)**
   - Thực hiện bàn giao kỹ thuật và tập trung hóa hosting (centralize) về IT.
   - Làm rõ yêu cầu chi tiết đối với trang Nhà đầu tư (IR page) và Website mới, thống nhất kế hoạch triển khai.
2. **Giai đoạn 2: Phát triển IR Page Phase 2 & Revamp Website VNG (Từ 01/07 – 20/09/2026)**
   - Hoàn thiện nội dung và thiết kế giao diện chi tiết trên Figma.
   - Lập trình giao diện theo Figma, tích hợp CMS quản trị.
   - Thực hiện kiểm thử chấp nhận người dùng (UAT) và đánh giá an ninh bảo mật (Security check).
   - Chạy thử nghiệm giới hạn (Soft launch) và hoàn thiện tài liệu vận hành.
3. **Giai đoạn 3: Tối ưu & Mở rộng (Sau ngày 21/09/2026)**
   - Vận hành, bảo trì định kỳ hệ thống.
   - Tối ưu hóa SEO/AIO và cấu hình hệ thống đo lường (tracking).
   - Sẵn sàng triển khai các trang chiến dịch (Microsite) theo các chiến dịch truyền thông mới.
