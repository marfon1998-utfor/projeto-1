const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

let observedButtons;

class FakeElement {
  constructor() {
    this.textContent = '';
    this.innerHTML = '';
    this.value = 'all';
    this.attributes = {};
    this.listeners = {};
    this.classList = {
      values: new Set(),
      add: (...names) => names.forEach(name => this.classList.values.add(name)),
      remove: (...names) => names.forEach(name => this.classList.values.delete(name)),
      contains: name => this.classList.values.has(name)
    };
  }

  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  focus() {}
  scrollIntoView() {}
  querySelectorAll(selector) {
    if (selector !== '.add-button' && selector !== '.favorite-button') return [];
    this.createdButtons = [1, 2].map(id => {
      const button = new FakeElement();
      button.dataset = selector === '.add-button' ? { product: String(id) } : { favorite: String(id) };
      button.textContent = selector === '.add-button' ? 'Adicionar ao carrinho' : '♡';
      observedButtons.push(button);
      return button;
    });
    return this.createdButtons;
  }
  querySelector() { return new FakeElement(); }
}

function createApp({ storage = new Map(), fetchMock = async () => { throw new Error('Unexpected network request'); } } = {}) {
  observedButtons = [];
  const elements = new Map();
  const getElement = selector => {
    if (!elements.has(selector)) elements.set(selector, new FakeElement());
    return elements.get(selector);
  };
  const document = {
    body: getElement('body'),
    querySelector: getElement
  };
  const requests = [];
  const context = {
    document,
    window: { scrollTo() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    fetch: async (url, options) => { requests.push({ url, options }); return fetchMock(url, options); },
    URLSearchParams,
    setTimeout,
    clearTimeout,
    console,
    Map
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  vm.runInContext(`${source}\nglobalThis.testApi = { searchProducts, renderProducts, setProducts(value) { products = value; } };`, context);
  return { context, elements, getElement, requests, storage };
}

const sampleProducts = [
  { id: 1, title: 'Jaqueta azul', description: 'Algodão', category: 'clothing', image: 'https://example.com/1.png', price: 20, rating: { rate: 4, count: 2 } },
  { id: 2, title: 'Anel dourado', description: 'Acessório', category: 'jewelery', image: 'https://example.com/2.png', price: 10, rating: { rate: 5, count: 1 } }
];

test('filtra produtos já carregados por texto e categoria', () => {
  const { context, getElement } = createApp();
  context.testApi.setProducts(sampleProducts);
  getElement('#search-input').value = 'azul';

  context.testApi.renderProducts();
  assert.match(getElement('#results-count').textContent, /^1 produto encontrado$/);
  assert.match(getElement('#product-grid').innerHTML, /Jaqueta azul/);

  getElement('#search-input').value = '';
  getElement('#category-filter').value = 'jewelery';
  context.testApi.renderProducts();
  assert.match(getElement('#results-count').textContent, /^1 produto encontrado$/);
  assert.match(getElement('#product-grid').innerHTML, /Anel dourado/);
  assert.doesNotMatch(getElement('#product-grid').innerHTML, /Jaqueta azul/);
});

test('envia termo e categoria como parâmetros na consulta JSON da API', async () => {
  const app = createApp({ fetchMock: async () => ({ ok: true, json: async () => sampleProducts }) });
  app.getElement('#search-input').value = '  azul  ';
  app.getElement('#search-category').value = 'clothing';

  await app.getElement('#search-form').listeners.submit({ preventDefault() {} });

  assert.equal(app.requests.length, 1);
  const requestUrl = new URL(app.requests[0].url);
  assert.equal(requestUrl.pathname, '/products/category/clothing');
  assert.equal(requestUrl.searchParams.get('search'), 'azul');
  assert.equal(requestUrl.searchParams.get('limit'), '20');
  assert.match(app.getElement('#product-grid').innerHTML, /Jaqueta azul/);
});

test('recusa busca vazia ou com menos de três caracteres e mostra validação', async () => {
  const app = createApp({ fetchMock: async () => ({ ok: true, json: async () => sampleProducts }) });
  const submit = app.getElement('#search-form').listeners.submit;

  for (const value of ['', '  ', 'ab']) {
    app.getElement('#search-input').value = value;
    await submit({ preventDefault() {} });
    assert.match(app.getElement('#search-message').textContent, /pelo menos 3 caracteres/);
  }
  assert.equal(app.requests.length, 0);
});

test('mostra estado vazio quando nenhum produto corresponde à busca', () => {
  const { context, getElement } = createApp();
  context.testApi.setProducts(sampleProducts);
  getElement('#search-input').value = 'inexistente';

  context.testApi.renderProducts();
  assert.match(getElement('#results-count').textContent, /^0 produtos encontrados$/);
  assert.match(getElement('#product-grid').innerHTML, /Nenhum produto encontrado/);
});

test('mantém contagem e resumo dos itens no carrinho e limpa a conta ao sair', () => {
  const { context, getElement } = createApp();
  context.testApi.setProducts(sampleProducts);
  getElement('#search-input').value = '';
  context.testApi.renderProducts();
  const addButton = observedButtons[0];
  addButton.listeners.click();
  addButton.listeners.click();

  assert.equal(getElement('#cart-count').textContent, 2);
  assert.equal(getElement('#cart-button').getAttribute('aria-label'), 'Carrinho, 2 itens');
  getElement('#cart-button').listeners.click();
  assert.match(getElement('#toast').textContent, /Jaqueta azul \(2\)/);

  getElement('#logout-button').listeners.click();
  assert.equal(getElement('#cart-count').textContent, 0);
  assert.equal(getElement('#cart-button').getAttribute('aria-label'), 'Carrinho, 0 itens');
});

test('salva favoritos no localStorage e recupera a lista em uma nova sessão', () => {
  const storage = new Map();
  const { context, getElement } = createApp({ storage });
  context.testApi.setProducts(sampleProducts);
  getElement('#search-input').value = '';
  context.testApi.renderProducts();
  observedButtons.at(-2).listeners.click();

  assert.equal(getElement('#favorites-count').textContent, 1);
  assert.equal(storage.get('store-demo-favorites'), '["1"]');

  const reopened = createApp({ storage });
  reopened.context.testApi.setProducts(sampleProducts);
  reopened.getElement('#search-input').value = '';
  reopened.context.testApi.renderProducts();
  reopened.getElement('#favorites-tab').listeners.click();
  assert.equal(reopened.getElement('#section-title').textContent, 'Seus produtos favoritos');
  assert.match(reopened.getElement('#product-grid').innerHTML, /Jaqueta azul/);
  assert.doesNotMatch(reopened.getElement('#product-grid').innerHTML, /Anel dourado/);
});

test('logo retorna à vitrine sem navegar para outra página', () => {
  const { context, getElement } = createApp();
  context.testApi.setProducts(sampleProducts);
  getElement('#search-input').value = '';
  let prevented = false;
  getElement('.brand').listeners.click({ preventDefault() { prevented = true; } });

  assert.equal(prevented, true);
  assert.equal(getElement('#section-title').textContent, 'Explore nossos produtos');
  assert.equal(getElement('#catalog-stage').classList.contains('is-hidden'), false);
});

test('mantém a aplicação em uma única página HTML', () => {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  assert.equal((html.match(/<html\b/gi) || []).length, 1);
  assert.match(html, /<script\s+src="app\.js"\s+defer><\/script>/i);
  assert.doesNotMatch(html, /href="[^#][^"]*\.html(?:[?#][^"]*)?"/i);
});
