# 🧪 MatFlow — High-Tech Material & Purchase Order Management System

<p align="center">
  <img src="src/assets/hero.png" alt="MatFlow Banner" width="100%" style="max-height: 280px; object-fit: cover; border-radius: 12px; margin-bottom: 16px;" onerror="this.style.display='none'" />
</p>

<p align="center">
  <strong>Hệ thống số hóa quản lý nguyên vật liệu, kiểm soát hạn sử dụng đa lô keo kỹ thuật, theo dõi đơn hàng mua sắm (PO) và lập kế hoạch ngân sách thiết bị phòng Lab.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-8.0-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Recharts-3.8-22c55e?style=flat-square" alt="Recharts" />
  <img src="https://img.shields.io/badge/Design-Cursor_Warm_Minimalism-f54e00?style=flat-square" alt="Cursor Design" />
  <img src="https://img.shields.io/badge/Architecture-Local_First_%26_RBAC-26251e?style=flat-square" alt="Architecture" />
</p>

---

## 📌 Giới thiệu Dự án

Trong các nhà máy công nghệ cao và phòng thí nghiệm kiểm định chất lượng (QA/QC Lab & SMT Electronics), việc quản lý nguyên vật liệu phụ trợ (Sub-Materials) gặp nhiều thách thức đặc thù:
* Các loại keo dán dẫn điện **ACF Tape**, kem hàn **Solder Paste**, chất trợ hàn **Flux** có hạn sử dụng nghiêm ngặt và yêu cầu bảo quản nhiệt độ âm sâu (-10°C).
* Cần kiểm soát chi tiết theo **nhiều lô hàng (Multi-Batch)**: Lô đang mở dùng (`CURRENT`), Lô dự phòng trữ lạnh (`NEXT`), Lô đã hết hoặc quá hạn (`HISTORY`).
* Quy trình đặt mua hàng (Purchase Order - PO) cần tính toán chính xác thời gian nhận hàng dự kiến (**ETA**) dựa trên **Leadtime**, và cần tự động cập nhật tồn kho ngay khi nhận hàng.

**MatFlow** được xây dựng để giải quyết toàn diện bài toán trên với trải nghiệm giao diện **Warm Minimalism** hiện đại, mượt mà và trực quan.

---

## ⚡ Trải nghiệm Trực tiếp (Live Demo)

Ứng dụng được thiết kế theo kiến trúc **Local-First**, toàn bộ dữ liệu mẫu và các luồng nghiệp vụ chạy trực tiếp trên trình duyệt web mà không yêu cầu cài đặt máy chủ.

Ngay tại màn hình Đăng nhập, người dùng có thể lựa chọn nhanh 1 trong 3 vai trò trải nghiệm:

| Vai trò | Tài khoản | Mật khẩu | Quyền hạn & Trải nghiệm tương ứng |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `admin` | `123456` | **Toàn quyền hệ thống:** Thêm, sửa, xóa, duyệt PO, cấu hình tỷ giá ngoại tệ, phân quyền chi tiết cho nhân viên. |
| **Kỹ thuật viên (User Lab)** | `user_lab` | `123456` | **Thao tác vận hành kho:** Cập nhật số lượng tồn kho nhanh, tạo PO nháp, thực hiện nhận hàng vào kho. |
| **Khách xem (Guest Viewer)** | `guest` | `123456` | **Chế độ chỉ đọc (Read-only):** Xem danh mục vật tư, tiến độ PO và tỷ giá; các nút thêm/sửa/xóa tự động ẩn hoặc khóa. |

> 💡 **Khôi phục dữ liệu (Reset Data):** Nếu trong quá trình trải nghiệm bạn muốn đưa toàn bộ kho vật tư, đơn hàng và cài đặt về trạng thái mẫu ban đầu, chỉ cần bấm nút **"Reset Data"** trên thanh Topbar.

---

## 🔑 Các Tính năng Cốt lõi

### 1. Quản lý Nguyên Vật Liệu (NVL Detail & Inventory)
* Bảng danh mục vật tư hỗ trợ **kéo giãn độ rộng cột (Resizable Columns)** và **bộ lọc nâng cao theo từng cột (Column Filter)**.
* Hiển thị cảnh báo trực quan theo các mức tồn kho: **Nguy cấp (Red)**, **Cảnh báo (Orange)**, **Theo dõi (Yellow)** và **Hạn sử dụng**.
* Tích hợp **Biểu đồ biến động tồn kho (Stock History Chart)** sử dụng `Recharts`, trực quan hóa lịch sử xuất nhập theo Ngày, Tuần, Tháng, Năm.
* Xem chi tiết phóng to ảnh sản phẩm và ảnh phiếu báo giá (Zoom, Rotate, Pan).
* Hỗ trợ xuất dữ liệu ra file Excel có định dạng màu sắc (`xlsx-js-style`) và cấu hình ánh xạ ô khi nhập Excel (`Excel Mapping`).

### 2. Quản lý Đa Lô Hàng Băng Dính & Hóa Chất (ACF Tape - Flux - Solder)
* Quản lý chuyên biệt cho các vật tư nhạy cảm nhiệt: Băng dính ACF dán màn hình/FPC, chất trợ hàn Flux, thiếc hàn Solder.
* **Mô hình Vòng đời Đa lô (Multi-Batch Lifecycle):**
  * `CURRENT`: Lô đang xuất dùng tại chuyền sản xuất.
  * `NEXT`: Lô lưu trữ trong tủ lạnh chuyên dụng.
  * `HISTORY`: Lô đã sử dụng hết hoặc quá hạn.
