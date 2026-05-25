function resolveApiBaseUrl() {
    const { protocol, hostname, origin } = window.location;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
    const isFileProtocol = protocol === "file:";
    const configuredBaseUrl = typeof __API_BASE_URL__ === "string" ? __API_BASE_URL__.trim() : "";

    if (configuredBaseUrl) {
        return configuredBaseUrl.replace(/\/$/, "");
    }

    if (isFileProtocol || isLocalhost) {
        return "http://localhost:3000";
    }

    return origin.replace(/\/$/, "");
}

const API_BASE_URL = resolveApiBaseUrl();
window.API_BASE_URL = API_BASE_URL;

// JWT decoding/validation removed - backend no longer uses JWTs

function clearAuthSession() {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
}

function apiFetch(url, options = {}) {
    return fetch(url, {
        credentials: "include",
        ...options,
        headers: {
            ...(options.headers || {})
        }
    });
}

function getStoredToken() {
    return localStorage.getItem("token");
}

function getAuthUser() {
    const raw = localStorage.getItem("user");
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        clearAuthSession();
        return null;
    }
}

window.clearAuthSession = clearAuthSession;
window.getStoredToken = getStoredToken;
window.getAuthUser = getAuthUser;
window.apiFetch = apiFetch;
window.formatCurrency = formatCurrency;

let productsData = [];
window.cart = JSON.parse(localStorage.getItem("lmn_cart")) || [];
let modalCurrentProductId = null;
let currentPage = 1;
const pageName = window.location.pathname.split("/").pop() || "index.html";
const isCatalogPage = pageName === "products.html";
const itemsPerPage = isCatalogPage ? 12 : 6;
let currentSearchTerm = "";
let currentCategoryId = "";
let currentSort = "newest";

const CART_COUNT_EL = document.getElementById("cart-count");
const PRODUCT_CONTAINER = document.getElementById("product-container");
const PAGINATION_CONTAINER = document.getElementById("pagination-container");
const ORDER_LINK_BTN = document.getElementById("order-link-btn");
const PRODUCT_REVIEWS_EL = document.getElementById("modal-product-reviews");
let currentReviewProductId = null;
let currentReviewPage = 1;
const reviewPageSize = 5;

document.addEventListener("DOMContentLoaded", () => {
    checkAuthUI();
    initSearchHandlers();
    initCatalogControls();
    loadProducts(currentPage);
    updateCartUI();
    initFormHandlers();
    initProfilePage();
});

function getStoredUser() {
    return getAuthUser();
}

function formatCurrency(value) {
    return `${Number(value || 0).toLocaleString("vi-VN")} VNĐ`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeJsString(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, " ");
}

function checkAuthUI() {
    const user = getStoredUser();
    const loginLink = document.querySelector('a[href="login.html"]');

    if (!user) return;

    // Redirect admin to admin dashboard if they are on a regular user page
    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    const userPages = ["index.html", "products.html", "cart.html", "orders.html", "profile.html", "login.html", "register.html"];

    if (user.role === "admin" && userPages.includes(currentPage)) {
        window.location.href = "admin.html";
        return;
    }

    if (ORDER_LINK_BTN) ORDER_LINK_BTN.classList.remove("d-none");

    if (loginLink) {
        loginLink.innerHTML = '<i class="bi bi-person-circle fs-5"></i>';
        loginLink.href = "profile.html";
        loginLink.title = `Hồ sơ (${user.userName})`;

        const logoutLink = document.createElement("a");
        logoutLink.href = "#";
        logoutLink.className = "nav-link p-0";
        logoutLink.title = "Đăng xuất";
        logoutLink.innerHTML = '<i class="bi bi-box-arrow-right fs-5"></i>';
        logoutLink.addEventListener("click", (e) => {
            e.preventDefault();
            clearAuthSession();
            window.location.href = "index.html";
        });

        loginLink.insertAdjacentElement("afterend", logoutLink);
    }
}

