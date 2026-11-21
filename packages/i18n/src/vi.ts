// Core Vietnamese strings. Keep keys identical to en.ts (checked by i18n.test.ts and CI).
export default {
  app: {
    tagline: 'Đặt lịch học cầu lông',
  },
  nav: {
    home: 'Trang chủ',
    sessions: 'Buổi học',
    bookings: 'Lịch đã đặt',
    profile: 'Hồ sơ',
    inbox: 'Hộp thư',
    admin: 'Quản trị',
  },
  auth: {
    continueWithGoogle: 'Tiếp tục với Google',
    signOut: 'Đăng xuất',
    mockTitle: 'Đăng nhập cục bộ (chỉ dành cho phát triển)',
  },
  sessions: {
    spotsLeft: '{count, plural, =0 {Đã đầy} other {Còn # chỗ}}',
    book: 'Đặt chỗ',
    joinWaitlist: 'Vào danh sách chờ',
    cancel: 'Hủy đặt chỗ',
    waitlistPosition: 'Bạn đang ở vị trí số {position} trong danh sách chờ',
  },
  payments: {
    unpaid: 'Chưa thanh toán',
    partPaid: 'Đã thanh toán một phần',
    paid: 'Đã thanh toán',
    overdue: 'Quá hạn',
    markPaid: 'Đánh dấu đã thanh toán',
    payByPayId: 'Thanh toán qua PayID {payId} với mã tham chiếu {reference}',
  },
  notifications: {
    enablePush: 'Bật nhắc lịch',
    iosInstall: 'Trên iPhone, nhấn Chia sẻ rồi Thêm vào Màn hình chính để nhận nhắc lịch',
    empty: 'Chưa có tin nhắn',
  },
  settings: {
    language: 'Ngôn ngữ',
    appearance: 'Giao diện',
    theme: 'Chủ đề',
    appName: 'Tên ứng dụng',
    contrastError: 'Màu này khó đọc. Hãy chọn màu đậm hơn hoặc nhạt hơn.',
  },
};
