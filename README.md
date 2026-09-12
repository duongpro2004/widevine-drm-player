# Widevine DRM Player & Client CRUD Studio

Ứng dụng web hoàn chỉnh tích hợp trình phát **Google Shaka Player** hỗ trợ giải mã **Widevine DRM (com.widevine.alpha)**, **ClearKey**, và luồng không mã hóa (Clear DASH), đi kèm hệ thống **CRUD** đầy đủ từ client và **Cửa sổ Debug License Headers** thời gian thực.

---

## 🌟 Các tính năng nổi bật

1. **Trình phát Widevine DRM (Google Shaka Player)**:
   - Tự động nhận diện Widevine CDM trên trình duyệt (`navigator.requestMediaKeySystemAccess`).
   - Tích hợp sẵn luồng Widevine DRM chuẩn của Google (`Angel One`).
   - Hiển thị thông số kỹ thuật thời gian thực: Độ phân giải, Video Bandwidth, Trạng thái Key DRM (`usable`), thời gian buffer.
   - Hỗ trợ đổi độ phân giải, kênh âm thanh, phụ đề tiếng Anh/Việt.

2. **Cửa sổ Debug License Server & Client Headers**:
   - Tích hợp sẵn License Server cục bộ tại `/api/drm/license`.
   - **Bắt và soi toàn bộ HTTP Request Headers** mà client gửi lên khi xin cấp license (ví dụ: `Authorization: Bearer ...`, `X-Client-Version`, `X-User-ID`, `User-Agent`, v.v.).
   - Hiển thị kích thước payload, hex preview và trạng thái phản hồi.
   - Tự động cập nhật trực quan trên giao diện client mỗi 2 giây.

3. **Hệ thống CRUD Quản lý Video từ Client**:
   - **Create (Thêm)**: Thêm luồng video mới với đầy đủ thông số: Tiêu đề, Stream URL (MPD), Loại DRM (Widevine / ClearKey / None), License Server URL, Custom Headers (JSON). Có nút nạp mẫu nhanh.
   - **Read (Xem & Phát)**: Danh sách video trực quan có lọc theo DRM và tìm kiếm theo từ khóa. Bấm **Phát** để lập tức đưa vào player giải mã.
   - **Update (Sửa)**: Chỉnh sửa bất kỳ thông số nào của video (URL, headers, license server).
   - **Delete (Xóa)**: Xóa video khỏi danh sách lưu trữ JSON.
   - **Reset**: Nút khôi phục dữ liệu mẫu ban đầu chỉ với 1 click.

---

## 🚀 Hướng dẫn khởi chạy

### 1. Cài đặt dependencies (nếu chưa cài):
```bash
npm install
```

### 2. Khởi động server:
```bash
npm start
```
Server sẽ chạy tại: **`http://localhost:3000`**

---

## 🔍 Hướng dẫn Test DRM & Debug Headers từ Client

1. Mở trình duyệt (Chrome / Edge / Firefox) tại địa chỉ: **`http://localhost:3000`**.
2. Quan sát biểu tượng **Widevine CDM: Sẵn sàng (L3)** ở góc trên bên phải.
3. Bấm vào video đầu tiên: **Angel One (Widevine - Qua Local Debug License Server)**.
4. Mở tab **"Cửa sổ Debug License Headers"** bên dưới video:
   - Bạn sẽ thấy ngay request xin license từ client với các header như:
     - `authorization: Bearer sample-jwt-widevine-token-xyz123`
     - `x-client-version: 2.4.0`
     - `x-user-id: tester_99`
     - và các header chuẩn của trình duyệt.
5. Để test CRUD:
   - Bấm nút **"Thêm Video"** ở cột bên phải.
   - Nhập tiêu đề, URL MPD và thử thay đổi giá trị trong ô **Custom Request Headers** (ví dụ: `"Authorization": "Bearer my_own_token"`).
   - Bấm **Lưu Video**.
   - Bấm **Phát** video vừa tạo để kiểm tra client gửi đúng header bạn vừa đặt lên server!