async function loadProducts(page) {
    if (!PRODUCT_CONTAINER) return;

    try {
        const params = new URLSearchParams({
            page: String(page),
            limit: String(itemsPerPage)
        });

        if (currentCategoryId) params.set("categoryId", currentCategoryId);
        if (currentSearchTerm) params.set("q", currentSearchTerm);
        if (currentSort) params.set("sort", currentSort);

        const response = await apiFetch(`${API_BASE_URL}/products?${params.toString()}`);
        if (!response.ok) throw new Error("Failed to fetch products");

        const data = await response.json();
        productsData = data.products;

        renderProducts(productsData);
        renderPagination(isCatalogPage ? data.pagination : null);

        if (isCatalogPage && page > 1) {
            document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
        }
    } catch (error) {
        console.error("Error:", error);
        PRODUCT_CONTAINER.innerHTML = '<div class="col-12 text-center text-danger py-5">Lỗi kết nối server. Vui lòng kiểm tra backend.</div>';
    }
}

function initSearchHandlers() {
    const searchInput = document.getElementById("search-input");
    const searchBtn = document.getElementById("search-btn");

    if (!searchInput) return;

    const runSearch = () => {
        const searchTerm = searchInput.value.trim();
        if (!isCatalogPage) {
            window.location.href = searchTerm
                ? `products.html?q=${encodeURIComponent(searchTerm)}`
                : "products.html";
            return;
        }

        currentSearchTerm = searchTerm;
        currentPage = 1;
        updateCatalogUrl();
        loadProducts(currentPage);
    };

    const params = new URLSearchParams(window.location.search);
    const initialSearch = params.get("q") || params.get("search");
    if (initialSearch) {
        searchInput.value = initialSearch;
        currentSearchTerm = initialSearch.trim();
    }

    searchBtn?.addEventListener("click", runSearch);
    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") runSearch();
    });
}

function initCatalogControls() {
    if (!isCatalogPage) return;

    const params = new URLSearchParams(window.location.search);
    currentSearchTerm = params.get("q") || "";
    currentCategoryId = params.get("categoryId") || "";
    currentSort = params.get("sort") || "newest";

    const catalogSearchInput = document.getElementById("catalog-search-input");
    const catalogSearchBtn = document.getElementById("catalog-search-btn");
    const sortSelect = document.getElementById("catalog-sort");

    if (catalogSearchInput) catalogSearchInput.value = currentSearchTerm;
    if (sortSelect) sortSelect.value = currentSort;

    document.querySelectorAll("[data-category-filter]").forEach((button) => {
        button.classList.toggle("active", button.dataset.categoryFilter === currentCategoryId);
        button.addEventListener("click", () => {
            currentCategoryId = button.dataset.categoryFilter || "";
            currentPage = 1;
            document.querySelectorAll("[data-category-filter]").forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            updateCatalogUrl();
            loadProducts(currentPage);
        });
    });

    const runCatalogSearch = () => {
        currentSearchTerm = catalogSearchInput?.value.trim() || "";
        currentPage = 1;
        updateCatalogUrl();
        loadProducts(currentPage);
    };

    catalogSearchBtn?.addEventListener("click", runCatalogSearch);
    catalogSearchInput?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") runCatalogSearch();
    });

    sortSelect?.addEventListener("change", () => {
        currentSort = sortSelect.value;
        currentPage = 1;
        updateCatalogUrl();
        loadProducts(currentPage);
    });
}

function updateCatalogUrl() {
    if (!isCatalogPage) return;

    const params = new URLSearchParams();
    if (currentCategoryId) params.set("categoryId", currentCategoryId);
    if (currentSearchTerm) params.set("q", currentSearchTerm);
    if (currentSort && currentSort !== "newest") params.set("sort", currentSort);

    const nextUrl = params.toString() ? `products.html?${params.toString()}` : "products.html";
    window.history.replaceState({}, document.title, nextUrl);
}

