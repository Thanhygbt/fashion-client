document.addEventListener("DOMContentLoaded", async () => {
    const user = getAuthUser();
    if (!user || user.role !== "admin") {
        alert("Bạn không có quyền truy cập trang này!");
        window.location.href = "index.html";
        return;
    }

    initTabs();
    initForms();
    initAdminSearches();
    await loadDashboard();
});

function logout() {
    clearAuthSession();
    window.location.href = "login.html";
}

function initTabs() {
    const navBtns = document.querySelectorAll(".nav-btn");
    navBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            navBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            const target = btn.getAttribute("data-target");
            const targetPane = document.getElementById(`tab-${target}`);
            if (!targetPane) {
                console.error(`Missing admin tab pane: tab-${target}`);
                return;
            }

            document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.add("d-none"));
            targetPane.classList.remove("d-none");

            if (target === "users") loadUsers();
            if (target === "products") loadProductsAdmin();
            if (target === "orders") loadOrdersAdmin();
            if (target === "coupons") loadCouponsAdmin();
            if (target === "inventory") loadInventoryAdmin();
        });
    });
}

const reqHeaders = () => ({
    "Content-Type": "application/json"
});

async function adminFetch(url, options = {}) {
    const res = await fetch(url, {
        credentials: "include",
        ...options,
        headers: {
            ...reqHeaders(),
            ...(options.headers || {})
        }
    });

    if (res.status === 401) {
        clearAuthSession();
        alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        window.location.href = "login.html";
        throw new Error("Unauthorized");
    }

    return res;
}

async function fetchProductsPage(page = 1, limit = 100) {
    const res = await adminFetch(`${API_BASE_URL}/products?page=${page}&limit=${limit}`);
    return res.json();
}

async function fetchAllProductsAdmin() {
    const firstPage = await fetchProductsPage(1, 100);
    const products = extractArray(firstPage, ['products']) || [];
    const totalPages = Number(firstPage.pagination?.totalPages || 1);

    for (let page = 2; page <= totalPages; page += 1) {
        const data = await fetchProductsPage(page, 100);
        const pageProducts = extractArray(data, ['products']) || [];
        if (pageProducts.length) products.push(...pageProducts);
    }

    return {
        products,
        total: Number(firstPage.pagination?.total || products.length)
    };
}

function formatCurrency(value) {
    return `${Number(value || 0).toLocaleString("vi-VN")} VNĐ`;
}

function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("vi-VN");
}

function formatDateInput(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Normalize possible array wrappers from API responses.
function extractArray(payload, keys = ['items','data','results','users','orders','products','coupons','logs']) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (typeof payload === 'object') {
        for (const k of keys) {
            if (Array.isArray(payload[k])) return payload[k];
            if (payload[k] && typeof payload[k] === 'object') {
                for (const sub of ['items','data','results']) {
                    if (Array.isArray(payload[k][sub])) return payload[k][sub];
                }
            }
        }
        if (Array.isArray(payload.data)) return payload.data;
        if (Array.isArray(payload.items)) return payload.items;
    }
    return [];
}

function statusBadge(status, type = 'order') {
    const map = {
        pending: { text: "Chờ xử lý", class: "bg-pending" },
        processing: { text: "Đang xử lý", class: "bg-processing" },
        completed: { text: "Hoàn thành", class: "bg-completed" },
        cancelled: { text: "Đã hủy", class: "bg-cancelled" },
        paid: { text: "Đã thanh toán", class: "bg-paid" },
        failed: { text: "Lỗi TT", class: "bg-failed" },
        active: { text: "Hoạt động", class: "bg-completed" },
        inactive: { text: "Bị khóa", class: "bg-cancelled" },
    };
    const mapped = map[status] || { text: status, class: "bg-secondary" };
    return `<span class="badge ${mapped.class}">${escapeHtml(mapped.text)}</span>`;
}

async function loadDashboard() {
    try {
        const [usersRes, productsData, ordersRes] = await Promise.all([
            adminFetch(`${API_BASE_URL}/users`),
            fetchProductsPage(1, 1),
            adminFetch(`${API_BASE_URL}/orders`)
        ]);

        const usersJson = await usersRes.json();
        const ordersJson = await ordersRes.json();

        const users = extractArray(usersJson, ['users']) || [];
        const orders = extractArray(ordersJson, ['orders']) || [];

        const productsPaginationTotal = Number(productsData.pagination?.total || (Array.isArray(productsData) ? productsData.length : 0));

        document.getElementById("stat-users").innerText = users.length;
        document.getElementById("stat-products").innerText = productsPaginationTotal || 0;
        document.getElementById("stat-orders").innerText = orders.length;
    } catch (e) {
        console.error("Dashboard error", e);
    }
}

