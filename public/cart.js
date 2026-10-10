const INVENTORY = {};
const SHIPPING_COST = 10;
const FREE_SHIPPING_THRESHOLD = 75;

async function verifyStockOnServer(items) {
    try {
        const res = await fetch('/api/cart/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });
        if (!res.ok) throw new Error('Server returned ' + res.status);
        return await res.json();
    } catch (err) {
        console.warn('Stock verification unavailable, allowing:', err.message);
        return { valid: true, errors: [] };
    }
}

async function deductStockOnServer(items) {
    try {
        const res = await fetch('/api/cart/deduct', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items })
        });
        if (!res.ok) throw new Error('Server returned ' + res.status);
        return await res.json();
    } catch (err) {
        console.warn('Stock deduction unavailable:', err.message);
        return { success: true };
    }
}

class ShoppingCart {
    constructor() {
        this.items = JSON.parse(localStorage.getItem('tara_cart')) || [];
        this.total = 0;
        this.init();
    }

    init() {
        this.calculateTotal();
        this.renderCartCount();
        this.setupEventListeners();
    }

    _cartKey(item) {
        return item.stone || item.size ? `${item.id}|${item.stone || ''}|${item.size || ''}` : item.id;
    }

    _totalQuantity(productId) {
        return this.items.filter(i => i.id === productId).reduce((sum, i) => sum + i.quantity, 0);
    }