function renderProducts(products) {

    if (products.length === 0) {
        PRODUCT_CONTAINER.innerHTML = `<div class="col-12 text-center text-muted py-5">${currentSearchTerm ? "Không tìm thấy sản phẩm phù hợp." : "Hiện chưa có sản phẩm nào."}</div>`;
        return;
    }

    PRODUCT_CONTAINER.innerHTML = products.map((product) => `
        <div class="col-md-6 col-lg-4">
          <div class="product-card reveal active" onclick="openDetails(${Number(product.id)})" style="cursor: pointer;">
            <div class="product-image-wrapper">
              <img src="${escapeHtml(product.image_url)}" class="product-image" alt="${escapeHtml(product.name)}">
              <div class="product-actions d-flex justify-content-center position-absolute w-100 bottom-0 mb-4 opacity-0 transition-all duration-300">
                 <button class="btn btn-black px-5">XEM CHI TIẾT</button>
              </div>
            </div>
            <div class="product-info">
              <h5 class="product-name">${escapeHtml(product.name)}</h5>
              <p class="product-price">${formatCurrency(product.price)}</p>
            </div>
          </div>
        </div>
    `).join("");

    document.querySelectorAll(".product-card").forEach((card) => {
        card.addEventListener("mouseenter", () => card.querySelector(".product-actions")?.classList.add("opacity-100"));
        card.addEventListener("mouseleave", () => card.querySelector(".product-actions")?.classList.remove("opacity-100"));
    });
}

function renderPagination(pagination) {
    if (!PAGINATION_CONTAINER || !pagination || pagination.totalPages <= 1) {
        if (PAGINATION_CONTAINER) PAGINATION_CONTAINER.innerHTML = "";
        return;
    }

    const { page, totalPages } = pagination;
    let html = "";

    html += `
        <button class="pagination-btn ${page === 1 ? "disabled" : ""}" onclick="${page > 1 ? `changePage(${page - 1})` : ""}">
           <i class="bi bi-chevron-left page-arrow"></i>
        </button>
    `;

    for (let i = 1; i <= totalPages; i += 1) {
        html += `
            <button class="pagination-btn ${i === page ? "active" : ""}" onclick="changePage(${i})">
               ${i}
            </button>
        `;
    }

    html += `
        <button class="pagination-btn ${page === totalPages ? "disabled" : ""}" onclick="${page < totalPages ? `changePage(${page + 1})` : ""}">
           <i class="bi bi-chevron-right page-arrow"></i>
        </button>
    `;

    PAGINATION_CONTAINER.innerHTML = html;
    PAGINATION_CONTAINER.classList.add("active");
}

function changePage(page) {
    currentPage = page;
    loadProducts(currentPage);
}

function renderReviewItems(reviews) {
    return reviews.map((review) => `
            <div class="review-item">
              <div class="d-flex justify-content-between gap-3">
                <strong>${escapeHtml(review.user_name)}</strong>
                <span class="small text-muted">${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}</span>
              </div>
              <div class="small text-muted mb-2">${new Date(review.created_at).toLocaleDateString("vi-VN")}</div>
              <div>${escapeHtml(review.comment || "Không có nhận xét.")}</div>
            </div>
        `).join("");
}

async function loadProductReviews(productId, page = 1, append = false) {
    if (!PRODUCT_REVIEWS_EL) return;

    if (!append) {
        currentReviewProductId = productId;
        currentReviewPage = 1;
        PRODUCT_REVIEWS_EL.innerHTML = '<div class="small text-muted">Đang tải review...</div>';
    }

    try {
        const response = await apiFetch(`${API_BASE_URL}/products/${productId}/reviews?page=${page}&limit=${reviewPageSize}`);
        if (!response.ok) throw new Error("Failed to fetch reviews");

        const data = await response.json();
        if (!data.reviews || data.reviews.length === 0) {
            if (!append) {
                PRODUCT_REVIEWS_EL.innerHTML = '<div class="small text-muted">Chưa có review nào cho sản phẩm này.</div>';
            }
            return;
        }

        const reviewsHtml = renderReviewItems(data.reviews);
        const totalPages = Number(data.pagination?.totalPages || 1);
        currentReviewPage = page;

        const loadMoreHtml = page < totalPages
            ? `<button type="button" class="btn btn-outline-black btn-sm mt-3" onclick="loadMoreProductReviews()">Xem thêm review</button>`
            : "";

        if (append) {
            const loadMoreBtn = PRODUCT_REVIEWS_EL.querySelector("[data-review-load-more]");
            if (loadMoreBtn) loadMoreBtn.remove();
            PRODUCT_REVIEWS_EL.insertAdjacentHTML("beforeend", reviewsHtml);
            if (loadMoreHtml) {
                PRODUCT_REVIEWS_EL.insertAdjacentHTML("beforeend", `<div data-review-load-more>${loadMoreHtml}</div>`);
            }
        } else {
            PRODUCT_REVIEWS_EL.innerHTML = reviewsHtml + (loadMoreHtml ? `<div data-review-load-more>${loadMoreHtml}</div>` : "");
        }
    } catch (error) {
        if (!append) {
            PRODUCT_REVIEWS_EL.innerHTML = '<div class="small text-danger">Không thể tải review.</div>';
        }
    }
}

