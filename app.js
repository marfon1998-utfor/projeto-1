const AUTH_API = 'https://fakestoreapi.com/auth/login';
const PRODUCTS_API = 'https://fakestoreapi.com/products';

const loginStage = document.querySelector('#login-stage');
const loginHeader = document.querySelector('#login-header');
const storeHeader = document.querySelector('#store-header');
const storeNav = document.querySelector('#store-nav');
const catalogStage = document.querySelector('#catalog-stage');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const loginButton = document.querySelector('#login-button');
const passwordStage = document.querySelector('#password-stage');
const usernameInput = document.querySelector('#username');
const passwordInput = document.querySelector('#password');
const categoryFilter = document.querySelector('#category-filter');
const searchInput = document.querySelector('#search-input');
const searchCategory = document.querySelector('#search-category');
const searchMessage = document.querySelector('#search-message');
const grid = document.querySelector('#product-grid');
const favoritesTab = document.querySelector('#favorites-tab');
const favoritesCount = document.querySelector('#favorites-count');
const sectionTitle = document.querySelector('#section-title');
let products = [];
const cartItems = new Map();
let favorites = new Set();
let showingFavorites = false;
let toastTimer;

try {
  favorites = new Set(JSON.parse(localStorage.getItem('store-demo-favorites') || '[]').map(String));
} catch {
  localStorage.removeItem('store-demo-favorites');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginMessage.textContent = '';

  if (passwordStage.classList.contains('is-hidden')) {
    passwordStage.classList.remove('is-hidden');
    passwordInput.required = true;
    document.querySelector('label[for="username"]').textContent = 'E-mail ou nome de usuário';
    loginButton.textContent = 'Entrar';
    passwordInput.focus();
    return;
  }

  setBusy(true);
  try {
    const response = await fetch(AUTH_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput.value.trim(), password: passwordInput.value })
    });
    if (!response.ok) throw new Error('Usuário ou senha inválidos. Confira as credenciais de demonstração.');
    const data = await response.json();
    if (!data.token) throw new Error('A API não retornou uma sessão válida. Tente novamente.');
    await showCatalog(usernameInput.value.trim());
  } catch (error) {
    loginMessage.textContent = error instanceof TypeError ? 'Não foi possível conectar à API. Confira sua conexão e tente novamente.' : error.message;
  } finally {
    setBusy(false);
  }
});

document.querySelector('#toggle-password').addEventListener('click', () => {
  const show = passwordInput.type === 'password';
  passwordInput.type = show ? 'text' : 'password';
  document.querySelector('#toggle-password').setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
});

