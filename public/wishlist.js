class Wishlist {
    constructor() {
        this.storageKey = 'tara_wishlist';
        this.items = JSON.parse(localStorage.getItem(this.storageKey)) || [];
        this.init();
    }

    init() {
        this.renderBadge();
        this.setupEventListeners();
        this.updateButtons();
    }

    _inventory() {
        return (typeof INVENTORY !== 'undefined') ? INVENTORY : {};
    }

    _cart() {
        return (typeof cart !== 'undefined') ? cart : null;
    }

    _details(id) {
        const inv = this._inventory()[id];
        if (!inv) return null;
        return { name: inv.name, price: inv.price, image: inv.image || 'logocircle.png' };
    }

    contains(id) {
        return this.items.some(i => i.id === id);
    }

    toggle(id) {
        if (this.contains(id)) {
            this.removeItem(id);
            this.notify('Removed from wishlist');
        } else {
            const details = this._details(id);
            if (!details) {
                this.notify('Product not found');
                return;
            }
            this.items.push({ id, ...details });
            this.save();
            this.notify('Added to wishlist');
        }
    }

    removeItem(id) {
        this.items = this.items.filter(i => i.id !== id);
        this.save();
    }

    clear() {
        this.items = [];
        this.save();
    }

    save() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.items));
        this.renderBadge();
        this.updateButtons();
    }

    notify(message) {
        const cart = this._cart();
        if (cart && typeof cart.showNotification === 'function') {
            cart.showNotification(message);
        }
    }

    renderBadge() {
        const count = this.items.length;
        document.querySelectorAll('.wishlist-count-badge').forEach(badge => {
            badge.textContent = count;
            badge.classList.toggle('hidden', count === 0);
        });
    }

    updateButtons() {
        document.querySelectorAll('[data-wishlist-id]').forEach(btn => {
            const id = btn.getAttribute('data-wishlist-id');
            const active = this.contains(id);
            btn.classList.toggle('wishlist-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            const icon = btn.querySelector('i');
            if (icon) {
                icon.classList.toggle('fas', active);
                icon.classList.toggle('far', !active);
            }
        });
    }

    isSoldOut(id) {
        const inv = this._inventory()[id];
        if (!inv) return false;
        const cart = this._cart();
        const qty = cart && typeof cart._totalQuantity === 'function' ? cart._totalQuantity(id) : 0;
        return qty >= inv.stock;
    }

    openModal() {
        this.renderModal();
        const modal = document.getElementById('wishlist-modal');
        if (modal) modal.classList.remove('hidden');
    }

    closeModal() {
        const modal = document.getElementById('wishlist-modal');
        if (modal) modal.classList.add('hidden');
    }

    addToCart(item) {
        const cart = this._cart();
        if (!cart) return;
        cart.addItem({ id: item.id, name: item.name, price: Number(item.price), image: item.image });
    }

    renderModal() {
        const container = document.getElementById('wishlist-items');
        if (!container) return;

        container.innerHTML = '';

        if (this.items.length === 0) {
            container.innerHTML = '<p class="text-[#6b6058] text-center py-4">Your wishlist is empty. Save the pieces you love.</p>';
            return;
        }

        this.items.forEach(item => {
            const soldOut = this.isSoldOut(item.id);
            const row = document.createElement('div');
            row.className = 'flex justify-between items-center border-b border-[#c97b3a]/10 py-3';
            row.innerHTML = `
                <div class="flex items-center space-x-3">
                    <img src="${item.image || 'logocircle.png'}" alt="${item.name}" class="w-12 h-12 object-cover rounded" onerror="this.src='logocircle.png'">
                    <div>
                        <h4 class="text-sm font-medium text-[#d4a373]">${item.name}</h4>
                        <p class="text-xs text-[#6b6058]">$${Number(item.price).toFixed(2)}</p>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <button class="${soldOut ? 'btn-mini opacity-50 cursor-not-allowed' : 'btn-mini'}" ${soldOut ? 'disabled' : ''} data-add-wishlist="${item.id}">${soldOut ? 'Sold Out' : 'Add to Cart'}</button>
                    <button class="text-[#8a7e72] hover:text-red-400 text-sm" data-remove-wishlist="${item.id}" aria-label="Remove from wishlist"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;
            row.querySelector('[data-add-wishlist]').addEventListener('click', () => this.addToCart(item));
            row.querySelector('[data-remove-wishlist]').addEventListener('click', () => {
                this.removeItem(item.id);
                this.renderModal();
                this.notify('Removed from wishlist');
            });
            container.appendChild(row);
        });
    }

    setupEventListeners() {
        document.querySelectorAll('#wishlist-button-desktop, #wishlist-button-mobile').forEach(btn => {
            btn.addEventListener('click', () => this.openModal());
        });

        const closeBtn = document.getElementById('close-wishlist');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());

        document.querySelectorAll('[data-wishlist-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.toggle(btn.getAttribute('data-wishlist-id'));
            });
        });

        const modal = document.getElementById('wishlist-modal');
        if (modal) {
            modal.addEventListener('click', e => {
                if (e.target === modal) this.closeModal();
            });
        }

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') this.closeModal();
        });
    }
}

const wishlist = new Wishlist();