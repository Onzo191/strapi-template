/**
 * Idempotent demo seed (P1 DoD: "seed data").
 *
 * Runs on bootstrap only when `SEED=true` AND the DB has no articles yet, so
 * it never clobbers real content. Seeds authors, taxonomy, a few bilingual
 * (vi/en) articles, one block-composed landing page, header/footer navigation
 * and the Global single type.
 *
 * Uses the Strapi 5 Document Service. Localized entries are created in the
 * default locale (vi) first, then an `en` localization is attached via
 * `update({ documentId, locale: "en" })` so both share one documentId.
 */
import type { Core } from "@strapi/strapi";

type Blocks = Array<Record<string, unknown>>;

/** Build a Strapi `blocks` value from plain paragraphs / an optional heading. */
function richText(paragraphs: string[], heading?: string): Blocks {
  const nodes: Blocks = [];
  if (heading) {
    nodes.push({ type: "heading", level: 2, children: [{ type: "text", text: heading }] });
  }
  for (const p of paragraphs) {
    nodes.push({ type: "paragraph", children: [{ type: "text", text: p }] });
  }
  return nodes;
}

/**
 * Loosely-typed Document Service accessor. The generated Document `Input`
 * types are intentionally excluded from the CMS tsconfig, so seed payloads
 * (dynamic zones, relations-by-documentId) don't need to satisfy them — this
 * is bootstrap-only demo data, not application code.
 */
// biome-ignore lint/suspicious/noExplicitAny: bootstrap-only loose typing
function docs(strapi: Core.Strapi, uid: string): any {
  return strapi.documents(uid as never);
}

async function publish(strapi: Core.Strapi, uid: string, documentId: string, locale: string) {
  await docs(strapi, uid).publish({ documentId, locale });
}