    async addItem(product) {
        const inventory = INVENTORY[product.id];
        if (!inventory) {
            this.showNotification('Product not found in inventory');
            return;
        }

        const cartKey = this._cartKey(product);
        const existingItem = this.items.find(item => this._cartKey(item) === cartKey);
        const currentQuantityInCart = existingItem ? existingItem.quantity : 0;
        const totalInCart = this._totalQuantity(product.id);
        const newTotal = totalInCart + 1;

        if (newTotal > inventory.stock) {
            this.showNotification(`${inventory.name} is sold out`);
            return;
        }

        const verification = await verifyStockOnServer([{ id: product.id, quantity: newTotal }]);
        if (!verification.valid) {
            const msg = verification.errors[0]?.error || 'Unable to add item';
            this.showNotification(msg);
            return;
        }

        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            this.items.push({ ...product, quantity: 1 });
        }
        this.saveCart();
        this.updateUI();
        this.updateSoldOutButtons();
        this.showNotification('Item added to cart');
    }

    removeItem(cartKey) {
        this.items = this.items.filter(item => this._cartKey(item) !== cartKey);
        this.saveCart();
        this.updateUI();
        this.updateSoldOutButtons();
    }

    async updateQuantity(cartKey, change) {
        const item = this.items.find(i => this._cartKey(i) === cartKey);
        if (item) {
            const inventory = INVENTORY[item.id];
            const newQuantity = item.quantity + change;
            const totalInCart = this._totalQuantity(item.id);

            if (change > 0 && totalInCart + 1 > inventory.stock) {
                this.showNotification(`Only ${inventory.stock} available in stock`);
                return;
            }

            if (change > 0) {
                const verification = await verifyStockOnServer([{ id: item.id, quantity: totalInCart + 1 }]);
                if (!verification.valid) {
                    const msg = verification.errors[0]?.error || 'Unable to update quantity';
                    this.showNotification(msg);
                    return;
                }
            }

            item.quantity = newQuantity;
            if (item.quantity <= 0) {
                this.removeItem(cartKey);
            } else {
                this.saveCart();
                this.updateUI();
                this.updateSoldOutButtons();
            }
        }
    }

    clearCart() {
        this.items = [];
        this.saveCart();
        this.updateUI();
    }

    calculateTotal() {
        this.total = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        this.shipping = (this.items.length > 0 && this.total < FREE_SHIPPING_THRESHOLD) ? SHIPPING_COST : 0;
        this.grandTotal = this.total + this.shipping;
    }

    saveCart() {
        this.calculateTotal();
        localStorage.setItem('tara_cart', JSON.stringify(this.items));
    }

    updateUI() {
        this.renderCartCount();
        this.renderCartModal();
    }

    renderCartCount() {
        const count = this.items.reduce((sum, item) => sum + item.quantity, 0);
        const badges = document.querySelectorAll('.cart-count-badge');
        badges.forEach(badge => {
            badge.textContent = count;
            badge.classList.toggle('hidden', count === 0);
        });
    }

    renderCartModal() {
        const cartItemsContainer = document.getElementById('cart-items');
        const cartTotalElement = document.getElementById('cart-total');
        const cartShippingElement = document.getElementById('cart-shipping');
        const cartGrandTotalElement = document.getElementById('cart-grand-total');
        const paypalButtonContainer = document.getElementById('paypal-button-container');

        if (!cartItemsContainer || !cartTotalElement) return;

        cartItemsContainer.innerHTML = '';

        if (this.items.length === 0) {
            cartItemsContainer.innerHTML = '<p class="text-[#6b6058] text-center py-4">Your cart is empty.</p>';
            if (paypalButtonContainer) paypalButtonContainer.innerHTML = '';
            this._paypalRendered = false;
        } else {
            this.items.forEach(item => {
                const inventory = INVENTORY[item.id];
                const maxQuantity = inventory ? inventory.stock : 0;
                const canAddMore = this._totalQuantity(item.id) < maxQuantity;
                const cartKey = this._cartKey(item);
                const variantLabel = [item.stone, item.size].filter(Boolean).join(' — ');

                const itemElement = document.createElement('div');
                itemElement.className = 'flex justify-between items-center border-b border-[#c97b3a]/10 py-3';
                itemElement.innerHTML = `
                    <div class="flex items-center space-x-3">
                        <img src="${item.image || 'logocircle.png'}" alt="${item.name}" class="w-12 h-12 object-cover rounded" onerror="this.src='logocircle.png'">
                        <div>
                            <h4 class="text-sm font-medium text-[#d4a373]">${item.name}</h4>
                            ${variantLabel ? `<p class="text-xs text-[#8a7e72]">${variantLabel}</p>` : ''}
                            <p class="text-xs text-[#6b6058]">$${item.price.toFixed(2)}</p>
                            <p class="text-xs text-[#8a7e72]">${item.quantity} of ${maxQuantity} available</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button class="text-[#6b6058] hover:text-[#d4a373]" onclick="cart.updateQuantity('${cartKey.replace(/'/g, "\\'")}', -1)">
                            <i class="fas fa-minus-circle"></i>
                        </button>
                        <span class="text-sm font-medium w-4 text-[#e8e0d8] text-center">${item.quantity}</span>
                        <button class="text-[#6b6058] hover:text-[#d4a373] ${canAddMore ? '' : 'opacity-50 cursor-not-allowed'}"
                            onclick="${canAddMore ? `cart.updateQuantity('${cartKey.replace(/'/g, "\\'")}', 1)` : ''}">
                            <i class="fas fa-plus-circle"></i>
                        </button>
                    </div>
                `;
                cartItemsContainer.appendChild(itemElement);
            });

            if (paypalButtonContainer && !this._paypalRendered) {
                this.renderPayPalButton();
            }
        }

        cartTotalElement.textContent = `$${this.total.toFixed(2)}`;
        if (cartShippingElement) cartShippingElement.textContent = this.items.length > 0 && this.shipping === 0 ? 'Free' : `$${this.shipping.toFixed(2)}`;
        if (cartGrandTotalElement) cartGrandTotalElement.textContent = `$${this.grandTotal.toFixed(2)}`;
    }

    renderPayPalButton() {
        const container = document.getElementById('paypal-button-container');
        if (!container || this._paypalRendered) return;
        this._paypalRendered = true;
        container.innerHTML = '<div class="text-center py-2">' +
            '<p class="text-[#d4a373] text-lg font-medium mb-2"><i class="fas fa-hourglass-half mr-2"></i>Checkout Coming Soon</p>' +
            '<p class="text-[#8a7e72] text-sm leading-relaxed">We\'re almost ready to accept orders. Your cart is saved — checkout will be available very soon. Thank you for your patience!</p>' +
            '</div>';
    }

    async finalizePaidOrder(details) {
        const items = this.items.map(item => ({
            id: item.id,
            quantity: item.quantity,
            stone: item.stone,
            size: item.size
        }));
        await deductStockOnServer(items);
        const givenName = details && details.payer && details.payer.name ? details.payer.name.given_name : null;
        const nameText = givenName ? ', ' + givenName : '';
        this.clearCart();
        this.showNotification(`Thank you for your order${nameText}! Payment successful.`);
        const modal = document.getElementById('cart-modal');
        if (modal) modal.classList.add('hidden');
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 right-4 bg-[#c97b3a] text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-300 translate-y-full z-50';
        notification.textContent = message;
        document.body.appendChild(notification);

        requestAnimationFrame(() => {
            notification.classList.remove('translate-y-full');
        });

        setTimeout(() => {
            notification.classList.add('translate-y-full');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    setupEventListeners() {
        const cartBtnDesktop = document.getElementById('cart-button-desktop');
        const cartBtnMobile = document.getElementById('cart-button-mobile');
        const closeCartBtn = document.getElementById('close-cart');
        const cartModal = document.getElementById('cart-modal');

        const openCart = (e) => {
            if (e) e.preventDefault();
            this.updateUI();
            cartModal.classList.remove('hidden');
        };

        if (cartBtnDesktop) cartBtnDesktop.addEventListener('click', openCart);
        if (cartBtnMobile) cartBtnMobile.addEventListener('click', openCart);

        if (closeCartBtn) {
            closeCartBtn.addEventListener('click', () => {
                cartModal.classList.add('hidden');
            });
        }

        if (cartModal) {
            cartModal.addEventListener('click', (e) => {
                if (e.target === cartModal) {
                    cartModal.classList.add('hidden');
                }
            });
        }

        this.updateSoldOutButtons();
    }

    updateSoldOutButtons() {
        Object.keys(INVENTORY).forEach(productId => {
            const buttons = document.querySelectorAll(`[data-id="${productId}"]`);
            const inventory = INVENTORY[productId];
            const cartQuantity = this._totalQuantity(productId);
            const isSoldOut = cartQuantity >= inventory.stock;

            buttons.forEach(btn => {
                if (isSoldOut) {
                    btn.textContent = 'Sold Out';
                    btn.disabled = true;
                    btn.classList.add('opacity-50', 'cursor-not-allowed');
                } else {
                    btn.textContent = 'Add to Cart';
                    btn.disabled = false;
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            });
        });
    }
}

const FALLBACK_INVENTORY = [
    { id: 'lotion', name: 'ÆTHERRA Harmonizing Hibiscus', stock: 9 },
    { id: 'cream', name: 'ÆTHERRA Butterfly Beauty Hydrosol Spray', stock: 15 },
    { id: 'perfume', name: 'ÆTHERRA Floral Calm Solid Perfume', stock: 20 },
    { id: 'fluorite-necklace', name: 'Fluorite Necklace', stock: 0 },
    { id: 'labradorite-necklace', name: 'Labradorite Necklace', stock: 1 },
    { id: 'amethyst-bracelet', name: 'Chip Amethyst Bracelet', stock: 1 },
    { id: 'assorted-rings', name: 'Assorted Dainty Rings', stock: 1 },
    { id: 'garnet-bracelet', name: 'Garnet Bracelet', stock: 1 },
    { id: 'copper-bangle', name: '10 Gauge Copper Bangle', stock: 10 },
    { id: 'strawberry-quartz-bracelet', name: '4mm Strawberry Quartz Bracelet', stock: 1 },
    { id: 'carnelian-4mm-bracelet', name: 'Carnelian 4mm Bracelet', stock: 1 },
    { id: 'citrine-4mm-bracelet', name: 'Yellow Agate 4mm Bracelet', stock: 1 },
    { id: 'dragonsblood-4mm-bracelet', name: 'Dragon\'s Blood 4mm Bracelet', stock: 1 },
    { id: 'turquoise-4mm-bracelet', name: 'Turquoise 4mm Bracelet', stock: 1 },
    { id: 'carnelian-bracelet', name: 'Carnelian 6mm Bracelet', stock: 10 },
    { id: 'sunstone-bracelet', name: 'Sunstone 6mm Bracelet', stock: 1 },
    { id: 'malachite-bracelet', name: 'Malachite 6mm Bracelet', stock: 1 },
    { id: 'dragonsblood-bracelet', name: 'Dragon\'s Blood 8mm Bracelet', stock: 1 },
    { id: 'chip-aquamarine-bracelet', name: 'Chip Aquamarine Bracelet', stock: 1 },
    { id: 'chip-aventurine-bracelet', name: 'Chip Aventurine Bracelet', stock: 1 },
    { id: 'chip-fluorite-bracelet', name: 'Chip Fluorite Bracelet', stock: 1 },
    { id: 'chip-onyx-bracelet', name: 'Chip Onyx Bracelet', stock: 1 },
    { id: 'chip-peridot-bracelet', name: 'Chip Peridot Bracelet', stock: 1 },
    { id: 'chip-red-coral-bracelet', name: 'Chip Red Coral Bracelet', stock: 1 },
    { id: 'citrine-6mm-bracelet', name: 'Citrine 6mm Bracelet', stock: 1 },
    { id: 'white-jade-8mm-bracelet', name: 'White Jade 8mm Bracelet', stock: 1 },
    { id: 'carnelian-8mm-bracelet', name: 'Carnelian 8mm Bracelet', stock: 1 },
    { id: 'blue-aventurine-8mm-bracelet', name: 'Blue Aventurine 8mm Bracelet', stock: 1 },
    { id: 'amethyst-8mm-bracelet', name: 'Amethyst 8mm Bracelet', stock: 1 },
    { id: 'amazonite-8mm-necklace', name: 'Amazonite 8mm Necklace', stock: 1 },
    { id: 'amethyst-chain-necklace', name: 'Amethyst Chain Necklace', stock: 1 },
    { id: 'black-tourmaline-chip-necklace', name: 'Black Tourmaline Chip Necklace', stock: 1 },
    { id: 'carnelian-pendant-chain-necklace', name: 'Carnelian Pendant Chain Necklace', stock: 1 },
    { id: 'dragonsblood-faceted-necklace', name: 'Dragon\'s Blood Faceted Necklace', stock: 1 },
    { id: 'fluorite-chip-necklace', name: 'Fluorite Chip Necklace', stock: 1 },
    { id: 'garnet-chip-necklace', name: 'Garnet Chip Necklace', stock: 1 },
    { id: 'jade-pearl-chain-necklace', name: 'Jade & Pearl Chain Necklace', stock: 1 },
    { id: 'labradorite-beaded-necklace', name: 'Labradorite Beaded Necklace', stock: 1 },
    { id: 'pearl-8mm-necklace', name: 'Pearl 8mm Necklace', stock: 1 },
    { id: 'shell-pendant-chain-necklace', name: 'Shell Pendant Chain Necklace', stock: 1 },
    { id: 'yellow-agate-4mm-necklace', name: 'Yellow Agate 4mm Necklace', stock: 1 }
];

async function loadInventory() {
    try {
        const res = await fetch('/api/products');
        if (!res.ok) throw new Error('Server unavailable');
        const products = await res.json();
        products.forEach(p => {
            INVENTORY[p.id] = { stock: p.stock, name: p.name, price: p.price, image: p.image };
        });
    } catch (err) {
        console.warn('Server unavailable, using fallback inventory:', err.message);
        FALLBACK_INVENTORY.forEach(p => {
            INVENTORY[p.id] = { stock: p.stock, name: p.name };
        });
    }
    if (cart) cart.updateSoldOutButtons();
}

const cart = new ShoppingCart();
loadInventory();