function loadMoreProductReviews() {
    if (!currentReviewProductId) return;
    loadProductReviews(currentReviewProductId, currentReviewPage + 1, true);
}

function openDetails(productId) {
    const product = productsData.find((p) => p.id === productId);
    if (!product) return;

    // Set current modal product id (may change when user switches color)
    modalCurrentProductId = product.id;

    document.getElementById("modal-product-image").src = product.image_url;
    document.getElementById("modal-product-name").innerText = product.name;
    document.getElementById("modal-product-price").innerText = formatCurrency(product.price);
    document.getElementById("modal-product-desc").innerText = product.description;

    // Render sizes
    const sizesContainer = document.getElementById("modal-product-sizes");
    const selectedSizeInput = document.getElementById("selected-size");
    selectedSizeInput.value = ""; // Reset

    const sizes = (product.sizes || "S,M,L,XL").split(",");
    sizesContainer.innerHTML = sizes.map(size => {
        const s = size.trim();
        return `<div class="size-btn" onclick="selectSize(this, '${escapeJsString(s)}')">${escapeHtml(s)}</div>`;
    }).join("");

    // Reset Qty
    const qtyEl = document.getElementById("modal-qty");
    if (qtyEl) qtyEl.innerText = "1";

    const addToCartBtn = document.getElementById("add-to-cart-modal-btn");
    addToCartBtn.onclick = () => {
        const size = selectedSizeInput.value;
        if (!size) {
            alert("Vui lòng chọn size trước khi thêm vào giỏ hàng");
            return;
        }
        const qty = parseInt(document.getElementById("modal-qty").innerText) || 1;
        // Use the currently selected variant id when adding to cart
        addToCart(modalCurrentProductId || product.id, size, qty);
        const modalEl = document.getElementById("productModal");
        bootstrap.Modal.getInstance(modalEl).hide();
    };
    // Render color variants (if any) and load reviews for the currently selected variant
    renderProductColorVariants(product);
    loadProductReviews(modalCurrentProductId || product.id);
    new bootstrap.Modal(document.getElementById("productModal")).show();
}

function removeDiacritics(str) {
    if (!str) return "";
    // Normalize and strip combining diacritical marks (U+0300 - U+036F)
    return str.normalize ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : str;
}

function normalizeText(str) {
    return removeDiacritics(String(str || '')).toLowerCase().trim();
}

function extractBaseName(name) {
    const n = normalizeText(name);
    const mauIdx = n.indexOf(' mau');
    if (mauIdx !== -1) return n.slice(0, mauIdx).trim();
    const words = n.split(/\s+/);
    const last = words[words.length - 1];
    const colorNames = ['den', 'xam', 'nau', 'hong', 'trang', 'do', 'xanh', 'be', 'den'];
    if (colorNames.includes(last)) return words.slice(0, -1).join(' ');
    return words.slice(0, 3).join(' ');
}

function extractColorLabel(name) {
    const n = normalizeText(name);
    const mauIdx = n.indexOf(' mau');
    if (mauIdx !== -1) return n.slice(mauIdx + 4).trim();
    const words = n.split(/\s+/);
    return words[words.length - 1];
}

function mapColorToCss(colorLabel) {
    if (!colorLabel) return null;
    const map = {
        den: '#000000',
        "đen": '#000000',
        xam: '#8a8a8a',
        "xám": '#8a8a8a',
        trang: '#ffffff',
        "trang": '#ffffff',
        nau: '#8b5a2b',
        "nâu": '#8b5a2b',
        hong: '#ff77b0',
        "hồng": '#ff77b0',
        do: '#b30000',
        "đỏ": '#b30000',
        xanh: '#1e90ff',
        be: '#f5e0c7'
    };
    return map[colorLabel] || null;
}