export async function seed(strapi: Core.Strapi): Promise<void> {
  const existing = await docs(strapi, "api::article.article").findMany({ limit: 1 });
  if (existing.length > 0) {
    strapi.log.info("[seed] articles already present — skipping seed");
    return;
  }
  strapi.log.info("[seed] seeding demo content…");

  // --- Authors (no i18n) ---------------------------------------------------
  const newsroom = await docs(strapi, "api::author.author").create({
    data: {
      name: "VNG Newsroom",
      slug: "vng-newsroom",
      jobTitle: "Editorial",
      bio: "Official VNG corporate newsroom.",
    },
  });
  const techTeam = await docs(strapi, "api::author.author").create({
    data: {
      name: "VNG Tech",
      slug: "vng-tech",
      jobTitle: "Engineering",
      bio: "Engineering & product stories from VNG.",
    },
  });

  // --- Categories (vi default + en localization) ---------------------------
  const categoryDefs = [
    { slug: "tin-cong-ty", vi: "Tin công ty", en: "Company News" },
    { slug: "cong-nghe", vi: "Công nghệ", en: "Technology" },
    { slug: "tuyen-dung", vi: "Tuyển dụng", en: "Careers" },
  ];
  const categories: Record<string, string> = {};
  for (const c of categoryDefs) {
    const doc = await docs(strapi, "api::category.category").create({
      data: { name: c.vi, slug: c.slug, description: `${c.vi} — VNG` },
      locale: "vi",
    });
    await docs(strapi, "api::category.category").update({
      documentId: doc.documentId,
      locale: "en",
      data: { name: c.en, slug: c.slug, description: `${c.en} — VNG` },
    });
    categories[c.slug] = doc.documentId;
  }

  // --- Tags (vi default + en localization) ---------------------------------
  const tagDefs = [
    { slug: "ai", vi: "AI", en: "AI" },
    { slug: "cloud", vi: "Cloud", en: "Cloud" },
    { slug: "van-hoa", vi: "Văn hóa", en: "Culture" },
  ];
  const tags: Record<string, string> = {};
  for (const t of tagDefs) {
    const doc = await docs(strapi, "api::tag.tag").create({
      data: { name: t.vi, slug: t.slug },
      locale: "vi",
    });
    await docs(strapi, "api::tag.tag").update({
      documentId: doc.documentId,
      locale: "en",
      data: { name: t.en, slug: t.slug },
    });
    tags[t.slug] = doc.documentId;
  }

  // --- Articles (vi + en, published) ---------------------------------------
  const articleDefs = [
    {
      slug: "vng-ra-mat-nen-tang-ai",
      category: "cong-nghe",
      tags: ["ai", "cloud"],
      author: techTeam.documentId,
      featured: true,
      vi: {
        title: "VNG ra mắt nền tảng AI mới",
        excerpt: "Nền tảng AI giúp doanh nghiệp tăng tốc chuyển đổi số.",
        heading: "Bước tiến về AI",
      },
      en: {
        title: "VNG launches a new AI platform",
        excerpt: "An AI platform to accelerate enterprise digital transformation.",
        heading: "A step forward in AI",
      },
    },
    {
      slug: "van-hoa-vng",
      category: "tin-cong-ty",
      tags: ["van-hoa"],
      author: newsroom.documentId,
      featured: false,
      vi: {
        title: "Văn hóa làm việc tại VNG",
        excerpt: "Điều gì làm nên môi trường làm việc tại VNG.",
        heading: "Con người là trung tâm",
      },
      en: {
        title: "Working culture at VNG",
        excerpt: "What makes the working environment at VNG.",
        heading: "People at the center",
      },
    },
    {
      slug: "vng-tuyen-dung-2026",
      category: "tuyen-dung",
      tags: ["cloud", "ai"],
      author: newsroom.documentId,
      featured: true,
      vi: {
        title: "VNG tuyển dụng kỹ sư 2026",
        excerpt: "Cơ hội gia nhập đội ngũ kỹ sư của VNG.",
        heading: "Gia nhập VNG",
      },
      en: {
        title: "VNG is hiring engineers in 2026",
        excerpt: "Join the engineering team at VNG.",
        heading: "Join VNG",
      },
    },
  ];

  for (const a of articleDefs) {
    const doc = await docs(strapi, "api::article.article").create({
      data: {
        title: a.vi.title,
        slug: a.slug,
        excerpt: a.vi.excerpt,
        featured: a.featured,
        body: richText([a.vi.excerpt, "Nội dung chi tiết sẽ được cập nhật."], a.vi.heading),
        category: categories[a.category],
        tags: a.tags.map((s) => tags[s]),
        author: a.author,
        seo: {
          metaTitle: a.vi.title,
          metaDescription: a.vi.excerpt,
          keywords: a.tags.join(", "),
          noindex: false,
        },
      },
      locale: "vi",
    });
    await docs(strapi, "api::article.article").update({
      documentId: doc.documentId,
      locale: "en",
      data: {
        title: a.en.title,
        slug: a.slug,
        excerpt: a.en.excerpt,
        featured: a.featured,
        body: richText([a.en.excerpt, "Full content coming soon."], a.en.heading),
        category: categories[a.category],
        tags: a.tags.map((s) => tags[s]),
        author: a.author,
        seo: {
          metaTitle: a.en.title,
          metaDescription: a.en.excerpt,
          keywords: a.tags.join(", "),
          noindex: false,
        },
      },
    });
    await publish(strapi, "api::article.article", doc.documentId, "vi");
    await publish(strapi, "api::article.article", doc.documentId, "en");
  }

  // --- Landing page (block-composed, vi + en, published) -------------------
  const landingBlocksVi = [
    {
      __component: "blocks.hero",
      heading: "VNG — Kiến tạo công nghệ vì cuộc sống tốt đẹp hơn",
      subheading: "Nền tảng công nghệ hàng đầu Việt Nam.",
      eyebrow: "Về VNG",
      background: "gradient",
      alignment: "center",
      actions: [{ label: "Xem tin tức mới nhất", href: "/tin-tuc", variant: "primary" }],
    },
    {
      __component: "blocks.stats",
      heading: "VNG trong những con số",
      stats: [
        { value: "3000+", label: "Nhân viên" },
        { value: "100M+", label: "Người dùng" },
        { value: "20+", label: "Năm phát triển" },
      ],
    },
    {
      __component: "blocks.feature-grid",
      heading: "Lĩnh vực hoạt động",
      columns: 3,
      features: [
        { title: "Trò chơi", description: "Phát hành và phát triển game." },
        { title: "Nền tảng số", description: "Zalo và hệ sinh thái." },
        { title: "Điện toán đám mây", description: "Hạ tầng cloud cho doanh nghiệp." },
      ],
    },
    { __component: "blocks.article-carousel", heading: "Tin mới nhất", autoPull: true, limit: 6 },
    {
      __component: "blocks.cta",
      heading: "Gia nhập VNG",
      description: "Cùng chúng tôi kiến tạo tương lai số.",
      background: "dark",
      actions: [{ label: "Xem vị trí tuyển dụng", href: "/tuyen-dung", variant: "primary" }],
    },
  ];
  const landingBlocksEn = [
    {
      __component: "blocks.hero",
      heading: "VNG — Building technology for a better life",
      subheading: "Vietnam's leading technology platform.",
      eyebrow: "About VNG",
      background: "gradient",
      alignment: "center",
      actions: [{ label: "See the latest news", href: "/news", variant: "primary" }],
    },
    {
      __component: "blocks.stats",
      heading: "VNG by the numbers",
      stats: [
        { value: "3000+", label: "Employees" },
        { value: "100M+", label: "Users" },
        { value: "20+", label: "Years" },
      ],
    },
    {
      __component: "blocks.feature-grid",
      heading: "What we do",
      columns: 3,
      features: [
        { title: "Games", description: "Game publishing and development." },
        { title: "Digital platforms", description: "Zalo and its ecosystem." },
        { title: "Cloud", description: "Cloud infrastructure for enterprises." },
      ],
    },
    { __component: "blocks.article-carousel", heading: "Latest news", autoPull: true, limit: 6 },
    {
      __component: "blocks.cta",
      heading: "Join VNG",
      description: "Build the digital future with us.",
      background: "dark",
      actions: [{ label: "See open roles", href: "/careers", variant: "primary" }],
    },
  ];

  const landing = await docs(strapi, "api::landing-page.landing-page").create({
    data: {
      title: "Trang chủ",
      slug: "home",
      blocks: landingBlocksVi,
      seo: {
        metaTitle: "VNG — Trang chủ",
        metaDescription: "Nền tảng công nghệ hàng đầu Việt Nam.",
        noindex: false,
      },
    },
    locale: "vi",
  });
  await docs(strapi, "api::landing-page.landing-page").update({
    documentId: landing.documentId,
    locale: "en",
    data: {
      title: "Home",
      slug: "home",
      blocks: landingBlocksEn,
      seo: {
        metaTitle: "VNG — Home",
        metaDescription: "Vietnam's leading technology platform.",
        noindex: false,
      },
    },
  });
  await publish(strapi, "api::landing-page.landing-page", landing.documentId, "vi");
  await publish(strapi, "api::landing-page.landing-page", landing.documentId, "en");

  // --- About page (static shell, vi + en, published) ------------------------
  // Exercises the block types `home`'s landing pages don't (§P5 design-system
  // restyle needs real content to render against): leadership-grid, timeline,
  // logo-cloud, testimonial, faq, embed, contact-form. `image-gallery` is
  // skipped — its `elements.gallery-image.image` field is a required media
  // relation, and seeding a real uploaded asset is out of scope here.
  const aboutBlocksVi = [
    {
      __component: "blocks.hero",
      heading: "Về VNG",
      subheading: "Kiến tạo công nghệ vì cuộc sống tốt đẹp hơn.",
      eyebrow: "Giới thiệu",
      background: "default",
      alignment: "left",
      actions: [{ label: "Xem vị trí tuyển dụng", href: "/tuyen-dung", variant: "outline" }],
    },
    {
      __component: "blocks.leadership-grid",
      heading: "Đội ngũ lãnh đạo",
      leaders: [
        {
          name: "Nguyễn Văn A",
          role: "Chủ tịch kiêm Tổng giám đốc",
          bio: "Dẫn dắt chiến lược phát triển công nghệ của VNG.",
        },
        {
          name: "Trần Thị B",
          role: "Giám đốc Công nghệ",
          bio: "Phụ trách định hướng kỹ thuật và nền tảng đám mây.",
        },
        {
          name: "Phạm Văn C",
          role: "Giám đốc Nhân sự",
          bio: "Xây dựng văn hoá và phát triển đội ngũ.",
        },
      ],
    },
    {
      __component: "blocks.timeline",
      heading: "Hành trình phát triển",
      events: [
        {
          date: "2004",
          title: "Thành lập",
          description: "VNG được thành lập, khởi đầu với dịch vụ trò chơi trực tuyến.",
        },
        { date: "2012", title: "Ra mắt Zalo", description: "Nền tảng nhắn tin Zalo ra mắt." },
        {
          date: "2023",
          title: "Mở rộng điện toán đám mây",
          description: "Đầu tư mạnh vào hạ tầng cloud cho doanh nghiệp.",
        },
      ],
    },
    {
      __component: "blocks.logo-cloud",
      heading: "Nền tảng & thương hiệu",
      logos: [
        { name: "Zalo", url: "https://zalo.me" },
        { name: "ZaloPay", url: "https://zalopay.vn" },
        { name: "Zing MP3", url: "https://zingmp3.vn" },
      ],
    },
    {
      __component: "blocks.testimonial",
      heading: "Khách hàng nói gì về chúng tôi",
      items: [
        {
          quote: "Nền tảng cloud của VNG giúp chúng tôi mở rộng nhanh chóng.",
          authorName: "Nguyễn Thị D",
          authorRole: "CTO",
          company: "Công ty ABC",
        },
        {
          quote: "Đội ngũ hỗ trợ chuyên nghiệp và tận tâm.",
          authorName: "Lê Văn E",
          authorRole: "Giám đốc vận hành",
          company: "Công ty XYZ",
        },
      ],
    },
    {
      __component: "blocks.faq",
      heading: "Câu hỏi thường gặp",
      items: [
        {
          question: "VNG hoạt động trong lĩnh vực nào?",
          answer: "VNG hoạt động trong game, nền tảng số (Zalo) và điện toán đám mây.",
        },
        {
          question: "Làm sao để ứng tuyển vào VNG?",
          answer: "Xem các vị trí đang tuyển tại trang Tuyển dụng.",
        },
      ],
    },
    {
      __component: "blocks.embed",
      title: "Trụ sở VNG",
      url: "https://www.google.com/maps?q=VNG+Corporation,+Ho+Chi+Minh+City&output=embed",
      aspectRatio: "16:9",
    },
    {
      __component: "blocks.contact-form",
      heading: "Liên hệ với chúng tôi",
      description: "Gửi câu hỏi hoặc góp ý cho đội ngũ VNG.",
      submitLabel: "Gửi",
      successMessage: "Cảm ơn bạn đã liên hệ!",
      fields: [
        { name: "fullName", label: "Họ và tên", type: "text", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        {
          name: "topic",
          label: "Chủ đề",
          type: "select",
          required: false,
          options: "Hợp tác, Tuyển dụng, Khác",
        },
        { name: "message", label: "Nội dung", type: "textarea", required: true },
        {
          name: "subscribe",
          label: "Đăng ký nhận bản tin",
          type: "checkbox",
          required: false,
        },
      ],
    },
  ];
  const aboutBlocksEn = [
    {
      __component: "blocks.hero",
      heading: "About VNG",
      subheading: "Building technology for a better life.",
      eyebrow: "Overview",
      background: "default",
      alignment: "left",
      actions: [{ label: "See open roles", href: "/careers", variant: "outline" }],
    },
    {
      __component: "blocks.leadership-grid",
      heading: "Leadership team",
      leaders: [
        {
          name: "Nguyen Van A",
          role: "Chairman & CEO",
          bio: "Leads VNG's technology growth strategy.",
        },
        {
          name: "Tran Thi B",
          role: "Chief Technology Officer",
          bio: "Oversees engineering direction and the cloud platform.",
        },
        { name: "Pham Van C", role: "Head of People", bio: "Builds culture and grows the team." },
      ],
    },
    {
      __component: "blocks.timeline",
      heading: "Our journey",
      events: [
        {
          date: "2004",
          title: "Founded",
          description: "VNG was founded, starting with online game services.",
        },
        {
          date: "2012",
          title: "Zalo launches",
          description: "The Zalo messaging platform officially launches.",
        },
        {
          date: "2023",
          title: "Cloud expansion",
          description: "Heavy investment in enterprise cloud infrastructure.",
        },
      ],
    },
    {
      __component: "blocks.logo-cloud",
      heading: "Platforms & brands",
      logos: [
        { name: "Zalo", url: "https://zalo.me" },
        { name: "ZaloPay", url: "https://zalopay.vn" },
        { name: "Zing MP3", url: "https://zingmp3.vn" },
      ],
    },
    {
      __component: "blocks.testimonial",
      heading: "What our customers say",
      items: [
        {
          quote: "VNG's cloud platform helped us scale quickly.",
          authorName: "Nguyen Thi D",
          authorRole: "CTO",
          company: "ABC Company",
        },
        {
          quote: "A professional and dedicated support team.",
          authorName: "Le Van E",
          authorRole: "Operations Director",
          company: "XYZ Company",
        },
      ],
    },
    {
      __component: "blocks.faq",
      heading: "Frequently asked questions",
      items: [
        {
          question: "What does VNG do?",
          answer: "VNG operates in gaming, digital platforms (Zalo), and cloud computing.",
        },
        {
          question: "How do I apply to VNG?",
          answer: "Check open roles on the Careers page.",
        },
      ],
    },
    {
      __component: "blocks.embed",
      title: "VNG headquarters",
      url: "https://www.google.com/maps?q=VNG+Corporation,+Ho+Chi+Minh+City&output=embed",
      aspectRatio: "16:9",
    },
    {
      __component: "blocks.contact-form",
      heading: "Contact us",
      description: "Send a question or feedback to the VNG team.",
      submitLabel: "Send",
      successMessage: "Thanks for reaching out!",
      fields: [
        { name: "fullName", label: "Full name", type: "text", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        {
          name: "topic",
          label: "Topic",
          type: "select",
          required: false,
          options: "Partnership, Careers, Other",
        },
        { name: "message", label: "Message", type: "textarea", required: true },
        {
          name: "subscribe",
          label: "Subscribe to newsletter",
          type: "checkbox",
          required: false,
        },
      ],
    },
  ];

  const aboutPage = await docs(strapi, "api::page.page").create({
    data: {
      title: "Về VNG",
      slug: "about",
      blocks: aboutBlocksVi,
      seo: {
        metaTitle: "Về VNG",
        metaDescription: "Tìm hiểu về đội ngũ, hành trình và đối tác của VNG.",
        noindex: false,
      },
    },
    locale: "vi",
  });
  await docs(strapi, "api::page.page").update({
    documentId: aboutPage.documentId,
    locale: "en",
    data: {
      title: "About VNG",
      slug: "about",
      blocks: aboutBlocksEn,
      seo: {
        metaTitle: "About VNG",
        metaDescription: "Learn about VNG's team, history, and partners.",
        noindex: false,
      },
    },
  });
  await publish(strapi, "api::page.page", aboutPage.documentId, "vi");
  await publish(strapi, "api::page.page", aboutPage.documentId, "en");

  // --- Navigation (header + footer; slug shared across locales) ------------
  const navDefs = [
    {
      slug: "main-header",
      vi: {
        title: "Menu chính",
        items: [
          { label: "Trang chủ", url: "/" },
          { label: "Tin tức", url: "/tin-tuc" },
          {
            label: "Về VNG",
            url: "/ve-vng",
            children: [
              { label: "Giới thiệu", url: "/ve-vng/gioi-thieu" },
              { label: "Lãnh đạo", url: "/ve-vng/lanh-dao" },
            ],
          },
          { label: "Tuyển dụng", url: "/tuyen-dung" },
        ],
      },
      en: {
        title: "Main menu",
        items: [
          { label: "Home", url: "/" },
          { label: "News", url: "/news" },
          {
            label: "About VNG",
            url: "/about",
            children: [
              { label: "Overview", url: "/about/overview" },
              { label: "Leadership", url: "/about/leadership" },
            ],
          },
          { label: "Careers", url: "/careers" },
        ],
      },
    },
    {
      slug: "main-footer",
      vi: {
        title: "Chân trang",
        items: [
          { label: "Điều khoản", url: "/dieu-khoan" },
          { label: "Bảo mật", url: "/bao-mat" },
          { label: "Liên hệ", url: "/lien-he" },
        ],
      },
      en: {
        title: "Footer",
        items: [
          { label: "Terms", url: "/terms" },
          { label: "Privacy", url: "/privacy" },
          { label: "Contact", url: "/contact" },
        ],
      },
    },
  ];
  for (const n of navDefs) {
    const doc = await docs(strapi, "api::navigation.navigation").create({
      data: { title: n.vi.title, slug: n.slug, items: n.vi.items },
      locale: "vi",
    });
    await docs(strapi, "api::navigation.navigation").update({
      documentId: doc.documentId,
      locale: "en",
      data: { title: n.en.title, slug: n.slug, items: n.en.items },
    });
    await publish(strapi, "api::navigation.navigation", doc.documentId, "vi");
    await publish(strapi, "api::navigation.navigation", doc.documentId, "en");
  }

  // --- Global (single type, vi + en) ---------------------------------------
  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "VNG Corporation",
    url: "https://vng.com.vn",
  };
  await docs(strapi, "api::global.global").create({
    data: {
      siteName: "VNG",
      siteDescription: "Nền tảng công nghệ hàng đầu Việt Nam.",
      defaultSeo: {
        metaTitle: "VNG Corporation",
        metaDescription: "Nền tảng công nghệ hàng đầu Việt Nam.",
        noindex: false,
      },
      socialLinks: [
        { label: "Facebook", href: "https://facebook.com/VNGCorp", variant: "link" },
        { label: "LinkedIn", href: "https://linkedin.com/company/vng", variant: "link" },
      ],
      organizationSchema: orgSchema,
    },
    locale: "vi",
  });
  const globalDoc = await docs(strapi, "api::global.global").findFirst({ locale: "vi" });
  if (globalDoc) {
    await docs(strapi, "api::global.global").update({
      documentId: globalDoc.documentId,
      locale: "en",
      data: {
        siteName: "VNG",
        siteDescription: "Vietnam's leading technology platform.",
        defaultSeo: {
          metaTitle: "VNG Corporation",
          metaDescription: "Vietnam's leading technology platform.",
          noindex: false,
        },
        organizationSchema: orgSchema,
      },
    });
  }

  strapi.log.info("[seed] demo content seeded ✓");
}
