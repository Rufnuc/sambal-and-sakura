import type { Locale } from "./config";

// Curated, high-quality overrides keyed by the EXACT English source text.
// The auto-translation engine applies these FIRST (instant, no API call, always
// brand-correct) and only calls the translation provider for anything not here.
// Keep entries short/!exact — they must match the rendered English string.

type Overrides = Record<string, string>;

const zh: Overrides = {
  "Home": "首页",
  "Menu": "菜单",
  "Offers": "优惠",
  "Careers": "招聘",
  "Reviews": "评价",
  "Contact": "联系我们",
  "FAQ": "常见问题",
  "Book a Table": "预订餐桌",
  "Order Now": "立即点餐",
  "Order Online": "在线点餐",
  "Call": "致电",
  "Add": "加入",
  "Customise": "自选",
  "Checkout": "结账",
  "Place order": "下单",
  "Collection": "自取",
  "Delivery": "外送",
  "Cash only": "仅收现金",
  "Use my location": "使用我的位置",
  "Free": "免费",
  "Order": "点餐",
  "Book": "预订",
  "Apply": "使用",
  "Guest checkout · no account needed": "访客结账 · 无需注册",
};

const vi: Overrides = {
  "Home": "Trang chủ",
  "Menu": "Thực đơn",
  "Offers": "Ưu đãi",
  "Careers": "Tuyển dụng",
  "Reviews": "Đánh giá",
  "Contact": "Liên hệ",
  "FAQ": "Câu hỏi thường gặp",
  "Book a Table": "Đặt bàn",
  "Order Now": "Đặt món ngay",
  "Order Online": "Đặt món trực tuyến",
  "Call": "Gọi điện",
  "Add": "Thêm",
  "Customise": "Tùy chọn",
  "Checkout": "Thanh toán",
  "Place order": "Đặt hàng",
  "Collection": "Tự đến lấy",
  "Delivery": "Giao hàng",
  "Free": "Miễn phí",
  "Order": "Đặt món",
  "Book": "Đặt bàn",
  "Apply": "Áp dụng",
};

const ja: Overrides = {
  "Home": "ホーム",
  "Menu": "メニュー",
  "Offers": "特典",
  "Careers": "採用情報",
  "Reviews": "レビュー",
  "Contact": "お問い合わせ",
  "FAQ": "よくある質問",
  "Book a Table": "テーブルを予約",
  "Order Now": "今すぐ注文",
  "Order Online": "オンライン注文",
  "Call": "電話する",
  "Add": "追加",
  "Customise": "カスタマイズ",
  "Checkout": "お会計",
  "Place order": "注文する",
  "Collection": "店頭受取",
  "Delivery": "配達",
  "Free": "無料",
  "Order": "注文",
  "Book": "予約",
  "Apply": "適用",
};

export const CURATED: Record<Locale, Overrides> = { en: {}, zh, vi, ja };
