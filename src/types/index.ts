export type CategoryId = string;

export type SaleId = 'nike' | 'adidas' | 'puma';

export interface Category {
  id: CategoryId;
  name: string;
  emoji: string;
}

export interface Sale {
  id: SaleId;
  name: string;
  emoji: string;
  description: string;
  url: string;
}

export interface ProductColor {
  id: string;
  name: string;
  thumbnail: string;
  images: string[];
  sizes: string[];
  price?: number;
  originalPrice?: number;
  /** Raw scraped price before the sale campaign's reseller markup — see admin-upload.html. */
  basePrice?: number;
  baseOriginalPrice?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  /** Raw scraped price before the sale campaign's reseller markup — see admin-upload.html. */
  basePrice?: number;
  baseOriginalPrice?: number;
  /** Site-wide display currency price/originalPrice are actually in — see api/_lib/pricing.ts. */
  currency?: 'USD' | 'UAH';
  categoryId: CategoryId;
  saleId: SaleId;
  sourceName: string;
  sourceUrl: string;
  productUrl: string;
  image: string;
  sizes: string[];
  colors: ProductColor[];
  featuredRank: number;
}

export interface CartItem {
  productId: string;
  size: string;
  colorId: string;
  quantity: number;
}

export interface OrderForm {
  comment: string;
}

export interface Order {
  id: string;
  createdAt: string;
  customer: OrderForm;
  items: Array<{
    product: Product;
    size: string;
    color: ProductColor;
    quantity: number;
    lineTotal: number;
  }>;
  total: number;
  telegramUser?: TelegramWebAppUser;
}

// The buyer-facing "Мої замовлення" screen — GET /api/orders?mine=1 (see api/orders.ts). A
// server-side snapshot per order line, not the live Product/ProductColor shape: the catalog
// entry it came from may since be re-uploaded or gone entirely (see CLAUDE.md's two-repo
// pipeline note), and an order's history has to stay readable regardless.
export interface MyOrderItem {
  id: number;
  productId: string | null;
  productName: string;
  productImage: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  size: string;
  colorId: string | null;
  colorName: string | null;
  quantity: number;
  unitPrice: number;
}

export interface MyOrder {
  id: string;
  createdAt: string;
  comment: string | null;
  currency: 'USD' | 'UAH' | null;
  total: number;
  paid: boolean;
  paidAt: string | null;
  redeemed: boolean;
  redeemedAt: string | null;
  items: MyOrderItem[];
}

export type SortOption = 'recommended' | 'price-desc' | 'price-asc';

export interface CatalogFilters {
  search: string;
  sizes: string[];
  brands: SaleId[];
}

export interface ProductsMeta {
  categories: Array<{ id: CategoryId; image: string | null }>;
  sizesByCategory: Record<CategoryId, string[]>;
}

export interface CategoryWithImage extends Category {
  image: string | null;
}

// What ProductCard actually renders — a projection of Product, not the full shape. Used by the
// catalog grid and Home's top-N row, which only ever show a thumbnail/name/price/color-count and
// navigate to /product/:id on click; the full Product (all colors' images/sizes/description/URLs)
// is fetched separately once someone actually opens a product. See colorPrice/colorOriginalPrice
// in utils/format.ts for why each color still carries its own price/originalPrice.
export interface ProductCardColorData {
  price?: number;
  originalPrice?: number;
}

export interface ProductCardData {
  id: string;
  name: string;
  image: string;
  sourceName: string;
  currency?: 'USD' | 'UAH';
  price: number;
  originalPrice?: number;
  colors: ProductCardColorData[];
}

export interface ProductsListResponse {
  products: ProductCardData[];
  totalCount: number;
}

export interface Banner {
  id: number;
  imageUrl: string;
  title: string;
  subtitle: string;
  linkCategoryId: string | null;
  linkSaleId: string | null;
  linkUrl: string | null;
  sortOrder: number;
  active: boolean;
}
