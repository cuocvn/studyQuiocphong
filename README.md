# QP-Quiz - Nền Tảng Ôn Thi Giáo Dục Quốc Phòng & An Ninh

Nền tảng web hiện đại, trực quan giúp học tập, ôn luyện và ghi nhớ ngân hàng câu hỏi trắc nghiệm môn Giáo dục Quốc phòng và An ninh một cách nhanh chóng và khoa học thông qua hệ thống Spaced Repetition (lặp lại ngắt quãng) và các chế độ thi thử thông minh.

Ứng dụng chạy hoàn toàn phía client (trong trình duyệt), không cần máy chủ phụ trợ và không phụ thuộc vào Python. Dự án tương thích hoàn toàn để triển khai trên GitHub Pages.

## 🚀 Các Tính Năng Vượt Trội

1. **Nhập dữ liệu tự động từ PDF**:
   - Tích hợp công cụ phân tích tệp PDF bằng thư viện `pdf.js` trực tiếp trong trình duyệt.
   - Quét nội dung câu hỏi trắc nghiệm, nhận diện các bài học (Bài 1 - Bài 13), câu hỏi và đáp án từ tệp PDF tải lên.

2. **Chế độ Luyện Tập Tự Do**:
   - Trực quan hóa tiến trình bằng thanh tiến độ và thống kê độ chính xác thực tế.
   - **Xáo trộn đáp án động**: Tự động xáo trộn ngẫu nhiên vị trí các lựa chọn A, B, C, D khi tải câu hỏi để chống tình trạng học vẹt (trong tệp PDF gốc đáp án đúng luôn là a).
   - Phản hồi tức thì: Chọn đúng tự động chuyển câu sau 1.2 giây; chọn sai hiển thị thông báo lỗi và yêu cầu suy nghĩ lại.

3. **Chế độ Ghi Nhớ Nhanh (Memorization Mode)**:
   - Dựa trên phương pháp học thông minh Leitner.
   - Ẩn đáp án và cho phép người dùng tự ôn luyện trước khi bấm "Hiện câu trả lời".
   - Phân loại câu hỏi thành "Đã thuộc" và "Chưa thuộc" để tối ưu hóa tần suất lặp lại.

4. **Thi Thử Mô Phỏng (Exam Simulation)**:
   - Cấu hình số lượng câu hỏi, thời gian làm bài (20 - 60 phút) và bài học cần kiểm tra.
   - Đồng hồ đếm ngược thời gian làm bài thời gian thực.
   - Không hiển thị đáp án đúng/sai ngay lập tức. Sau khi nộp bài sẽ chấm điểm và hiển thị toàn bộ phiếu câu hỏi có đáp án chi tiết và giải thích.

5. **Bản Đồ Nhiệt Kiến Thức (Knowledge Heatmap)**:
   - Trực quan hóa độ chính xác và tỷ lệ hoàn thành theo từng bài học bằng lưới màu.
   - Tự động thống kê Top 3 bài học thế mạnh và Top 3 bài học yếu cần bổ sung kiến thức.

6. **Phân Tích Độ Khó & Đo Lường Thời Gian**:
   - Ghi lại thời gian phản hồi (tính bằng mili-giây) cho mỗi câu hỏi.
   - Thống kê danh sách 10 câu hỏi khó nhất dựa trên tần suất trả lời sai và thời gian trả lời lâu nhất.

7. **Hệ Thống Lưu Trữ & Đồng Bộ Dữ Liệu**:
   - Lưu trữ tiến trình học, sao lưu, lịch sử ôn tập, dấu trang (bookmarks) vào `localStorage` của trình duyệt.
   - Xuất/Nhập tiến trình học tập dưới dạng tệp tin JSON.
   - Xuất dữ liệu câu hỏi sai ra định dạng CSV và Báo cáo tổng quan học tập ra định dạng PDF.

---

## 🛠️ Công Nghệ Sử Dụng

- **Ngôn ngữ cốt lõi**: HTML5, Vanilla CSS3, Javascript (ES6+).
- **Thiết kế**: Giao diện Glassmorphism cao cấp, hỗ trợ chế độ Tối (Dark Mode) và Sáng (Light Mode), tương thích hoàn toàn với thiết bị di động (Mobile Responsive).
- **Thư viện bên thứ ba (qua CDN)**:
  - [pdf.js](https://mozilla.github.io/pdf.js/) - Thư viện đọc tệp PDF phía client.
  - [Chart.js](https://www.chartjs.org/) - Vẽ biểu đồ thống kê học tập.
  - [jsPDF](https://github.com/parallax/jsPDF) - Xuất báo cáo tiến trình học tập ra định dạng PDF.
  - [FontAwesome](https://fontawesome.com/) - Bộ icon giao diện hiện đại.

---

## 💻 Cách Khởi Chạy Trên Máy Cục Bộ

Vì dự án chạy hoàn toàn trên trình duyệt bằng Vanilla JS, bạn không cần cài đặt máy chủ phức tạp. Có 2 cách khởi chạy:

### Cách 1: Chạy trực tiếp
Nhấp đúp chuột vào tệp `index.html` để mở trực tiếp trong trình duyệt web của bạn.

### Cách 2: Sử dụng Web Server cục bộ (Khuyên dùng)
Sử dụng một máy chủ web mini để tránh các vấn đề CORS cục bộ (nếu có):
```bash
# Sử dụng NodeJS (npx serve)
npx serve .

# Hoặc sử dụng extension Live Server trên VS Code
```

---

## 🌐 Hướng Dẫn Triển Khai Lên GitHub Pages

Sau khi mã nguồn được đẩy lên kho lưu trữ GitHub của bạn:
1. Truy cập vào **Settings** của kho lưu trữ trên GitHub.
2. Tìm đến tab **Pages** ở danh mục bên trái.
3. Ở mục **Build and deployment**, phần **Source**, chọn **Deploy from a branch**.
4. Chọn nhánh chính (`main` hoặc `master`) và thư mục gốc `/ (root)`. Bấm **Save**.
5. Đợi khoảng 1-2 phút, trang web của bạn sẽ được kích hoạt tại địa chỉ:
   `https://<username>.github.io/<repository-name>/`
