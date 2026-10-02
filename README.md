# 🧪 Material Control System (QA & SMT Lab) - Live Demo for Portfolio

> **Hệ thống Quản lý Nguyên Vật Liệu (NVL), Băng dính ACF/Keo kỹ thuật, Đơn mua hàng (PO) và Kế hoạch Chi phí Thiết bị** dành cho phòng kiểm tra chất lượng (QA/QC Lab) & xưởng sản xuất điện tử SMT.
> Thiết kế theo ngôn ngữ **Warm Minimalism** lấy cảm hứng từ Cursor UI (`#f2f1ed`, viền `oklab()`, typography chuẩn kỹ thuật).

---

## 🌟 Điểm nổi bật cho CV / Portfolio

1. **Kiến trúc Full-featured Standalone:**
   - Ứng dụng chạy hoàn toàn độc lập trên trình duyệt (client-side mock engine + LocalStorage), **sẵn sàng deploy 1-click lên Vercel** mà không cần cấu hình database hay server bên ngoài.
   - Dữ liệu demo phong phú, sát thực tế với các ngành công nghiệp công nghệ cao (băng dính dán vi mạch ACF, dung dịch cồn IPA 99.9%, khăn lau phòng sạch, dây thiếc hàn SAC305, wafer chuẩn, thiết bị đo Fluke, kính hiển vi Olympus...).

2. **Quy trình Quản lý Kho & Đơn Hàng (End-to-End Workflow):**
   - **NVL Chi Tiết:** Quản lý kho, ngưỡng cảnh báo (Alarm Level), hạn sử dụng, lọc theo cột nhiều điều kiện, xem biểu đồ lịch sử biến động tồn kho bằng **Recharts**, xuất Excel có định dạng màu sắc.
   - **ACF Tape - Flux - Solder (Multi-Batch):** Quản lý đặc thù theo mô hình đa lô hàng (`CURRENT` đang dùng, `NEXT` dự phòng, `HISTORY` đã hết/hết hạn), tự động đảo lô (auto-rotate), cảnh báo hết hạn trong 60 ngày.
   - **Theo dõi Purchase Orders (Follow PO):** Vòng đời đơn hàng từ *Draft (Nháp) &rarr; Ordering (Đang đặt) &rarr; Received (Đã nhận)*. Tự động tính ETA theo Leadtime; khi xác nhận nhận hàng sẽ **tự động tăng tồn kho NVL** hoặc đẩy vào lô Next của Keo. Xuất biểu mẫu *Request Purchasing* ra Excel.
   - **Kế hoạch Chi phí Thiết bị (Equipment Expense):** Bảng ma trận ngân sách theo 12 tháng (`m1 - m12`) và phân kỳ nhiều năm (năm trước, năm nay, năm sau), tự động tính tổng lũy kế.
   - **Tỷ Giá Ngoại Tệ (Live Exchange Rates):** Widget tỷ giá USD/JPY trên Topbar, tự động quy đổi giá trị sang USD/VND trong toàn hệ thống.
   - **Phân Quyền Động Đa Cấp (Granular RBAC):** Bật/tắt quyền theo từng slug (`nvl.view`, `nvl.create`, `po.buy`, `tape.delete`...) và cập nhật tức thì trên giao diện qua Socket Event bus mô phỏng.

---

## ⚡ Tài khoản Demo Đăng nhập nhanh (1-Click Login)

Trên trang Đăng nhập đã tích hợp sẵn 3 nút chọn nhanh:

| Tài khoản | Username | Password | Vai trò | Quyền hạn mô tả |
| :--- | :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `123456` | Quản trị viên | **Toàn quyền hệ thống**: Thêm, sửa, xóa, duyệt PO, cấu hình tỷ giá, phân quyền nhân viên. |
| **User Lab** | `user_lab` | `123456` | Kỹ thuật viên | Quyền xem, cập nhật số lượng tồn kho nhanh, tạo PO nháp, nhận hàng. |
| **Guest Viewer** | `guest` | `123456` | Khách xem | **Chỉ xem**: Không được thêm, sửa, xóa hay chỉnh sửa tồn kho (nút thao tác tự động ẩn/khóa). |

*Ghi chú: Nếu trong quá trình trải nghiệm bạn xóa hoặc sửa đổi nhiều dữ liệu, chỉ cần bấm nút **"Reset Data"** trên Topbar để khôi phục toàn bộ về trạng thái dữ liệu mẫu gốc.*

---

## 🚀 Hướng dẫn Deploy lên Vercel (Dành cho CV)

Dự án đã được cấu hình sẵn file [`vercel.json`](./vercel.json) để xử lý định tuyến SPA (React Router).

### Cách 1: Deploy qua Giao diện Web Vercel (Khuyên dùng)
1. Đẩy folder `demo` (hoặc push toàn bộ repo) lên GitHub của bạn.
2. Truy cập [vercel.com](https://vercel.com) và đăng nhập.
3. Bấm **"Add New..."** &rarr; **"Project"** &rarr; Chọn Repository GitHub vừa tạo.
4. Ở phần **Root Directory**, bấm *Edit* và chọn thư mục `demo` (nếu repo chứa cả project).
5. Framework Preset sẽ tự động nhận diện là **Vite**.
6. Bấm **"Deploy"**. Trong khoảng 1 phút, Vercel sẽ cấp cho bạn một domain trực tiếp (ví dụ: `https://material-control-demo.vercel.app`) để đính kèm vào CV!

### Cách 2: Deploy qua Vercel CLI (Dòng lệnh)
```bash
# Cài đặt vercel CLI nếu chưa có
npm install -g vercel

# Di chuyển vào folder demo và deploy
cd demo
vercel
```

---

## 💻 Chạy thử nghiệm ở Local (Development)

```bash
# 1. Di chuyển vào thư mục demo
cd demo

# 2. Cài đặt các gói phụ thuộc (nếu chưa cài)
npm install

# 3. Khởi động môi trường dev
npm run dev
```
Trình duyệt sẽ mở tại `http://localhost:3000`.

---

## 🛠️ Công nghệ Sử dụng (Tech Stack)

* **Frontend:** React 19, Vite, React Router DOM v7
* **Biểu đồ & Hiển thị:** Recharts (Area/Line Chart), Lucide React
* **Xử lý Báo cáo & Excel:** SheetJS (`xlsx`), `xlsx-js-style`
* **Styling & Theme:** Vanilla CSS, CSS Custom Properties, Oklab color space, Hỗ trợ Light / Dark Mode
* **Client Mock Engine:** Custom in-browser API & Event Interceptor với LocalStorage Persistence.