* **Cơ chế tự động đảo lô (Auto-Rotation):** Tự động chuyển đổi trạng thái lô hàng khi lô hiện tại hết tồn kho hoặc quá hạn dùng.
* Cảnh báo trước ngày hết hạn **60 ngày** và lưu trữ tài liệu kỹ thuật TDS (Technical Data Sheet).

### 3. Quy trình Theo dõi Đơn Mua Hàng (Follow PO & Smart Receiving)
* Theo dõi tiến độ đơn hàng qua 3 giai đoạn chuẩn: `Draft (Nháp)` &rarr; `Ordering (Đang đặt)` &rarr; `Received (Đã nhận hàng)`.
* **Tự động tính ETA:** Hệ thống tự động tính ngày giao hàng dự kiến dựa trên ngày đặt hàng và **Leadtime** của từng nhà cung cấp.
* **Tự động tăng tồn kho khi nhận hàng:** Khi chuyển đơn sang trạng thái `Received`, hệ thống tự động cộng dồn số lượng vào tồn kho NVL hoặc tự động khởi tạo/bổ sung vào lô `NEXT` của Keo.
* Tạo nhanh đơn hàng nháp từ danh sách vật tư đã chọn với 1 cú click.
* Xuất file báo cáo **Request Purchasing** chuẩn theo mẫu Excel.

### 4. Ma trận Kế hoạch Ngân sách Thiết bị (Equipment Expense Matrix)
* Lập kế hoạch chi phí và dự toán ngân sách mua sắm trang thiết bị phòng Lab theo **12 tháng (`m1 - m12`)** và phân kỳ nhiều năm (`Năm trước`, `Năm nay`, `Năm sau`).
* Tự động gom nhóm thiết bị theo chủng loại (*Measuring Tool, IT, Fixture, Calibration...*), tính tổng chi phí tự động theo tháng và năm.
* Hỗ trợ chỉnh sửa nhanh trực tiếp trên bảng và lưu hàng loạt (`Bulk-save`).

### 5. Quản lý Nhà Cung Cấp & Tỷ Giá Ngoại Tệ
* **Nhà cung cấp (Vendors):** Quản lý nhà cung cấp gom nhóm theo từng khu vực sản xuất (`nvl_category`), có cơ chế ràng buộc bảo vệ toàn vẹn dữ liệu.
* **Tỷ giá ngoại tệ (Exchange Rates):** Widget tỷ giá USD/JPY trên thanh Topbar cho phép xem và cập nhật tức thì; tự động quy đổi giá trị tương đương sang USD trong toàn bộ đơn hàng PO.

### 6. Phân Quyền Người Dùng Động (Granular RBAC)
* Phân quyền chi tiết theo từng hành động cụ thể thông qua Permission Slug:
  * `nvl.view`, `nvl.create`, `nvl.edit`, `nvl.delete`, `nvl.stock`, `nvl.import`
  * `po.view`, `po.edit`, `po.delete`, `po.receive`, `po.buy`, `po.vendor`, `po.delete_history`
  * `tape.view`, `tape.create`, `tape.edit`, `tape.delete`, `tape.history`
  * `expense.view`, `expense.edit`
  * `rate.view`, `rate.edit`, `rate.delete`
* Giao diện bật/tắt quyền theo dạng Toggle trực quan trong bảng điều khiển Quản trị viên, áp dụng tức thì mà không cần đăng nhập lại.

---

## 🎨 Ngôn ngữ Thiết kế (Design Language)

Hệ thống được thiết kế theo triết lý **Warm Minimalism** lấy cảm hứng từ Cursor UI:
* **Màu sắc chủ đạo:** Nền kem ấm (`#f2f1ed`), bề mặt thẻ phụ (`#e6e5e0`), chữ nâu trầm (`#26251e`) và màu nhấn cam thương hiệu (`#f54e00`).
* **Đường viền Perceptual:** Sử dụng không gian màu `oklab()` cho các đường viền mờ tự nhiên, tạo cảm giác mượt mà và tinh gọn.
* **Chế độ Giao diện:** Hỗ trợ đầy đủ cả hai chế độ **Giao diện Sáng (Light Mode)** và **Giao diện Tối (Dark Mode)**, có thể chuyển đổi nhanh tại menu người dùng.

---

## 💻 Hướng dẫn Cài đặt & Chạy cục bộ

Dành cho các lập trình viên hoặc nhà tuyển dụng muốn clone mã nguồn và chạy thử trên máy tính cá nhân:

```bash
# 1. Di chuyển vào thư mục dự án demo
cd demo

# 2. Cài đặt các thư viện phụ thuộc
npm install

# 3. Khởi động môi trường phát triển cục bộ
npm run dev
```

Sau khi chạy lệnh trên, ứng dụng sẽ hoạt động tại địa chỉ: `http://localhost:3000`.

---

## 🛠️ Công nghệ Sử dụng (Tech Stack)

| Lớp (Layer) | Công nghệ |
| :--- | :--- |
| **Core Framework** | React 19, Vite 8 |
| **Routing** | React Router DOM v7 |
| **Data Visualization** | Recharts 3.8 |
| **Icons & UI Elements** | Lucide React |
| **Spreadsheet Engine** | SheetJS (`xlsx`), `xlsx-js-style` |
| **Date & Time** | `date-fns` |
| **State & Persistence** | React Context API, Local-First Mock Engine, LocalStorage |
| **Styling** | Vanilla CSS, CSS Custom Properties, Oklab Color Space |

---

<p align="center">
  Phát triển với sự tỉ mỉ về trải nghiệm người dùng và tiêu chuẩn quản lý sản xuất công nghệ cao.
</p>