document.querySelector('#logout-button').addEventListener('click', () => {
  cartItems.clear();
  updateCartDisplay();
  catalogStage.classList.add('is-hidden');
  storeHeader.classList.add('is-hidden');
  storeNav.classList.add('is-hidden');
  loginHeader.classList.remove('is-hidden');
  loginStage.classList.remove('is-hidden');
  document.body.classList.remove('is-shopping');
  passwordStage.classList.add('is-hidden');
  passwordInput.required = false;
  passwordInput.value = '';
  loginButton.textContent = 'Continuar';
  loginMessage.textContent = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.querySelector('#retry-button').addEventListener('click', loadProducts);
categoryFilter.addEventListener('change', () => searchProducts(categoryFilter.value));
document.querySelector('.brand').addEventListener('click', event => {
  event.preventDefault();
  showingFavorites = false;
  favoritesTab.setAttribute('aria-pressed', 'false');
  sectionTitle.textContent = 'Explore nossos produtos';
  categoryFilter.disabled = false;
  searchCategory.disabled = false;
  categoryFilter.value = 'all';
  searchCategory.value = 'all';
  searchInput.value = '';
  searchMessage.textContent = '';
  renderProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
favoritesTab.addEventListener('click', () => {
  showingFavorites = !showingFavorites;
  if (showingFavorites) {
    categoryFilter.value = 'all';
    searchCategory.value = 'all';
  }
  favoritesTab.setAttribute('aria-pressed', String(showingFavorites));
  sectionTitle.textContent = showingFavorites ? 'Seus produtos favoritos' : 'Explore nossos produtos';
  categoryFilter.disabled = showingFavorites;
  searchCategory.disabled = showingFavorites;
  searchMessage.textContent = '';
  renderProducts();
});
document.querySelector('#search-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  searchMessage.textContent = '';
  const termo = searchInput.value.trim();

  if (termo.length < 3) {
    searchMessage.textContent = 'Digite pelo menos 3 caracteres para pesquisar.';
    searchInput.focus();
    return;
  }

  await searchProducts(termo, searchCategory.value);
  document.querySelector('#ofertas').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
document.querySelector('#cart-button').addEventListener('click', () => {
  if (!cartItems.size) {
    showToast('Seu carrinho está vazio por enquanto.');
    return;
  }
  const summary = [...cartItems.values()].map(({ title, quantity }) => `${title} (${quantity})`).join('; ');
  showToast(`Carrinho: ${summary}`);
});


async function showCatalog(username) {
  document.body.classList.add('is-shopping');
  loginHeader.classList.add('is-hidden');
  loginStage.classList.add('is-hidden');
  storeHeader.classList.remove('is-hidden');
  storeNav.classList.remove('is-hidden');
  catalogStage.classList.remove('is-hidden');
  document.querySelector('#account-label').innerHTML = `<small>Olá, ${escapeHtml(username)}</small><strong>Sua conta</strong>`;
  await loadProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadProducts() {
  document.querySelector('#catalog-error').classList.add('is-hidden');
  document.querySelector('#results-count').textContent = 'Carregando produtos...';
  grid.innerHTML = Array.from({ length: 8 }, () => '<div class="product-card"><div class="skeleton image-skeleton"></div><div class="skeleton line-skeleton"></div><div class="skeleton line-skeleton"></div></div>').join('');
  try {
    const response = await fetch(PRODUCTS_API);
    if (!response.ok) throw new Error('Falha ao carregar os produtos.');
    products = await response.json();
    updateFavoritesCount();
    const categories = [...new Set(products.map(product => product.category))];
    const options = categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    categoryFilter.innerHTML = '<option value="all">Todas as categorias</option>' + options;
    searchCategory.innerHTML = '<option value="all">Todos</option>' + options;
    renderProducts();
  } catch {
    grid.innerHTML = '';
    document.querySelector('#results-count').textContent = '';
    document.querySelector('#catalog-error').classList.remove('is-hidden');
  }
}

async function searchProducts(term, category) {
  searchMessage.textContent = '';
  const endpoint = category === 'all' ? PRODUCTS_API : `${PRODUCTS_API}/category/${encodeURIComponent(category)}`;
  const params = new URLSearchParams({ limit: '20', search: term });
  try {
    const response = await fetch(`${endpoint}?${params.toString()}`);
    if (!response.ok) throw new Error('Falha na busca de produtos.');
    products = await response.json();
    categoryFilter.value = category;
    searchCategory.value = category;
    updateFavoritesCount();
    renderProducts();
  } catch {
    grid.innerHTML = '';
    document.querySelector('#results-count').textContent = '';
    searchMessage.textContent = 'Não foi possível fazer a busca agora. Tente de novo.';
  }
}

function renderProducts() {
  const term = searchInput.value.trim().toLocaleLowerCase('pt-BR');
  const category = categoryFilter.value;
  const filtered = products.filter(product =>
    (!showingFavorites || favorites.has(String(product.id))) &&
    (showingFavorites || category === 'all' || product.category === category) &&
    (!term || `${product.title} ${product.description} ${product.category}`.toLocaleLowerCase('pt-BR').includes(term))
  );
  document.querySelector('#results-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'produto encontrado' : 'produtos encontrados'}`;
  if (!filtered.length) {
    const emptyMessage = showingFavorites ? 'Você ainda não salvou favoritos. Toque no coração de um produto para encontrá-lo aqui.' : 'Nenhum produto encontrado. Tente outra busca ou categoria.';
    grid.innerHTML = `<div class="catalog-error"><p>${emptyMessage}</p></div>`;
    return;
  }
  grid.innerHTML = filtered.map((product, index) => `
    <article class="product-card" style="--card-index:${Math.min(index, 12)}">
      <div class="product-image-wrap"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy"><span class="product-category">${escapeHtml(product.category)}</span><button type="button" class="favorite-button${favorites.has(String(product.id)) ? ' is-favorite' : ''}" data-favorite="${product.id}" aria-label="${favorites.has(String(product.id)) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}" aria-pressed="${favorites.has(String(product.id))}">${favorites.has(String(product.id)) ? '♥' : '♡'}</button></div>
      <div class="product-info"><h3>${escapeHtml(product.title)}</h3><p class="rating"><span>${'★'.repeat(Math.round(product.rating?.rate || 0))}${'☆'.repeat(5 - Math.round(product.rating?.rate || 0))}</span> <small>${product.rating?.count || 0}</small></p><p class="price"><sup>US$</sup>${Number(product.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p><button class="add-button" data-product="${product.id}">Adicionar ao carrinho</button></div>
    </article>`).join('');
  grid.querySelectorAll('.add-button').forEach(button => button.addEventListener('click', () => {
    const product = products.find(item => String(item.id) === button.dataset.product);
    if (!product) return;
    const current = cartItems.get(product.id) || { title: product.title, quantity: 0 };
    current.quantity++;
    cartItems.set(product.id, current);
    updateCartDisplay();
    button.classList.add('added');
    button.textContent = 'Adicionado';
    showToast('Produto adicionado ao carrinho.');
  }));
  grid.querySelectorAll('.favorite-button').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.favorite;
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    localStorage.setItem('store-demo-favorites', JSON.stringify([...favorites]));
    updateFavoritesCount();
    renderProducts();
    showToast(favorites.has(id) ? 'Produto adicionado aos favoritos.' : 'Produto removido dos favoritos.');
  }));
}

function updateFavoritesCount() {
  const availableIds = new Set(products.map(product => String(product.id)));
  favoritesCount.textContent = [...favorites].filter(id => availableIds.has(id)).length;
}

function setBusy(busy) {
  loginButton.disabled = busy;
  loginButton.textContent = busy ? 'Verificando...' : 'Entrar';
}

function updateCartDisplay() {
  const count = [...cartItems.values()].reduce((total, item) => total + item.quantity, 0);
  document.querySelector('#cart-count').textContent = count;
  document.querySelector('#cart-button').setAttribute('aria-label', `Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}