// ================= USERS =================
let allUsers = [];
async function loadUsers() {
    try {
        const res = await adminFetch(`${API_BASE_URL}/users`);
        const json = await res.json();
        const users = extractArray(json, ['users']) || [];
        allUsers = users;
        const tbody = document.getElementById("users-table-body");

        if (!Array.isArray(users) || users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Không có người dùng phù hợp</td></tr>`;
            return;
        }

        renderUsers();
    } catch (e) {
        console.error(e);
    }
}

function renderUsers() {
    const tbody = document.getElementById("users-table-body");
    if (!Array.isArray(allUsers)) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Lỗi tải dữ liệu</td></tr>`;
        return;
    }

    const keyword = (document.getElementById("admin-search-users")?.value || "").toLowerCase().trim();
    const users = allUsers.filter(u => [
        u.id,
        u.user_name,
        u.email,
        u.full_name,
        u.phone,
        u.role,
        u.status
    ].some(value => String(value || "").toLowerCase().includes(keyword)));

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Không có người dùng phù hợp</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(u => `
            <tr>
                <td class="fw-bold">#${Number(u.id)}</td>
                <td>${escapeHtml(u.user_name)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${escapeHtml(u.full_name || '-')}</td>
                <td class="text-uppercase small fw-bold">${escapeHtml(u.role)}</td>
                <td>${statusBadge(u.status, 'user')}</td>
                <td class="text-end">
                  <button class="btn btn-sm btn-outline-dark me-1" onclick="openEditUserModal(${Number(u.id)})"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${Number(u.id)})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `).join("");
}

function openEditUserModal(id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    document.getElementById("u-id").value = user.id;
    document.getElementById("u-username").value = user.user_name;
    document.getElementById("u-email").value = user.email;
    document.getElementById("u-name").value = user.full_name || "";
    document.getElementById("u-phone").value = user.phone || "";
    document.getElementById("u-address").value = user.address || "";
    document.getElementById("u-role").value = user.role === "admin" ? "admin" : "customer";
    document.getElementById("u-status").value = user.status;

    new bootstrap.Modal(document.getElementById("userModal")).show();
}

async function deleteUser(id) {
    if (!confirm("Khóa tài khoản người dùng này?")) return;

    try {
        const res = await adminFetch(`${API_BASE_URL}/users/${id}`, {
            method: "DELETE"
        });
        if (res.ok) {
            alert("Đã khóa tài khoản người dùng");
            loadUsers();
            loadDashboard();
        } else {
            const data = await res.json();
            alert("Lỗi: " + data.message);
        }
    } catch (e) {
        alert("Lỗi kết nối");
    }
}

// ================= PRODUCTS =================
let allProducts = [];
async function loadProductsAdmin() {
    try {
        const data = await fetchAllProductsAdmin();
        allProducts = data.products;
        const tbody = document.getElementById("products-table-body");

        renderProductsAdmin();
    } catch (e) {
        console.error(e);
    }
}

function renderProductsAdmin() {
    const tbody = document.getElementById("products-table-body");
    const keyword = (document.getElementById("admin-search-products")?.value || "").toLowerCase().trim();
    const products = allProducts.filter(p => [
        p.id,
        p.name,
        p.category_id,
        p.price,
        p.stock_quantity
    ].some(value => String(value || "").toLowerCase().includes(keyword)));

    if (products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">Không có sản phẩm phù hợp</td></tr>`;
        return;
    }

    tbody.innerHTML = products.map(p => `
            <tr>
                <td><img src="${escapeHtml(p.image_url)}" width="40" height="40" class="rounded object-fit-cover shadow-sm"></td>
                <td class="fw-bold">${escapeHtml(p.name)}</td>
                <td class="text-danger fw-bold">${formatCurrency(p.price)}</td>
                <td>${p.stock_quantity ?? 0}</td>
                <td><span class="badge bg-light text-dark border">${escapeHtml(p.category_id)}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-dark me-1" onclick="openEditProductModal(${Number(p.id)})"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteProduct(${Number(p.id)})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `).join("");
}

function openAddProductModal() {
    document.getElementById("productModalTitle").innerText = "Thêm Sản Phẩm Mới";
    document.getElementById("productForm").reset();
    document.getElementById("p-id").value = "";
    new bootstrap.Modal(document.getElementById("productModal")).show();
}

function openEditProductModal(id) {
    const p = allProducts.find(prod => prod.id === id);
    if (!p) return;

    document.getElementById("productModalTitle").innerText = "Chỉnh Sửa Sản Phẩm";
    document.getElementById("p-id").value = p.id;
    document.getElementById("p-name").value = p.name;
    document.getElementById("p-price").value = p.price;
    document.getElementById("p-stock").value = p.stock_quantity;
    document.getElementById("p-category").value = p.category_id;
    document.getElementById("p-image").value = p.image_url;
    document.getElementById("p-sizes").value = p.sizes || "S,M,L,XL";
    document.getElementById("p-desc").value = p.description || "";

    new bootstrap.Modal(document.getElementById("productModal")).show();
}

async function deleteProduct(id) {
    if (!confirm("Bạn có chắc chắn muốn xóa sản phẩm này?")) return;

    try {
        const res = await adminFetch(`${API_BASE_URL}/products/${id}`, {
            method: "DELETE"
        });
        if (res.ok) {
            alert("Đã xóa sản phẩm");
            loadProductsAdmin();
            loadDashboard();
        } else {
            const data = await res.json();
            alert("Lỗi: " + (data.error || data.message));
        }
    } catch (e) {
        alert("Lỗi kết nối");
    }
}

// ================= ORDERS =================
let allOrders = [];
async function loadOrdersAdmin() {
    try {
        const res = await adminFetch(`${API_BASE_URL}/orders`);
        const json = await res.json();
        const orders = extractArray(json, ['orders']) || [];
        const tbody = document.getElementById("orders-table-body");

        if (!Array.isArray(orders) || orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Không có đơn hàng phù hợp</td></tr>`;
            return;
        }

        allOrders = orders;
        renderOrdersAdmin();
    } catch (e) {
        console.error(e);
    }
}

function renderOrdersAdmin() {
    const tbody = document.getElementById("orders-table-body");
    const keyword = (document.getElementById("admin-search-orders")?.value || "").toLowerCase().trim();
    const orders = allOrders.filter(o => [
        `LMN-${String(o.id).padStart(5, '0')}`,
        o.id,
        o.phone,
        o.address,
        o.payment_method,
        o.payment_status,
        o.status
    ].some(value => String(value || "").toLowerCase().includes(keyword)));

    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Không có đơn hàng phù hợp</td></tr>`;
        return;
    }

    tbody.innerHTML = orders.map(o => {
            const methodLabel = o.payment_method === 'payos'
                ? '<span class="badge bg-primary">PayOS</span>'
                : '<span class="badge bg-secondary">COD</span>';
            const canConfirmPayment = o.payment_status !== "paid" && o.status !== "cancelled";
            const canSendEmail = o.payment_status === "paid";
            return `
            <tr>
                <td class="fw-bold">#LMN-${String(o.id).padStart(5, '0')}</td>
                <td>${escapeHtml(o.phone)}</td>
                <td class="small text-muted" style="max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(o.address)}">${escapeHtml(o.address)}</td>
                <td class="fw-bold text-dark">${formatCurrency(o.total_amount)}</td>
                <td>${methodLabel}</td>
                <td>${statusBadge(o.payment_status)}</td>
                <td>${statusBadge(o.status)}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-dark me-1" onclick="openOrderDetail(${Number(o.id)})" title="Chi tiết"><i class="bi bi-eye"></i></button>
                    ${canConfirmPayment ? `<button class="btn btn-sm btn-outline-success me-1" onclick="confirmOrderPayment(${Number(o.id)})" title="Xác nhận thanh toán"><i class="bi bi-cash-coin"></i></button>` : ""}
                    ${canSendEmail ? `<button class="btn btn-sm btn-outline-primary me-1" onclick="sendOrderEmail(${Number(o.id)})" title="Gửi email"><i class="bi bi-envelope"></i></button>` : ""}
                    <select class="form-select form-select-sm d-inline-block border-dark" style="width:auto" onchange="updateOrderStatus(${Number(o.id)}, this.value)">
                        <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Chờ xử lý</option>
                        <option value="processing" ${o.status === 'processing' ? 'selected' : ''}>Đang xử lý</option>
                        <option value="completed" ${o.status === 'completed' ? 'selected' : ''}>Hoàn thành</option>
                        <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Hủy</option>
                    </select>
                </td>
            </tr>`;
        }).join("");
}

async function updateOrderStatus(orderId, newStatus) {
    if (!confirm("Chắc chắn muốn cập nhật trạng thái đơn hàng này?")) {
        loadOrdersAdmin();
        return;
    }
    try {
        const res = await adminFetch(`${API_BASE_URL}/orders/${orderId}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: newStatus })
        });
        if (res.ok) {
            alert("Đã cập nhật trạng thái");
            loadOrdersAdmin();
            loadDashboard();
        } else {
            const data = await res.json();
            alert("Lỗi: " + data.message);
            loadOrdersAdmin();
        }
    } catch (e) {
        alert("Lỗi kết nối server");
    }
}

async function openOrderDetail(orderId) {
    const body = document.getElementById("order-detail-body");
    body.innerHTML = `<div class="text-center text-muted py-4">Đang tải đơn hàng...</div>`;
    new bootstrap.Modal(document.getElementById("orderDetailModal")).show();

    try {
        const res = await adminFetch(`${API_BASE_URL}/orders/${orderId}`);
        const order = await res.json();
        if (!res.ok) {
            body.innerHTML = `<div class="alert alert-danger mb-0">${escapeHtml(order.message || "Không tải được đơn hàng")}</div>`;
            return;
        }

        const items = Array.isArray(order.items) ? order.items : [];
        body.innerHTML = `
            <div class="row g-3 mb-4">
                <div class="col-md-6">
                    <div class="small text-muted text-uppercase fw-bold">Mã đơn</div>
                    <div class="fw-bold">#LMN-${String(order.id).padStart(5, '0')}</div>
                </div>
                <div class="col-md-6">
                    <div class="small text-muted text-uppercase fw-bold">Ngày tạo</div>
                    <div>${formatDateTime(order.created_at)}</div>
                </div>
                <div class="col-md-6">
                    <div class="small text-muted text-uppercase fw-bold">SĐT</div>
                    <div>${escapeHtml(order.phone)}</div>
                </div>
                <div class="col-md-6">
                    <div class="small text-muted text-uppercase fw-bold">Địa chỉ</div>
                    <div>${escapeHtml(order.address)}</div>
                </div>
                <div class="col-md-4">
                    <div class="small text-muted text-uppercase fw-bold">Thanh toán</div>
                    <div>${statusBadge(order.payment_status)}</div>
                </div>
                <div class="col-md-4">
                    <div class="small text-muted text-uppercase fw-bold">Đơn hàng</div>
                    <div>${statusBadge(order.status)}</div>
                </div>
                <div class="col-md-4">
                    <div class="small text-muted text-uppercase fw-bold">Tổng tiền</div>
                    <div class="fw-bold text-danger">${formatCurrency(order.total_amount)}</div>
                </div>
            </div>
            <div class="table-responsive">
                <table class="table table-sm align-middle">
                    <thead>
                        <tr>
                            <th>Sản phẩm</th>
                            <th>Size</th>
                            <th>Số lượng</th>
                            <th>Giá</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${items.map(item => `
                            <tr>
                                <td>
                                    <div class="d-flex align-items-center gap-2">
                                        <img src="${escapeHtml(item.image_url || "")}" width="42" height="42" class="rounded object-fit-cover">
                                        <span class="fw-bold">${escapeHtml(item.name)}</span>
                                    </div>
                                </td>
                                <td>${escapeHtml(item.size || "-")}</td>
                                <td>${Number(item.quantity || 0)}</td>
                                <td>${formatCurrency(item.price)}</td>
                            </tr>
                        `).join("")}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) {
        body.innerHTML = `<div class="alert alert-danger mb-0">Lỗi kết nối server</div>`;
    }
}

async function confirmOrderPayment(orderId) {
    if (!confirm("Xác nhận đơn hàng này đã thanh toán?")) return;

    try {
        const res = await adminFetch(`${API_BASE_URL}/orders/${orderId}/confirm-payment`, {
            method: "PATCH"
        });
        const data = await res.json();
        if (!res.ok) {
            alert("Lỗi: " + (data.message || "Không xác nhận được thanh toán"));
            return;
        }
        alert("Đã xác nhận thanh toán");
        loadOrdersAdmin();
        loadDashboard();
    } catch (e) {
        alert("Lỗi kết nối server");
    }
}

async function sendOrderEmail(orderId) {
    if (!confirm("Gửi email xác nhận cho đơn hàng này?")) return;

    try {
        const res = await adminFetch(`${API_BASE_URL}/orders/${orderId}/send-email`, {
            method: "POST"
        });
        const data = await res.json();
        if (!res.ok) {
            alert("Lỗi: " + (data.message || "Không gửi được email"));
            return;
        }
        alert("Đã gửi email");
    } catch (e) {
        alert("Lỗi kết nối server");
    }
}

// ================= COUPONS =================
let allCoupons = [];

async function loadCouponsAdmin() {
    try {
        const res = await adminFetch(`${API_BASE_URL}/coupons`);
        const data = await res.json();
        allCoupons = Array.isArray(data.coupons) ? data.coupons : [];
        renderCouponsAdmin();
    } catch (e) {
        console.error("Load coupons error", e);
    }
}

function renderCouponsAdmin() {
    const tbody = document.getElementById("coupons-table-body");
    const keyword = (document.getElementById("admin-search-coupons")?.value || "").toLowerCase().trim();
    const coupons = allCoupons.filter(c => [
        c.code,
        c.discountType,
        c.discountValue,
        c.minOrderAmount,
        c.isActive ? "active" : "inactive"
    ].some(value => String(value || "").toLowerCase().includes(keyword)));

    if (coupons.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Không có mã giảm giá phù hợp</td></tr>`;
        return;
    }

    tbody.innerHTML = coupons.map(c => {
        const valueLabel = c.discountType === "percent" ? `${Number(c.discountValue)}%` : formatCurrency(c.discountValue);
        const limitLabel = c.usageLimit === null || c.usageLimit === undefined ? `${Number(c.usedCount || 0)} / không giới hạn` : `${Number(c.usedCount || 0)} / ${Number(c.usageLimit)}`;
        return `
            <tr>
                <td class="fw-bold text-uppercase">${escapeHtml(c.code)}</td>
                <td>${c.discountType === "percent" ? "Phần trăm" : "Số tiền"}</td>
                <td class="fw-bold">${valueLabel}</td>
                <td>${formatCurrency(c.minOrderAmount)}</td>
                <td>${escapeHtml(limitLabel)}</td>
                <td>${c.expiresAt ? formatDateTime(c.expiresAt) : "-"}</td>
                <td>${statusBadge(c.isActive ? "active" : "inactive")}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-dark me-1" onclick="openEditCouponModal(${Number(c.id)})"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteCoupon(${Number(c.id)})"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
        `;
    }).join("");
}

function openAddCouponModal() {
    document.getElementById("couponModalTitle").innerText = "Thêm Mã Giảm Giá";
    document.getElementById("couponForm").reset();
    document.getElementById("c-id").value = "";
    document.getElementById("c-min").value = 0;
    document.getElementById("c-active").value = "true";
    new bootstrap.Modal(document.getElementById("couponModal")).show();
}

function openEditCouponModal(id) {
    const coupon = allCoupons.find(c => Number(c.id) === Number(id));
    if (!coupon) return;

    document.getElementById("couponModalTitle").innerText = "Chỉnh Sửa Mã Giảm Giá";
    document.getElementById("c-id").value = coupon.id;
    document.getElementById("c-code").value = coupon.code || "";
    document.getElementById("c-type").value = coupon.discountType || "percent";
    document.getElementById("c-value").value = coupon.discountValue || "";
    document.getElementById("c-min").value = coupon.minOrderAmount || 0;
    document.getElementById("c-limit").value = coupon.usageLimit ?? "";
    document.getElementById("c-expires").value = formatDateInput(coupon.expiresAt);
    document.getElementById("c-active").value = coupon.isActive ? "true" : "false";

    new bootstrap.Modal(document.getElementById("couponModal")).show();
}

async function deleteCoupon(id) {
    if (!confirm("Bạn có chắc chắn muốn xóa mã giảm giá này?")) return;

    try {
        const res = await adminFetch(`${API_BASE_URL}/coupons/${id}`, {
            method: "DELETE"
        });
        const data = await res.json();
        if (!res.ok) {
            alert("Lỗi: " + (data.message || "Không xóa được mã"));
            return;
        }
        alert("Đã xóa mã giảm giá");
        loadCouponsAdmin();
    } catch (e) {
        alert("Lỗi kết nối server");
    }
}

// ================= INVENTORY =================
let allInventoryProducts = [];
let allInventoryLogs = [];

async function loadInventoryAdmin() {
    try {
        const [productsRes, logsRes] = await Promise.all([
            adminFetch(`${API_BASE_URL}/inventory`),
            adminFetch(`${API_BASE_URL}/inventory/logs`)
        ]);

        const productsJson = await productsRes.json();
        const logsJson = await logsRes.json();
        allInventoryProducts = extractArray(productsJson, ['products']) || [];
        allInventoryLogs = extractArray(logsJson, ['logs']) || [];
        renderInventoryAdmin();
        renderInventoryLogs();
    } catch (e) {
        console.error("Load inventory error", e);
    }
}

function renderInventoryAdmin() {
    const tbody = document.getElementById("inventory-table-body");
    const keyword = (document.getElementById("admin-search-inventory")?.value || "").toLowerCase().trim();
    const products = allInventoryProducts.filter(p => [
        p.id,
        p.name,
        p.category_id,
        p.stock_quantity
    ].some(value => String(value || "").toLowerCase().includes(keyword)));

    if (products.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Không có sản phẩm phù hợp</td></tr>`;
        return;
    }

    tbody.innerHTML = products.map(p => `
        <tr>
            <td class="fw-bold">#${Number(p.id)}</td>
            <td>${escapeHtml(p.name)}</td>
            <td><span class="badge ${Number(p.stock_quantity) <= 5 ? "bg-danger" : "bg-light text-dark border"}">${Number(p.stock_quantity || 0)}</span></td>
            <td>${formatCurrency(p.price)}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-dark" onclick="adjustInventory(${Number(p.id)})"><i class="bi bi-plus-slash-minus me-1"></i> Điều chỉnh</button>
            </td>
        </tr>
    `).join("");
}

function renderInventoryLogs() {
    const tbody = document.getElementById("inventory-logs-body");
    const logs = allInventoryLogs.slice(0, 80);

    if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted">Chưa có lịch sử kho</td></tr>`;
        return;
    }

    tbody.innerHTML = logs.map(log => `
        <tr>
            <td>
                <div class="fw-bold small">${escapeHtml(log.product_name)}</div>
                <div class="text-muted" style="font-size: 10px;">${formatDateTime(log.created_at)}</div>
            </td>
            <td class="${Number(log.change_amount) >= 0 ? "text-success" : "text-danger"} fw-bold">${Number(log.change_amount) > 0 ? "+" : ""}${Number(log.change_amount)}</td>
            <td class="small">${escapeHtml(log.reason)}</td>
        </tr>
    `).join("");
}

async function adjustInventory(productId) {
    const product = allInventoryProducts.find(p => Number(p.id) === Number(productId));
    const rawAmount = prompt(`Nhập số lượng cần cộng/trừ cho "${product ? product.name : `#${productId}`}"`, "1");
    if (rawAmount === null) return;

    const changeAmount = Number(rawAmount);
    if (!Number.isInteger(changeAmount) || changeAmount === 0) {
        alert("Số lượng điều chỉnh phải là số nguyên khác 0");
        return;
    }

    try {
        const res = await adminFetch(`${API_BASE_URL}/inventory/adjust`, {
            method: "POST",
            body: JSON.stringify({ productId, changeAmount })
        });
        const data = await res.json();
        if (!res.ok) {
            alert("Lỗi: " + (data.message || "Không điều chỉnh được tồn kho"));
            return;
        }
        alert("Đã điều chỉnh tồn kho");
        loadInventoryAdmin();
        loadProductsAdmin();
        loadDashboard();
    } catch (e) {
        alert("Lỗi kết nối server");
    }
}

// ================= FORM HANDLERS =================
function initForms() {
    const productForm = document.getElementById("productForm");
    if (productForm) {
        productForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const id = document.getElementById("p-id").value;
            const data = {
                name: document.getElementById("p-name").value,
                price: document.getElementById("p-price").value,
                stockQuantity: document.getElementById("p-stock").value,
                categoryId: document.getElementById("p-category").value,
                imageUrl: document.getElementById("p-image").value,
                sizes: document.getElementById("p-sizes").value,
                description: document.getElementById("p-desc").value
            };

            const url = id ? `${API_BASE_URL}/products/${id}` : `${API_BASE_URL}/products`;
            const method = id ? "PUT" : "POST";

            try {
                const res = await adminFetch(url, {
                    method: method,
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    alert(id ? "Đã cập nhật sản phẩm" : "Đã thêm sản phẩm mới");
                    bootstrap.Modal.getInstance(document.getElementById("productModal")).hide();
                    loadProductsAdmin();
                    loadDashboard();
                } else {
                    const errRes = await res.json();
                    alert("Lỗi: " + errRes.message);
                }
            } catch (err) {
                alert("Lỗi kết nối");
            }
        });
    }

    const userForm = document.getElementById("userForm");
    if (userForm) {
        userForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const id = document.getElementById("u-id").value;
            const data = {
                user_name: document.getElementById("u-username").value,
                email: document.getElementById("u-email").value,
                full_name: document.getElementById("u-name").value,
                phone: document.getElementById("u-phone").value,
                address: document.getElementById("u-address").value,
                role: document.getElementById("u-role").value,
                status: document.getElementById("u-status").value
            };

            try {
                const res = await adminFetch(`${API_BASE_URL}/users/${id}`, {
                    method: "PUT",
                    body: JSON.stringify(data)
                });
                if (res.ok) {
                    alert("Đã cập nhật thông tin người dùng");
                    bootstrap.Modal.getInstance(document.getElementById("userModal")).hide();
                    loadUsers();
                    loadDashboard();
                } else {
                    const errRes = await res.json();
                    alert("Lỗi: " + errRes.message);
                }
            } catch (err) {
                alert("Lỗi kết nối");
            }
        });
    }

    const couponForm = document.getElementById("couponForm");
    if (couponForm) {
        couponForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const id = document.getElementById("c-id").value;
            const data = {
                code: document.getElementById("c-code").value,
                discountType: document.getElementById("c-type").value,
                discountValue: document.getElementById("c-value").value,
                minOrderAmount: document.getElementById("c-min").value,
                usageLimit: document.getElementById("c-limit").value,
                isActive: document.getElementById("c-active").value === "true",
                expiresAt: document.getElementById("c-expires").value || null
            };

            const url = id ? `${API_BASE_URL}/coupons/${id}` : `${API_BASE_URL}/coupons`;
            const method = id ? "PUT" : "POST";

            try {
                const res = await adminFetch(url, {
                    method,
                    body: JSON.stringify(data)
                });
                const result = await res.json();
                if (!res.ok) {
                    alert("Lỗi: " + (result.message || "Không lưu được mã giảm giá"));
                    return;
                }
                alert(id ? "Đã cập nhật mã giảm giá" : "Đã thêm mã giảm giá");
                bootstrap.Modal.getInstance(document.getElementById("couponModal")).hide();
                loadCouponsAdmin();
            } catch (err) {
                alert("Lỗi kết nối");
            }
        });
    }
}

function initAdminSearches() {
    const bindings = [
        ["admin-search-users", renderUsers],
        ["admin-search-products", renderProductsAdmin],
        ["admin-search-orders", renderOrdersAdmin],
        ["admin-search-coupons", renderCouponsAdmin],
        ["admin-search-inventory", renderInventoryAdmin],
    ];

    bindings.forEach(([id, handler]) => {
        const input = document.getElementById(id);
        if (input) input.addEventListener("input", handler);
    });
}

// Chat feature removed (backend): related functions deleted

// Global functions for onclick handlers
window.logout = logout;
window.openAddProductModal = openAddProductModal;
window.openEditProductModal = openEditProductModal;
window.deleteProduct = deleteProduct;
window.openEditUserModal = openEditUserModal;
window.deleteUser = deleteUser;
window.updateOrderStatus = updateOrderStatus;
window.openOrderDetail = openOrderDetail;
window.confirmOrderPayment = confirmOrderPayment;
window.sendOrderEmail = sendOrderEmail;
window.openAddCouponModal = openAddCouponModal;
window.openEditCouponModal = openEditCouponModal;
window.deleteCoupon = deleteCoupon;
window.adjustInventory = adjustInventory;
 