function getVariantsForProduct(product) {
    const base = extractBaseName(product.name);
    if (!base) return [product];
    const variants = productsData.filter(p => {
        const np = normalizeText(p.name);
        return np.includes(base) || base.includes(np) || np.startsWith(base) || base.startsWith(np);
    });
    // Deduplicate and ensure original first
    const unique = [];
    const seen = new Set();
    // Put original product first
    if (!seen.has(product.id)) { unique.push(product); seen.add(product.id); }
    for (const v of variants) {
        if (!seen.has(v.id)) { unique.push(v); seen.add(v.id); }
    }
    return unique;
}

function renderProductColorVariants(product) {
    const container = document.getElementById('modal-product-colors');
    if (!container) return;
    const variants = getVariantsForProduct(product);
    if (!variants || variants.length === 0) {
        container.innerHTML = '';
        return;
    }

    const html = variants.map(v => {
        const colorLabel = extractColorLabel(v.name) || v.name;
        const cssColor = mapColorToCss(colorLabel);
        const style = cssColor ? `background:${cssColor};` : `background-image:url('${escapeHtml(v.image_url)}'); background-size:cover; background-position:center;`;
        return `<div class="color-swatch" data-variant-id="${Number(v.id)}" title="${escapeHtml(colorLabel)}" onclick="switchVariant(${Number(v.id)}, this)" style="${style}"></div>`;
    }).join('');

    container.innerHTML = html;
    // mark active swatch
    const activeEl = container.querySelector(`[data-variant-id='${product.id}']`);
    if (activeEl) activeEl.classList.add('active');
}

window.switchVariant = function (variantId, el) {
    const v = productsData.find(p => Number(p.id) === Number(variantId));
    if (!v) return;
    modalCurrentProductId = Number(variantId);
    document.getElementById('modal-product-image').src = v.image_url;
    document.getElementById('modal-product-name').innerText = v.name;
    document.getElementById('modal-product-price').innerText = formatCurrency(v.price);
    document.getElementById('modal-product-desc').innerText = v.description;

    // update sizes for variant
    const sizesContainer = document.getElementById('modal-product-sizes');
    const selectedSizeInput = document.getElementById('selected-size');
    selectedSizeInput.value = '';
    const sizes = (v.sizes || 'S,M,L,XL').split(',');
    sizesContainer.innerHTML = sizes.map(size => {
        const s = size.trim();
        return `<div class="size-btn" onclick="selectSize(this, '${escapeJsString(s)}')">${escapeHtml(s)}</div>`;
    }).join('');

    // update active swatch
    try {
        document.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
        if (el) el.classList.add('active');
    } catch (e) { }
};

function updateModalQty(delta) {
    const qtyEl = document.getElementById("modal-qty");
    let current = parseInt(qtyEl.innerText) || 1;
    current += delta;
    if (current < 1) current = 1;
    qtyEl.innerText = current;
}

function selectSize(btn, size) {
    document.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("selected-size").value = size;
}

function addToCart(productId, size = null, qty = 1) {
    const product = productsData.find((p) => p.id === productId);
    if (!product) return;

    // If size is not provided (e.g. from quick add), try to use default
    if (!size) {
        const defaultSizes = (product.sizes || "S,M,L,XL").split(",");
        size = defaultSizes[0].trim();
    }

    const existingItem = window.cart.find((item) => item.id === productId && item.size === size);

    if (existingItem) {
        existingItem.quantity += qty;
    } else {
        const cartKey = `${productId}-${size}`;
        window.cart.push({ ...product, quantity: qty, size: size, cartKey: cartKey });
    }

    localStorage.setItem("lmn_cart", JSON.stringify(window.cart));
    updateCartUI();
    alert(`Đã thêm ${qty} ${product.name} (Size: ${size}) vào túi đồ.`);
}

function updateCartUI() {
    const totalItems = (window.cart || []).reduce((acc, item) => acc + item.quantity, 0);
    if (CART_COUNT_EL) CART_COUNT_EL.innerText = totalItems;
}

