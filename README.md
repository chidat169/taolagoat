# Paris Metro Map

## Giới thiệu
Đây là một dự án đầy tâm huyết của tác giả giúp giải quyết vấn đề tìm đường đi trong mạng lưới metro dày đặc của Paris (hơn 300 ga), phục vụ cho bà con nhân dân có trải nghiệm đi học và đi làm thuận tiện nhất.

---

## Tech Stack
* **Frontend:** HTML, JavaScript, Tailwind CSS, Leaflet.js
* **Backend:** FastAPI, Motor
* **Database:** MongoDB 

---

## Hướng dẫn sử dụng

### Cài đặt Database
* Cài đặt **MongoDB** và tạo database của bạn.

### Cấu hình biến môi trường
- Tìm file `.env.example` trong thư mục **backend**.
- Đổi tên thành `.env`.
- Chỉnh sửa các biến môi trường bên trong cho phù hợp với cấu hình MongoDB của bạn.
> **Lưu ý:** Nếu bạn không thiết lập `MONGO_USER` và `MONGO_PASSWORD` cho database local, hãy comment hai dòng đó lại.

### Thiết lập Backend
Mở folder **backend**, thực hiện các bước sau trong Terminal:

```bash
# Khởi tạo môi trường ảo
python -m venv .venv

# Kích hoạt môi trường ảo
# Trên Windows:
.venv\Scripts\activate
# Trên Linux/macOS:
source .venv/bin/activate

# Cài đặt các thư viện cần thiết
pip install -r requirements.txt

# Khởi chạy server development
fastapi dev app/main.py
```

---

### Test API và sử dụng

* **API:** Sau khi chạy backend thành công, bạn có thể truy cập tài liệu API tự động tại:  
    [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

* **Frontend:**
    - Mở folder **frontend** trong cửa sổ mới bằng VSCode (không tắt cửa sổ **backend**).
    - Click chuột phải vào file `index.html` và chọn **Open with Live Server** (Yêu cầu đã cài đặt Extension *Live Server*).
    - Truy cập bản đồ tại:  
    [http://localhost:5500](http://localhost:5500)
       
---

## Thuật toán

Điểm đặc biệt của thuật toán nằm ở tham số **Penalty**.
Trong khi thuật toán $A^*$ truyền thống chỉ tập trung vào việc cực tiểu hóa hàm chi phí $f(n)$ dựa trên khoảng cách:

$$f(n) = g(n) + h(n)$$

Thuật toán này áp dụng thêm hệ số **Penalty** cộng trực tiếp vào $g(n)$ cho mỗi lần chuyển tuyến.
* **Với Penalty = 0:** Thuật toán hoạt động như $A^*$ thuần túy, tìm đường ngắn nhất tuyệt đối về mặt địa lý.
* **Với Penalty > 0 (ví dụ: 2000m):** Thuật toán sẽ tính toán để giảm số lần đổi tàu xuống. Hệ thống sẽ chỉ yêu cầu bạn chuyển tuyến nếu việc việc tiết kiệm quãng đường từ tuyến mới lớn hơn **Penalty** phát sinh do việc đổi tàu đó. Điều này giống như bạn đang nói với máy tính rằng: "Tôi chọn ngồi yên trên tàu và đi xa thêm *1.99km* còn hơn là phải đứng dậy chuyển tuyến 1 lần"

---

## Demo
<img width="1920" height="1080" alt="default" src="https://github.com/user-attachments/assets/7aedadff-0ec1-4cba-ba77-2dea082ae7fd" />
<img width="1920" height="1080" alt="find" src="https://github.com/user-attachments/assets/f8f2e2e4-9b45-467c-9057-f42c023e7aec" />
<img width="1920" height="1080" alt="lines" src="https://github.com/user-attachments/assets/68f062a2-3095-4da5-9817-afbe905af179" />
<img width="1920" height="1080" alt="segments" src="https://github.com/user-attachments/assets/f614e17c-3743-41cb-a604-31b3b5ed94d3" />
<img width="1920" height="1080" alt="stations" src="https://github.com/user-attachments/assets/7727e286-db83-4841-9150-a8cc5be4cc62" />