function initFormHandlers() {
    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");
    const sendOtpBtn = document.getElementById("sendOtpBtn");

    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const userName = document.getElementById("username").value;
            const password = document.getElementById("password").value;

            try {
                const response = await apiFetch(`${API_BASE_URL}/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userName, password })
                });
                const result = await response.json();
                if (response.ok) {
                    localStorage.setItem("user", JSON.stringify(result.user));
                    alert("Đăng nhập thành công.");

                    if (result.user.role === "admin") {
                        window.location.href = "admin.html";
                    } else {
                        window.location.href = "index.html";
                    }
                } else {
                    alert(result.message || "Lỗi đăng nhập");
                }
            } catch (err) {
                alert("Không thể kết nối backend");
            }
        });
    }

    if (sendOtpBtn) {
        sendOtpBtn.addEventListener("click", async () => {
            const userName = document.getElementById("username").value;
            const email = document.getElementById("email").value;

            if (!userName || !email) {
                alert("Nhập username và email trước");
                return;
            }

            sendOtpBtn.disabled = true;
            sendOtpBtn.innerText = "Đang gửi...";

            try {
                const response = await apiFetch(`${API_BASE_URL}/send-otp`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userName, email })
                });
                const result = await response.json();
                if (response.ok) {
                    alert(result.message || "Mã OTP đã gửi về email.");
                } else {
                    alert(result.message || "Lỗi gửi OTP");
                    sendOtpBtn.disabled = false;
                    sendOtpBtn.innerText = "GỬI MÃ";
                }
            } catch (err) {
                alert("Lỗi kết nối");
                sendOtpBtn.disabled = false;
                sendOtpBtn.innerText = "GỬI MÃ";
            }
        });
    }

    if (registerForm) {
        registerForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const data = {
                userName: document.getElementById("username").value,
                email: document.getElementById("email").value,
                fullName: document.getElementById("fullName").value,
                phone: document.getElementById("phone").value,
                address: document.getElementById("address").value,
                password: document.getElementById("password").value,
                otp: document.getElementById("otp").value
            };

            try {
                const response = await apiFetch(`${API_BASE_URL}/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(data)
                });
                const result = await response.json();
                if (response.ok) {
                    alert("Đăng ký thành công. Hãy đăng nhập.");
                    window.location.href = "login.html";
                } else {
                    alert(result.message || "Lỗi đăng ký");
                }
            } catch (err) {
                alert("Lỗi kết nối backend");
            }
        });
    }
}

async function initProfilePage() {
    const form = document.getElementById("profileForm");
    if (!form) return;

    const storedUser = getStoredUser();
    if (!storedUser) {
        window.location.href = "login.html";
        return;
    }

    try {
        const res = await apiFetch(`${API_BASE_URL}/me`);
        if (res.status === 401) {
            clearAuthSession();
            window.location.href = "login.html";
            return;
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Không tải được hồ sơ");
        const user = data.user;

        document.getElementById("profile-username").value = user.userName || user.user_name || "";
        document.getElementById("profile-email").value = user.email || "";
        document.getElementById("profile-full-name").value = user.fullName || user.full_name || "";
        document.getElementById("profile-phone").value = user.phone || "";
        document.getElementById("profile-address").value = user.address || "";
    } catch (err) {
        alert(err.message || "Không tải được hồ sơ");
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const user = getAuthUser();
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        const payload = {
            fullName: document.getElementById("profile-full-name").value.trim(),
            phone: document.getElementById("profile-phone").value.trim(),
            address: document.getElementById("profile-address").value.trim()
        };

        try {
            const res = await apiFetch(`${API_BASE_URL}/me`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.message || "Không cập nhật được hồ sơ");
                return;
            }
            localStorage.setItem("user", JSON.stringify(data.user));
            alert("Đã cập nhật hồ sơ");
        } catch (err) {
            alert("Không thể kết nối server");
        }
    });
}

window.changePage = changePage;
window.openDetails = openDetails;
window.selectSize = selectSize;
window.updateModalQty = updateModalQty;
window.addToCart = addToCart;
window.updateCartUI = updateCartUI;
window.loadMoreProductReviews = loadMoreProductReviews;
